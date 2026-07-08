// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const path = require("path");
const terser = require("terser");
const { createZipFromDirectory } = require("./archive");
const { RELEASE_NOTES_PATH, validateReleaseNotesContent } = require("./release-notes-policy");
const {
  VERSION_FILE_NAME,
  collectReleaseOptions,
  parseReleaseArgs,
  resolveReleaseMetadata,
  writeVersionFile,
} = require("./release-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const STRUCTURE_ONLY_DIRS = ["logs", "modelos", "listas"];
const ROOT_FILES = [
  "LICENSE",
  "main.js",
  "package-lock.json",
  "package.json",
  "RCF.md",
  "README.md",
  "start.bat",
  "start.cmd",
  "start.sh",
  "atualizar.bat",
  "atualizar.cmd",
  "atualizar.sh",
];
const ROOT_GLOB_PREFIXES = [
  ".editorconfig",
  ".prettier",
  "README",
];
const ROOT_DIRS = ["docs", "scripts", "src"];
const EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".runtime",
  ".wwebjs_auth",
  ".wwebjs_cache",
  ".wwebjs_sessions.json",
  "AGENTS.md",
  "continue.ia",
  "dist",
  "logs",
  "node_modules",
  "test",
]);
const EXCLUDED_SUFFIXES = [
  ".log",
  ".tmp",
  ".temp",
  ".bak",
  ".zip",
];
const ROOT_ONLY_EXCLUDED_NAMES = new Set(["clientes.csv", "texto.md"]);
const LEGAL_HEADER_KEYWORDS = [
  /autor/iu,
  /author/iu,
  /copyright/iu,
  /licen[çc]a/iu,
  /license/iu,
  /spdx-license-identifier/iu,
  /disclaimer/iu,
  /atribui[çc][aã]o/iu,
  /notice/iu,
];

async function buildDist(options = {}) {
  const collectedOptions = await collectReleaseOptions(options, { rootDir: ROOT_DIR });
  const releaseMetadata = resolveReleaseMetadata(collectedOptions, { rootDir: ROOT_DIR });
  const releaseNotesSnapshot = readExistingReleaseNotes();

  cleanDistDirectory();
  fs.mkdirSync(DIST_DIR, { recursive: true });

  for (const fileName of ROOT_FILES) {
    copyRootFile(fileName);
  }

  writeRuntimePackageFiles();
  copyOptionalRootConfigFiles();

  for (const dirName of ROOT_DIRS) {
    copyDirectory(path.join(ROOT_DIR, dirName), path.join(DIST_DIR, dirName));
  }

  for (const dirName of STRUCTURE_ONLY_DIRS) {
    fs.mkdirSync(path.join(DIST_DIR, dirName), { recursive: true });
  }

  ensureEnvExample();
  writeVersionFile(releaseMetadata, path.join(DIST_DIR, VERSION_FILE_NAME));
  await minifyJavaScriptFiles(DIST_DIR);
  restoreExistingReleaseNotes(releaseNotesSnapshot);
  validateBuiltDist();
  const archivePath = createDistributionArchive(releaseMetadata);
  console.log(`Release distribuível gerada em ${path.relative(ROOT_DIR, DIST_DIR)}`);
  console.log(`Pacote ZIP gerado em ${path.relative(ROOT_DIR, archivePath)}`);
  return {
    archivePath,
    metadata: releaseMetadata,
  };
}

function readExistingReleaseNotes() {
  if (!fs.existsSync(RELEASE_NOTES_PATH) || !fs.statSync(RELEASE_NOTES_PATH).isFile()) {
    return null;
  }

  return fs.readFileSync(RELEASE_NOTES_PATH);
}

function restoreExistingReleaseNotes(snapshot) {
  if (!snapshot) {
    return;
  }

  fs.mkdirSync(path.dirname(RELEASE_NOTES_PATH), { recursive: true });
  fs.writeFileSync(RELEASE_NOTES_PATH, snapshot);
}

function cleanDistDirectory() {
  if (!fs.existsSync(DIST_DIR)) {
    return;
  }

  for (const entry of sortedDirents(DIST_DIR)) {
    if (path.join(DIST_DIR, entry.name) === RELEASE_NOTES_PATH) {
      continue;
    }

    fs.rmSync(path.join(DIST_DIR, entry.name), {
      force: true,
      maxRetries: 8,
      recursive: true,
      retryDelay: 250,
    });
  }
}

function copyRootFile(fileName) {
  const source = path.join(ROOT_DIR, fileName);

  if (shouldExcludeRootFile(fileName) || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    return;
  }

  copyFile(source, path.join(DIST_DIR, fileName));
}

