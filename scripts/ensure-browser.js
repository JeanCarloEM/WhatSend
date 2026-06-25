const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  getExistingBrowserConnectionConfig,
  resolveBrowserExecutablePath,
} = require("../src/browser");
const { ROOT_DIR } = require("../src/config");

function main() {
  try {
    ensureCompatibleBrowser();
  } catch (err) {
    console.error(err.message || String(err));
    process.exitCode = 1;
  }
}

function ensureCompatibleBrowser() {
  if (getExistingBrowserConnectionConfig()) {
    console.log("Navegador existente configurado por BROWSER_URL/BROWSER_WS_ENDPOINT.");
    return;
  }

  const currentBrowser = findCompatibleBrowser();

  if (currentBrowser) {
    console.log(`Navegador compatível encontrado: ${currentBrowser}`);
    return;
  }

  console.log("Chrome/Edge/Chromium não encontrado. Instalando Chrome compatível...");
  installPuppeteerChrome();

  const installedBrowser = findCompatibleBrowser();

  if (!installedBrowser) {
    throw new Error(
      "A instalação automática do Chrome foi concluída, mas o executável não foi encontrado. Rode `npx puppeteer browsers install chrome` manualmente ou configure PUPPETEER_EXECUTABLE_PATH.",
    );
  }

  console.log(`Chrome compatível instalado: ${installedBrowser}`);
}

function findCompatibleBrowser() {
  try {
    return resolveBrowserExecutablePath();
  } catch (_) {
    return "";
  }
}

function installPuppeteerChrome() {
  const command = resolvePuppeteerCommand();
  const args = command.local
    ? ["browsers", "install", "chrome"]
    : ["exec", "--", "puppeteer", "browsers", "install", "chrome"];

  const result = childProcess.spawnSync(command.path, args, {
    cwd: ROOT_DIR,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`Falha ao iniciar instalador do Chrome: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      "Falha ao instalar Chrome compatível automaticamente. Verifique a conexão com a internet ou instale Chrome/Edge manualmente.",
    );
  }
}

function resolvePuppeteerCommand() {
  const localBin = path.join(
    ROOT_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "puppeteer.cmd" : "puppeteer",
  );

  if (fs.existsSync(localBin)) {
    return { local: true, path: localBin };
  }

  return {
    local: false,
    path: process.platform === "win32" ? "npm.cmd" : "npm",
  };
}

if (require.main === module) {
  main();
}

module.exports = {
  ensureCompatibleBrowser,
  findCompatibleBrowser,
  installPuppeteerChrome,
  resolvePuppeteerCommand,
};
