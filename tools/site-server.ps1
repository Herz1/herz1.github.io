param(
  [ValidateSet('Start', 'Stop', 'Toggle')]
  [string]$Action = 'Toggle',
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $projectRoot '.local-server'
$stateFile = Join-Path $stateDir 'server.json'
$stdoutLog = Join-Path $stateDir 'server.out.log'
$stderrLog = Join-Path $stateDir 'server.err.log'
$siteUrl = "http://127.0.0.1:$Port/"

function Get-SiteServer {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    return $null
  }

  try {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $process = Get-Process -Id ([int]$state.pid) -ErrorAction Stop
    $actualStart = $process.StartTime.ToUniversalTime().ToString('o')

    if ($actualStart -ne [string]$state.startedAtUtc) {
      Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
      return $null
    }

    return [pscustomobject]@{
      Process = $process
      State = $state
    }
  }
  catch {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    return $null
  }
}

function Test-PortInUse {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connectTask = $client.ConnectAsync('127.0.0.1', $Port)
    return $connectTask.Wait(300) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Open-Site {
  if (-not $NoBrowser) {
    Start-Process $siteUrl
  }
}

function Test-CurrentProjectAtPort {
  try {
    $webClient = [System.Net.WebClient]::new()
    try {
      $remoteIndex = $webClient.DownloadData($siteUrl)
    }
    finally {
      $webClient.Dispose()
    }

    $localIndex = [System.IO.File]::ReadAllBytes((Join-Path $projectRoot 'index.html'))
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $remoteHash = [Convert]::ToBase64String($sha256.ComputeHash($remoteIndex))
      $localHash = [Convert]::ToBase64String($sha256.ComputeHash($localIndex))
    }
    finally {
      $sha256.Dispose()
    }
    return $remoteHash -eq $localHash
  }
  catch {
    return $false
  }
}

function Start-SiteServer {
  $running = Get-SiteServer
  if ($running) {
    Write-Host "网站已经在运行：$siteUrl" -ForegroundColor Green
    Open-Site
    return
  }

  if (Test-PortInUse) {
    if (Test-CurrentProjectAtPort) {
      Write-Host "网站已经由其他本地服务器运行：$siteUrl" -ForegroundColor Green
      Open-Site
      return
    }
    throw "端口 $Port 已被其他程序占用。请关闭占用程序，或运行 tools\site-server.ps1 -Action Start -Port 其他端口。"
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  $pythonArguments = @()
  if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pythonCommand) {
      $pythonArguments += '-3'
    }
  }
  if (-not $pythonCommand) {
    throw '未找到 Python 3。请先安装 Python，或将 python/py 加入 PATH。'
  }

  $serverScript = Join-Path $PSScriptRoot 'site-server.py'
  if (-not (Test-Path -LiteralPath $serverScript)) {
    throw "缺少本地服务器脚本：$serverScript"
  }

  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
  $pythonArguments += @(
    "`"$serverScript`"",
    '--port', [string]$Port,
    '--bind', '127.0.0.1',
    '--directory', "`"$projectRoot`""
  )

  $serverProcess = Start-Process `
    -FilePath $pythonCommand.Source `
    -ArgumentList $pythonArguments `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

  $serverProcess.Refresh()
  @{
    pid = $serverProcess.Id
    port = $Port
    url = $siteUrl
    startedAtUtc = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    projectRoot = $projectRoot
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8

  $ready = $false
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Milliseconds 200
    if ($serverProcess.HasExited) {
      break
    }
    try {
      $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    }
    catch {
      # The server may still be starting.
    }
  }

  if (-not $ready) {
    if (-not $serverProcess.HasExited) {
      Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    $details = if (Test-Path -LiteralPath $stderrLog) {
      Get-Content -LiteralPath $stderrLog -Raw
    } else {
      '没有可用的错误日志。'
    }
    throw "本地服务器启动失败。`n$details"
  }

  Write-Host "网站已启动：$siteUrl" -ForegroundColor Green
  Write-Host '双击“一键关闭网站.cmd”即可关闭服务器。'
  Open-Site
}

function Stop-SiteServer {
  $running = Get-SiteServer
  if (-not $running) {
    Write-Host '网站服务器当前没有运行。' -ForegroundColor Yellow
    return
  }

  Stop-Process -Id $running.Process.Id -Force
  Wait-Process -Id $running.Process.Id -Timeout 3 -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  Write-Host '网站服务器已关闭。' -ForegroundColor Green
}

try {
  switch ($Action) {
    'Start' { Start-SiteServer }
    'Stop' { Stop-SiteServer }
    'Toggle' {
      if (Get-SiteServer) {
        Stop-SiteServer
      } else {
        Start-SiteServer
      }
    }
  }
}
catch {
  Write-Host "操作失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
