// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const https = require("https");
const path = require("path");

const { ROOT_DIR } = require("./config");
const { VERSION_FILE_NAME } = require("../scripts/release-metadata");

const UPDATE_COMPONENTS = Object.freeze({
  app: {
    action: "software",
    label: "WhatSend",
    repository: "JeanCarloEM/WhatSend",
  },
  whatsappWebJs: {
    action: "whatsapp-web.js",
    label: "whatsapp-web.js",
    packageName: "whatsapp-web.js",
  },
});

const DEFAULT_UPDATE_CHECK_POLICY = Object.freeze({
  cacheTtlMs: 30 * 60 * 1000,
  globalTimeoutMs: 15000,
  maxRetries: 1,
  retryBaseDelayMs: 350,
  timeoutMs: 5000,
});

function createUpdateCheckState(policy = {}) {
  const effective = normalizeUpdatePolicy(policy);
  return {
    cache: null,
    checkedAt: "",
    components: emptyComponents(),
    inFlight: null,
    policy: effective,
    requestSeq: 0,
    status: "desconhecido",
  };
}

function checkUpdates(state, options = {}) {
  const target = state || createUpdateCheckState();
  const now = options.now || Date.now();

  if (!options.force && target.cache && now - target.cache.at < target.policy.cacheTtlMs) {
    return target.cache.result;
  }

  if (target.inFlight) {
    return target.inFlight.promise;
  }

  const requestId = `upd-${++target.requestSeq}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.policy.globalTimeoutMs);
  const promise = runUpdateCheck(target, {
    ...options,
    now,
    requestId,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timer);
    if (target.inFlight && target.inFlight.requestId === requestId) {
      target.inFlight = null;
    }
  });

  target.inFlight = {
    cancel: () => controller.abort(),
    promise,
    requestId,
  };
  target.status = "verificando";
  return promise;
}

function cancelUpdateCheck(state) {
  if (state && state.inFlight && typeof state.inFlight.cancel === "function") {
    state.inFlight.cancel();
    return true;
  }
  return false;
}

async function runUpdateCheck(state, options) {
  const startedAt = new Date(options.now).toISOString();
  const diagnostics = [];
  const components = {};

  const tasks = [
    ["app", checkAppUpdate],
    ["whatsappWebJs", checkWhatsappWebJsUpdate],
  ];

  for (const [key, checker] of tasks) {
    try {
      components[key] = await checker({ ...options, diagnostics });
    } catch (error) {
      components[key] = componentState("falha_temporaria", {
        error: safeMessage(error),
        label: UPDATE_COMPONENTS[key].label,
      });
      diagnostics.push(`${key}: ${safeMessage(error)}`);
    }
  }

  const available = Object.values(components).some((component) => component.updateAvailable);
  const result = {
    checkedAt: startedAt,
    components,
    diagnostics: diagnostics.slice(-4),
    ok: true,
    status: available ? "atualizacao_disponivel" : "atualizada",
    updateAvailable: available,
  };

  state.cache = { at: options.now, result };
  state.checkedAt = startedAt;
  state.components = components;
  state.status = result.status;
  return result;
}

async function checkAppUpdate(options = {}) {
  const installed = readJsonSafe(path.join(options.rootDir || ROOT_DIR, VERSION_FILE_NAME));
  const packageVersion = readPackageVersion(options.rootDir || ROOT_DIR);
  const currentVersion = normalizeVersion(
    (installed && (installed.version || installed.packageVersion)) || packageVersion,
  );

  if (!currentVersion) {
    return componentState("consulta_inconclusiva", {
      currentVersion: packageVersion || "",
      label: UPDATE_COMPONENTS.app.label,
      reason: "versao_local_ausente",
    });
  }

  const release = await withRetry(() => readGithubLatestRelease(UPDATE_COMPONENTS.app.repository, options), options);
  const latestVersion = normalizeVersion(release && release.tag_name);

  if (!latestVersion) {
    return componentState("consulta_inconclusiva", {
      currentVersion,
      label: UPDATE_COMPONENTS.app.label,
      reason: "versao_remota_ausente",
    });
  }

  return versionComponent(UPDATE_COMPONENTS.app.label, currentVersion, latestVersion, {
    action: UPDATE_COMPONENTS.app.action,
    remote: release.html_url || "",
  });
}

async function checkWhatsappWebJsUpdate(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const currentVersion = readInstalledPackageVersion(rootDir, UPDATE_COMPONENTS.whatsappWebJs.packageName)
    || normalizeVersion(readDependencyRange(rootDir, UPDATE_COMPONENTS.whatsappWebJs.packageName));

  if (!currentVersion) {
    return componentState("consulta_inconclusiva", {
      label: UPDATE_COMPONENTS.whatsappWebJs.label,
      reason: "versao_local_ausente",
    });
  }

  const metadata = await withRetry(() => readNpmPackageMetadata(UPDATE_COMPONENTS.whatsappWebJs.packageName, options), options);
  const distTags = metadata && (metadata.distTags || metadata["dist-tags"]);
  const latestVersion = normalizeVersion(distTags && distTags.latest);

  if (!latestVersion) {
    return componentState("consulta_inconclusiva", {
      currentVersion,
      label: UPDATE_COMPONENTS.whatsappWebJs.label,
      reason: "versao_remota_ausente",
    });
  }

  return versionComponent(UPDATE_COMPONENTS.whatsappWebJs.label, currentVersion, latestVersion, {
    action: UPDATE_COMPONENTS.whatsappWebJs.action,
    remote: "npm:latest",
  });
}

function versionComponent(label, currentVersion, latestVersion, extra = {}) {
  const comparison = compareVersions(currentVersion, latestVersion);
  if (comparison < 0) {
    return componentState("atualizacao_disponivel", {
      ...extra,
      currentVersion,
      label,
      latestVersion,
      updateAvailable: true,
    });
  }

  return componentState("atualizado", {
    ...extra,
    currentVersion,
    label,
    latestVersion,
    updateAvailable: false,
  });
}

function componentState(status, details = {}) {
  return {
    currentVersion: "",
    error: "",
    latestVersion: "",
    reason: "",
    status,
    updateAvailable: false,
    ...details,
  };
}

function emptyComponents() {
  return Object.fromEntries(Object.keys(UPDATE_COMPONENTS).map((key) => [
    key,
    componentState("desconhecido", { label: UPDATE_COMPONENTS[key].label }),
  ]));
}

async function withRetry(operation, options = {}) {
  const maxRetries = Number.isInteger(options.maxRetries)
    ? options.maxRetries
    : normalizeUpdatePolicy(options.policy || {}).maxRetries;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal && options.signal.aborted) {
      throw new Error("consulta_cancelada");
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await delay(backoffDelay(attempt, options), options.signal);
    }
  }

  throw lastError;
}

function backoffDelay(attempt, options = {}) {
  const base = Number(options.retryBaseDelayMs || DEFAULT_UPDATE_CHECK_POLICY.retryBaseDelayMs);
  const jitter = Number(options.jitterMs || 73);
  return base * (attempt + 1) + Math.floor(Math.random() * jitter);
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("consulta_cancelada"));
      }, { once: true });
    }
  });
}

async function readGithubLatestRelease(repository, options = {}) {
  return requestJson(`https://api.github.com/repos/${repository}/releases/latest`, options);
}

