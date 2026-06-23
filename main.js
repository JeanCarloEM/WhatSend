/**
 * =============================================================================
 * RCF - REQUIREMENTS & CONTROL FRAMEWORK
 * =============================================================================
 *
 * Projeto:
 *   Disparador Local de Mensagens WhatsApp
 *
 * Objetivo:
 *   Realizar envio automatizado de mensagens personalizadas pelo WhatsApp Web,
 *   usando um CSV local de destinatários e um template Markdown local.
 *
 * Escopo:
 *   - Operação local e sob demanda.
 *   - Sem uso da API Oficial da Meta.
 *   - Comunicação externa somente com WhatsApp Web e URLs de anexos declaradas
 *     explicitamente no template.
 *   - Sessão persistida localmente.
 *   - Auditoria local em arquivos dentro de ./logs.
 *   - Compatibilidade com Windows, macOS e Linux quando Node.js, dependências e
 *     navegador Chromium compatível estiverem disponíveis.
 *
 * =============================================================================
 * REGRAS DE NEGÓCIO
 * =============================================================================
 *
 * RN001 - Origem dos Dados
 *   Os destinatários devem ser carregados exclusivamente de:
 *
 *      ./clientes.csv
 *
 *   O CSV deve conter obrigatoriamente as colunas:
 *
 *      nome
 *      telefone
 *      conta
 *
 *   Colunas adicionais devem ficar disponíveis automaticamente como variáveis
 *   no template.
 *
 * -----------------------------------------------------------------------------
 *
 * RN002 - Template de Mensagem
 *   O template deve ser carregado exclusivamente de:
 *
 *      ./texto.md
 *
 *   O conteúdo textual deve ser preservado conforme definido no arquivo, após
 *   substituição de variáveis e interpretação dos anexos Markdown.
 *
 * -----------------------------------------------------------------------------
 *
 * RN003 - Variáveis do Template
 *   Variáveis devem usar o padrão:
 *
 *      ${nome}
 *      ${telefone}
 *      ${conta}
 *
 *   ou qualquer outra coluna existente no CSV.
 *
 *   Caso a coluna não exista:
 *
 *      - Não lançar exceção.
 *      - Substituir por string vazia.
 *      - Registrar aviso em ./logs/avisos.csv.
 *
 * -----------------------------------------------------------------------------
 *
 * RN004 - Formatação do Nome
 *   Ao aplicar ${nome}, o valor deve ser formatado para mensagem:
 *
 *      - Capitalizar as palavras.
 *      - Manter no máximo duas palavras.
 *      - Preservar nomes compostos com hífen.
 *
 * -----------------------------------------------------------------------------
 *
 * RN005 - Recursos Markdown Textuais
 *   O template pode conter recursos textuais do Markdown aceitos pelo WhatsApp,
 *   como listas, blockquote, itálico, destaque e emojis. O sistema não deve
 *   sanitizar ou reescrever esse conteúdo textual além das variáveis previstas.
 *
 * -----------------------------------------------------------------------------
 *
 * RN006 - Anexos via Markdown
 *   A notação:
 *
 *      ![](CAMINHO_OU_URL)
 *
 *   deve ser interpretada como anexo.
 *
 *   O caminho pode ser:
 *
 *      - Relativo ao diretório de texto.md.
 *      - Absoluto.
 *      - URL http/https.
 *
 *   Arquivos locais inexistentes devem falhar na pré-validação. URLs devem ser
 *   baixadas para uma pasta temporária e reutilizadas quando a mesma URL aparecer
 *   novamente.
 *
 * -----------------------------------------------------------------------------
 *
 * RN007 - Ordem e Legenda de Anexos
 *   Quando um anexo estiver no início ou no final do template, o texto adjacente
 *   deve ser enviado como legenda do próprio anexo sempre que compatível com o
 *   WhatsApp Web.
 *
 *   Quando o anexo estiver no meio do texto, o sistema deve preservar a ordem do
 *   template enviando as partes separadamente.
 *
 *   Imagens devem ser enviadas como mídia; outros arquivos, como PDF ou ZIP,
 *   devem ser enviados como documento.
 *
 * -----------------------------------------------------------------------------
 *
 * RN008 - Tratamento de Telefone
 *   Antes de qualquer validação ou envio:
 *
 *      - Remover todos os caracteres não numéricos.
 *      - Manter apenas dígitos.
 *      - Adicionar o código do Brasil, 55, quando ausente.
 *
 * -----------------------------------------------------------------------------
 *
 * RN009 - Validação de Existência no WhatsApp
 *   Nenhuma mensagem deve ser enviada sem validação prévia do número via:
 *
 *      client.getNumberId()
 *
 *   Números inexistentes ou inválidos devem ser registrados em log e não devem
 *   interromper o lote.
 *
 * -----------------------------------------------------------------------------
 *
 * RN010 - Prevenção Inteligente de Reenvio
 *   O controle de envio deve usar:
 *
 *      ./logs/enviados.csv
 *      ./logs/mensagens.json
 *
 *   O sistema deve registrar telefone, hash do template nativo e data/hora.
 *
 *   Se a mensagem nativa atual for menos de 10% diferente de uma mensagem já
 *   enviada para o mesmo telefone dentro da janela configurada, o registro deve
 *   ser pulado.
 *
 *   Se a mensagem nativa atual diferir 10% ou mais, deve ser considerada nova
 *   e pode ser enviada sem força manual.
 *
 *   Se a mensagem similar tiver sido enviada há mais de 48 horas, por padrão,
 *   pode ser reenviada.
 *
 *   Os limites devem ser configuráveis via:
 *
 *      MESSAGE_DIFF_THRESHOLD_PERCENT
 *      RESEND_AFTER_HOURS
 *
 * -----------------------------------------------------------------------------
 *
 * RN011 - Forçar ou Limpar Histórico
 *   Deve existir opção para reenviar ignorando o histórico:
 *
 *      --force-resend
 *      --reenviar
 *
 *   Deve existir opção para limpar o histórico de enviados:
 *
 *      --clear-sent
 *      --reset-sent
 *      --reset-enviados
 *
 *   Essas opções não devem permitir envio para telefones inválidos ou números
 *   inexistentes no WhatsApp.
 *
 * -----------------------------------------------------------------------------
 *
 * RN012 - Continuidade Operacional
 *   Em caso de interrupção inesperada, queda do sistema, perda de conexão ou
 *   reinicialização, a execução deve poder ser retomada sem reenviar mensagens
 *   ainda bloqueadas pelo histórico inteligente.
 *
 * -----------------------------------------------------------------------------
 *
 * RN013 - Isolamento de Falhas
 *   Erros individuais devem ser registrados e não devem interromper o lote.
 *
 * -----------------------------------------------------------------------------
 *
 * RN014 - Controle de Velocidade
 *   Deve existir intervalo aleatório entre envios, configurável por:
 *
 *      MIN_DELAY_MS
 *      MAX_DELAY_MS
 *
 *   Valores padrão:
 *
 *      8000 ms
 *      20000 ms
 *
 * -----------------------------------------------------------------------------
 *
 * RN015 - Persistência de Sessão
 *   A autenticação do WhatsApp deve permanecer armazenada localmente em:
 *
 *      ./.wwebjs_auth
 *
 *   Deve ser possível isolar uma sessão alternativa por:
 *
 *      WA_CLIENT_ID
 *
 * -----------------------------------------------------------------------------
 *
 * RN016 - Operação Local e Privacidade
 *   Dados de clientes não devem ser transmitidos para sistemas terceiros, exceto
 *   para o próprio WhatsApp durante o envio e para URLs de anexos explicitamente
 *   declaradas no template.
 *
 * -----------------------------------------------------------------------------
 *
 * RN017 - Integridade dos Dados de Entrada
 *   O sistema não deve alterar:
 *
 *      clientes.csv
 *      texto.md
 *
 *   durante validação ou envio.
 *
 * -----------------------------------------------------------------------------
 *
 * RN018 - Auditoria
 *   Todo resultado deve possuir rastreabilidade local.
 *
 *   Arquivos mínimos:
 *
 *      ./logs/enviados.csv
 *      ./logs/erros.csv
 *      ./logs/pulos.csv
 *      ./logs/avisos.csv
 *      ./logs/mensagens.json
 *
 * -----------------------------------------------------------------------------
 *
 * RN019 - Saída de Console
 *   O console deve exibir status compacto e legível, com progresso, enviados,
 *   pulos, erros e avisos. Quando suportado pelo terminal, deve usar cores e
 *   atualizar a linha de progresso sem inundar a tela.
 *
 *   Todo pulo deve apresentar motivo claro.
 *
 * -----------------------------------------------------------------------------
 *
 * RN020 - Pré-Validação Segura
 *   O comando de checagem deve validar arquivos, estrutura de logs, template,
 *   anexos locais, sessão e navegador antes de qualquer envio:
 *
 *      npm run check
 *
 *   Em caso de falha, o processamento deve ser interrompido antes do primeiro
 *   envio.
 *
 * -----------------------------------------------------------------------------
 *
 * RN021 - Navegador Compatível
 *   O sistema deve usar navegador Chromium compatível, detectando
 *   automaticamente Chrome, Chromium ou Edge em Windows, macOS e Linux, ou
 *   aceitando configuração manual por:
 *
 *      PUPPETEER_EXECUTABLE_PATH
 *      CHROME_EXECUTABLE_PATH
 *
 *   Quando o navegador já estiver aberto, só deve ser reutilizado se tiver sido
 *   iniciado com depuração remota e informado por:
 *
 *      BROWSER_URL
 *      BROWSER_WS_ENDPOINT
 *      CONNECT_EXISTING_BROWSER
 *
 * =============================================================================
 * REQUISITOS NÃO FUNCIONAIS
 * =============================================================================
 *
 * RNF001 - Plataforma
 *   Compatível com Windows, macOS e Linux, desde que Node.js LTS, dependências e
 *   navegador Chromium compatível estejam disponíveis.
 *
 * RNF002 - Execução
 *   Compatível com Node.js LTS e CommonJS.
 *
 * RNF003 - Offline Parcial
 *   Operação offline para leitura, validação, renderização do template e logs,
 *   exceto comunicação com WhatsApp Web e download de anexos remotos.
 *
 * RNF004 - Escala
 *   Suportar lotes grandes com processamento independente por destinatário.
 *
 * RNF005 - Manutenibilidade
 *   As regras críticas devem possuir cobertura automatizada por node:test.
 *
 * RNF006 - Extensibilidade
 *   O desenho deve permitir evolução futura para múltiplos templates,
 *   campanhas, anexos avançados, agendamento e dry-run.
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
    const resolvedPath = resolveConfiguredExecutablePath(configuredPath);

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
    // Continua procurando navegadores instalados na plataforma.
  }

  candidatePaths.push(...getInstalledBrowserCandidates());
  candidatePaths.push(...getPathBrowserCandidates());
  candidatePaths.push(...findPuppeteerCacheBrowsers());

  const executablePath = uniqueValues(candidatePaths).find((candidatePath) => {
    return candidatePath && fs.existsSync(candidatePath);
  });

  if (!executablePath) {
    throw new Error(
      "Chrome/Chromium/Edge não encontrado. Instale um navegador compatível, rode `npx puppeteer browsers install chrome`, ou configure PUPPETEER_EXECUTABLE_PATH no .env.",
    );
  }

  return executablePath;
}

function resolveConfiguredExecutablePath(configuredPath) {
  const value = String(configuredPath).trim();

  if (!value) {
    return value;
  }

  const looksLikePath =
    path.isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".");

  if (looksLikePath) {
    return path.resolve(value);
  }

  return findExecutableOnPath(value) || path.resolve(value);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getInstalledBrowserCandidates(platform = os.platform()) {
  if (platform === "win32") {
    return getWindowsBrowserCandidates();
  }

  if (platform === "darwin") {
    return getMacBrowserCandidates();
  }

  return getLinuxBrowserCandidates();
}

function getWindowsBrowserCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);

  const relativePaths = [
    path.join("Google", "Chrome", "Application", "chrome.exe"),
    path.join("Google", "Chrome Beta", "Application", "chrome.exe"),
    path.join("Chromium", "Application", "chrome.exe"),
    path.join("Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  return roots.flatMap((root) =>
    relativePaths.map((relativePath) => path.join(root, relativePath)),
  );
}

function getMacBrowserCandidates() {
  const roots = [
    "/Applications",
    process.env.HOME ? path.join(process.env.HOME, "Applications") : undefined,
  ].filter(Boolean);

  const relativePaths = [
    path.join("Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
    path.join("Google Chrome Beta.app", "Contents", "MacOS", "Google Chrome Beta"),
    path.join("Chromium.app", "Contents", "MacOS", "Chromium"),
    path.join("Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
  ];

  return roots.flatMap((root) =>
    relativePaths.map((relativePath) => path.join(root, relativePath)),
  );
}

function getLinuxBrowserCandidates() {
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/local/bin/google-chrome",
    "/usr/local/bin/chromium",
    "/snap/bin/chromium",
  ];
}

function getPathBrowserCandidates() {
  return uniqueValues(getBrowserExecutableNames().map(findExecutableOnPath));
}

function getBrowserExecutableNames(platform = os.platform()) {
  const common = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
    "msedge",
  ];

  if (platform === "win32") {
    return ["chrome.exe", "msedge.exe", "chromium.exe", ...common];
  }

  if (platform === "darwin") {
    return ["Google Chrome", "Chromium", "Microsoft Edge", ...common];
  }

  return common;
}

function getPathDirectories() {
  const pathValue = process.env.PATH || process.env.Path || process.env.path || "";
  return pathValue.split(path.delimiter).filter(Boolean);
}

function findExecutableOnPath(name) {
  const extensions =
    os.platform() === "win32" && !path.extname(name)
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of getPathDirectories()) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${name}${ext}`);

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
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

    if (entry.isFile() && isBrowserExecutableName(entry.name)) {
      executables.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      collectBrowserExecutables(entryPath, executables, depth + 1);
    }
  }
}

function isBrowserExecutableName(name) {
  return [
    "chrome",
    "chrome.exe",
    "chromium",
    "chromium.exe",
    "google chrome",
    "google chrome for testing",
    "microsoft edge",
    "msedge.exe",
  ].includes(String(name).toLowerCase());
}

function getExistingBrowserConnectionConfig() {
  const browserWSEndpoint = readFirstEnv([
    "BROWSER_WS_ENDPOINT",
    "PUPPETEER_BROWSER_WS_ENDPOINT",
  ]);

  if (browserWSEndpoint) {
    return { browserWSEndpoint };
  }

  const browserURL = readFirstEnv(["BROWSER_URL", "PUPPETEER_BROWSER_URL"]);

  if (browserURL) {
    return { browserURL };
  }

  if (isTruthyEnv(process.env.CONNECT_EXISTING_BROWSER)) {
    return { browserURL: "http://127.0.0.1:9222" };
  }

  return null;
}

function buildPuppeteerConfig() {
  const existingBrowserConfig = getExistingBrowserConnectionConfig();

  if (existingBrowserConfig) {
    return existingBrowserConfig;
  }

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

function getWhatsAppClientId() {
  const clientId = readFirstEnv(["WA_CLIENT_ID", "WWEBJS_CLIENT_ID"]);

  if (!clientId) {
    return undefined;
  }

  if (!/^[-_\w]+$/i.test(clientId)) {
    throw new Error(
      "WA_CLIENT_ID inválido. Use apenas letras, números, hífen ou sublinhado.",
    );
  }

  return clientId;
}

function formatBrowserStartupError(err, paths = PATHS) {
  const message = err && err.message ? err.message : String(err);

  if (/already running/i.test(message) && /userDataDir/i.test(message)) {
    return [
      message,
      "",
      "O perfil local do WhatsApp Web já está em uso por outro navegador.",
      "Para continuar, escolha uma destas opções:",
      `- feche a janela que está usando ${path.join(paths.auth, "session")} e rode novamente;`,
      "- use WA_CLIENT_ID=outro_nome para criar uma sessão separada, possivelmente com novo QR Code;",
      "- para reutilizar uma janela já aberta, inicie Chrome/Edge com depuração remota e configure BROWSER_URL ou BROWSER_WS_ENDPOINT.",
      "",
      "Uma janela comum do navegador, aberta sem depuração remota, não pode ser anexada pelo Puppeteer.",
    ].join("\n");
  }

  if (
    /ECONNREFUSED|ECONNRESET|Failed to fetch browser webSocket URL|browserURL/i.test(
      message,
    )
  ) {
    return [
      message,
      "",
      "Não foi possível conectar ao navegador existente.",
      "Confirme que ele foi iniciado com depuração remota, por exemplo na porta 9222, e que BROWSER_URL aponta para esse endereço.",
    ].join("\n");
  }

  if (/Could not find Chrome/i.test(message)) {
    return [
      message,
      "",
      "Chrome/Chromium/Edge não foi encontrado pelo Puppeteer.",
      "Instale um navegador compatível, rode `npx puppeteer browsers install chrome`, ou configure PUPPETEER_EXECUTABLE_PATH no .env.",
    ].join("\n");
  }

  return message;
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
      const existingBrowserConfig = getExistingBrowserConnectionConfig();
      const executablePath = existingBrowserConfig
        ? null
        : resolveBrowserExecutablePath();

      if (!existingBrowserConfig && !executablePath) {
        issues.push("Chrome/Chromium/Edge não encontrado.");
      }

      getWhatsAppClientId();
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
      clientId: getWhatsAppClientId(),
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
    console.error(formatBrowserStartupError(err, PATHS));
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
  formatBrowserStartupError,
  findPuppeteerCacheBrowsers,
  getExistingBrowserConnectionConfig,
  getBrowserExecutableNames,
  getInstalledBrowserCandidates,
  getLinuxBrowserCandidates,
  getMacBrowserCandidates,
  getPathBrowserCandidates,
  getSendDecision,
  getTemplateFingerprint,
  getWhatsAppClientId,
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
