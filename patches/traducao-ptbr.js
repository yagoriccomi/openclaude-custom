// Tradução da interface do OpenClaude para português do Brasil.
//
// Só traduz o que o usuário VÊ na tela (rodapé, modos, diálogos de permissão, avisos).
// Nunca mexe em prompts de sistema, descrições de ferramentas nem nomes internos: isso
// continua em inglês de propósito, porque é o que o modelo lê. A resposta do modelo já sai
// em português pela configuração "language" do settings.json.
//
// Cada linha é [trecho original, tradução, quantas vezes o original aparece no cli.mjs].
// O trecho original deve ser um literal inteiro (com aspas ou prefixo de chave) para não
// pegar texto parecido em outro lugar. Se a contagem real for diferente da esperada, a linha
// é pulada e aparece no relatório (`node aplicar-patches.js --traducao`).
//
// Regras para a tradução: sem aspas duplas soltas, sem crase e sem "${" (o texto cai dentro
// de strings JS). O aplicar-patches.js ainda roda `node --check` antes de gravar.
"use strict";

const VERBOS_GERUNDIO = [
  "Acomodando", "Afinando", "Alinhando", "Analisando", "Arquitetando", "Armando", "Articulando",
  "Assando", "Borbulhando", "Calculando", "Canalizando", "Cogitando", "Combinando", "Compilando",
  "Compondo", "Computando", "Concebendo", "Conectando", "Considerando", "Construindo", "Contemplando",
  "Cozinhando", "Criando", "Cultivando", "Decifrando", "Deliberando", "Desembaraçando", "Destilando",
  "Dissecando", "Elaborando", "Embaralhando", "Engendrando", "Esculpindo", "Esmiuçando", "Estudando",
  "Evoluindo", "Examinando", "Explorando", "Fermentando", "Forjando", "Formulando", "Fritando",
  "Germinando", "Gerando", "Harmonizando", "Idealizando", "Improvisando", "Imaginando", "Investigando",
  "Lapidando", "Maquinando", "Matutando", "Meditando", "Misturando", "Moldando", "Montando",
  "Navegando", "Orquestrando", "Organizando", "Pensando", "Peneirando", "Planejando", "Polindo",
  "Ponderando", "Preparando", "Processando", "Reciclando", "Refletindo", "Refinando", "Remoendo",
  "Resolvendo", "Ruminando", "Sintetizando", "Sondando", "Temperando", "Tecendo", "Tramando",
  "Transformando", "Trabalhando", "Vasculhando", "Zunindo",
];
const VERBOS_PASSADO = [
  "Assado", "Cozinhado", "Fermentado", "Processado", "Refletido", "Temperado", "Trabalhado",
];

const T = [];
const add = (find, replace, count = 1) => T.push({ find, replace, count });

// --- Rodapé, atalhos e dicas de teclado ---
add('"? for shortcuts"', '"? para atalhos"');
add('"! for bash mode"', '"! para modo bash"', 2);
add('"@ for file paths"', '"@ para caminhos de arquivo"');
add("(esc to interrupt ", "(esc para interromper ");
add('"(press esc to close)"', '"(pressione esc para fechar)"', 3);
add('"(tab to switch, esc to close)"', '"(tab para alternar, esc para fechar)"');
add('"Esc to go back"', '"Esc para voltar"', 5);
add('"Esc to close"', '"Esc para fechar"');
add('"Type to filter"', '"Digite para filtrar"');
add('"Type to search"', '"Digite para buscar"');
add('"Type to Search"', '"Digite para buscar"');
add('"type to search"', '"digite para buscar"', 2);
add('"Please wait…"', '"Aguarde…"');
add('"Tool use rejected"', '"Uso da ferramenta rejeitado"');

// --- Modos de permissão (barra de status e shift+tab) ---
add('title:"Plan Mode"', 'title:"Modo Plano"');
add('shortTitle:"Plan"', 'shortTitle:"Plano"');
add('title:"Accept edits"', 'title:"Aceitar edições"');
add('shortTitle:"Accept"', 'shortTitle:"Aceitar"');
add('title:"Auto mode"', 'title:"Modo automático"');
add('title:"Bypass Permissions"', 'title:"Ignorar permissões"');
add('shortTitle:"Bypass"', 'shortTitle:"Ignorar"');
add('title:"Default"', 'title:"Padrão"');

