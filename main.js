/**
 * =============================================================================
 * RCF - REQUIREMENTS & CONTROL FRAMEWORK
 * =============================================================================
 *
 * Projeto:
 *   Disparador Local de Mensagens WhatsApp
 *
 * Objetivo:
 *   Realizar o envio automatizado de mensagens personalizadas através do
 *   WhatsApp Web, utilizando dados provenientes de um arquivo CSV e um modelo
 *   de mensagem em Markdown.
 *
 * Escopo:
 *   - Operação 100% local.
 *   - Sem dependência de serviços externos além do próprio WhatsApp Web.
 *   - Sem utilização da API Oficial da Meta.
 *   - Sessão persistida localmente.
 *   - Execução manual sob demanda.
 *
 * =============================================================================
 * REGRAS DE NEGÓCIO
 * =============================================================================
 *
 * RN001 - Origem dos Dados
 *   Os destinatários devem ser carregados exclusivamente do arquivo:
 *
 *      ./clientes.csv
 *
 *   O arquivo deve conter obrigatoriamente:
 *
 *      nome
 *      telefone
 *      conta
 *
 *   Colunas adicionais devem ser disponibilizadas automaticamente para
 *   substituição de variáveis no template.
 *
 * -----------------------------------------------------------------------------
 *
 * RN002 - Template de Mensagem
 *
 *   O modelo de mensagem deve ser carregado de:
 *
 *      ./texto.md
 *
 *   O conteúdo deve ser enviado exatamente como definido no arquivo.
 *
 *   Variáveis devem utilizar o padrão:
 *
 *      ${nome}
 *      ${telefone}
 *      ${conta}
 *
 *   ou qualquer outra coluna existente no CSV.
 *
 * -----------------------------------------------------------------------------
 *
 * RN003 - Substituição de Variáveis
 *
 *   Toda variável encontrada no template deve ser substituída pelo valor da
 *   respectiva coluna do registro atual.
 *
 *   Caso a coluna não exista:
 *
 *      - Não lançar exceção.
 *      - Substituir por string vazia.
 *      - Registrar aviso em log.
 *
 * -----------------------------------------------------------------------------
 *
 * RN004 - Tratamento de Telefone
 *
 *   Antes de qualquer validação ou envio:
 *
 *      - Remover caracteres não numéricos.
 *      - Remover espaços.
 *      - Remover parênteses.
 *      - Remover hífens.
 *      - Remover barras.
 *      - Remover pontos.
 *
 *   O número final deve conter apenas dígitos.
 *
 * -----------------------------------------------------------------------------
 *
 * RN005 - Padronização de País
 *
 *   Caso o número não possua código do país:
 *
 *      55
 *
 *   este deve ser automaticamente adicionado.
 *
 * -----------------------------------------------------------------------------
 *
 * RN006 - Validação de Existência
 *
 *   Nenhuma mensagem deve ser enviada sem validação prévia de existência do
 *   número no WhatsApp.
 *
 *   Deve ser utilizado:
 *
 *      client.getNumberId()
 *
 *   Números inexistentes devem ser registrados em log.
 *
 * -----------------------------------------------------------------------------
 *
 * RN007 - Prevenção de Duplicidade
 *
 *   Um telefone já registrado como enviado não deve receber nova mensagem
 *   durante a mesma campanha.
 *
 *   O controle deve ser realizado através do arquivo:
 *
 *      ./logs/enviados.csv
 *
 * -----------------------------------------------------------------------------
 *
 * RN008 - Continuidade Operacional
 *
 *   Em caso de interrupção inesperada:
 *
 *      - Encerramento do processo.
 *      - Falha do Windows.
 *      - Perda de conexão.
 *      - Reinicialização da máquina.
 *
 *   A execução deve poder ser retomada sem reenvio dos registros já concluídos.
 *
 * -----------------------------------------------------------------------------
 *
 * RN009 - Isolamento de Falhas
 *
 *   Erros individuais não devem interromper o processamento do lote.
 *
 *   Cada destinatário deve ser tratado independentemente.
 *
 * -----------------------------------------------------------------------------
 *
 * RN010 - Controle de Velocidade
 *
 *   Deve existir intervalo aleatório entre envios.
 *
 *   Objetivos:
 *
 *      - Simular comportamento humano.
 *      - Reduzir risco de bloqueios.
 *      - Evitar disparos em massa instantâneos.
 *
 * -----------------------------------------------------------------------------
 *
 * RN011 - Persistência de Sessão
 *
 *   A autenticação do WhatsApp deve permanecer armazenada localmente.
 *
 *   Diretório padrão:
 *
 *      ./.wwebjs_auth
 *
 * -----------------------------------------------------------------------------
 *
 * RN012 - Operação Local
 *
 *   Nenhum dado de clientes deve ser transmitido para sistemas terceiros,
 *   exceto para o próprio WhatsApp durante o envio da mensagem.
 *
 * -----------------------------------------------------------------------------
 *
 * RN013 - Integridade dos Dados
 *
 *   O sistema não deve alterar:
 *
 *      clientes.csv
 *      texto.md
 *
 *   sob nenhuma circunstância.
 *
 * -----------------------------------------------------------------------------
 *
 * RN014 - Auditoria
 *
 *   Todo resultado deve possuir rastreabilidade.
 *
 *   Arquivos mínimos:
 *
 *      ./logs/enviados.csv
 *      ./logs/erros.csv
 *
 * -----------------------------------------------------------------------------
 *
 * RN015 - Segurança Operacional
 *
 *   O sistema deve falhar de forma segura.
 *
 *   Em caso de:
 *
 *      - CSV inválido
 *      - Template ausente
 *      - Sessão corrompida
 *      - Estrutura de diretórios inválida
 *
 *   O processamento deve ser interrompido antes do primeiro envio.
 *
 * =============================================================================
 * REQUISITOS NÃO FUNCIONAIS
 * =============================================================================
 *
 * RNF001
 *   Compatível com Windows 10 e Windows 11.
 *
 * RNF002
 *   Compatível com Node.js LTS.
 *
 * RNF003
 *   Operação offline para todas as etapas exceto comunicação com WhatsApp.
 *
 * RNF004
 *   Suportar milhares de registros sem carregamento excessivo de memória.
 *
 * RNF005
 *   Possibilitar futura implementação de:
 *
 *      - Anexos
 *      - Imagens
 *      - PDFs
 *      - Múltiplos templates
 *      - Campanhas
 *      - Agendamento
 *      - Dry-run
 *
 * =============================================================================
 * FIM DO RCF
 * =============================================================================
 */

