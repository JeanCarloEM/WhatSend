// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { extractZip } = require("./archive");
const { VERSION_FILE_NAME, buildVersionId } = require("./release-metadata");

const OWNER = "JeanCarloEM";
const REPO = "WhatSend";
const ROOT_DIR = path.resolve(__dirname, "..");
const GITHUB_API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const MAIN_TARBALL_URL = `https://codeload.github.com/${OWNER}/${REPO}/tar.gz/refs/heads/main`;
const GITHUB_API_VERSION = "2022-11-28";

const PROTECTED_ROOT_ENTRIES = new Set([
  ".env",
  ".git",
  ".runtime",
  ".wwebjs_auth",
  ".wwebjs_cache",
  ".wwebjs_sessions.json",
  "clientes.csv",
  "logs",
  "node_modules",
  "texto.md",
]);

function requestBuffer(url, options = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Redirecionamentos demais ao baixar: ${url}`));
  }

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: options.accept || "application/octet-stream",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "User-Agent": `${REPO}-updater`,
          ...(options.headers || {}),
        },
      },
      (res) => {
        const statusCode = res.statusCode || 0;
        const location = res.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          res.resume();
          resolve(requestBuffer(new URL(location, url).toString(), options, redirectCount + 1));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: res.headers,
            statusCode,
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Tempo esgotado ao acessar: ${url}`));
    });
  });
}

async function requestJson(url, options = {}) {
  const response = await (options.request || requestBuffer)(url, {
    accept: "application/vnd.github+json",
    headers: options.headers,
  });

  if (response.statusCode === 404 && options.allowNotFound) {
    return {
      data: null,
      headers: response.headers || {},
      statusCode: response.statusCode,
    };
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `Falha ao consultar GitHub (${response.statusCode}): ${response.body.toString("utf8").slice(0, 300)}`,
    );
  }

  try {
    return {
      data: JSON.parse(response.body.toString("utf8")),
      headers: response.headers || {},
      statusCode: response.statusCode,
    };
  } catch (err) {
    throw new Error(`Resposta inválida do GitHub em ${url}: ${err.message}`);
  }
}

async function resolveUpdateSource(options = {}) {
  const latestRelease = await requestJson(`${GITHUB_API}/releases/latest`, {
    allowNotFound: true,
    request: options.request,
  });

  if (latestRelease.statusCode === 404) {
    return resolveMainSource(options);
  }

  const release = latestRelease.data;

  if (isValidRelease(release)) {
    const commitSha = await resolveReleaseCommitSha(release, options);
    const asset = selectReleaseAsset(release);

    return {
      archiveType: asset ? "zip" : "tar.gz",
      assetDigest: asset ? asset.digest || "" : "",
      assetName: asset ? asset.name : "",
      commitSha,
      label: `release ${release.tag_name}`,
      releaseId: release.id,
      sourceType: "release",
      tagName: release.tag_name,
      url: asset ? asset.browser_download_url : release.tarball_url,
      versionId: createVersionId("release", commitSha, release.tag_name),
    };
  }

  return resolveMainSource(options);
}

function isValidRelease(release) {
  return Boolean(
    release &&
    typeof release.tag_name === "string" &&
    release.tag_name.trim() &&
    typeof release.tarball_url === "string" &&
    release.tarball_url.trim(),
  );
}

function selectReleaseAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];

  return assets
    .filter((asset) => (
      asset &&
      typeof asset.name === "string" &&
      /^WhatSend-v.+\.zip$/u.test(asset.name) &&
      typeof asset.browser_download_url === "string" &&
      asset.browser_download_url
    ))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))[0] || null;
}

async function resolveCommitSha(ref, options = {}) {
  const response = await requestJson(`${GITHUB_API}/commits/${encodeURIComponent(ref)}`, {
    request: options.request,
  });
  const sha = response.data && response.data.sha;

  if (!isCommitSha(sha)) {
    throw new Error(`Não foi possível identificar o commit remoto para ${ref}.`);
  }

  return sha;
}

async function resolveReleaseCommitSha(release, options = {}) {
  if (isCommitSha(release.target_commitish)) {
    return release.target_commitish;
  }

  return resolveCommitSha(release.tag_name, options);
}

async function resolveMainSource(options = {}) {
  const response = await requestJson(`${GITHUB_API}/branches/main`, {
    request: options.request,
  });
  const commitSha = response.data && response.data.commit && response.data.commit.sha;

  if (!isCommitSha(commitSha)) {
    throw new Error("Não foi possível identificar o commit remoto da branch main.");
  }

  return {
    commitSha,
    label: "branch main (nenhuma release válida publicada)",
    sourceType: "main",
    url: MAIN_TARBALL_URL,
    versionId: createVersionId("main", commitSha),
  };
}

function createVersionId(sourceType, commitSha, tagName = "") {
  const normalizedSource = String(sourceType || "").trim().toLowerCase();
  const normalizedSha = String(commitSha || "").trim().toLowerCase();
  const normalizedTag = String(tagName || "").trim();

  if (normalizedSource === "release") {
    return buildVersionId(normalizedTag, normalizedSha);
  }

  return `main:${normalizedSha}`;
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/iu.test(value);
}

function readInstalledVersion(rootDir = ROOT_DIR) {
  const filePath = path.join(rootDir, VERSION_FILE_NAME);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`Aviso: ${VERSION_FILE_NAME} inválido será ignorado (${err.message}).`);
    return null;
  }
}

function isSameInstalledVersion(installed, source) {
  return Boolean(
    installed &&
    source &&
    typeof installed.versionId === "string" &&
    installed.versionId === source.versionId,
  );
}

