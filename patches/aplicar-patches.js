// Reaplica no OpenClaude instalado pelo npm as correções locais que precisam ficar
// dentro do pacote. Seguro de rodar quantas vezes quiser (idempotente).
//
//   node aplicar-patches.js          aplica e mostra o resultado
//   node aplicar-patches.js --auto   usado pelos atalhos em ~/.openclaude/bin: só faz
//                                    algo se o cli.mjs mudou (ex.: depois de npm update)
//
// Se uma atualização mudar o trecho que o patch procura, o script NÃO adivinha:
// avisa em vermelho e deixa o arquivo como está, para ajustar o patch à mão.
"use strict";

const fs = require("fs");
const path = require("path");

// O pacote mudou de @gitlawb para @twigpine em 2026-10; aceita os dois.
const PKG_DIR =
  ["@twigpine", "@gitlawb"]
    .map((scope) => path.join(process.env.APPDATA || "", "npm", "node_modules", scope, "openclaude"))
    .find((dir) => fs.existsSync(path.join(dir, "dist", "cli.mjs"))) ||
  path.join(process.env.APPDATA || "", "npm", "node_modules", "@twigpine", "openclaude");
const CLI = process.env.OPENCLAUDE_CLI_TESTE || path.join(PKG_DIR, "dist", "cli.mjs"); // _TESTE: só para ensaiar numa cópia
const STATE = path.join(__dirname, ".state.json");
const auto = process.argv.includes("--auto");

const PATCHES = [
  {
    id: "win32-sem-passwordvault",
    why:
      "No Windows, guarda as credenciais só em ~/.openclaude/.credentials.json em vez de chamar " +
      "powershell.exe + Windows.Security.Credentials.PasswordVault (o Kaspersky acusa isso como " +
      "PDM:HackTool.Win32.Lazagne.a).",
    find:
      'if(process.platform==="win32")return allowPlainTextFallback?createFallbackStorage(windowsCredentialStorage,plainTextStorage):windowsCredentialStorage;',
    replace: 'if(process.platform==="win32")return plainTextStorage/*patch:win32-sem-passwordvault*/;',
  },
  {
    id: "sem-limite-de-turnos",
    why:
      "Sem valor configurado, o modo interativo para em 50 turnos (\"Reached the maximum number of " +
      "turns (50)\"). Agora, sem valor configurado, não há limite; --max-turns N, OPENCLAUDE_MAX_TURNS " +
      "e o /config continuam valendo quando definidos.",
    find: "if(configured===void 0)return DEFAULT_REPL_MAX_TURNS;return normalizeReplMaxTurns(configured)",
    replace: "if(configured===void 0)return/*patch:sem-limite-de-turnos*/;return normalizeReplMaxTurns(configured)",
  },
  {
    id: "effort-claude-openai",
    why:
      "Com provedor OpenAI (o 9router), o /effort dizia \"Effort not supported for this model\" para " +
      "qualquer Claude: o OpenClaude só libera effort a opus/sonnet/haiku falando direto com a " +
      "Anthropic. Agora Opus, Sonnet e Fable 5+ ganham low/medium/high/xhigh/max, como se " +
      "ANTHROPIC_DEFAULT_*_MODEL_SUPPORTED_CAPABILITIES=effort,xhigh_effort,max_effort estivesse " +
      "no perfil. O OpenClaude manda reasoning_effort e o router-proxy o entrega ao Claude.",
    find:
      'get3PModelCapabilityOverride=memoize_default((model,capability,apiProvider)=>{if((apiProvider??getAPIProvider())==="firstParty"&&isFirstPartyAnthropicBaseUrl())return;',
    replace:
      'get3PModelCapabilityOverride=memoize_default((model,capability,apiProvider)=>{if((apiProvider??getAPIProvider())==="firstParty"&&isFirstPartyAnthropicBaseUrl())return;' +
      'if(/claude-(opus|sonnet|fable)-[5-9]/i.test(model)&&/^(effort|xhigh_effort|max_effort)$/.test(capability))return!0/*patch:effort-claude-openai*/;',
  },
  {
    id: "effort-max-claude-openai",
    why:
      "No provedor OpenAI, o OpenClaude troca o effort max por xhigh, porque os modelos GPT não " +
      "aceitam max. No Claude, max é outro nível: num teste de 16/11/2026 gastou 8.510 tokens " +
      "contra 3.087 do high. Para Opus, Sonnet e Fable 5+, max agora segue como max.",
    find: 'k3ReasoningControl?"max":standardEffortToOpenAI(appliedEffortLevel):void 0',
    replace:
      'k3ReasoningControl||appliedEffortLevel==="max"&&/claude-(opus|sonnet|fable)-[5-9]/i.test(String(effortModel))' +
      '/*patch:effort-max-claude-openai*/?"max":standardEffortToOpenAI(appliedEffortLevel):void 0',
  },
  {
    id: "effort-max-claude-openai-pedido",
    why:
      "Segunda metade do effort-max-claude-openai: ao montar o pedido, o OpenClaude descarta o " +
      "effort max de modelos que o catálogo interno não marca com max, e o pedido saía sem effort.",
    find: 'reasoning=normalizedReasoning?.effort==="max"&&!supportsMaxReasoning||',
    replace:
      'reasoning=normalizedReasoning?.effort==="max"&&!supportsMaxReasoning' +
      '&&!/claude-(opus|sonnet|fable)-[5-9]/i.test(String(requestedModel))/*patch:effort-max-claude-openai-pedido*/||',
  },
];

