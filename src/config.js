// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const os = require("os");
const path = require("path");
const CONFIG_RESTRICTIONS = require("./config-restrictions.json");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const ROOT_DIR = path.resolve(__dirname, "..");
const REQUIRED_COLUMNS = ["nome", "telefone"];
const DEFAULT_COUNTRY_CODE = "55";

function readIntegerEnv(name, fallback) {
  const restriction = getEnvRestriction(name);
  const defaultValue = fallback ?? restriction.default;
  const rawValue = process.env[name];
  const value = rawValue === undefined || String(rawValue).trim() === ""
    ? defaultValue
    : Number.parseInt(rawValue, 10);

  validateEnvNumber(name, value, restriction, "integer");
  return value;
}

function readNumberEnv(name, fallback) {
  const restriction = getEnvRestriction(name);
  const defaultValue = fallback ?? restriction.default;
  const rawValue = process.env[name];
  const value = rawValue === undefined || String(rawValue).trim() === ""
    ? defaultValue
    : Number.parseFloat(rawValue);

  validateEnvNumber(name, value, restriction, "number");
  return value;
}

function getEnvRestriction(name) {
  return (CONFIG_RESTRICTIONS.env && CONFIG_RESTRICTIONS.env[name]) || {
    default: undefined,
    min: 0,
    type: "number",
  };
}

function validateEnvNumber(name, value, restriction, expectedType) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} inválido: informe um número.`);
  }

  if (expectedType === "integer" && !Number.isInteger(value)) {
    throw new Error(`${name} inválido: informe um inteiro.`);
  }

  if (restriction.min !== undefined && value < restriction.min) {
    throw new Error(`${name} inválido: mínimo ${restriction.min}.`);
  }

  if (restriction.max !== undefined && value > restriction.max) {
    throw new Error(`${name} inválido: máximo ${restriction.max}.`);
  }
}

function validateEnvRelations(values) {
  for (const [name, restriction] of Object.entries(CONFIG_RESTRICTIONS.env || {})) {
    const value = values[name];

    if (value === undefined) {
      continue;
    }

    if (restriction.greaterThan) {
      const other = values[restriction.greaterThan];
      const minDifference = Number(restriction.minDifference || 0);

      if (restriction.allowEqualWhenZero && value === 0 && other === 0) {
        continue;
      }

      if (other !== undefined && value - other < minDifference) {
        throw new Error(`${name} inválido: deve ser pelo menos ${minDifference} maior que ${restriction.greaterThan}.`);
      }
    }

    if (restriction.greaterThanOrEqual) {
      const other = values[restriction.greaterThanOrEqual];

      if (other !== undefined && value < other) {
        throw new Error(`${name} inválido: deve ser maior ou igual a ${restriction.greaterThanOrEqual}.`);
      }
    }
  }
}

function readFirstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function isTruthyEnv(value) {
  return ["1", "true", "yes", "sim", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

const PATHS = Object.freeze({
  csv: path.resolve(ROOT_DIR, "clientes.csv"),
  template: path.resolve(ROOT_DIR, "texto.md"),
  modelsDir: path.resolve(ROOT_DIR, "modelos"),
  listsDir: path.resolve(ROOT_DIR, "listas"),
  logsDir: path.resolve(ROOT_DIR, "logs"),
  sent: path.resolve(ROOT_DIR, "logs", "enviados.csv"),
  errors: path.resolve(ROOT_DIR, "logs", "erros.csv"),
  messageCache: path.resolve(ROOT_DIR, "logs", "mensagens.json"),
  skipped: path.resolve(ROOT_DIR, "logs", "pulos.csv"),
  warnings: path.resolve(ROOT_DIR, "logs", "avisos.csv"),
  auth: path.resolve(ROOT_DIR, ".wwebjs_auth"),
  sessionsFile: path.resolve(ROOT_DIR, ".wwebjs_sessions.json"),
  mediaCacheDir: path.resolve(os.tmpdir(), "whatsapp-rcf-media"),
});

const MIN_DELAY_MS = readIntegerEnv("MIN_DELAY_MS", 8000);
const MAX_DELAY_MS = readIntegerEnv("MAX_DELAY_MS", 20000);
const MESSAGE_DIFF_THRESHOLD_PERCENT = readNumberEnv("MESSAGE_DIFF_THRESHOLD_PERCENT", 10);
const TEMPLATE_VARIANT_MIN_LENGTH = readIntegerEnv("TEMPLATE_VARIANT_MIN_LENGTH", 96);
const RESEND_AFTER_HOURS = readNumberEnv("RESEND_AFTER_HOURS", 48);

validateEnvRelations({
  MAX_DELAY_MS,
  MESSAGE_DIFF_THRESHOLD_PERCENT,
  MIN_DELAY_MS,
  RESEND_AFTER_HOURS,
  TEMPLATE_VARIANT_MIN_LENGTH,
});

const COLORS = Object.freeze({
  blue: "\x1b[34m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
});

module.exports = {
  COLORS,
  CONFIG_RESTRICTIONS,
  DEFAULT_COUNTRY_CODE,
  MAX_DELAY_MS,
  MESSAGE_DIFF_THRESHOLD_PERCENT,
  MIN_DELAY_MS,
  PATHS,
  REQUIRED_COLUMNS,
  RESEND_AFTER_HOURS,
  ROOT_DIR,
  TEMPLATE_VARIANT_MIN_LENGTH,
  isTruthyEnv,
  readFirstEnv,
  readIntegerEnv,
  readNumberEnv,
  validateEnvRelations,
};