const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const readline = require("readline");

require("dotenv").config({ path: path.resolve(__dirname, ".env"), quiet: true });

const qrcode = require("qrcode-terminal");
const { parse } = require("csv-parse/sync");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const ROOT_DIR = __dirname;
const REQUIRED_COLUMNS = ["nome", "telefone", "conta"];
const DEFAULT_COUNTRY_CODE = "55";

const PATHS = Object.freeze({
  csv: path.resolve(ROOT_DIR, "clientes.csv"),
  template: path.resolve(ROOT_DIR, "texto.md"),
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
const MESSAGE_DIFF_THRESHOLD_PERCENT = readNumberEnv(
  "MESSAGE_DIFF_THRESHOLD_PERCENT",
  10,
);
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

function readIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readNumberEnv(name, fallback) {
  const value = Number.parseFloat(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min = MIN_DELAY_MS, max = MAX_DELAY_MS) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function sanitizePhone(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  let cleaned = String(phone || "").replace(/\D/g, "");

  if (cleaned && !cleaned.startsWith(countryCode)) {
    cleaned = countryCode + cleaned;
  }

  return cleaned;
}

function formatNameForMessage(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(capitalizeNamePart)
    .join(" ");
}

function capitalizeNamePart(part) {
  return part
    .split("-")
    .map((piece) => {
      const lower = piece.toLocaleLowerCase("pt-BR");
      return lower.replace(/^\p{L}/u, (letter) =>
        letter.toLocaleUpperCase("pt-BR"),
      );
    })
    .join("-");
}

function readTextFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} não é um arquivo: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function loadTemplate(filePath = PATHS.template) {
  return readTextFile(filePath, "Template");
}

function loadCsv(filePath = PATHS.csv) {
  const csv = readTextFile(filePath, "CSV de clientes");
  let rows;

  try {
    rows = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new Error(`CSV inválido: ${err.message}`);
  }

  if (rows.length === 0) {
    throw new Error("CSV inválido: arquivo vazio.");
  }

  const header = rows[0].map((column) => String(column).trim());
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !header.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `CSV inválido: colunas obrigatórias ausentes: ${missingColumns.join(", ")}.`,
    );
  }

  try {
    return parse(csv, {
      columns: (columns) => columns.map((column) => String(column).trim()),
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch (err) {
    throw new Error(`CSV inválido: ${err.message}`);
  }
}

function applyTemplate(template, data, options = {}) {
  const missingVariables = new Set();

  return template.replace(/\$\{([^}]+)\}/g, (_, field) => {
    const key = String(field).trim();

    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      if (!missingVariables.has(key) && options.onMissingVariable) {
        options.onMissingVariable(key);
      }

      missingVariables.add(key);
      return "";
    }

    const value = data[key] ?? "";
    return key === "nome" ? formatNameForMessage(value) : value;
  });
}

function parseTemplateParts(renderedTemplate) {
  const parts = [];
  const mediaPattern = /!\[[^\]]*]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = mediaPattern.exec(renderedTemplate)) !== null) {
    const text = renderedTemplate.slice(lastIndex, match.index);

    if (text.trim()) {
      parts.push({ type: "text", value: text });
    }

    parts.push({
      type: "media",
      source: normalizeMediaSource(match[1]),
      raw: match[0],
    });

    lastIndex = mediaPattern.lastIndex;
  }

  const tail = renderedTemplate.slice(lastIndex);

  if (tail.trim()) {
    parts.push({ type: "text", value: tail });
  }

  return parts;
}

