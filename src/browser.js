// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const os = require("os");
const path = require("path");

const { PATHS, isTruthyEnv, readFirstEnv } = require("./config");
const { uniqueValues } = require("./utils");

function resolveBrowserExecutablePath() {
  const configuredPath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;

  if (configuredPath) {
    const resolvedPath = resolveConfiguredExecutablePath(configuredPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Navegador configurado não encontrado: ${resolvedPath}`);
    }

    return resolvedPath;
  }

  const candidatePaths = [];

  try {
    const puppeteer = require("puppeteer");
    const executablePath = puppeteer.executablePath();

    if (executablePath) {
      candidatePaths.push(executablePath);
    }
  } catch {
    // Continua procurando navegadores instalados na plataforma.
  }

  candidatePaths.push(...getInstalledBrowserCandidates());
  candidatePaths.push(...getPathBrowserCandidates());
  candidatePaths.push(...findPuppeteerCacheBrowsers());

  const executablePath = uniqueValues(candidatePaths).find((candidatePath) => {
    return candidatePath && fs.existsSync(candidatePath);
  });

  if (!executablePath) {
    throw new Error(
      "Chrome/Chromium/Edge não encontrado. Instale um navegador compatível, rode `npx puppeteer browsers install chrome`, ou configure PUPPETEER_EXECUTABLE_PATH no .env.",
    );
  }

  return executablePath;
}

function resolveConfiguredExecutablePath(configuredPath) {
  const value = String(configuredPath).trim();

  if (!value) {
    return value;
  }

  const looksLikePath =
    path.isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".");

  if (looksLikePath) {
    return path.resolve(value);
  }

  return findExecutableOnPath(value) || path.resolve(value);
}

function getInstalledBrowserCandidates(platform = os.platform()) {
  if (platform === "win32") {
    return getWindowsBrowserCandidates();
  }

  if (platform === "darwin") {
    return getMacBrowserCandidates();
  }

  return getLinuxBrowserCandidates();
}

function getWindowsBrowserCandidates() {
  const roots = [
    process.env.ProgramFiles || "C:\\Program Files",
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    process.env.LOCALAPPDATA,
  ].filter(Boolean);

  const relativePaths = [
    path.win32.join("Google", "Chrome", "Application", "chrome.exe"),
    path.win32.join("Google", "Chrome Beta", "Application", "chrome.exe"),
    path.win32.join("Chromium", "Application", "chrome.exe"),
    path.win32.join("Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  return roots.flatMap((root) =>
    relativePaths.map((relativePath) => path.win32.join(root, relativePath)),
  );
}

function getMacBrowserCandidates() {
  const roots = [
    "/Applications",
    process.env.HOME ? path.posix.join(process.env.HOME, "Applications") : undefined,
  ].filter(Boolean);

  const relativePaths = [
    path.posix.join("Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
    path.posix.join("Google Chrome Beta.app", "Contents", "MacOS", "Google Chrome Beta"),
    path.posix.join("Chromium.app", "Contents", "MacOS", "Chromium"),
    path.posix.join("Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
  ];

  return roots.flatMap((root) =>
    relativePaths.map((relativePath) => path.posix.join(root, relativePath)),
  );
}

function getLinuxBrowserCandidates() {
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/local/bin/google-chrome",
    "/usr/local/bin/chromium",
    "/snap/bin/chromium",
  ];
}

function getPathBrowserCandidates() {
  return uniqueValues(getBrowserExecutableNames().map(findExecutableOnPath));
}

function getBrowserExecutableNames(platform = os.platform()) {
  const common = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
    "msedge",
  ];

  if (platform === "win32") {
    return ["chrome.exe", "msedge.exe", "chromium.exe", ...common];
  }

  if (platform === "darwin") {
    return ["Google Chrome", "Chromium", "Microsoft Edge", ...common];
  }

  return common;
}

function getPathDirectories() {
  const pathValue = process.env.PATH || process.env.Path || process.env.path || "";
  return pathValue.split(path.delimiter).filter(Boolean);
}

function findExecutableOnPath(name) {
  const extensions =
    os.platform() === "win32" && !path.extname(name)
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of getPathDirectories()) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${name}${ext}`);

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function findPuppeteerCacheBrowsers() {
  const cacheRoots = [
    process.env.PUPPETEER_CACHE_DIR,
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, ".cache", "puppeteer")
      : undefined,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "puppeteer")
      : undefined,
  ].filter(Boolean);

  const executables = [];

  for (const cacheRoot of cacheRoots) {
    collectBrowserExecutables(cacheRoot, executables, 0);
  }

  return executables;
}

