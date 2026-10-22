# Customizações do OpenClaude

Ajustes locais do [OpenClaude](https://www.npmjs.com/package/@gitlawb/openclaude) (`npm i -g @gitlawb/openclaude`)
neste PC. Nada aqui fica dentro do pacote do npm, então `npm update -g @gitlawb/openclaude`
não apaga essas mudanças.

## O que tem aqui

| Caminho | Para que serve |
| --- | --- |
| `bin/openclaude(.cmd/.ps1)` | Atalhos que substituem o `openclaude` do npm (a pasta `bin` vem antes de `%APPDATA%\npm` no PATH do usuário). Ligam o proxy se ele estiver desligado, reaplicam os patches e abrem o OpenClaude do npm. |
| `proxy/router-proxy.js` | Proxy local `127.0.0.1:8788` → 9router (Tailscale). Traduz as chamadas `cc/*`, corrige nomes de ferramentas `_ide` e **troca de modelo sozinho** quando o router responde com limite de uso/sobrecarga. |
| `proxy/test-fallback.js` | Teste da troca de modelo com um router falso: `node proxy/test-fallback.js` |
| `proxy/start-proxy-hidden.vbs`, `proxy/launch-openclaude.bat` | Ligam o proxy sem janela; o `.bat` é o do atalho do Menu Iniciar. |
| `patches/aplicar-patches.js` | Reaplica dentro do pacote do npm o que não tem como ficar fora dele. |
| `CLAUDE.md`, `settings.json` | Instruções e configurações do OpenClaude. |

## Troca automática de modelo

Ordem: Fable 5.1 → Fable 5 → Opus 5.5 → Opus 5 → Sonnet 5.5 → Sonnet 5 → Haiku 4.5.
Quando o modelo pedido dá erro de limite (429/529, ou 503 do router com `rate_limit`), o mesmo pedido
é refeito no próximo da lista, e o modelo bloqueado só é tentado de novo depois do tempo de "reset"
informado pelo router (no mínimo 30 s). Um aviso `⚠️ [proxy] …` aparece no fim da próxima resposta
finalizada, e outro `✅ [proxy] …` quando o modelo original volta. Cada troca fica registrada em
`proxy/requests.log` (`"event":"fallback"`).

## Depois de atualizar o OpenClaude

Não precisa fazer nada: no próximo `openclaude`, o `aplicar-patches.js --auto` percebe que o
`cli.mjs` mudou e reaplica o patch. Se a atualização tiver mudado o trecho que o patch procura,
ele avisa em vermelho e não mexe no arquivo; aí o patch precisa ser revisto.

Patch atual: `win32-sem-passwordvault`. No Windows as credenciais ficam só em
`~/.openclaude/.credentials.json`, sem chamar `powershell.exe` + `PasswordVault`, que o Kaspersky
acusa como `PDM:HackTool.Win32.Lazagne.a`.

## Instalar em outro PC

1. `npm i -g @gitlawb/openclaude`
2. Clonar este repositório em `%USERPROFILE%\.openclaude`.
3. Pôr `%USERPROFILE%\.openclaude\bin` no começo do PATH do usuário.
4. Ajustar `UPSTREAM_HOST` em `proxy/router-proxy.js` se o router for outro.