function normalizeMediaSource(source) {
  return String(source || "")
    .trim()
    .replace(/^<(.+)>$/, "$1")
    .replace(/^["'](.+)["']$/, "$1")
    .trim();
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeTemplateForTracking(template) {
  return String(template || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function calculateDifferencePercent(a, b) {
  const left = normalizeTemplateForTracking(a);
  const right = normalizeTemplateForTracking(b);
  const maxLength = Math.max(left.length, right.length);

  if (maxLength === 0) {
    return 0;
  }

  return (levenshteinDistance(left, right) / maxLength) * 100;
}

function levenshteinDistance(a, b) {
  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[b.length];
}

function getTemplateFingerprint(template) {
  const content = normalizeTemplateForTracking(template);

  return {
    content,
    hash: hashValue(content),
  };
}

function loadMessageCache(filePath = PATHS.messageCache) {
  if (!fs.existsSync(filePath)) {
    return { messages: {}, version: 1 };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

    return {
      messages: parsed.messages && typeof parsed.messages === "object"
        ? parsed.messages
        : {},
      version: 1,
    };
  } catch {
    return { messages: {}, version: 1 };
  }
}

function saveMessageCache(cache, filePath = PATHS.messageCache) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ messages: cache.messages, version: 1 }, null, 2)}\n`,
    "utf8",
  );
}

function registerTemplateInCache(template, paths = PATHS) {
  const fingerprint = getTemplateFingerprint(template);
  const cache = loadMessageCache(paths.messageCache);

  if (!cache.messages[fingerprint.hash]) {
    cache.messages[fingerprint.hash] = {
      content: fingerprint.content,
      createdAt: new Date().toISOString(),
      hash: fingerprint.hash,
    };
    saveMessageCache(cache, paths.messageCache);
  }

  return {
    cache,
    ...fingerprint,
  };
}

function parseDateMs(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatAgeHours(ageMs) {
  return (ageMs / 3600000).toFixed(1);
}

function getSendDecision(telefone, sentRecords, messageContext, options = {}) {
  const now = options.now || new Date();
  const resendAfterMs =
    (options.resendAfterHours ?? RESEND_AFTER_HOURS) * 3600000;
  const resendAfterHours = options.resendAfterHours ?? RESEND_AFTER_HOURS;
  const differenceThresholdPercent =
    options.messageDiffThresholdPercent ?? MESSAGE_DIFF_THRESHOLD_PERCENT;

  const records = sentRecords.filter((record) => record.telefone === telefone);

  if (records.length === 0) {
    return { shouldSend: true, reason: "Nenhum envio anterior para este telefone." };
  }

  let lastDifferentRecent;
  let lastExpired;

  for (const record of records) {
    const sentAtMs = parseDateMs(record.dataHora);
    const ageMs = sentAtMs === undefined ? 0 : now.getTime() - sentAtMs;
    const expired = sentAtMs !== undefined && ageMs > resendAfterMs;

    if (expired) {
      lastExpired = { ageMs, record };
      continue;
    }

    if (!record.mensagemHash) {
      return {
        code: "JA_ENVIADO_LEGADO",
        shouldSend: false,
        reason:
          "Telefone já consta em logs/enviados.csv em formato antigo; use --force-resend, --reset-sent ou aguarde o prazo de reenvio.",
      };
    }

    const previousContent =
      messageContext.cache.messages[record.mensagemHash]?.content;

    if (!previousContent) {
      return {
        code: "JA_ENVIADO_SEM_CACHE",
        shouldSend: false,
        reason:
          "Telefone já consta como enviado, mas o cache da versão anterior não foi encontrado; use --force-resend ou --reset-sent.",
      };
    }

    const differencePercent =
      record.mensagemHash === messageContext.hash
        ? 0
        : calculateDifferencePercent(messageContext.content, previousContent);

    if (differencePercent < differenceThresholdPercent) {
      return {
        code: "JA_ENVIADO_MENSAGEM_SIMILAR",
        differencePercent,
        shouldSend: false,
        reason: `Mensagem similar já enviada há ${formatAgeHours(ageMs)}h (${differencePercent.toFixed(1)}% diferente; limite ${differenceThresholdPercent}%).`,
      };
    }

    lastDifferentRecent = { differencePercent, record };
  }

  if (lastDifferentRecent) {
    return {
      shouldSend: true,
      reason: `Mensagem atual é ${lastDifferentRecent.differencePercent.toFixed(1)}% diferente da enviada anteriormente.`,
    };
  }

  if (lastExpired) {
    return {
      shouldSend: true,
      reason: `Último envio similar passou do prazo configurado (${formatAgeHours(lastExpired.ageMs)}h > ${resendAfterHours}h).`,
    };
  }

  return { shouldSend: true, reason: "Nenhum envio bloqueante encontrado." };
}

function extensionFromContentType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "text/plain": ".txt",
  };

  return map[type] || "";
}

function extensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext && ext.length <= 12 ? ext : "";
  } catch {
    return "";
  }
}

function findCachedDownload(cacheDir, url) {
  if (!fs.existsSync(cacheDir)) {
    return undefined;
  }

  const hash = hashValue(url);
  const entry = fs
    .readdirSync(cacheDir, { withFileTypes: true })
    .find((dirent) => dirent.isFile() && dirent.name.startsWith(hash));

  return entry ? path.join(cacheDir, entry.name) : undefined;
}

function resolveLocalMediaPath(source, templatePath) {
  const filePath = path.isAbsolute(source)
    ? source
    : path.resolve(path.dirname(templatePath), source);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Anexo não encontrado: ${source}`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`Anexo não é um arquivo: ${source}`);
  }

  return filePath;
}

