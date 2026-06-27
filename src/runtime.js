const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { ROOT_DIR } = require("./config");

const RUNTIME_APP_NAME = "whatsender";
const RUNTIME_VERSION = 1;
const GUI_INSTANCE_DIR = path.join(os.tmpdir(), "whatsender", "instances");
const SCRIPT_DIRS = ["src", "scripts"];
const SCRIPT_FILES = ["main.js", "package.json", "package-lock.json"];

function getGuiInstanceRecordPath(paths) {
  const appId = createRuntimeAppId(paths.root || ROOT_DIR);
  const sessionId = getRuntimeSessionId(paths);
  return path.join(GUI_INSTANCE_DIR, `${appId}-${hashText(sessionId).slice(0, 16)}.json`);
}

async function prepareGuiInstance(paths, options = {}) {
  const recordPath = getGuiInstanceRecordPath(paths);
  const record = readGuiInstanceRecord(recordPath);

  if (!record) {
    return { action: "start", recordPath };
  }

  const stale = () => {
    removeGuiInstanceRecord(recordPath, record);
    return { action: "start", recordPath };
  };

  if (!isRecordForRuntime(record, paths)) {
    return stale();
  }

  if (!isProcessActive(record.pid)) {
    return stale();
  }

  const identity = await probeGuiInstance(record);

  if (!identity || !isIdentityForRecord(identity, record, paths)) {
    return stale();
  }

  if (hasRuntimeScriptsChanged(record, paths.root || ROOT_DIR)) {
    await shutdownGuiInstance(record, {
      reason: "scripts_changed",
      timeoutMs: options.shutdownTimeoutMs,
    });
    removeGuiInstanceRecord(recordPath, record);
    return {
      action: "replace",
      reason: "scripts_changed",
      record,
      recordPath,
    };
  }

  await openUrlInSystemBrowser(record.url);
  return {
    action: "reuse",
    record,
    recordPath,
  };
}

function registerGuiInstance(serverInfo, paths, options = {}) {
  fs.mkdirSync(GUI_INSTANCE_DIR, { recursive: true });

  const recordPath = getGuiInstanceRecordPath(paths);
  const now = new Date().toISOString();
  const record = {
    appId: createRuntimeAppId(paths.root || ROOT_DIR),
    appName: RUNTIME_APP_NAME,
    argv: process.argv.slice(),
    authSessionDir: paths.authSessionDir || "",
    execPath: process.execPath,
    mainScript: path.join(ROOT_DIR, "main.js"),
    pid: process.pid,
    ppid: process.ppid,
    port: extractUrlPort(serverInfo.url),
    profiles: [getRuntimeSessionId(paths)],
    root: path.resolve(paths.root || ROOT_DIR),
    scriptSnapshot: createRuntimeScriptSnapshot(paths.root || ROOT_DIR),
    sessionId: getRuntimeSessionId(paths),
    startedAt: now,
    token: options.token || crypto.randomBytes(24).toString("hex"),
    updatedAt: now,
    url: serverInfo.url,
    version: RUNTIME_VERSION,
  };
  let active = true;

  writeJsonFile(recordPath, record);

  const heartbeat = setInterval(() => {
    if (!active) {
      return;
    }

    record.updatedAt = new Date().toISOString();
    writeJsonFile(recordPath, record);
  }, 10000);

  if (typeof heartbeat.unref === "function") {
    heartbeat.unref();
  }

  const registration = {
    publicRecord: toPublicRuntimeRecord(record),
    record,
    recordPath,
    stop() {
      if (!active) {
        return;
      }

      active = false;
      clearInterval(heartbeat);
      removeGuiInstanceRecord(recordPath, record);
    },
  };

  process.once("exit", () => registration.stop());
  return registration;
}

