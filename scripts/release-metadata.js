// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const OWNER = "JeanCarloEM";
const REPO = "WhatSend";
const REPOSITORY = `${OWNER}/${REPO}`;
const VERSION_FILE_NAME = "whatsend-version.json";
const DEFAULT_CHANNEL = "stable";
const CHANNELS_WITHOUT_SUFFIX = new Set(["stable", "release", "final", "prod", "production"]);

function parseReleaseArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [rawKey, inlineValue] = arg.startsWith("--") ? arg.split(/=(.*)/u, 2) : ["", undefined];

    if (arg === "--official-release" || arg === "--release") {
      options.officialRelease = true;
    } else if (arg === "--no-official-release" || arg === "--snapshot") {
      options.officialRelease = false;
    } else if (arg === "--yes" || arg === "-y") {
      options.confirmed = true;
    } else if (rawKey === "--version") {
      options.version = inlineValue ?? argv[++index];
    } else if (rawKey === "--channel") {
      options.channel = inlineValue ?? argv[++index];
    } else if (rawKey === "--commit-sha") {
      options.commitSha = inlineValue ?? argv[++index];
    } else if (rawKey === "--tag") {
      options.tagName = inlineValue ?? argv[++index];
    } else if (rawKey === "--generated-at") {
      options.generatedAt = inlineValue ?? argv[++index];
    } else if (arg.startsWith("--")) {
      throw new Error(`Parâmetro de release desconhecido: ${arg}`);
    }
  }

  return options;
}

async function collectReleaseOptions(options = {}, context = {}) {
  const rootDir = context.rootDir || path.resolve(__dirname, "..");
  const interactive = context.interactive ?? (process.stdin.isTTY && process.stdout.isTTY);
  const promptSession = context.prompt ? null : createPrompt();
  const prompt = context.prompt || promptSession.ask;
  const resolved = { ...options };

  try {
    if (!resolved.version) {
      const defaultVersion = readPackageVersion(rootDir);
      resolved.version = interactive
        ? await prompt(`Versão da release [${defaultVersion}]: `, defaultVersion)
        : defaultVersion;
    }

    if (!resolved.channel) {
      resolved.channel = interactive
        ? await prompt("Canal (stable, beta, alpha, rc) [stable]: ", DEFAULT_CHANNEL)
        : DEFAULT_CHANNEL;
    }

    if (typeof resolved.officialRelease !== "boolean") {
      if (interactive) {
        const answer = await prompt("Este artefato será anexado a uma Release oficial? (sim/não) [não]: ", "não");
        resolved.officialRelease = isYes(answer);
        resolved.confirmed = resolved.confirmed || resolved.officialRelease;
      } else {
        resolved.officialRelease = false;
      }
    }

    if (!resolved.commitSha) {
      resolved.commitSha = process.env.GITHUB_SHA || resolveGitCommitSha(rootDir) || "";
    }

    return resolved;
  } finally {
    if (promptSession) {
      promptSession.close();
    }
  }
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask(question, defaultValue = "") {
      return new Promise((resolve) => {
        rl.question(question, (answer) => {
          resolve(answer.trim() || defaultValue);
        });
      });
    },
    close() {
      rl.close();
    },
  };
}

function isYes(value) {
  return ["s", "sim", "y", "yes"].includes(String(value || "").trim().toLocaleLowerCase("pt-BR"));
}

function resolveReleaseMetadata(options = {}, context = {}) {
  const rootDir = context.rootDir || path.resolve(__dirname, "..");
  const version = normalizeVersion(options.version || readPackageVersion(rootDir));
  const channel = normalizeChannel(options.channel || DEFAULT_CHANNEL);
  const tagName = normalizeTagName(options.tagName || buildTagName(version, channel));
  const expectedTag = buildTagName(version, channel);
  const commitSha = normalizeCommitSha(options.commitSha || process.env.GITHUB_SHA || resolveGitCommitSha(rootDir));
  const officialRelease = Boolean(options.officialRelease);

  if (tagName !== expectedTag) {
    throw new Error(`Tag ${tagName} divergente da versão/canal esperados (${expectedTag}).`);
  }

  if (officialRelease && !isCommitSha(commitSha)) {
    throw new Error("Release oficial exige commit SHA completo. Informe --commit-sha ou use GitHub Actions.");
  }

  return {
    schema: 1,
    repository: REPOSITORY,
    sourceType: "release",
    version,
    channel,
    tagName,
    commitSha,
    versionId: buildVersionId(tagName, commitSha),
    packageVersion: readPackageVersion(rootDir),
    artifactName: buildArtifactName(version, channel),
    officialRelease,
    generatedAt: options.generatedAt || new Date().toISOString(),
  };
}

function normalizeVersion(version) {
  const normalized = String(version || "").trim().replace(/^v/iu, "");

  if (!/^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(normalized)) {
    throw new Error(`Versão inválida: ${version || "(vazia)"}`);
  }

  return normalized;
}

function normalizeChannel(channel) {
  const normalized = String(channel || DEFAULT_CHANNEL).trim().toLocaleLowerCase("en-US");

  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(normalized)) {
    throw new Error(`Canal inválido: ${channel || "(vazio)"}`);
  }

  return normalized;
}

function normalizeTagName(tagName) {
  const normalized = String(tagName || "").trim();

  if (!/^v\d+\.\d+\.\d+(?:[.-][0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/u.test(normalized)) {
    throw new Error(`Tag de release inválida: ${tagName || "(vazia)"}`);
  }

  return normalized;
}

function normalizeCommitSha(commitSha) {
  const normalized = String(commitSha || "").trim().toLocaleLowerCase("en-US");
  return isCommitSha(normalized) ? normalized : "";
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/iu.test(value);
}

function buildTagName(version, channel = DEFAULT_CHANNEL) {
  const normalizedVersion = normalizeVersion(version);
  const normalizedChannel = normalizeChannel(channel);
  const suffix = CHANNELS_WITHOUT_SUFFIX.has(normalizedChannel) ? "" : `-${normalizedChannel}`;

  return `v${normalizedVersion}${suffix}`;
}

function buildArtifactName(version, channel = DEFAULT_CHANNEL) {
  return `WhatSend-${buildTagName(version, channel)}.zip`;
}

function buildVersionId(tagName, commitSha) {
  return `release:${normalizeTagName(tagName)}:${normalizeCommitSha(commitSha) || "unknown"}`;
}

function writeVersionFile(metadata, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function readPackageVersion(rootDir) {
  const packageJsonPath = path.join(rootDir, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return "0.0.0";
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function resolveGitCommitSha(rootDir) {
  try {
    const result = childProcess.spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });

    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

module.exports = {
  DEFAULT_CHANNEL,
  REPOSITORY,
  VERSION_FILE_NAME,
  buildArtifactName,
  buildTagName,
  buildVersionId,
  collectReleaseOptions,
  isCommitSha,
  normalizeChannel,
  normalizeCommitSha,
  normalizeTagName,
  normalizeVersion,
  parseReleaseArgs,
  resolveReleaseMetadata,
  writeVersionFile,
};