async function resolveMediaPath(source, paths = PATHS, downloadCache = new Map()) {
  if (!source) {
    throw new Error("Anexo sem caminho definido.");
  }

  if (!isUrl(source)) {
    return resolveLocalMediaPath(source, paths.template);
  }

  if (downloadCache.has(source)) {
    return downloadCache.get(source);
  }

  const downloadedPath = await downloadMediaUrl(source, paths.mediaCacheDir);
  downloadCache.set(source, downloadedPath);
  return downloadedPath;
}

async function downloadMediaUrl(url, cacheDir = PATHS.mediaCacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachedPath = findCachedDownload(cacheDir, url);

  if (cachedPath) {
    return cachedPath;
  }

  const extFromUrl = extensionFromUrl(url);
  const pendingPath = path.join(cacheDir, `${hashValue(url)}${extFromUrl}`);

  if (fs.existsSync(pendingPath)) {
    return pendingPath;
  }

  const response = await fetchUrlBuffer(url);
  const ext = extFromUrl || extensionFromContentType(response.contentType);
  const filePath = path.join(cacheDir, `${hashValue(url)}${ext}`);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, response.body);
  }

  return filePath;
}

function fetchUrlBuffer(url, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Redirecionamentos demais ao baixar: ${url}`));
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const request = transport.get(parsed, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        resolve(fetchUrlBuffer(new URL(location, parsed).toString(), redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Falha ao baixar anexo (${statusCode}): ${url}`));
        return;
      }

      const chunks = [];

      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          contentType: response.headers["content-type"],
        });
      });
    });

    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new Error(`Tempo esgotado ao baixar anexo: ${url}`));
    });
  });
}