// --- Diálogos de permissão ---
add('"Do you want to proceed?"', '"Deseja continuar?"', 4);
add('"Would you like to proceed?"', '"Deseja continuar?"');
add('label:"Yes"', 'label:"Sim"', 15);
add('label:"No"', 'label:"Não"', 15);
add("Yes, during this session", "Sim, durante esta sessão");
add("Yes, allow all edits during this session", "Sim, permitir todas as edições nesta sessão");
add("Yes, and don't ask again for", "Sim, e não perguntar de novo para", 8);
add('["No, and tell ",PRODUCT_DISPLAY_NAME," what to do differently "',
    '["Não, e diga ao ",PRODUCT_DISPLAY_NAME," o que fazer de diferente "');

// --- Avisos e mensagens de status ---
add("Interrupted by user", "Interrompido pelo usuário");
add("Compacting conversation", "Compactando a conversa", 2);
add("Conversation compacted", "Conversa compactada", 4);
add("Context low (", "Contexto baixo (", 2);
add("% remaining)", "% restante)", 2);
add("No conversation found", "Nenhuma conversa encontrada", 6);
add("Tip: ", "Dica: ", 5);
add("Welcome to OpenClaude", "Bem-vindo ao OpenClaude", 4);
add("`thought for ${", "`pensou por ${");
add("`${verb} for ${duration3}`", "`${verb} por ${duration3}`");