function writeInstalledVersion(source, rootDir = ROOT_DIR) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const currentVersionPath = path.join(rootDir, VERSION_FILE_NAME);
  let currentVersion = {};
  let packageVersion = "";

  if (fs.existsSync(currentVersionPath) && fs.statSync(currentVersionPath).isFile()) {
    try {
      currentVersion = JSON.parse(fs.readFileSync(currentVersionPath, "utf8"));
    } catch {
      currentVersion = {};
    }
  }

  if (fs.existsSync(packageJsonPath)) {
    try {
      packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version || "";
    } catch {
      packageVersion = "";
    }
  }

  const version = {
    schema: 1,
    repository: `${OWNER}/${REPO}`,
    ...currentVersion,
    sourceType: source.sourceType,
    tagName: source.tagName || "",
    commitSha: source.commitSha,
    versionId: source.versionId,
    packageVersion,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(rootDir, VERSION_FILE_NAME),
    `${JSON.stringify(version, null, 2)}\n`,
    "utf8",
  );
}

async function downloadTarball(source) {
  const response = await requestBuffer(source.url);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Falha ao baixar ${source.label} (${response.statusCode}).`);
  }

  return response.body;
}

function extractArchive(archiveBuffer, source, destinationDir) {
  if (source.archiveType === "zip") {
    extractZip(archiveBuffer, destinationDir);
    return;
  }

  extractTarGz(archiveBuffer, destinationDir);
}

function readTarString(buffer, start, length) {
  return buffer
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/u, "")
    .trim();
}

function readTarSize(buffer, start) {
  const value = readTarString(buffer, start, 12).trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function isEmptyTarBlock(buffer, offset) {
  for (let index = offset; index < offset + 512; index += 1) {
    if (buffer[index] !== 0) {
      return false;
    }
  }

  return true;
}

function safeTarPath(name) {
  const normalized = name.replace(/\\/gu, "/").replace(/^\/+/u, "");
  const withoutRoot = normalized.split("/").slice(1).join("/");

  if (!withoutRoot || withoutRoot.includes("..")) {
    return "";
  }

  return withoutRoot;
}

function extractTarGz(tarGzBuffer, destinationDir) {
  const tar = zlib.gunzipSync(tarGzBuffer);

  for (let offset = 0; offset < tar.length;) {
    if (offset + 512 > tar.length || isEmptyTarBlock(tar, offset)) {
      break;
    }

    const rawName = readTarString(tar, offset, 100);
    const prefix = readTarString(tar, offset + 345, 155);
    const type = String.fromCharCode(tar[offset + 156] || 0);
    const size = readTarSize(tar, offset + 124);
    const fullName = prefix ? `${prefix}/${rawName}` : rawName;
    const relativePath = safeTarPath(fullName);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;

    if (relativePath) {
      const targetPath = path.join(destinationDir, relativePath);

      if (type === "5") {
        fs.mkdirSync(targetPath, { recursive: true });
      } else if (type === "0" || type === "\0" || type === "") {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, tar.subarray(contentStart, contentEnd));
      }
    }

    offset = contentStart + Math.ceil(size / 512) * 512;
  }
}

function shouldSkip(relativePath) {
  const firstPart = relativePath.split(/[\\/]/u)[0];
  return PROTECTED_ROOT_ENTRIES.has(firstPart);
}

function copyTree(sourceDir, targetDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const relativePath = path.relative(sourceDir, sourcePath);

    copyEntry(sourcePath, path.join(targetDir, entry.name), relativePath);
  }
}

function copyEntry(sourcePath, targetPath, relativePath) {
  if (shouldSkip(relativePath)) {
    console.log(`Preservando arquivo/pasta local: ${relativePath}`);
    return;
  }

  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });

    for (const entry of fs.readdirSync(sourcePath)) {
      copyEntry(
        path.join(sourcePath, entry),
        path.join(targetPath, entry),
        path.join(relativePath, entry),
      );
    }

    return;
  }

  if (!stat.isFile()) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = childProcess.spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: "true",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Comando falhou: ${command} ${args.join(" ")}`);
  }
}

async function updateProject() {
  const source = await resolveUpdateSource();
  console.log(`Fonte da atualização: ${source.label}`);

  const installed = readInstalledVersion();

  if (isSameInstalledVersion(installed, source)) {
    console.log(`WhatSend já está atualizado (${source.versionId}).`);
    return false;
  }

  const tarball = await downloadTarball(source);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${REPO}-update-`));
  const extractDir = path.join(tempDir, "source");

  try {
    fs.mkdirSync(extractDir, { recursive: true });
    extractArchive(tarball, source, extractDir);
    copyTree(extractDir, ROOT_DIR);
  } finally {
    fs.rmSync(tempDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }

  run("npm", ["install"]);
  run("node", ["scripts/ensure-browser.js"]);
  writeInstalledVersion(source);

  console.log(`Atualização concluída (${source.versionId}).`);
  return true;
}

if (require.main === module) {
  updateProject().catch((err) => {
    console.error(`Atualização falhou: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MAIN_TARBALL_URL,
  PROTECTED_ROOT_ENTRIES,
  VERSION_FILE_NAME,
  copyTree,
  createVersionId,
  extractArchive,
  extractTarGz,
  isSameInstalledVersion,
  readInstalledVersion,
  resolveUpdateSource,
  safeTarPath,
  selectReleaseAsset,
  shouldSkip,
  updateProject,
  writeInstalledVersion,
};