function shouldSendAsDocument(media) {
  return !String(media.mimetype || "").startsWith("image/");
}

function normalizeCaption(value) {
  return String(value || "").trim();
}

function buildSendPlan(parts) {
  const plan = [];
  const mediaCaptions = new Map();
  const consumedText = new Set();
  const firstTextIndex = parts.findIndex((part) => part.type === "text");
  const lastTextIndex = parts.findLastIndex((part) => part.type === "text");

  if (
    firstTextIndex > 0 &&
    parts.slice(0, firstTextIndex).every((part) => part.type === "media")
  ) {
    mediaCaptions.set(
      firstTextIndex - 1,
      normalizeCaption(parts[firstTextIndex].value),
    );
    consumedText.add(firstTextIndex);
  }

  if (
    lastTextIndex >= 0 &&
    lastTextIndex < parts.length - 1 &&
    !consumedText.has(lastTextIndex) &&
    parts.slice(lastTextIndex + 1).every((part) => part.type === "media")
  ) {
    mediaCaptions.set(
      lastTextIndex + 1,
      normalizeCaption(parts[lastTextIndex].value),
    );
    consumedText.add(lastTextIndex);
  }

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.type === "text") {
      if (!consumedText.has(index)) {
        plan.push(part);
      }

      continue;
    }

    plan.push({
      ...part,
      ...(mediaCaptions.has(index) ? { caption: mediaCaptions.get(index) } : {}),
    });
  }

  return plan;
}

function validateTemplateMediaReferences(template, paths = PATHS) {
  const issues = [];

  for (const part of parseTemplateParts(template)) {
    if (part.type !== "media" || isUrl(part.source)) {
      continue;
    }

    try {
      resolveLocalMediaPath(part.source, paths.template);
    } catch (err) {
      issues.push(err.message);
    }
  }

  return issues;
}

async function sendRenderedTemplate(client, chatId, renderedTemplate, paths = PATHS) {
  const parts = buildSendPlan(parseTemplateParts(renderedTemplate));
  const downloadCache = new Map();

  for (const part of parts) {
    if (part.type === "text") {
      await client.sendMessage(chatId, part.value);
      continue;
    }

    const filePath = await resolveMediaPath(part.source, paths, downloadCache);
    const media = MessageMedia.fromFilePath(filePath);
    const options = {
      sendMediaAsDocument: shouldSendAsDocument(media),
    };

    if (part.caption) {
      options.caption = part.caption;
    }

    await client.sendMessage(chatId, media, options);
  }
}

function supportsStatusUi() {
  return Boolean(process.stdout.isTTY && !process.env.NO_STATUS_UI);
}

function colorize(text, color) {
  if (!supportsStatusUi()) {
    return text;
  }

  return `${COLORS[color] || ""}${text}${COLORS.reset}`;
}

