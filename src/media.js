// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { fileURLToPath } = require("url");
const { MessageMedia } = require("whatsapp-web.js");

const { PATHS, ROOT_DIR, readIntegerEnv, validateEnvRelations } = require("./config");
const { hashValue } = require("./utils");
const {
  isEmbeddedMediaReference,
  parseEmbeddedTemplate,
  parseTemplateParts,
  splitMessagePostings,
  validateEmbeddedReferences,
} = require("./template");
const { inferSupportedMediaMimeType } = require("./media-capabilities");

const CAPTION_POSITION = Symbol("captionPosition");
const MESSAGE_SEND_RETRIES = Math.max(1, readIntegerEnv("MESSAGE_SEND_RETRIES", 3));
const MESSAGE_SEND_RETRY_DELAY_MS = readIntegerEnv("MESSAGE_SEND_RETRY_DELAY_MS", 1200);
const MESSAGE_SEND_RETRY_MAX_DELAY_MS = readIntegerEnv("MESSAGE_SEND_RETRY_MAX_DELAY_MS", 10000);
const MEDIA_SEND_RETRIES = Math.max(1, readIntegerEnv("MEDIA_SEND_RETRIES", 5));
const MEDIA_SEND_RETRY_DELAY_MS = readIntegerEnv("MEDIA_SEND_RETRY_DELAY_MS", 1200);
const MEDIA_SEND_RETRY_MAX_DELAY_MS = readIntegerEnv("MEDIA_SEND_RETRY_MAX_DELAY_MS", 10000);
const MEDIA_CONTEXT_READY_TIMEOUT_MS = readIntegerEnv("MEDIA_CONTEXT_READY_TIMEOUT_MS", 15000);
const MEDIA_CONTEXT_STABLE_MS = readIntegerEnv("MEDIA_CONTEXT_STABLE_MS", 500);

validateEnvRelations({
  MEDIA_CONTEXT_READY_TIMEOUT_MS,
  MEDIA_CONTEXT_STABLE_MS,
  MEDIA_SEND_RETRIES,
  MEDIA_SEND_RETRY_DELAY_MS,
  MEDIA_SEND_RETRY_MAX_DELAY_MS,
  MESSAGE_SEND_RETRIES,
  MESSAGE_SEND_RETRY_DELAY_MS,
  MESSAGE_SEND_RETRY_MAX_DELAY_MS,
});
const chatSendQueues = new Map();
const AUDIO_OGG_MARKERS = [
  Buffer.from("OpusHead", "ascii"),
  Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]),
  Buffer.from("Speex   ", "ascii"),
  Buffer.from("fLaC", "ascii"),
];
const NON_AUDIO_OGG_MARKERS = [
  Buffer.from("theora", "ascii"),
  Buffer.from("fishead", "ascii"),
  Buffer.from("video", "ascii"),
];

function isUrl(value) {
  return /^https?:\/\//i.test(value);
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
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
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

function resolveLocalMediaPath(source, templatePath, baseDir, fallbackDirs = [ROOT_DIR]) {
  const candidates = buildLocalMediaCandidates(source, templatePath, baseDir, fallbackDirs);

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    if (!fs.statSync(filePath).isFile()) {
      throw new Error(`Anexo não é um arquivo: ${source}`);
    }

    assertReadableFile(filePath, source);
    return filePath;
  }

  throw new Error(
    `Anexo não encontrado: ${source}. Locais verificados: ${candidates.join("; ")}`,
  );
}

function buildLocalMediaCandidates(source, templatePath, baseDir, fallbackDirs = [ROOT_DIR]) {
  const rawSource = normalizeLocalMediaSource(source);

  if (path.isAbsolute(rawSource)) {
    return [path.normalize(rawSource)];
  }

  const dirs = [
    baseDir,
    templatePath ? path.dirname(templatePath) : "",
    ...fallbackDirs,
  ];
  const uniqueDirs = [];
  const seen = new Set();

  for (const dir of dirs) {
    if (!dir) {
      continue;
    }

    const normalized = path.resolve(dir);
    const key = process.platform === "win32"
      ? normalized.toLocaleLowerCase("pt-BR")
      : normalized;

    if (!seen.has(key)) {
      seen.add(key);
      uniqueDirs.push(normalized);
    }
  }

  return uniqueDirs.map((dir) => path.resolve(dir, rawSource));
}

