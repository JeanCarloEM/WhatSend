// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const path = require("path");

const CONFIG_RESTRICTIONS = require("./config-restrictions.json");

const ENV_SETTING_DEFINITIONS = Object.freeze(
  Object.entries(CONFIG_RESTRICTIONS.env || {})
    .filter(([name]) => name !== "GUI_PORT")
    .map(([name, definition]) => ({
      fallback: String(definition.default ?? ""),
      label: definition.label || name,
      max: definition.max,
      min: definition.min,
      name,
      type: definition.type || "number",
    })),
);

const ENV_SETTING_NAMES = new Set(ENV_SETTING_DEFINITIONS.map((definition) => definition.name));

function applyStartupEnvSettings(rootDir, argv = process.argv.slice(2)) {
  const sessionId = parseSessionArg(argv);
  const settings = readSessionEnvSettings(rootDir);
  const values = settings.sessions[sessionId] || settings.sessions.default || {};
  applyEnvValues(values, { preserveExisting: true });
}

function getEnvSettingsSnapshot(rootDir, sessionId = "default") {
  const globalValues = readDotEnvValues(path.join(rootDir, ".env"));
  const sessionValues = readSessionEnvSettings(rootDir).sessions[sessionId] || {};

  return {
    definitions: ENV_SETTING_DEFINITIONS,
    scopes: {
      current: pickAllowedValues(process.env),
      global: globalValues,
      session: sessionValues,
    },
  };
}

function saveEnvSettings(rootDir, scope, sessionId, values) {
  const validated = validateEnvValues(values);

  if (scope === "current") {
    applyEnvValues(validated);
    return { values: validated };
  }

  if (scope === "global") {
    writeDotEnvValues(path.join(rootDir, ".env"), validated);
    applyEnvValues(validated);
    return { values: validated };
  }

  if (scope === "session") {
    const safeSessionId = normalizeSessionId(sessionId);
    const store = readSessionEnvSettings(rootDir);
    store.sessions[safeSessionId] = validated;
    writeSessionEnvSettings(rootDir, store);
    return { sessionId: safeSessionId, values: validated };
  }

  throw new Error("Escopo de configuração inválido.");
}

function validateEnvValues(values) {
  const result = {};

  for (const [name, value] of Object.entries(values || {})) {
    if (!ENV_SETTING_NAMES.has(name)) {
      throw new Error(`Configuração não permitida: ${name}`);
    }

    const text = String(value ?? "").trim();
    if (!text) {
      continue;
    }

    const restriction = CONFIG_RESTRICTIONS.env[name] || {};
    const number = Number(text);
    if (!Number.isFinite(number)) {
      throw new Error(`Valor inválido para ${name}: use número.`);
    }

    if (restriction.type === "integer" && !Number.isInteger(number)) {
      throw new Error(`Valor inválido para ${name}: use inteiro.`);
    }

    if (restriction.min !== undefined && number < restriction.min) {
      throw new Error(`Valor inválido para ${name}: mínimo ${restriction.min}.`);
    }

    if (restriction.max !== undefined && number > restriction.max) {
      throw new Error(`Valor inválido para ${name}: máximo ${restriction.max}.`);
    }

    result[name] = String(number);
  }

  validateEnvRelations(result);
  return result;
}

function validateEnvRelations(values) {
  const numbers = {};
  for (const [name, value] of Object.entries(values || {})) {
    numbers[name] = Number(value);
  }

  for (const [name, restriction] of Object.entries(CONFIG_RESTRICTIONS.env || {})) {
    const value = numbers[name];
    if (value === undefined || !Number.isFinite(value)) continue;

    if (restriction.greaterThan) {
      const other = numbers[restriction.greaterThan];
      const minDifference = Number(restriction.minDifference || 0);
      if (Number.isFinite(other) && value - other < minDifference) {
        throw new Error(`${name} deve ser pelo menos ${minDifference} maior que ${restriction.greaterThan}.`);
      }
    }

    if (restriction.greaterThanOrEqual) {
      const other = numbers[restriction.greaterThanOrEqual];
      if (Number.isFinite(other) && value < other) {
        throw new Error(`${name} deve ser maior ou igual a ${restriction.greaterThanOrEqual}.`);
      }
    }
  }
}

function applyEnvValues(values, options = {}) {
  for (const [name, value] of Object.entries(values || {})) {
    const current = String(process.env[name] || "").trim();
    if (ENV_SETTING_NAMES.has(name) && (!options.preserveExisting || !current)) {
      process.env[name] = String(value);
    }
  }
}

function readSessionEnvSettings(rootDir) {
  const filePath = getSessionEnvSettingsPath(rootDir);

  if (!fs.existsSync(filePath)) {
    return { sessions: {}, version: 1 };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      version: 1,
    };
  } catch {
    return { sessions: {}, version: 1 };
  }
}

function writeSessionEnvSettings(rootDir, store) {
  const filePath = getSessionEnvSettingsPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ sessions: store.sessions || {}, version: 1 }, null, 2)}\n`, "utf8");
}

function getSessionEnvSettingsPath(rootDir) {
  return path.join(rootDir, ".runtime", "session-env-settings.json");
}

function readDotEnvValues(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || !ENV_SETTING_NAMES.has(match[1])) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/gu, "");
  }
  return values;
}

function writeDotEnvValues(filePath, values) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/u)
    : [];
  const remaining = new Set(Object.keys(values));
  const lines = existing.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
    if (!match || !remaining.has(match[1])) {
      return line;
    }

    remaining.delete(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });

  for (const name of remaining) {
    lines.push(`${name}=${values[name]}`);
  }

  fs.writeFileSync(filePath, `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`, "utf8");
}

function pickAllowedValues(source) {
  const result = {};
  for (const name of ENV_SETTING_NAMES) {
    if (source[name] !== undefined) {
      result[name] = String(source[name]);
    }
  }
  return result;
}

function parseSessionArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "");
    if (arg === "--session" && argv[index + 1]) {
      return normalizeSessionId(argv[index + 1]);
    }
    if (arg.startsWith("--session=")) {
      return normalizeSessionId(arg.slice("--session=".length));
    }
  }
  return "default";
}

function normalizeSessionId(value) {
  return String(value || "default")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "default";
}

module.exports = {
  ENV_SETTING_DEFINITIONS,
  applyStartupEnvSettings,
  getEnvSettingsSnapshot,
  saveEnvSettings,
};
