@ECHO off
REM Abre o OpenClaude do npm. O proxy agora roda no servidor (https://9router.yagoriccomi.com.br/v1).
REM Fica fora de %APPDATA%\npm para nao ser sobrescrito por "npm update -g".
REM Reaplica os patches locais se o OpenClaude foi atualizado (rapido quando nada mudou).
node "%USERPROFILE%\.openclaude\patches\aplicar-patches.js" --auto
"%APPDATA%\npm\openclaude.cmd" %*