function normalizeLocalMediaSource(source) {
  const rawSource = String(source || "")
    .trim()
    .replace(/^["'](.+)["']$/, "$1")
    .trim();

  if (/^file:\/\//iu.test(rawSource)) {
    try {
      return fileURLToPath(rawSource);
    } catch {
      return rawSource;
    }
  }

  return rawSource;
}

function assertReadableFile(filePath, source) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (err) {
    throw new Error(
      `Anexo não pôde ser lido: ${source}. Caminho resolvido: ${filePath}. ${err.message}`,
    );
  }
}

function getMediaFallbackDirs(paths = PATHS) {
  return [
    paths.root,
    ROOT_DIR,
  ].filter(Boolean);
}

async function resolveMediaPath(source, paths = PATHS, downloadCache = new Map()) {
  if (!source) {
    throw new Error("Anexo sem caminho definido.");
  }

  if (!isUrl(source)) {
    return resolveLocalMediaPath(
      source,
      paths.template,
      paths.templateBaseDir,
      getMediaFallbackDirs(paths),
    );
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

function createMessageMediaFromFile(filePath) {
  const normalizedPath = path.normalize(filePath);
  const filename = path.basename(normalizedPath);
  let stat;

  try {
    stat = fs.statSync(normalizedPath);
    const data = fs.readFileSync(normalizedPath).toString("base64");
    return new MessageMedia(
      inferMediaMimeType(normalizedPath),
      data,
      filename,
      stat.size,
    );
  } catch (err) {
    throw new Error(`Falha ao ler anexo: ${normalizedPath}. ${err.message}`);
  }
}

function inferMediaMimeType(filePath) {
  return inferSupportedMediaMimeType(filePath);
}

function isOggSource(source, embeddedAttachments = new Map()) {
  if (!source) {
    return false;
  }

  if (isEmbeddedMediaReference(source)) {
    return path.extname(embeddedAttachments.get(source.slice(7))?.name || "")
      .toLocaleLowerCase("pt-BR") === ".ogg";
  }

  try {
    const value = isUrl(source) ? new URL(source).pathname : source;
    return path.extname(value).toLocaleLowerCase("pt-BR") === ".ogg";
  } catch {
    return path.extname(String(source)).toLocaleLowerCase("pt-BR") === ".ogg";
  }
}

function isOggAudioOnly(filePath) {
  if (path.extname(filePath).toLocaleLowerCase("pt-BR") !== ".ogg") {
    return false;
  }

  const buffer = readFilePrefix(filePath, 256 * 1024);

  if (buffer.length < 4 || buffer.subarray(0, 4).toString("ascii") !== "OggS") {
    return false;
  }

  if (NON_AUDIO_OGG_MARKERS.some((marker) => bufferIncludes(buffer, marker))) {
    return false;
  }

  return AUDIO_OGG_MARKERS.some((marker) => bufferIncludes(buffer, marker));
}

function readFilePrefix(filePath, maxBytes) {
  const fd = fs.openSync(filePath, "r");

  try {
    const stat = fs.fstatSync(fd);
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    const bytesRead = fs.readSync(fd, buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function bufferIncludes(buffer, marker) {
  return buffer.indexOf(marker) !== -1;
}

function normalizeCaption(value) {
  return String(value || "").trim();
}

function buildSendPlan(parts, embeddedAttachments = new Map()) {
  const plan = [];
  const mediaCaptions = new Map();
  const consumedText = new Set();
  const firstTextIndex = parts.findIndex((part) => part.type === "text");
  const lastTextIndex = parts.findLastIndex((part) => part.type === "text");

  if (
    firstTextIndex > 0 &&
    parts
      .slice(0, firstTextIndex)
      .every((part) => part.type === "media" && !isOggSource(part.source, embeddedAttachments))
  ) {
    mediaCaptions.set(firstTextIndex - 1, {
      position: "after",
      value: normalizeCaption(parts[firstTextIndex].value),
    });
    consumedText.add(firstTextIndex);
  }

  if (
    lastTextIndex >= 0 &&
    lastTextIndex < parts.length - 1 &&
    !consumedText.has(lastTextIndex) &&
    parts
      .slice(lastTextIndex + 1)
      .every((part) => part.type === "media" && !isOggSource(part.source, embeddedAttachments))
  ) {
    mediaCaptions.set(lastTextIndex + 1, {
      position: "before",
      value: normalizeCaption(parts[lastTextIndex].value),
    });
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

    const plannedPart = {
      ...part,
      ...(mediaCaptions.has(index)
        ? { caption: mediaCaptions.get(index).value }
        : {}),
    };

    if (mediaCaptions.has(index)) {
      Object.defineProperty(plannedPart, CAPTION_POSITION, {
        value: mediaCaptions.get(index).position,
      });
    }

    plan.push(plannedPart);
  }

  return plan;
}

function validateTemplateMediaReferences(template, paths = PATHS) {
  const issues = [];
  let document;

  try {
    document = typeof template === "string" ? parseEmbeddedTemplate(template) : template;
    issues.push(...validateEmbeddedReferences(document));
  } catch (err) {
    return [err.message];
  }

  for (const part of parseTemplateParts(document.content)) {
    if (part.type !== "media" || isUrl(part.source)) {
      continue;
    }

    if (isEmbeddedMediaReference(part.source)) continue;

    try {
      resolveLocalMediaPath(
        part.source,
        paths.template,
        paths.templateBaseDir,
        getMediaFallbackDirs(paths),
      );
    } catch (err) {
      issues.push(err.message);
    }
  }

  return issues;
}

async function sendRenderedTemplate(client, chatId, renderedTemplate, paths = PATHS, progressOptions = {}) {
  return enqueueChatSend(chatId, () =>
    sendRenderedTemplateInOrder(client, chatId, renderedTemplate, paths, progressOptions),
  );
}

async function sendRenderedTemplateInOrder(client, chatId, renderedTemplate, paths = PATHS, progressOptions = {}) {
  const postings = splitMessagePostings(renderedTemplate);
  const downloadCache = new Map();
  const embeddedAttachments = progressOptions.embeddedAttachments || new Map();

  for (const posting of postings) {
    const parts = buildSendPlan(parseTemplateParts(posting), embeddedAttachments);

    for (const part of parts) {
      if (part.type === "text") {
        await sendTextMessageWithRetry(client, chatId, part.value, progressOptions);
        continue;
      }

      const embedded = isEmbeddedMediaReference(part.source)
        ? embeddedAttachments.get(part.source.slice("@embed:".length))
        : null;
      const filePath = embedded ? null : await resolveMediaPath(part.source, paths, downloadCache);
      const filename = embedded ? embedded.name : path.basename(filePath);

      if (!embedded && isOggAudioOnly(filePath)) {
        emitMediaProgress(progressOptions, {
          message: `Enviando áudio ${filename}.`,
          type: "current",
        });
        await sendOggVoiceMessage(client, chatId, filePath, part, progressOptions);
        continue;
      }

      const media = embedded
        ? new MessageMedia(embedded.mime, embedded.data, embedded.name, embedded.bytes.length)
        : createMessageMediaFromFile(filePath);
      emitMediaProgress(progressOptions, {
        message: `Enviando anexo ${filename}.`,
        type: "current",
      });

      const sendOptions = {
        sendMediaAsDocument: shouldSendAsDocument(media),
        waitUntilMsgSent: true,
      };

      if (part.caption) {
        sendOptions.caption = part.caption;
      }

      await sendMediaMessageWithRetry(client, chatId, () => embedded
        ? new MessageMedia(embedded.mime, embedded.data, embedded.name, embedded.bytes.length)
        : createMessageMediaFromFile(filePath), sendOptions, {
        label: filename,
        onProgress: progressOptions.onProgress,
      });
    }
  }
}

async function sendOggVoiceMessage(client, chatId, filePath, part, progressOptions = {}) {
  const caption = normalizeCaption(part.caption);
  const captionPosition = part[CAPTION_POSITION];
  const filename = path.basename(filePath);

  if (caption && captionPosition === "before") {
    await sendTextMessageWithRetry(client, chatId, caption, progressOptions);
  }

  try {
    await sendMediaMessageWithRetry(
      client,
      chatId,
      () => createOggVoiceMedia(createMessageMediaFromFile(filePath)),
      {
        sendAudioAsVoice: true,
        sendMediaAsDocument: false,
        waitUntilMsgSent: true,
      },
      {
        label: filename,
        mode: "voice",
        onProgress: progressOptions.onProgress,
      },
    );
  } catch (voiceErr) {
    emitMediaProgress(progressOptions, {
      message: `Áudio ${filename}: envio como voz falhou; tentando como áudio comum.`,
      type: "warning",
    });
    await sendMediaMessageWithRetry(
      client,
      chatId,
      () => createMessageMediaFromFile(filePath),
      {
        sendAudioAsVoice: false,
        sendMediaAsDocument: false,
        waitUntilMsgSent: true,
      },
      {
        label: filename,
        mode: "audio",
        onProgress: progressOptions.onProgress,
        previousError: voiceErr,
      },
    );
  }

  if (caption && captionPosition === "after") {
    await sendTextMessageWithRetry(client, chatId, caption, progressOptions);
  }
}

async function sendTextMessageWithRetry(client, chatId, text, progressOptions = {}) {
  return sendConfirmedMessageWithRetry(
    client,
    chatId,
    () => text,
    {
      waitUntilMsgSent: true,
    },
    {
      kind: "text",
      label: "mensagem de texto",
      maxDelayMs: MESSAGE_SEND_RETRY_MAX_DELAY_MS,
      onProgress: progressOptions.onProgress,
      retryDelayMs: MESSAGE_SEND_RETRY_DELAY_MS,
      retries: MESSAGE_SEND_RETRIES,
      wrapError: false,
    },
  );
}

async function sendMediaMessageWithRetry(client, chatId, mediaFactory, options = {}, context = {}) {
  return sendConfirmedMessageWithRetry(client, chatId, mediaFactory, options, {
    ...context,
    maxDelayMs: MEDIA_SEND_RETRY_MAX_DELAY_MS,
    retryDelayMs: MEDIA_SEND_RETRY_DELAY_MS,
    retries: MEDIA_SEND_RETRIES,
  });
}

async function sendConfirmedMessageWithRetry(client, chatId, contentFactory, options = {}, context = {}) {
  const retries = Math.max(1, context.retries || MESSAGE_SEND_RETRIES);
  const retryDelayMs = context.retryDelayMs ?? MESSAGE_SEND_RETRY_DELAY_MS;
  const maxDelayMs = context.maxDelayMs ?? MESSAGE_SEND_RETRY_MAX_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await assertWhatsAppSendContextReady(client);
      return await client.sendMessage(chatId, contentFactory(), options);
    } catch (err) {
      lastError = err;

      if (attempt >= retries || !isTransientSendError(err)) {
        break;
      }

      emitMediaProgress(context, {
        attempt: attempt + 1,
        message: `Retentando ${describeMediaSend(context)} após instabilidade do WhatsApp Web (${attempt + 1}/${retries}).`,
        type: "warning",
      });
      await delay(getRetryDelay(retryDelayMs, maxDelayMs, attempt));
      emitMediaProgress(context, {
        attempt: attempt + 1,
        message: `Aguardando WhatsApp Web estabilizar para ${describeMediaSend(context)}.`,
        type: "wait",
      });
      await waitForWhatsAppMediaContext(client);
    }
  }

  const previous = context.previousError
    ? ` Tentativa como áudio de voz falhou antes: ${context.previousError.message || context.previousError}.`
    : "";

  if (context.wrapError === false) {
    throw lastError;
  }

  const label = context.label ? ` (${context.label})` : "";
  throw new Error(`Falha ao enviar anexo${label}: ${lastError.message || lastError}.${previous}`);
}

function enqueueChatSend(chatId, task) {
  const key = String(chatId || "");
  const previous = chatSendQueues.get(key) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(task);
  const tracked = queued
    .catch(() => undefined)
    .finally(() => {
      if (chatSendQueues.get(key) === tracked) {
        chatSendQueues.delete(key);
      }
    });

  chatSendQueues.set(key, tracked);
  return queued;
}

async function assertWhatsAppSendContextReady(client) {
  const ready = await waitForWhatsAppMediaContext(client);

  if (!ready) {
    throw new Error("WhatsApp Web não estabilizou para envio dentro do tempo limite.");
  }

  return true;
}

function getRetryDelay(baseDelayMs, maxDelayMs, attempt) {
  const exponentialDelay = Math.max(0, baseDelayMs) * (2 ** Math.max(0, attempt - 1));

  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0) {
    return exponentialDelay;
  }

  return Math.min(exponentialDelay, maxDelayMs);
}

function describeMediaSend(context = {}) {
  if (context.kind === "text") {
    return context.label || "mensagem de texto";
  }

  const label = context.label ? `anexo ${context.label}` : "anexo";

  if (context.mode === "voice") {
    return `${label} como áudio de voz`;
  }

  if (context.mode === "audio") {
    return `${label} como áudio comum`;
  }

  return label;
}

function emitMediaProgress(context = {}, event = {}) {
  if (typeof context.onProgress !== "function") {
    return;
  }

  try {
    context.onProgress({
      ...(context.kind === "text" ? {} : { media: true }),
      ...event,
    });
  } catch (_) {
    // Progresso visual não pode interferir no envio.
  }
}

function isTransientSendError(err) {
  const message = err && err.message ? err.message : String(err || "");
  return /Protocol error|Runtime\.callFunctionOn|Promise was collected|Execution context was destroyed|detached Frame|Target closed|Session closed|Navigation|Timeout|ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETDOWN|ENETUNREACH|EPIPE|WebSocket|window\.require is not a function|sendIq called before startComms|não estabilizou para envio/iu.test(message);
}

function isTransientMediaSendError(err) {
  return isTransientSendError(err);
}

async function waitForWhatsAppMediaContext(client, timeoutMs = MEDIA_CONTEXT_READY_TIMEOUT_MS) {
  const page = client && client.pupPage;

  if (!page || typeof page.evaluate !== "function") {
    return true;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await focusWhatsAppPage(client);

      if (typeof page.isClosed === "function" && page.isClosed()) {
        throw new Error("Página do WhatsApp Web fechada.");
      }

      const ready = await page.evaluate(() => {
        try {
          return Boolean(
            window.WWebJS &&
              window.WWebJS.getChat &&
              window.WWebJS.sendMessage &&
              typeof window.require === "function" &&
              window.require("WAWebCollections"),
          );
        } catch (_) {
          return false;
        }
      });

      if (ready) {
        if (MEDIA_CONTEXT_STABLE_MS > 0) {
          await delay(MEDIA_CONTEXT_STABLE_MS);
        }

        return true;
      }
    } catch (_) {
      // Navegação ou frame destacado durante a espera: tenta novamente até o timeout.
    }

    await delay(300);
  }

  return false;
}

async function focusWhatsAppPage(client) {
  const page = client && client.pupPage;

  if (!page || typeof page.bringToFront !== "function") {
    return false;
  }

  try {
    await page.bringToFront();
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function createOggVoiceMedia(media) {
  return new MessageMedia(
    "audio/ogg",
    media.data,
    media.filename || "audio.ogg",
    media.filesize,
  );
}

module.exports = {
  buildLocalMediaCandidates,
  createMessageMediaFromFile,
  buildSendPlan,
  createOggVoiceMedia,
  downloadMediaUrl,
  getMediaFallbackDirs,
  inferMediaMimeType,
  isOggAudioOnly,
  isOggSource,
  isUrl,
  isTransientMediaSendError,
  resolveLocalMediaPath,
  resolveMediaPath,
  sendRenderedTemplate,
  sendTextMessageWithRetry,
  sendConfirmedMessageWithRetry,
  sendMediaMessageWithRetry,
  focusWhatsAppPage,
  isTransientSendError,
  waitForWhatsAppMediaContext,
  validateTemplateMediaReferences,
};
