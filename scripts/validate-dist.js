// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { RELEASE_NOTES_RELATIVE_PATH, validateReleaseNotesContent } = require("./release-notes-policy");
const { VERSION_FILE_NAME } = require("./release-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const REQUIRED_FILES = [
  "LICENSE",
  "main.js",
  "package-lock.json",
  "package.json",
  "RCF.md",
  "README.md",
  VERSION_FILE_NAME,
  "src/index.js",
];
const REQUIRED_DIRS = ["docs", "scripts", "src", "logs", "modelos", "listas"];
const FORBIDDEN_NAMES = new Set([
  ".git",
  ".github",
  ".runtime",
  ".wwebjs_auth",
  ".wwebjs_cache",
  ".wwebjs_sessions.json",
  "AGENTS.md",
  "node_modules",
  "test",
]);
const ALLOWED_DOT_FILES = [/^\.env\./u, /^\.editorconfig$/u, /^\.prettier/u];
const SENSITIVE_PATTERNS = [
  /(^|[\\/])\.wwebjs/iu,
  /(^|[\\/])node_modules([\\/]|$)/iu,
  /(^|[\\/])\.git([\\/]|$)/iu,
  /(^|[\\/])\.runtime([\\/]|$)/iu,
  /(^|[\\/])\.env$/iu,
];
const ROOT_ONLY_FORBIDDEN_FILES = new Set(["clientes.csv", "texto.md"]);
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

function validateDist() {
  validateStructure(DIST_DIR);
  validateNoSensitiveFiles(DIST_DIR);
  validateStructureOnlyDirs(DIST_DIR);
  validateVersionMetadata(DIST_DIR);
  validateReleaseNotesIfPresent(DIST_DIR);
  validateLegalHeaders(DIST_DIR);
  validateExecutableDist(DIST_DIR);
  console.log("Dist validado com sucesso.");
}

function validateVersionMetadata(distDir) {
  const versionPath = path.join(distDir, VERSION_FILE_NAME);

  if (!fs.existsSync(versionPath) || !fs.statSync(versionPath).isFile()) {
    throw new Error(`${VERSION_FILE_NAME} ausente em dist.`);
  }

  const metadata = JSON.parse(fs.readFileSync(versionPath, "utf8"));

  if (
    metadata.repository !== "JeanCarloEM/WhatSend" ||
    metadata.sourceType !== "release" ||
    !metadata.version ||
    !metadata.channel ||
    !metadata.tagName ||
    !metadata.versionId ||
    !metadata.artifactName
  ) {
    throw new Error(`${VERSION_FILE_NAME} em dist não possui metadados de release consistentes.`);
  }

  const archivePath = path.join(distDir, metadata.artifactName);

  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) {
    throw new Error(`Pacote ZIP obrigatório ausente em dist: ${metadata.artifactName}`);
  }
}

function validateReleaseNotesIfPresent(distDir) {
  const releaseNotesPath = path.join(distDir, RELEASE_NOTES_RELATIVE_PATH.replace(/^dist\//u, ""));

  if (!fs.existsSync(releaseNotesPath)) {
    return;
  }

  if (!fs.statSync(releaseNotesPath).isFile()) {
    throw new Error("release-notes.md em dist deve ser arquivo Markdown.");
  }

  validateReleaseNotesContent(fs.readFileSync(releaseNotesPath, "utf8"));
}

function validateStructure(distDir) {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    throw new Error("Diretório dist não encontrado. Rode npm run build:dist.");
  }

  for (const fileName of REQUIRED_FILES) {
    const filePath = path.join(distDir, fileName);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`Arquivo obrigatório ausente em dist: ${fileName}`);
    }
  }

  for (const dirName of REQUIRED_DIRS) {
    const dirPath = path.join(distDir, dirName);

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      throw new Error(`Diretório obrigatório ausente em dist: ${dirName}`);
    }
  }
}

function validateNoSensitiveFiles(distDir) {
  for (const entryPath of listEntries(distDir)) {
    const relativePath = normalizeRelative(path.relative(distDir, entryPath));
    const name = path.basename(entryPath);

    if (ROOT_ONLY_FORBIDDEN_FILES.has(relativePath)) {
      throw new Error(`Arquivo operacional da raiz proibido em dist: ${relativePath}`);
    }

    if (FORBIDDEN_NAMES.has(name)) {
      throw new Error(`Item proibido em dist: ${relativePath}`);
    }

    if (fs.statSync(entryPath).isDirectory() && name.startsWith(".")) {
      throw new Error(`Diretório oculto proibido em dist: ${relativePath}`);
    }

    if (
      fs.statSync(entryPath).isFile() &&
      name.startsWith(".") &&
      !ALLOWED_DOT_FILES.some((pattern) => pattern.test(name))
    ) {
      throw new Error(`Arquivo oculto não permitido em dist: ${relativePath}`);
    }

    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(relativePath))) {
      throw new Error(`Arquivo sensível proibido em dist: ${relativePath}`);
    }
  }
}

function validateStructureOnlyDirs(distDir) {
  for (const dirName of ["logs", "modelos", "listas"]) {
    const dirPath = path.join(distDir, dirName);
    const entries = listEntries(dirPath);

    if (entries.length > 0) {
      throw new Error(`Diretório ${dirName} deve estar vazio na release distribuível.`);
    }
  }
}

function validateLegalHeaders(distDir) {
  for (const sourcePath of listDistributedJavaScriptSources()) {
    const relativePath = normalizeRelative(path.relative(ROOT_DIR, sourcePath));
    const distPath = path.join(distDir, relativePath);

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
      throw new Error(`Cabeçalho legal não preservado integralmente em dist: ${relativePath}`);
    }
  }
}

function validateExecutableDist(distDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whatsend-dist-"));
  const runtimeDir = path.join(tempRoot, "app");

  copyDirectory(distDir, runtimeDir);

  run(process.execPath, [resolveNpmCli(), "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: runtimeDir,
  });

  const checkDir = path.join(runtimeDir, "dist-check");
  fs.mkdirSync(checkDir, { recursive: true });
  fs.writeFileSync(
    path.join(checkDir, "clientes.csv"),
    "nome,telefone\nPessoa Teste,11999999999\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(checkDir, "texto.md"),
    "Mensagem de teste ${nome}.",
    "utf8",
  );

  run(
    process.execPath,
    [
      "main.js",
      "--check",
      "--check-csv",
      path.join("dist-check", "clientes.csv"),
      "--check-template",
      path.join("dist-check", "texto.md"),
    ],
    {
      cwd: runtimeDir,
    },
  );

  fs.rmSync(tempRoot, { force: true, recursive: true });
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: "true",
    },
    shell: false,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Comando falhou durante validação do dist: ${command} ${args.join(" ")}`);
  }
}

function resolveNpmCli() {
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("npm-cli.js não encontrado para validar dist.");
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

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of sortedDirents(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function listEntries(dirPath) {
  const entries = [];

  if (!fs.existsSync(dirPath)) {
    return entries;
  }

  for (const entry of sortedDirents(dirPath)) {
    const entryPath = path.join(dirPath, entry.name);
    entries.push(entryPath);

    if (entry.isDirectory()) {
      entries.push(...listEntries(entryPath));
    }
  }

  return entries;
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

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
}

if (require.main === module) {
  try {
    validateDist();
  } catch (err) {
    console.error(`Falha na validação do dist: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DIST_DIR,
  splitLeadingLegalHeader,
  validateDist,
  validateLegalHeaders,
  validateNoSensitiveFiles,
  validateReleaseNotesIfPresent,
  validateStructure,
  validateVersionMetadata,
};
