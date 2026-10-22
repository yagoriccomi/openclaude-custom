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

const PKG_DIR = path.join(process.env.APPDATA || "", "npm", "node_modules", "@gitlawb", "openclaude");
const CLI = path.join(PKG_DIR, "dist", "cli.mjs");
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
];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

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
  if (auto && prev.size === now.size && prev.mtimeMs === now.mtimeMs) return 0;

  let src = fs.readFileSync(CLI, "utf8");
  const original = src;
  let failed = 0;
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

  if (src !== original) {
    const backup = path.join(__dirname, "backup", `cli.mjs.${version}.original`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
    fs.writeFileSync(CLI, src);
  }
  // Só memoriza o estado quando tudo deu certo, para o --auto avisar de novo no próximo início.
  if (!failed) fs.writeFileSync(STATE, JSON.stringify({ version, ...stamp(CLI) }, null, 2));
  return failed ? 2 : 0;
}

process.exitCode = main();