function progressBar(done, total, width = 18) {
  const safeTotal = Math.max(total, 1);
  const filled = Math.round((Math.min(done, safeTotal) / safeTotal) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function maskPhone(phone) {
  const digits = String(phone || "");

  if (digits.length <= 4) {
    return digits || "sem telefone";
  }

  return `***${digits.slice(-4)}`;
}

function createStatusReporter(total) {
  const interactive = supportsStatusUi();
  const state = {
    current: "Preparando envio",
    errors: 0,
    processed: 0,
    sent: 0,
    skipped: 0,
    total,
    warnings: 0,
  };

  function render() {
    if (!interactive) {
      return;
    }

    const line = [
      colorize("Envio WhatsApp", "bold"),
      colorize(progressBar(state.processed, state.total), "cyan"),
      `${state.processed}/${state.total}`,
      colorize(`OK ${state.sent}`, "green"),
      colorize(`Pulos ${state.skipped}`, "yellow"),
      colorize(`Erros ${state.errors}`, "red"),
      colorize(`Avisos ${state.warnings}`, "blue"),
      colorize(state.current, "dim"),
    ].join("  ");

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(line.slice(0, process.stdout.columns || line.length));
  }

  return {
    current(message) {
      state.current = message;
      render();
    },
    error(message) {
      state.errors += 1;
      state.processed += 1;
      state.current = message;
      render();
    },
    event(message, color = "dim") {
      if (interactive) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }

      console.log(colorize(message, color));
      render();
    },
    finish() {
      if (interactive) {
        process.stdout.write("\n");
      }

      console.log(
        [
          colorize("Resumo:", "bold"),
          colorize(`${state.sent} enviados`, "green"),
          colorize(`${state.skipped} pulados`, "yellow"),
          colorize(`${state.errors} erros`, "red"),
          colorize(`${state.warnings} avisos`, "blue"),
        ].join("  "),
      );
    },
    sent(message) {
      state.sent += 1;
      state.processed += 1;
      state.current = message;
      render();
    },
    skip(message) {
      state.skipped += 1;
      state.processed += 1;
      state.current = message;
      render();
    },
    warning(message) {
      state.warnings += 1;
      state.current = message;
      render();
    },
  };
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureLogFile(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header}\n`, "utf8");
  }
}

function ensureSentLogFile(filePath) {
  const header = "telefone;mensagem_hash;data_hora";

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header}\n`, "utf8");
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  if (lines[0] !== header) {
    lines[0] = header;
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  }
}

function initLogFiles(paths = PATHS) {
  ensureDirectory(paths.logsDir);
  ensureSentLogFile(paths.sent);
  ensureLogFile(paths.errors, "telefone;codigo;detalhe;data_hora");
  ensureLogFile(paths.skipped, "telefone;codigo;detalhe;data_hora");
  ensureLogFile(paths.warnings, "telefone;codigo;detalhe;data_hora");
}

function formatLogValue(value) {
  return String(value ?? "")
    .replace(/[\r\n;]/g, " ")
    .trim();
}

function appendLog(filePath, values) {
  fs.appendFileSync(
    filePath,
    `${values.map(formatLogValue).join(";")}\n`,
    "utf8",
  );
}

function loadAlreadySent(filePath = PATHS.sent) {
  return new Set(loadSentRecords(filePath).map((record) => record.telefone));
}

function loadSentRecords(filePath = PATHS.sent) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("telefone;"))
    .map(parseSentRecord)
    .filter(Boolean);
}

function parseSentRecord(line) {
  const parts = line.split(";");
  const telefone = parts[0];

  if (!telefone) {
    return undefined;
  }

  if (parts.length >= 3) {
    return {
      dataHora: parts[2],
      mensagemHash: parts[1],
      telefone,
    };
  }

  return {
    dataHora: parts[1],
    mensagemHash: undefined,
    telefone,
  };
}

function resetSentLog(filePath = PATHS.sent) {
  fs.writeFileSync(filePath, "telefone;mensagem_hash;data_hora\n", "utf8");
}

function parseExecutionOptions(argv = process.argv.slice(2)) {
  const args = new Set(argv);

  return {
    check: args.has("--check"),
    forceResend:
      args.has("--force-resend") ||
      args.has("--reenviar") ||
      args.has("--no-skip-sent"),
    help: args.has("--help") || args.has("-h"),
    resetSent:
      args.has("--reset-sent") ||
      args.has("--reset-enviados") ||
      args.has("--clear-sent") ||
      args.has("--clear-enviados") ||
      args.has("--limpar-enviados"),
  };
}

function printHelp() {
  console.log(`Uso:
  npm start
  node main.js [opções]

Opções:
  --check             Valida arquivos e configuração sem enviar.
  --force-resend      Ignora logs/enviados.csv nesta execução e reenvia.
  --reset-sent        Limpa logs/enviados.csv antes de iniciar.
  --clear-sent        Alias de --reset-sent.
  --reenviar          Alias de --force-resend.
  --reset-enviados    Alias de --reset-sent.
  --help              Mostra esta ajuda.`);
}

