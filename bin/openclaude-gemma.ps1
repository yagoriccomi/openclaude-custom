# Abre o openclaude usando o Gemma 4 do servidor, via https://ollama.yagoriccomi.com.br
# Certificado válido (Let's Encrypt): não precisa do root.crt. Precisa do TOKEN de acesso.
# Token: na variável de ambiente GEMMA_TOKEN, ou em %USERPROFILE%\.openclaude\gemma-token.txt (fora do git).
# Uso (na pasta do projeto):  openclaude-gemma [-Exato] [args do openclaude]
# Sem bloco param(): com -File o PowerShell tentaria casar flags do openclaude (-p, --print...) com parâmetros do script.
$servidor = "https://ollama.yagoriccomi.com.br"
$exato = $args -contains "-Exato"
$resto = @($args | Where-Object { $_ -ne "-Exato" })

$arquivoToken = "$env:USERPROFILE\.openclaude\gemma-token.txt"
$token = $env:GEMMA_TOKEN
if (-not $token -and (Test-Path $arquivoToken)) { $token = (Get-Content $arquivoToken -Raw).Trim() }
if (-not $token) { Write-Output "Sem token: defina GEMMA_TOKEN ou crie $arquivoToken."; exit 1 }

# Checagem rápida: o Gemma precisa estar ligado no servidor e o token tem que valer.
# O token vai por variável de ambiente, não na linha de comando (que outros processos conseguem ler).
$env:GEMMA_CHECK_TOKEN = $token
& node -e "fetch('$servidor/api/version',{headers:{Authorization:'Bearer '+process.env.GEMMA_CHECK_TOKEN}}).then(r=>{if(r.status===401)console.error('token recusado');process.exit(r.ok?0:1)}).catch(e=>{console.error(e.cause?.code||e.message);process.exit(1)})"
$ok = $LASTEXITCODE -eq 0
Remove-Item Env:GEMMA_CHECK_TOKEN
if (-not $ok) {
    Write-Output "Gemma não respondeu em $servidor (desligado no servidor, ou token inválido)."
    exit 1
}

$env:CLAUDE_CODE_USE_OPENAI = "1"
$env:OPENAI_BASE_URL = "$servidor/v1"
$env:OPENAI_API_KEY = $token                                  # vai como Authorization: Bearer
$env:OPENCLAUDE_OLLAMA_NUM_CTX = "131072"
$env:CLAUDE_CODE_OPENAI_FALLBACK_CONTEXT_WINDOW = "131072"  # tem que bater com o num_ctx do servidor para compactar na hora certa
$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = "8192"                  # respostas longas na CPU (~10 t/s) levam minutos
$env:EXA_FREE_TIER = "0"                                      # busca web não vai para a Exa sem chave
if ($exato) {
    $env:OPENAI_MODEL = "gemma4-exato"
} else {
    $env:OPENAI_MODEL = "gemma4-agente?thinking=disabled"
    $env:CLAUDE_CODE_DISABLE_THINKING = "1"
}

# Prompt menor para a CPU do servidor: sem subagentes, RepoMap e Monitor (~3.500 tokens a menos)
# e sem MCPs (~1.100 tokens dos nomes do ArcGIS/Render). O openclaude normal continua com tudo.
openclaude --disallowedTools "Agent,RepoMap,Monitor" --strict-mcp-config @resto
exit $LASTEXITCODE