const TRAD_FILE = path.join(__dirname, "traducao-ptbr.js");
const checkOnly = process.argv.includes("--traducao");

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// Aplica a tradução (patches/traducao-ptbr.js) e devolve o texto novo + o relatório de cada linha.
// Linha com contagem diferente da esperada é pulada: não tenta adivinhar, só avisa.
function aplicarTraducao(src) {
  const rel = { aplicadas: 0, jaFeitas: 0, problemas: [] };
  let linhas;
  try {
    delete require.cache[require.resolve(TRAD_FILE)];
    linhas = require(TRAD_FILE);
  } catch (e) {
    rel.problemas.push(`não consegui ler traducao-ptbr.js: ${e.message}`);
    return { src, rel };
  }
  for (const t of linhas) {
    const nome = t.nome || String(t.find instanceof RegExp ? t.find : t.find).slice(0, 60);
    const achados =
      t.find instanceof RegExp ? (src.match(new RegExp(t.find.source, "g")) || []).length : src.split(t.find).length - 1;
    // Lista inteira trocada por regex: o resultado também casa com a regex, então já está feito.
    if (t.find instanceof RegExp && src.includes(t.replace)) {
      rel.jaFeitas++;
      continue;
    }
    if (achados === 0) {
      const textoNovo = t.replace;
      if (src.includes(textoNovo)) rel.jaFeitas++;
      else rel.problemas.push(`${nome}: não encontrado`);
      continue;
    }
    if (achados !== t.count) {
      rel.problemas.push(`${nome}: apareceu ${achados}x, esperado ${t.count}x`);
      continue;
    }
    src = t.find instanceof RegExp ? src.replace(new RegExp(t.find.source, "g"), () => t.replace) : src.split(t.find).join(t.replace);
    rel.aplicadas++;
  }
  return { src, rel };
}

// Confere a sintaxe do arquivo antes de gravar por cima do cli.mjs.
function sintaxeOk(texto) {
  const tmp = path.join(__dirname, "backup", "_teste-sintaxe.mjs");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, texto);
  const r = require("child_process").spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  fs.rmSync(tmp, { force: true });
  return { ok: r.status === 0, erro: (r.stderr || "").split("\n").slice(0, 6).join("\n") };
}

function stamp(file) {
  const st = fs.statSync(file);
  return { size: st.size, mtimeMs: Math.round(st.mtimeMs) };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

function main() {
  if (!fs.existsSync(CLI)) {
    console.error(red(`[patches] OpenClaude não encontrado em ${CLI}`));
    return 1;
  }
  const version = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8")).version;
  const prev = readState();
  const now = stamp(CLI);
  // Sem traducao-ptbr.js na pasta, os patches seguem; só a tradução fica de fora (aviso amarelo).
  const tradNow = fs.existsSync(TRAD_FILE) ? stamp(TRAD_FILE) : null;
  const tradIgual = tradNow
    ? prev.trad && prev.trad.size === tradNow.size && prev.trad.mtimeMs === tradNow.mtimeMs
    : !prev.trad;
  if (auto && prev.size === now.size && prev.mtimeMs === now.mtimeMs && tradIgual) return 0;

  let src = fs.readFileSync(CLI, "utf8");
  const original = src;
  let failed = 0;

  // `--traducao`: só confere cada linha da tradução contra o cli.mjs atual, sem gravar nada.
  if (checkOnly) {
    const { rel } = aplicarTraducao(src);
    console.log(`[traducao] ${rel.aplicadas} a aplicar, ${rel.jaFeitas} já aplicadas, ${rel.problemas.length} com problema`);
    rel.problemas.forEach((p) => console.log(yellow(`  - ${p}`)));
    return rel.problemas.length ? 2 : 0;
  }
  for (const p of PATCHES) {
    if (src.includes(p.replace)) {
      if (!auto) console.log(green(`[patches] ${p.id}: já aplicado`));
      continue;
    }
    const count = src.split(p.find).length - 1;
    if (count !== 1) {
      failed++;
      console.error(
        red(
          `[patches] ${p.id}: NÃO aplicado no OpenClaude ${version} — o trecho esperado ` +
            `apareceu ${count} vez(es). A atualização mudou esse código; o patch precisa ser revisto.\n` +
            `          Motivo do patch: ${p.why}`
        )
      );
      continue;
    }
    src = src.replace(p.find, () => p.replace);
    console.log(green(`[patches] ${p.id}: aplicado no OpenClaude ${version}`));
  }

  // Tradução: linhas que não casam não derrubam nada, só entram no aviso.
  const trad = aplicarTraducao(src);
  if (trad.src !== src) {
    const chk = sintaxeOk(trad.src);
    if (chk.ok) {
      src = trad.src;
      console.log(green(`[patches] tradução pt-BR: ${trad.rel.aplicadas} trechos aplicados no OpenClaude ${version}`));
    } else {
      failed++;
      console.error(red(`[patches] tradução pt-BR REJEITADA: o arquivo ficaria com erro de sintaxe.\n${chk.erro}`));
    }
  }
  if (trad.rel.problemas.length) {
    console.error(
      yellow(`[patches] tradução pt-BR: ${trad.rel.problemas.length} linha(s) não casaram (rode: node patches/aplicar-patches.js --traducao)`)
    );
  }

  if (src !== original) {
    const backup = path.join(__dirname, "backup", `cli.mjs.${version}.original`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
    fs.writeFileSync(CLI, src);
  }
  // Só memoriza o estado quando tudo deu certo, para o --auto avisar de novo no próximo início.
  if (!failed) fs.writeFileSync(STATE, JSON.stringify({ version, ...stamp(CLI), trad: tradNow }, null, 2));
  return failed ? 2 : 0;
}

process.exitCode = main();