function resolveBrowserExecutablePath() {
  const configuredPath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;

  if (configuredPath) {
    const resolvedPath = path.resolve(configuredPath);

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
    // Continua procurando navegadores instalados no Windows.
  }

  candidatePaths.push(...getWindowsBrowserCandidates());
  candidatePaths.push(...findPuppeteerCacheBrowsers());

  const executablePath = candidatePaths.find((candidatePath) => {
    return candidatePath && fs.existsSync(candidatePath);
  });

  if (!executablePath) {
    throw new Error(
      "Chrome/Edge não encontrado. Instale o Google Chrome, rode `npx puppeteer browsers install chrome`, ou configure PUPPETEER_EXECUTABLE_PATH no .env.",
    );
  }

  return executablePath;
}

function getWindowsBrowserCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);

  const relativePaths = [
    path.join("Google", "Chrome", "Application", "chrome.exe"),
    path.join("Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  return roots.flatMap((root) =>
    relativePaths.map((relativePath) => path.join(root, relativePath)),
  );
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

    if (entry.isFile() && ["chrome.exe", "msedge.exe"].includes(entry.name)) {
      executables.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      collectBrowserExecutables(entryPath, executables, depth + 1);
    }
  }
}

function buildPuppeteerConfig() {
  const executablePath = resolveBrowserExecutablePath();

  return {
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  };
}

function validateRuntimeFiles(paths = PATHS, options = {}) {
  const checkBrowser = options.checkBrowser !== false;
  const issues = [];
  let clientes = [];
  let template = "";

  try {
    template = loadTemplate(paths.template);

    if (template.trim().length === 0) {
      issues.push("Template inválido: texto.md está vazio.");
    }

    issues.push(...validateTemplateMediaReferences(template, paths));
  } catch (err) {
    issues.push(err.message);
  }

  try {
    clientes = loadCsv(paths.csv);
  } catch (err) {
    issues.push(err.message);
  }

  try {
    initLogFiles(paths);
  } catch (err) {
    issues.push(`Estrutura de logs inválida: ${err.message}`);
  }

  if (fs.existsSync(paths.auth) && !fs.statSync(paths.auth).isDirectory()) {
    issues.push(`Sessão inválida: ${paths.auth} não é um diretório.`);
  }

  if (checkBrowser) {
    try {
      const executablePath = resolveBrowserExecutablePath();

      if (!executablePath) {
        issues.push("Chrome/Edge não encontrado.");
      }
    } catch (err) {
      issues.push(err.message);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Pré-validação RCF falhou:\n- ${issues.join("\n- ")}`);
  }

  return {
    clientesCount: clientes.length,
    templateVariables: [...template.matchAll(/\$\{([^}]+)\}/g)].map((match) =>
      match[1].trim(),
    ),
  };
}

async function processCampaign(client, paths = PATHS, options = {}) {
  const forceResend = Boolean(options.forceResend);
  const sentRecords = loadSentRecords(paths.sent);
  const template = loadTemplate(paths.template);
  const messageContext = registerTemplateInCache(template, paths);
  const clientes = loadCsv(paths.csv);
  const status = createStatusReporter(clientes.length);

  console.log(`Clientes encontrados: ${clientes.length}`);

  for (const cliente of clientes) {
    const telefone = sanitizePhone(cliente.telefone);
    status.current(`Validando ${maskPhone(telefone)}`);

    try {
      if (!telefone) {
        const reason = "Telefone vazio ou sem dígitos.";

        appendLog(paths.errors, [
          cliente.telefone,
          "TELEFONE_INVALIDO",
          reason,
          new Date().toISOString(),
        ]);

        status.event(`Pulando registro: ${reason}`, "red");
        status.error("Telefone inválido");
        continue;
      }

      const sendDecision = getSendDecision(
        telefone,
        sentRecords,
        messageContext,
        options,
      );

      if (!forceResend && !sendDecision.shouldSend) {
        appendLog(paths.skipped, [
          telefone,
          sendDecision.code || "JA_ENVIADO",
          sendDecision.reason,
          new Date().toISOString(),
        ]);

        status.event(
          `Pulando ${maskPhone(telefone)}: ${sendDecision.reason}`,
          "yellow",
        );
        status.skip(`Já enviado ${maskPhone(telefone)}`);
        continue;
      }

      if (forceResend && sentRecords.some((record) => record.telefone === telefone)) {
        status.event(
          `Reenviando ${maskPhone(telefone)}: --force-resend ativo.`,
          "yellow",
        );
      } else if (sendDecision.reason && sendDecision.reason !== "Nenhum envio anterior para este telefone.") {
        status.event(`Enviando ${maskPhone(telefone)}: ${sendDecision.reason}`, "yellow");
      }

      const numberId = await client.getNumberId(telefone);

      if (!numberId) {
        const reason = "Número não encontrado no WhatsApp.";

        appendLog(paths.errors, [
          telefone,
          "NAO_REGISTRADO",
          reason,
          new Date().toISOString(),
        ]);

        status.event(`Pulando ${maskPhone(telefone)}: ${reason}`, "red");
        status.error(`Sem WhatsApp ${maskPhone(telefone)}`);
        continue;
      }

      const missingVariables = new Set();
      const mensagem = applyTemplate(template, cliente, {
        onMissingVariable: (field) => missingVariables.add(field),
      });

      for (const field of missingVariables) {
        appendLog(paths.warnings, [
          telefone,
          "VARIAVEL_AUSENTE",
          field,
          new Date().toISOString(),
        ]);

        status.warning(`Variável ausente: ${field}`);
      }

      await sendRenderedTemplate(client, numberId._serialized, mensagem, paths);

      const sentAt = new Date().toISOString();

      appendLog(paths.sent, [telefone, messageContext.hash, sentAt]);
      sentRecords.push({
        dataHora: sentAt,
        mensagemHash: messageContext.hash,
        telefone,
      });

      status.sent(`Enviado ${maskPhone(telefone)}`);

      const delay = randomDelay();
      status.current(`Aguardando ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    } catch (err) {
      appendLog(paths.errors, [
        telefone || cliente.telefone,
        "ERRO_ENVIO",
        err.message,
        new Date().toISOString(),
      ]);

      status.error(`Erro ${maskPhone(telefone)}: ${err.message}`);
    }
  }

  status.finish();
}

