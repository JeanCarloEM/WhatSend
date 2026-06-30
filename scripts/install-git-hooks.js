// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const GIT_DIR = path.join(ROOT_DIR, ".git");
const HOOKS_DIR = path.join(GIT_DIR, "hooks");
const PRE_COMMIT_PATH = path.join(HOOKS_DIR, "pre-commit");

function installGitHooks() {
  if (!fs.existsSync(GIT_DIR) || !fs.statSync(GIT_DIR).isDirectory()) {
    return false;
  }

  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.writeFileSync(
    PRE_COMMIT_PATH,
    [
      "#!/bin/sh",
      "node scripts/validate-release-notes-policy.js --staged",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    fs.chmodSync(PRE_COMMIT_PATH, 0o755);
  } catch {
    // Windows pode ignorar chmod; o Git for Windows ainda executa hooks shell válidos.
  }

  return true;
}

if (require.main === module) {
  try {
    if (installGitHooks()) {
      console.log("Hook Git local instalado: pre-commit.");
    }
  } catch (err) {
    console.warn(`Aviso: não foi possível instalar hook Git local: ${err.message}`);
  }
}

module.exports = { installGitHooks };