async function readNpmPackageMetadata(packageName, options = {}) {
  return requestJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, options);
}

function requestJson(url, options = {}) {
  if (typeof options.requestJson === "function") {
    return options.requestJson(url, options);
  }

  const timeoutMs = Number(options.timeoutMs || (options.policy && options.policy.timeoutMs) || DEFAULT_UPDATE_CHECK_POLICY.timeoutMs);
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WhatSend-update-check",
      },
      signal: options.signal,
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP_${response.statusCode || 0}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(new Error(`json_invalido:${error.message}`));
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("tempo_esgotado")));
    request.end();
  });
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) {
      return a.parts[index] < b.parts[index] ? -1 : 1;
    }
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en");
}

function parseVersion(value) {
  const version = normalizeVersion(value);
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-.]([0-9A-Za-z.-]+))?$/u);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || "",
  };
}

function normalizeVersion(value) {
  const version = String(value || "").trim().replace(/^[~^=<> ]+/u, "").replace(/^v/iu, "");
  const match = version.match(/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?/u);
  return match ? match[0].replace(/\.(beta|alpha|rc)([.-]?\d*)$/iu, "-$1$2") : "";
}

function readPackageVersion(rootDir) {
  const pkg = readJsonSafe(path.join(rootDir, "package.json"));
  return normalizeVersion(pkg && pkg.version);
}

function readDependencyRange(rootDir, packageName) {
  const pkg = readJsonSafe(path.join(rootDir, "package.json")) || {};
  return (pkg.dependencies && pkg.dependencies[packageName])
    || (pkg.devDependencies && pkg.devDependencies[packageName])
    || "";
}

function readInstalledPackageVersion(rootDir, packageName) {
  const pkg = readJsonSafe(path.join(rootDir, "node_modules", ...packageName.split("/"), "package.json"));
  return normalizeVersion(pkg && pkg.version);
}

function readJsonSafe(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
  } catch (_) {
    return null;
  }
}

function normalizeUpdatePolicy(policy = {}) {
  return {
    cacheTtlMs: readPositiveInteger(policy.cacheTtlMs, DEFAULT_UPDATE_CHECK_POLICY.cacheTtlMs),
    globalTimeoutMs: readPositiveInteger(policy.globalTimeoutMs, DEFAULT_UPDATE_CHECK_POLICY.globalTimeoutMs),
    maxRetries: Math.max(0, Number.isInteger(policy.maxRetries) ? policy.maxRetries : DEFAULT_UPDATE_CHECK_POLICY.maxRetries),
    retryBaseDelayMs: readPositiveInteger(policy.retryBaseDelayMs, DEFAULT_UPDATE_CHECK_POLICY.retryBaseDelayMs),
    timeoutMs: readPositiveInteger(policy.timeoutMs, DEFAULT_UPDATE_CHECK_POLICY.timeoutMs),
  };
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function safeMessage(error) {
  return String(error && error.message ? error.message : error).slice(0, 180);
}

module.exports = {
  DEFAULT_UPDATE_CHECK_POLICY,
  UPDATE_COMPONENTS,
  cancelUpdateCheck,
  checkAppUpdate,
  checkUpdates,
  checkWhatsappWebJsUpdate,
  compareVersions,
  createUpdateCheckState,
  normalizeVersion,
  readInstalledPackageVersion,
};