function createWhatsAppClient(paths = PATHS) {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: paths.auth,
    }),

    puppeteer: buildPuppeteerConfig(),
  });
}

function registerClientHandlers(client, paths = PATHS, options = {}) {
  client.on("qr", (qr) => {
    console.clear();
    console.log("Escaneie o QR Code:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", async () => {
    console.log("WhatsApp conectado.");

    try {
      await processCampaign(client, paths, options);
      console.log("Processamento concluído.");
    } catch (err) {
      console.error("Processamento interrompido:", err.message);
      process.exitCode = 1;
    }
  });

  client.on("auth_failure", (msg) => {
    console.error("Falha de autenticação:", msg);
    process.exitCode = 1;
  });

  client.on("disconnected", (reason) => {
    console.error("Desconectado:", reason);
  });
}

async function main() {
  try {
    const options = parseExecutionOptions();

    if (options.help) {
      printHelp();
      return;
    }

    const validation = validateRuntimeFiles(PATHS);
    console.log(
      `Pré-validação RCF concluída. Clientes: ${validation.clientesCount}.`,
    );

    if (options.check) {
      return;
    }

    if (options.resetSent) {
      resetSentLog(PATHS.sent);
      console.log("Lista de enviados resetada: logs/enviados.csv");
    }

    if (options.forceResend) {
      console.log("Reenvio forçado ativo: logs/enviados.csv será ignorado.");
    }

    const client = createWhatsAppClient(PATHS);
    registerClientHandlers(client, PATHS, options);
    await client.initialize();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  PATHS,
  REQUIRED_COLUMNS,
  applyTemplate,
  buildSendPlan,
  buildPuppeteerConfig,
  calculateDifferencePercent,
  findPuppeteerCacheBrowsers,
  getSendDecision,
  getTemplateFingerprint,
  getWindowsBrowserCandidates,
  formatNameForMessage,
  loadSentRecords,
  parseExecutionOptions,
  parseTemplateParts,
  registerTemplateInCache,
  resolveMediaPath,
  resetSentLog,
  sendRenderedTemplate,
  validateTemplateMediaReferences,
  loadAlreadySent,
  loadCsv,
  loadTemplate,
  processCampaign,
  randomDelay,
  resolveBrowserExecutablePath,
  sanitizePhone,
  validateRuntimeFiles,
};