function readGuiInstanceRecord(recordPath) {
  try {
    if (!fs.existsSync(recordPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(recordPath, "utf8"));
  } catch {
    return null;
  }
}

function removeGuiInstanceRecord(recordPath, record) {
  try {
    const current = readGuiInstanceRecord(recordPath);

    if (!current || !record || current.pid === record.pid) {
      fs.rmSync(recordPath, { force: true });
    }
  } catch {
    // Registro temporário não deve bloquear a execução principal.
  }
}

function isRecordForRuntime(record, paths) {
  return (
    record &&
    record.appName === RUNTIME_APP_NAME &&
    record.appId === createRuntimeAppId(paths.root || ROOT_DIR) &&
    path.resolve(record.root || "") === path.resolve(paths.root || ROOT_DIR) &&
    record.sessionId === getRuntimeSessionId(paths) &&
    Number.isInteger(record.pid) &&
    record.pid > 0 &&
    record.url
  );
}

function isIdentityForRecord(identity, record, paths) {
  const runtime = identity.runtime || identity;
  return (
    runtime &&
    runtime.appName === RUNTIME_APP_NAME &&
    runtime.appId === record.appId &&
    runtime.pid === record.pid &&
    runtime.sessionId === getRuntimeSessionId(paths)
  );
}

function createRuntimeAppId(rootDir = ROOT_DIR) {
  return hashText(`${RUNTIME_APP_NAME}|${normalizeRuntimePath(rootDir)}`).slice(0, 24);
}

function getRuntimeSessionId(paths = {}) {
  return (
    (paths.activeSession && paths.activeSession.id) ||
    paths.sessionClientId ||
    "default"
  );
}

function createRuntimeScriptSnapshot(rootDir = ROOT_DIR) {
  const files = collectRuntimeScriptFiles(rootDir);
  const hash = crypto.createHash("sha256");
  let latestMtimeMs = 0;

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const fileHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
    const mtimeMs = Math.trunc(stat.mtimeMs);
    latestMtimeMs = Math.max(latestMtimeMs, mtimeMs);
    hash.update(`${relativePath}\0${stat.size}\0${mtimeMs}\0${fileHash}\n`);
  }

  return {
    fingerprint: hash.digest("hex"),
    files: files.length,
    latestMtimeMs,
  };
}

function hasRuntimeScriptsChanged(record, rootDir = ROOT_DIR) {
  if (!record || !record.scriptSnapshot) {
    return false;
  }

  const current = createRuntimeScriptSnapshot(rootDir);
  return current.fingerprint !== record.scriptSnapshot.fingerprint;
}

function collectRuntimeScriptFiles(rootDir = ROOT_DIR) {
  const files = [];

  for (const fileName of SCRIPT_FILES) {
    const filePath = path.join(rootDir, fileName);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      files.push(filePath);
    }
  }

  for (const dirName of SCRIPT_DIRS) {
    collectFiles(path.join(rootDir, dirName), files);
  }

  return files.sort((a, b) => a.localeCompare(b, "en"));
}

function collectFiles(dirPath, files) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      collectFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }
}

async function probeGuiInstance(record) {
  try {
    return await requestJson(record.url, "/api/runtime/identity", "GET");
  } catch {
    return null;
  }
}

async function shutdownGuiInstance(record, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;

  if (record && record.token && record.url) {
    try {
      await requestJson(record.url, "/api/runtime/shutdown", "POST", {
        reason: options.reason || "replace",
        token: record.token,
      });
      await waitForProcessExit(record.pid, timeoutMs);
    } catch {
      // Se o endpoint local não responder, usa encerramento por árvore de processo.
    }
  }

  if (isProcessActive(record.pid)) {
    terminateProcessTree(record.pid);
    await waitForProcessExit(record.pid, timeoutMs);
  }
}

function requestJson(baseUrl, pathname, method, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const body = payload ? Buffer.from(JSON.stringify(payload), "utf8") : null;
    const req = http.request(
      {
        headers: body
          ? {
              "Content-Length": body.length,
              "Content-Type": "application/json",
            }
          : undefined,
        hostname: target.hostname,
        method,
        path: `${target.pathname}${target.search}`,
        port: target.port,
        timeout: 1500,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`));
            return;
          }

          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado.")));

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function isProcessActive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (isProcessActive(pid) && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return !isProcessActive(pid);
}

function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
    return;
  }

  if (os.platform() === "win32") {
    childProcess.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Processo já encerrou ou não é acessível.
    }
  }
}

function openUrlInSystemBrowser(url) {
  const platform = os.platform();
  const command =
    platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = childProcess.spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function toPublicRuntimeRecord(record) {
  const { token, ...publicRecord } = record;
  return publicRecord;
}

function extractUrlPort(url) {
  try {
    return Number.parseInt(new URL(url).port, 10) || null;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeRuntimePath(value) {
  const resolved = path.resolve(String(value || ""));
  return os.platform() === "win32" ? resolved.toLocaleLowerCase("pt-BR") : resolved;
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = {
  createRuntimeAppId,
  createRuntimeScriptSnapshot,
  getGuiInstanceRecordPath,
  hasRuntimeScriptsChanged,
  openUrlInSystemBrowser,
  prepareGuiInstance,
  probeGuiInstance,
  registerGuiInstance,
  shutdownGuiInstance,
  terminateProcessTree,
  toPublicRuntimeRecord,
};
