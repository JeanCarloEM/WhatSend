const os = require("os");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const ROOT_DIR = path.resolve(__dirname, "..");
const REQUIRED_COLUMNS = ["nome", "telefone"];
const DEFAULT_COUNTRY_CODE = "55";

function readIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readNumberEnv(name, fallback) {
  const value = Number.parseFloat(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
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
  mediaCacheDir: path.resolve(os.tmpdir(), "whatsapp-rcf-media"),
});

const MIN_DELAY_MS = readIntegerEnv("MIN_DELAY_MS", 8000);
const MAX_DELAY_MS = readIntegerEnv("MAX_DELAY_MS", 20000);
const MESSAGE_DIFF_THRESHOLD_PERCENT = readNumberEnv("MESSAGE_DIFF_THRESHOLD_PERCENT", 10);
const TEMPLATE_VARIANT_MIN_LENGTH = readIntegerEnv("TEMPLATE_VARIANT_MIN_LENGTH", 96);
const RESEND_AFTER_HOURS = readNumberEnv("RESEND_AFTER_HOURS", 48);

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
};