// --- Verbos que giram ao lado do spinner (lista inteira trocada) ---
T.push({
  find: /SPINNER_VERBS=\[(?:"[^"\n]*",?)+\]/,
  replace: "SPINNER_VERBS=" + JSON.stringify(VERBOS_GERUNDIO),
  count: 1,
  nome: "verbos do spinner",
});
T.push({
  find: /TURN_COMPLETION_VERBS=\[(?:"[^"\n]*",?)+\]/,
  replace: "TURN_COMPLETION_VERBS=" + JSON.stringify(VERBOS_PASSADO),
  count: 1,
  nome: "verbos de conclusão",
});

// --- Descrições dos comandos de barra (/help e menu ao digitar "/") ---
// Só a descrição muda; o nome do comando, os apelidos e as dicas de argumento ficam como estão.
const DESCRICOES = {
  "Configure extra usage to keep working when limits are hit": "Configurar uso extra para continuar trabalhando quando o limite for atingido",
  "Add a new working directory": "Adicionar uma nova pasta de trabalho",
  "Ask a quick side question without interrupting the main conversation": "Fazer uma pergunta rápida sem interromper a conversa principal",
  "Set and manage a session completion goal": "Definir e gerenciar uma meta de conclusão da sessão",
  "Submit feedback about OpenClaude": "Enviar feedback sobre o OpenClaude",
  "Clear conversation history and free up context": "Limpar o histórico da conversa e liberar contexto",
  "Clear session-scoped context window overrides": "Limpar os ajustes de janela de contexto da sessão",
  "Set the prompt bar color for this session": "Definir a cor da barra de entrada nesta sessão",
  "Create a git commit": "Criar um commit do git",
  "Configure commit attribution text": "Configurar o texto de autoria dos commits",
  "Copy Claude's last response to clipboard (or /copy N for the Nth-latest)": "Copiar a última resposta do Claude para a área de transferência (ou /copy N para a N-ésima mais recente)",
  "Continue the current session in Claude Desktop": "Continuar a sessão atual no Claude Desktop",
  "Commit, push, and open a PR": "Fazer commit, push e abrir um PR",
  "Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]": "Limpar o histórico da conversa mantendo um resumo no contexto. Opcional: /compact [instruções para o resumo]",
  "Show plan usage limits": "Mostrar os limites de uso do plano",
  "Open config panel": "Abrir o painel de configurações",
  "Visualize current context usage as a colored grid": "Ver o uso atual do contexto como uma grade colorida",
  "Show current context usage": "Mostrar o uso atual do contexto",
  "Show the total cost and duration of the current session": "Mostrar o custo total e a duração da sessão atual",
  "View uncommitted changes and per-turn diffs": "Ver alterações não commitadas e diffs de cada turno",
  "Show available LSP diagnostics already captured for this session": "Mostrar os diagnósticos LSP já capturados nesta sessão",
  "Run memory consolidation — synthesize recent sessions into durable memories": "Consolidar a memória: resumir as sessões recentes em memórias duradouras",
  "Show context window usage and token breakdown": "Mostrar o uso da janela de contexto e a divisão de tokens",
  "Diagnose and verify your OpenClaude installation and settings": "Diagnosticar e verificar a instalação e as configurações do OpenClaude",
  "Interactive setup for GitHub Copilot: OAuth device login stored in secure storage": "Configuração interativa do GitHub Copilot: login OAuth por dispositivo guardado no armazenamento seguro",
  "Manage native Knowledge Graph": "Gerenciar o grafo de conhecimento nativo",
  "Edit Claude memory files": "Editar os arquivos de memória do Claude",
  "Show or configure the repository structural map (codebase intelligence)": "Mostrar ou configurar o mapa estrutural do repositório (inteligência do código)",
  "Show help and available commands": "Mostrar a ajuda e os comandos disponíveis",
  "Manage IDE integrations and show status": "Gerenciar integrações com IDEs e mostrar o status",
  "Create verifier skill(s) for automated verification of code changes": "Criar skills de verificação automática das alterações de código",
  "Open or create your keybindings configuration file": "Abrir ou criar o arquivo de atalhos de teclado",
  "Inspect and set up Language Server Protocol code intelligence": "Inspecionar e configurar a inteligência de código via Language Server Protocol",
  "Sign out from your Anthropic account": "Sair da sua conta Anthropic",
  "Set up Claude GitHub Actions for a repository": "Configurar o Claude GitHub Actions em um repositório",
  "Install the Claude Slack app": "Instalar o app do Claude para Slack",
  "Send identical requests to test prompt caching (results in debug log)": "Enviar pedidos idênticos para testar o cache de prompt (resultado no log de depuração)",
  "Show per-turn and session cache hit/miss stats (works across all providers)": "Mostrar acertos e falhas de cache por turno e por sessão (vale para todos os provedores)",
  "Manage MCP servers": "Gerenciar servidores MCP",
  "Show QR code to download the Claude mobile app": "Mostrar o QR code para baixar o app do Claude no celular",
  "View release notes": "Ver as notas de versão",
  "Rename the current conversation": "Renomear a conversa atual",
  "Replay a session showing tool execution timeline": "Reproduzir uma sessão mostrando a linha do tempo das ferramentas",
  "Show estimated request context load and top contributors": "Mostrar a carga estimada de contexto do pedido e os maiores contribuintes",
  "Resume a previous conversation": "Retomar uma conversa anterior",
  "Continue the current task": "Continuar a tarefa atual",
  "Review a pull request": "Revisar um pull request",
  "Choose the web search backend (Exa by default) and manage its API key": "Escolher o mecanismo de busca na web (Exa por padrão) e gerenciar a chave de API",
  "Show remote session URL and QR code": "Mostrar a URL e o QR code da sessão remota",
  "List saved conversations to resume or delete them": "Listar as conversas salvas para retomar ou apagar",
  "Set a session-scoped context window override for a model": "Definir, para a sessão, um ajuste de janela de contexto de um modelo",
  "List available skills": "Listar as skills disponíveis",
  "Show OpenClaude status including version, model, account, API connectivity, and tool statuses": "Mostrar o status do OpenClaude: versão, modelo, conta, conexão com a API e estado das ferramentas",
  "List and manage background tasks": "Listar e gerenciar as tarefas em segundo plano",
  "Change the theme": "Mudar o tema",
  "Toggle between Vim and Normal editing modes": "Alternar entre os modos de edição Vim e Normal",
  "Your 2025 OpenClaude Year in Review": "Seu retrospecto de 2025 no OpenClaude",
  "Play the thinkback animation": "Reproduzir a animação do retrospecto",
  "Manage allow & deny tool permission rules": "Gerenciar as regras de permissão e bloqueio de ferramentas",
  "Enable plan mode or view the current session plan": "Ativar o modo plano ou ver o plano da sessão atual",
  "View and update your privacy settings": "Ver e alterar suas configurações de privacidade",
  "Manage API provider profiles": "Gerenciar os perfis de provedores de API",
  "View hook configurations for tool events": "Ver as configurações de hooks dos eventos de ferramentas",
  "List all files currently in context": "Listar todos os arquivos que estão no contexto",
  "Create a branch of the current conversation at this point": "Criar uma ramificação da conversa atual a partir deste ponto",
  "Manage agent configurations": "Gerenciar as configurações dos agentes",
  "Configure auto-fix: run lint/test after AI edits": "Configurar o auto-fix: rodar lint e testes depois das edições da IA",
  "Manage OpenClaude plugins": "Gerenciar os plugins do OpenClaude",
  "Activate pending plugin changes in the current session": "Ativar na sessão atual as alterações de plugins pendentes",
  "Restore the code and/or conversation to a previous point": "Restaurar o código e/ou a conversa para um ponto anterior",
  "Dump the JS heap to ~/Desktop": "Salvar o heap do JS em ~/Desktop",
  "Inject bridge failure states for manual recovery testing": "Simular falhas da ponte para testar a recuperação manual",
  "Print the version this session is running (not what autoupdate downloaded)": "Mostrar a versão desta sessão (não a que a atualização automática baixou)",
  "Update OpenClaude to the latest version": "Atualizar o OpenClaude para a versão mais recente",
  "Initialize and inspect the OpenClaude project wiki": "Iniciar e consultar a wiki do projeto do OpenClaude",
  "Claude in Chrome (Beta) settings": "Configurações do Claude no Chrome (Beta)",
  "Order OpenClaude stickers": "Pedir adesivos do OpenClaude",
  "Configure the advisor model": "Configurar o modelo consultor",
  "Earn opengateway credits from sponsored tips (ads.gitlawb.com)": "Ganhar créditos do opengateway com dicas patrocinadas (ads.gitlawb.com)",
  "Configure smart auto-routing (experimental): route simple turns to your configured simple model": "Configurar o roteamento automático inteligente (experimental): manda os turnos simples para o modelo simples configurado",
  "Exit the REPL": "Sair do REPL",
  "Export the current conversation to a file or clipboard": "Exportar a conversa atual para um arquivo ou para a área de transferência",
  "Toggle a searchable tag on the current session": "Ligar ou desligar uma etiqueta pesquisável na sessão atual",
  "Deprecated: use /config to change output style": "Obsoleto: use /config para mudar o estilo de saída",
  "Configure the default remote environment for teleport sessions": "Configurar o ambiente remoto padrão das sessões teleport",
  "Upgrade to Max for higher rate limits and more Opus": "Assinar o Max para ter limites maiores e mais Opus",
  "Show options when rate limit is reached": "Mostrar as opções quando o limite de uso é atingido",
  "Set up OpenClaude's status line UI": "Configurar a linha de status do OpenClaude",
  "Set effort level for model usage": "Definir o nível de esforço do modelo",
  "Show your OpenClaude usage statistics and activity": "Mostrar suas estatísticas de uso e atividade no OpenClaude",
  "Hatch, pet, and manage your OpenClaude companion": "Chocar, acariciar e gerenciar seu companheiro do OpenClaude",
  "Generate a report analyzing your OpenClaude sessions": "Gerar um relatório analisando suas sessões do OpenClaude",
  "Install OpenClaude native build": "Instalar a versão nativa do OpenClaude",
};
// Estas aparecem em duas definições do mesmo comando no pacote.
const EM_DOBRO = new Set([
  "Configure extra usage to keep working when limits are hit",
  "Show estimated request context load and top contributors",
  "Generate a report analyzing your OpenClaude sessions",
]);
for (const [en, pt] of Object.entries(DESCRICOES)) {
  add(`description:"${en}"`, `description:"${pt}"`, EM_DOBRO.has(en) ? 2 : 1);
}

// Descrições montadas na hora (getter ou condicional): traduz cada pedaço fixo.
add('"Initialize new project instruction file(s) and optional skills/hooks with codebase documentation"',
    '"Criar arquivo(s) de instruções do projeto novos, com skills/hooks opcionais e documentação do código"');
add('"Initialize a new project instruction file with codebase documentation"',
    '"Criar um novo arquivo de instruções do projeto com a documentação do código"', 2);
add('"Switch Anthropic accounts"', '"Trocar de conta Anthropic"');
add('"Sign in with your Anthropic account"', '"Entrar com sua conta Anthropic"', 2);
add('"Enable Option+Enter key binding for newlines and visual bell"',
    '"Ativar o atalho Option+Enter para quebra de linha e o aviso visual"');
add('"Install Shift+Enter key binding for newlines"', '"Instalar o atalho Shift+Enter para quebra de linha"', 2);
add("`Set the AI model for OpenClaude (currently ", "`Definir o modelo de IA do OpenClaude (atual: ");
add("`Toggle fast mode (", "`Ligar ou desligar o modo rápido (");
add("`~10–20 min · Finds and verifies bugs in your branch. Runs in OpenClaude on the web. See ${",
    "`~10–20 min · Encontra e confirma bugs na sua branch. Roda no OpenClaude na web. Veja ${");
add("`~10–30 min · OpenClaude on the web drafts an advanced plan you can edit and approve. See ${",
    "`~10–30 min · O OpenClaude na web monta um plano avançado que você pode editar e aprovar. Veja ${");

module.exports = T;
