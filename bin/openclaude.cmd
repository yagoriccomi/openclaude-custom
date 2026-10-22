@ECHO off
REM Liga o proxy local (127.0.0.1:8788) se estiver desligado e abre o OpenClaude do npm.
REM Fica fora de %APPDATA%\npm para nao ser sobrescrito por "npm update -g".
netstat -ano | findstr /R /C:"127.0.0.1:8788 .*LISTENING" >NUL || (
  wscript.exe "%USERPROFILE%\.openclaude\proxy\start-proxy-hidden.vbs"
  ping -n 2 127.0.0.1 >NUL
)
REM Reaplica os patches locais se o OpenClaude foi atualizado (rapido quando nada mudou).
node "%USERPROFILE%\.openclaude\patches\aplicar-patches.js" --auto
"%APPDATA%\npm\openclaude.cmd" %*
