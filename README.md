# Customizações do OpenClaude

Ajustes locais do [OpenClaude](https://www.npmjs.com/package/@gitlawb/openclaude) (`npm i -g @gitlawb/openclaude`)
neste PC. Nada aqui fica dentro do pacote do npm, então `npm update -g @gitlawb/openclaude`
não apaga essas mudanças.

## O que tem aqui

| Caminho | Para que serve |
| --- | --- |
| `bin/openclaude(.cmd/.ps1)` | Atalhos que substituem o `openclaude` do npm (a pasta `bin` vem antes de `%APPDATA%\npm` no PATH do usuário). Ligam o proxy se ele estiver desligado, reaplicam os patches e abrem o OpenClaude do npm. |
| `bin/openclaude-gemma(.cmd/.ps1)` | Abre o OpenClaude com o Gemma 4 do servidor (`https://ollama.yagoriccomi.com.br`), sem passar pelo proxy. Token em `GEMMA_TOKEN` ou em `gemma-token.txt` (fora do git). `-Exato` liga o raciocínio com temperatura 0. |
| `proxy/router-proxy.js` | Proxy local `127.0.0.1:8788` → 9router (`https://9router.yagoriccomi.com.br/v1`). Traduz as chamadas `cc/*`, corrige nomes de ferramentas `_ide` e **troca de modelo sozinho** quando o router responde com limite de uso/sobrecarga. |
| `proxy/test-fallback.js` | Teste da troca de modelo com um router falso: `node proxy/test-fallback.js` |
| (aposentados em 2026-11-11) | O proxy agora roda no servidor, em https://9router.yagoriccomi.com.br/v1. O atalho do Menu Iniciar aponta para `bin/openclaude.cmd`. |
| `patches/aplicar-patches.js` | Reaplica dentro do pacote do npm o que não tem como ficar fora dele. |
| `patches/traducao-ptbr.js` | Dicionário da tradução da interface para português do Brasil (ver abaixo). |
| `CLAUDE.md`, `settings.json` | Instruções e configurações do OpenClaude. |

## Troca automática de modelo

Ordem: Fable 5.1 → Fable 5 → Opus 5.5 → Sonnet 5.5 → Sonnet 5 → Haiku 4.5. O modelo padrão é o
Opus 5.5 (perfil "9Router (todos os modelos)" em `~/.openclaude.json` e `OPENAI_MODEL` em
`.openclaude-profile.json`).
Quando o modelo pedido dá erro de limite (429/529, ou 503 do router com `rate_limit`), o mesmo pedido
é refeito no próximo da lista, e o modelo bloqueado só é tentado de novo depois do tempo de "reset"
informado pelo router (no mínimo 30 s). Um aviso `⚠️ [proxy] …` aparece no fim da próxima resposta
finalizada, e outro `✅ [proxy] …` quando o modelo original volta. Cada troca fica registrada em
`proxy/requests.log` (`"event":"fallback"`).

## Depois de atualizar o OpenClaude

Não precisa fazer nada: no próximo `openclaude`, o `aplicar-patches.js --auto` percebe que o
`cli.mjs` mudou e reaplica o patch. Se a atualização tiver mudado o trecho que o patch procura,
ele avisa em vermelho e não mexe no arquivo; aí o patch precisa ser revisto.

Patches atuais: `sem-limite-de-turnos` (sem valor configurado, o modo interativo não para mais em 50
turnos; `--max-turns N`, `OPENCLAUDE_MAX_TURNS` e o `/config` continuam valendo) e `win32-sem-passwordvault`. No Windows as credenciais ficam só em
`~/.openclaude/.credentials.json`, sem chamar `powershell.exe` + `PasswordVault`, que o Kaspersky
acusa como `PDM:HackTool.Win32.Lazagne.a`.

## Tradução para português (pt-BR)

O OpenClaude não tem idioma de interface, então a tradução é um patch no `cli.mjs`, aplicado pelo
mesmo `aplicar-patches.js`. Traduz só o que aparece na tela (rodapé, modos, pedidos de permissão,
avisos, verbos do spinner). Prompts e descrições de ferramentas ficam em inglês de propósito; a resposta
do modelo já sai em português pelo `"language"` do `settings.json`.

- Para traduzir mais um texto: acrescentar uma linha `add("original", "tradução", quantidade)` em
  `patches/traducao-ptbr.js`. No próximo `openclaude` o patch reaplica sozinho.
- `node patches/aplicar-patches.js --traducao` confere cada linha contra o pacote atual (sem gravar)
  e lista as que deixaram de casar depois de uma atualização.
- Antes de gravar, o script roda `node --check`; se a tradução quebrar a sintaxe, ele recusa.
- Para desfazer: `npm i -g @twigpine/openclaude` reinstala o `cli.mjs` original (os patches voltam
  sozinhos no próximo início, inclusive a tradução; para ficar sem ela, esvazie `traducao-ptbr.js`).

## Instalar em outro PC

1. `npm i -g @gitlawb/openclaude`
2. Clonar este repositório em `%USERPROFILE%\.openclaude`.
3. Pôr `%USERPROFILE%\.openclaude\bin` no começo do PATH do usuário.
4. Ajustar `UPSTREAM_HOST` em `proxy/router-proxy.js` se o router for outro.
