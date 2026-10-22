# Liga o proxy local (127.0.0.1:8788) se estiver desligado e abre o OpenClaude do npm.
# Fica fora de %APPDATA%\npm para nao ser sobrescrito por "npm update -g".
$client = New-Object Net.Sockets.TcpClient
try { $client.Connect('127.0.0.1', 8788); $up = $true } catch { $up = $false } finally { $client.Dispose() }
if (-not $up) {
  wscript.exe "$env:USERPROFILE\.openclaude\proxy\start-proxy-hidden.vbs"
  Start-Sleep -Milliseconds 1200
}
# Reaplica os patches locais se o OpenClaude foi atualizado (rapido quando nada mudou).
node "$env:USERPROFILE\.openclaude\patches\aplicar-patches.js" --auto
if ($MyInvocation.ExpectingInput) { $input | & "$env:APPDATA\npm\openclaude.ps1" @args } else { & "$env:APPDATA\npm\openclaude.ps1" @args }
exit $LASTEXITCODE
