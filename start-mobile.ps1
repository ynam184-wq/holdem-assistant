$ErrorActionPreference = "Stop"
$port = 8080
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimePython = "C:\Users\young\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (Test-Path -LiteralPath $runtimePython) {
  $pythonExecutable = $runtimePython
} else {
  $pythonExecutable = (Get-Command python -ErrorAction Stop).Source
}

$localAddress = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "Holdem Compass 모바일 서버" -ForegroundColor Green
Write-Host "PC:      http://localhost:$port"
if ($localAddress) {
  Write-Host "모바일:  http://${localAddress}:$port" -ForegroundColor Cyan
  Write-Host "휴대폰과 PC를 같은 Wi-Fi에 연결한 뒤 모바일 주소를 여세요."
}
Write-Host "종료하려면 Ctrl+C를 누르세요."
Write-Host ""

Set-Location -LiteralPath $projectDirectory
& $pythonExecutable -m http.server $port --bind 0.0.0.0