function copyOptionalRootConfigFiles() {
  for (const entry of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === ".env" || shouldExcludeRootFile(entry.name)) {
      continue;
    }

    if (entry.name.startsWith(".env.") || ROOT_GLOB_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
      copyFile(path.join(ROOT_DIR, entry.name), path.join(DIST_DIR, entry.name));
    }
  }
}

function writeRuntimePackageFiles() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const runtimePackage = {
    author: packageJson.author,
    dependencies: packageJson.dependencies || {},
    description: packageJson.description,
    license: packageJson.license,
    main: packageJson.main,
    name: packageJson.name,
    scripts: pickRuntimeScripts(packageJson.scripts || {}),
    type: packageJson.type,
    version: packageJson.version,
  };

  fs.writeFileSync(
    path.join(DIST_DIR, "package.json"),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
    "utf8",
  );

  const lockPath = path.join(ROOT_DIR, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    return;
  }

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (lock.packages && lock.packages[""]) {
    lock.packages[""] = {
      ...lock.packages[""],
      dependencies: runtimePackage.dependencies,
    };
    delete lock.packages[""].devDependencies;
  }

  if (lock.packages) {
    for (const [name, metadata] of Object.entries(lock.packages)) {
      if (name && metadata && metadata.dev === true && metadata.optional !== true) {
        delete lock.packages[name];
      }
    }
  }

  fs.writeFileSync(
    path.join(DIST_DIR, "package-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
    "utf8",
  );
}

