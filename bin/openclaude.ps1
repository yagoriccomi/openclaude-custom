# Abre o OpenClaude do npm. O proxy agora roda no servidor (https://9router.yagoriccomi.com.br/v1).
# Fica fora de %APPDATA%\npm para nao ser sobrescrito por "npm update -g".
# Reaplica os patches locais se o OpenClaude foi atualizado (rapido quando nada mudou).
node "$env:USERPROFILE\.openclaude\patches\aplicar-patches.js" --auto
if ($MyInvocation.ExpectingInput) { $input | & "$env:APPDATA\npm\openclaude.ps1" @args } else { & "$env:APPDATA\npm\openclaude.ps1" @args }
exit $LASTEXITCODE