function collectBrowserExecutables(dirPath, executables, depth) {
  if (depth > 6 || executables.length >= 20 || !fs.existsSync(dirPath)) {
    return;
  }

  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isFile() && isBrowserExecutableName(entry.name)) {
      executables.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      collectBrowserExecutables(entryPath, executables, depth + 1);
    }
  }
}

function isBrowserExecutableName(name) {
  return [
    "chrome",
    "chrome.exe",
    "chromium",
    "chromium.exe",
    "google chrome",
    "google chrome for testing",
    "microsoft edge",
    "msedge.exe",
  ].includes(String(name).toLowerCase());
}

function getExistingBrowserConnectionConfig() {
  const browserWSEndpoint = readFirstEnv([
    "BROWSER_WS_ENDPOINT",
    "PUPPETEER_BROWSER_WS_ENDPOINT",
  ]);

  if (browserWSEndpoint) {
    return { browserWSEndpoint };
  }

  const browserURL = readFirstEnv(["BROWSER_URL", "PUPPETEER_BROWSER_URL"]);

  if (browserURL) {
    return { browserURL };
  }

  if (isTruthyEnv(process.env.CONNECT_EXISTING_BROWSER)) {
    return { browserURL: "http://127.0.0.1:9222" };
  }

  return null;
}

function buildPuppeteerConfig() {
  const existingBrowserConfig = getExistingBrowserConnectionConfig();

  if (existingBrowserConfig) {
    return existingBrowserConfig;
  }

  const executablePath = resolveBrowserExecutablePath();

  return {
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  };
}

function getWhatsAppClientId() {
  const clientId = readFirstEnv(["WA_CLIENT_ID", "WWEBJS_CLIENT_ID"]);

  if (!clientId) {
    return undefined;
  }

  if (!/^[-_\w]+$/i.test(clientId)) {
    throw new Error(
      "WA_CLIENT_ID inválido. Use apenas letras, números, hífen ou sublinhado.",
    );
  }

  return clientId;
}

function formatBrowserStartupError(err, paths = PATHS) {
  const message = err && err.message ? err.message : String(err);

  if (/already running/i.test(message) && /userDataDir/i.test(message)) {
    return [
      message,
      "",
      "O perfil local do WhatsApp Web já está em uso por outro navegador.",
      "Para continuar, escolha uma destas opções:",
      `- feche a janela que está usando ${path.join(paths.auth, "session")} e rode novamente;`,
      "- use WA_CLIENT_ID=outro_nome para criar uma sessão separada, possivelmente com novo QR Code;",
      "- para reutilizar uma janela já aberta, inicie Chrome/Edge com depuração remota e configure BROWSER_URL ou BROWSER_WS_ENDPOINT.",
      "",
      "Uma janela comum do navegador, aberta sem depuração remota, não pode ser anexada pelo Puppeteer.",
    ].join("\n");
  }

  if (
    /ECONNREFUSED|ECONNRESET|Failed to fetch browser webSocket URL|browserURL/i.test(
      message,
    )
  ) {
    return [
      message,
      "",
      "Não foi possível conectar ao navegador existente.",
      "Confirme que ele foi iniciado com depuração remota, por exemplo na porta 9222, e que BROWSER_URL aponta para esse endereço.",
    ].join("\n");
  }

  if (/Could not find Chrome/i.test(message)) {
    return [
      message,
      "",
      "Chrome/Chromium/Edge não foi encontrado pelo Puppeteer.",
      "Instale um navegador compatível, rode `npx puppeteer browsers install chrome`, ou configure PUPPETEER_EXECUTABLE_PATH no .env.",
    ].join("\n");
  }

  return message;
}

module.exports = {
  buildPuppeteerConfig,
  findPuppeteerCacheBrowsers,
  formatBrowserStartupError,
  getBrowserExecutableNames,
  getExistingBrowserConnectionConfig,
  getInstalledBrowserCandidates,
  getLinuxBrowserCandidates,
  getMacBrowserCandidates,
  getPathBrowserCandidates,
  getWhatsAppClientId,
  getWindowsBrowserCandidates,
  resolveBrowserExecutablePath,
};