function pickRuntimeScripts(scripts) {
  const allowed = [
    "browser:ensure",
    "check",
    "gui",
    "start",
    "start:clear",
    "start:force",
    "start:gui",
    "start:reset",
    "sent:clear",
    "update",
  ];
  const result = {};

  for (const name of allowed) {
    if (scripts[name]) {
      result[name] = scripts[name];
    }
  }

  return result;
}

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of sortedDirents(sourceDir)) {
    if (shouldExcludeEntry(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

async function minifyJavaScriptFiles(dirPath) {
  for (const filePath of listFiles(dirPath)) {
    if (path.extname(filePath).toLocaleLowerCase("en-US") !== ".js") {
      continue;
    }

    const code = fs.readFileSync(filePath, "utf8");
    const { header, body } = splitLeadingLegalHeader(code);
    const result = await terser.minify(body, {
      compress: {
        passes: 2,
      },
      format: {
        comments: false,
      },
      mangle: false,
      module: false,
    });

    if (!result.code) {
      throw new Error(`Falha ao minificar ${path.relative(DIST_DIR, filePath)}`);
    }

    fs.writeFileSync(filePath, `${header}${result.code}\n`, "utf8");
  }
}

function ensureEnvExample() {
  const envFiles = fs
    .readdirSync(DIST_DIR)
    .filter((name) => name.startsWith(".env") && name !== ".env");

  if (envFiles.length > 0) {
    return;
  }

  fs.writeFileSync(
    path.join(DIST_DIR, ".env.example"),
    [
      "MESSAGE_DIFF_THRESHOLD_PERCENT=10",
      "RESEND_AFTER_HOURS=48",
      "MIN_DELAY_MS=8000",
      "MAX_DELAY_MS=20000",
      "",
    ].join("\n"),
    "utf8",
  );
}

function shouldExcludeEntry(name) {
  return (
    EXCLUDED_NAMES.has(name) ||
    name.startsWith(".") ||
    EXCLUDED_SUFFIXES.some((suffix) => name.toLocaleLowerCase("en-US").endsWith(suffix))
  );
}

function shouldExcludeRootFile(name) {
  return EXCLUDED_NAMES.has(name) || ROOT_ONLY_EXCLUDED_NAMES.has(name);
}

function validateBuiltDist() {
  validateRootOperationalFilesExcluded();
  validateVersionMetadata();
  validateReleaseNotesIfPresent();
  validateMinifiedLegalHeaders();
}

function validateVersionMetadata() {
  const versionPath = path.join(DIST_DIR, VERSION_FILE_NAME);

  if (!fs.existsSync(versionPath) || !fs.statSync(versionPath).isFile()) {
    throw new Error(`${VERSION_FILE_NAME} obrigatório ausente em dist.`);
  }

  const metadata = JSON.parse(fs.readFileSync(versionPath, "utf8"));

  if (!metadata.versionId || !metadata.tagName || !metadata.artifactName) {
    throw new Error(`${VERSION_FILE_NAME} não contém metadados de release suficientes.`);
  }
}

function createDistributionArchive(releaseMetadata) {
  const archivePath = path.join(DIST_DIR, releaseMetadata.artifactName);

  createZipFromDirectory(DIST_DIR, archivePath, {
    exclude: [/^WhatSend-v.+\.zip$/u],
  });

  return archivePath;
}

function validateReleaseNotesIfPresent() {
  if (!fs.existsSync(RELEASE_NOTES_PATH)) {
    return;
  }

  validateReleaseNotesContent(fs.readFileSync(RELEASE_NOTES_PATH, "utf8"));
}

function validateRootOperationalFilesExcluded() {
  for (const fileName of ROOT_ONLY_EXCLUDED_NAMES) {
    const filePath = path.join(DIST_DIR, fileName);

    if (fs.existsSync(filePath)) {
      throw new Error(`Arquivo operacional da raiz não pode compor a release: ${fileName}`);
    }
  }
}

function validateMinifiedLegalHeaders() {
  for (const sourcePath of listDistributedJavaScriptSources()) {
    const relativePath = path.relative(ROOT_DIR, sourcePath);
    const distPath = path.join(DIST_DIR, relativePath);

    if (!fs.existsSync(distPath)) {
      continue;
    }

    const sourceCode = fs.readFileSync(sourcePath, "utf8");
    const { header } = splitLeadingLegalHeader(sourceCode);

    if (!header) {
      continue;
    }

    const distCode = fs.readFileSync(distPath, "utf8");

    if (!distCode.startsWith(header)) {
      throw new Error(`Cabeçalho legal não preservado integralmente em ${path.relative(DIST_DIR, distPath)}`);
    }
  }
}

function listDistributedJavaScriptSources() {
  return [
    path.join(ROOT_DIR, "main.js"),
    ...listFiles(path.join(ROOT_DIR, "scripts")).filter((filePath) => path.extname(filePath) === ".js"),
    ...listFiles(path.join(ROOT_DIR, "src")).filter((filePath) => path.extname(filePath) === ".js"),
  ];
}

function splitLeadingLegalHeader(code) {
  const header = extractLeadingCommentHeader(code);

  if (!header || !LEGAL_HEADER_KEYWORDS.some((pattern) => pattern.test(header))) {
    return {
      body: code,
      header: "",
    };
  }

  return {
    body: code.slice(header.length),
    header,
  };
}

function extractLeadingCommentHeader(code) {
  if (code.startsWith("/*")) {
    const endIndex = code.indexOf("*/");

    if (endIndex === -1) {
      return "";
    }

    return includeTrailingBlankLines(code, endIndex + 2);
  }

  let offset = 0;
  let sawComment = false;

  while (offset < code.length) {
    const lineEnd = findLineEnd(code, offset);
    const nextOffset = lineEnd.nextOffset;
    const line = code.slice(offset, lineEnd.contentEnd);

    if (line.startsWith("//")) {
      sawComment = true;
      offset = nextOffset;
      continue;
    }

    if (sawComment && line.trim() === "") {
      offset = nextOffset;
      break;
    }

    break;
  }

  return sawComment ? code.slice(0, offset) : "";
}

function includeTrailingBlankLines(code, offset) {
  let currentOffset = offset;

  while (currentOffset < code.length) {
    const lineEnd = findLineEnd(code, currentOffset);
    const line = code.slice(currentOffset, lineEnd.contentEnd);

    if (line.trim() !== "") {
      break;
    }

    currentOffset = lineEnd.nextOffset;
  }

  return code.slice(0, currentOffset);
}

function findLineEnd(code, offset) {
  let index = offset;

  while (index < code.length && code[index] !== "\n" && code[index] !== "\r") {
    index += 1;
  }

  if (index >= code.length) {
    return {
      contentEnd: code.length,
      nextOffset: code.length,
    };
  }

  const nextOffset = code[index] === "\r" && code[index + 1] === "\n" ? index + 2 : index + 1;

  return {
    contentEnd: index,
    nextOffset,
  };
}

function listFiles(dirPath) {
  const files = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  for (const entry of sortedDirents(dirPath)) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function sortedDirents(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

if (require.main === module) {
  buildDist(parseReleaseArgs()).catch((err) => {
    console.error(`Falha ao gerar dist: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DIST_DIR,
  buildDist,
  createDistributionArchive,
  listFiles,
  splitLeadingLegalHeader,
  shouldExcludeEntry,
  shouldExcludeRootFile,
  validateVersionMetadata,
};
