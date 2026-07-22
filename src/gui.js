// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { PATHS, ROOT_DIR, readIntegerEnv } = require("./config");
const { renderGuiIcon, renderGuiIconSprite } = require("./gui-icons");
const {
  AUTHOR,
  AUTHOR_URL,
  LICENSE_LOCAL_PATH,
  LICENSE_NAME,
  LICENSE_URL,
  renderLegalFooterHtml,
  renderComplianceSummaryHtml,
} = require("./notice");
const { loadCsv, normalizeTextContent } = require("./data");
const { initLogFiles, resetSentLog } = require("./logs");
const { processCampaign, validateRuntimeFiles } = require("./campaign");
const { buildSendPlan, isOggSource, isUrl, validateTemplateMediaReferences } = require("./media");
const {
  MAX_EMBEDDED_ATTACHMENT_BYTES,
  getEmbeddedAttachmentAccept,
  getEmbeddedAttachmentCapabilities,
} = require("./media-capabilities");
const { parseListFilter } = require("./data");
const {
  inspectTemplateSyntax,
  isEmbeddedMediaReference,
  parseEmbeddedTemplate,
  parseTemplateParts,
  splitMessagePostings,
  splitTemplateVariants,
} = require("./template");
const {
  createSession,
  listPersistedSessions,
  listSessions,
  renameSession,
  removeSession,
  resolveSessionByIdentifier,
  updateSessionPhone,
} = require("./sessions");
const { destroyWhatsAppClient, readClientPhone } = require("./whatsapp");
const { getEnvSettingsSnapshot, saveEnvSettings } = require("./env-settings");
const {
  cancelUpdateCheck,
  checkUpdates,
  createUpdateCheckState,
} = require("./update-check");

const GUI_HOST = "127.0.0.1";
const GUI_PORT = readIntegerEnv("GUI_PORT", 3137);
const GUI_PORT_ATTEMPTS = 20;
const GUI_RUNTIME_DIR = path.join(ROOT_DIR, ".runtime", "gui");
const MAX_JSON_BODY_BYTES = 15 * 1024 * 1024;
const DOCS_USAGE_GITHUB_URL = "https://github.com/JeanCarloEM/WhatSend/blob/main/docs/usage.md";
const HELP_VIDEO_URLS = Object.freeze({
  clients: "https://tools.jcem.pro/to/csv-rapido",
  expression: "https://tools.jcem.pro/to/operadores",
  template: "https://tools.jcem.pro/to/markdown-w",
});
const GUI_HINTS = Object.freeze({
  attachment: "Inserir anexo Markdown no ponto atual.",
  bold: "Aplicar ou remover negrito do WhatsApp na seleção.",
  code: "Aplicar ou remover monoespaçado na seleção.",
  dayPeriod: "Inserir $diatarde$, substituído por bom dia ou boa tarde no envio.",
  emoji: "Abrir menu de emojis profissionais.",
  italic: "Aplicar ou remover itálico do WhatsApp na seleção.",
  newModel: "Criar novo modelo separado por ^^^.",
  newPosting: "Inserir $postagem$ para enviar uma nova postagem sequencial.",
  open: "Abrir arquivo Markdown no editor.",
  removeModel: "Excluir este modelo.",
  saveLocal: "Salvar o modelo completo neste navegador.",
  templateModels: "Selecionar modelo preexistente do repositório.",
  save: "Salvar todas as abas em um arquivo .md separado por ^^^.",
  settings: "Abrir configurações desta execução.",
  shutdown: "Desligar o processo local e fechar o navegador controlado.",
  update: "Atualizar motor, dependências, software ou reverter a última atualização.",
  strikethrough: "Aplicar ou remover tachado do WhatsApp na seleção.",
  variant: "Inserir separador ^^^ entre modelos.",
  docs: "Abrir documentação Markdown no GitHub.",
  videoClients: "Abrir ajuda em vídeo sobre base de clientes.",
  videoExpression: "Abrir ajuda em vídeo sobre expressões.",
  videoTemplate: "Abrir ajuda em vídeo sobre modelos Markdown.",
});
const TEMPLATE_MARKER_ACTIONS = Object.freeze([
  {
    hint: GUI_HINTS.dayPeriod,
    icon: "sun",
    id: "insertDayPeriodButton",
    insert: "$diatarde$",
    label: "Inserir saudação por horário",
  },
  {
    hint: GUI_HINTS.variant,
    icon: "layerGroup",
    id: "insertVariantButton",
    insert: "\n\n^^^\n\n",
    label: "Inserir separador de modelos",
  },
]);

function registerGuiClientHandlers(client, basePaths = PATHS, baseOptions = {}) {
  const serverInfo = baseOptions.guiServerInfo;
  const state = serverInfo ? serverInfo.state : createGuiState(basePaths);

  client.on("qr", (qr) => {
    state.status = "autenticando";
    pushGuiLog(state, {
      message: "QR Code recebido. Escaneie no WhatsApp Web para continuar.",
      type: "warning",
    });
    console.log("Escaneie o QR Code no navegador do WhatsApp Web.");
    try {
      require("qrcode-terminal").generate(qr, { small: true });
    } catch (_) {
      console.log("QR Code recebido. Use a janela do navegador para autenticar.");
    }
  });

  client.on("loading_screen", (percent) => {
    state.status = "carregando_whatsapp";
    pushGuiLog(state, {
      message: `WhatsApp Web carregando${percent ? `: ${percent}%` : "."}`,
      type: "info",
    });
  });

  client.on("authenticated", () => {
    state.status = "autenticado";
    pushGuiLog(state, {
      message: "Sessão autenticada. Aguardando WhatsApp ficar pronto.",
      type: "info",
    });
  });

  client.on("ready", () => {
    state.status = "conectado";
    state.whatsappReady = true;
    updateSessionPhone(basePaths.activeSession, readClientPhone(client), basePaths);
    state.sessions = listSessions(basePaths);
    state.activeSession =
      state.sessions.find((session) => {
        return (
          basePaths.activeSession && session.id === basePaths.activeSession.id
        );
      }) || state.activeSession;
    pushGuiLog(state, {
      message: "WhatsApp conectado. A execução já pode ser configurada.",
      type: "sent",
    });
    console.log("WhatsApp conectado.");
  });

  client.on("auth_failure", (msg) => {
    state.status = "falha_autenticacao";
    state.lastError = String(msg || "Falha de autenticação.");
    pushGuiLog(state, {
      message: `Falha de autenticação: ${state.lastError}`,
      type: "error",
    });
    console.error("Falha de autenticação:", msg);
    process.exitCode = 1;
  });

  client.on("disconnected", (reason) => {
    state.status = "desconectado";
    state.whatsappReady = false;
    pushGuiLog(state, {
      message: `WhatsApp desconectado: ${reason}`,
      type: "error",
    });
    console.error("Desconectado:", reason);
  });
}

function startGuiServer(client, basePaths = PATHS, baseOptions = {}) {
  const state = createGuiState(basePaths);
  return listenGuiServer(client, basePaths, baseOptions, state, GUI_PORT, 0);
}

function createGuiHttpServer(client, basePaths, baseOptions, state) {
  let server;

  server = http.createServer((req, res) => {
    routeGuiRequest(req, res, {
      baseOptions,
      basePaths,
      client,
      server,
      state,
    }).catch((err) => {
      sendJson(res, 500, {
        error: err.message || String(err),
        ok: false,
      });
    });
  });

  return server;
}

function listenGuiServer(client, basePaths, baseOptions, state, port, attempt) {
  const server = createGuiHttpServer(client, basePaths, baseOptions, state);

  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE" && attempt < GUI_PORT_ATTEMPTS - 1) {
        server.close(() => {
          listenGuiServer(
            client,
            basePaths,
            baseOptions,
            state,
            port + 1,
            attempt + 1,
          ).then(resolve, reject);
        });
        return;
      }

      reject(err);
    });

    server.listen(port, GUI_HOST, () => {
      if (attempt > 0) {
        const message = `Porta ${GUI_PORT} ocupada. Interface local aberta na porta ${server.address().port}.`;
        console.log(message);
        pushGuiLog(state, {
          message,
          type: "warning",
        });
      }

      resolve({
        server,
        state,
        url: `http://${GUI_HOST}:${server.address().port}/`,
      });
    });
  });
}

function createGuiState(paths = PATHS) {
  return {
    activeSession: paths.activeSession || null,
    busy: false,
    finishedAt: null,
    lastError: "",
    log: [],
    progress: createEmptyGuiProgress(),
    update: { active: false, action: "", result: "" },
    updateCheck: createUpdateCheckState(),
    templates: createTemplatesState(),
    startedAt: null,
    status: "iniciando_whatsapp",
    sessions: listSessions(paths),
    whatsappReady: false,
  };
}

function createEmptyGuiProgress() {
  return {
    active: false,
    current: 0,
    percent: 0,
    total: 0,
  };
}

function createTemplatesState() {
  return {
    items: [],
    lastError: "",
    loadedAt: "",
    selected: null,
  };
}

function serializeUpdateCheckState(updateCheck) {
  return {
    checkedAt: updateCheck.checkedAt || "",
    components: updateCheck.components || {},
    inFlight: Boolean(updateCheck.inFlight),
    status: updateCheck.status || "desconhecido",
    updateAvailable: Object.values(updateCheck.components || {}).some((component) => component.updateAvailable),
  };
}

function serializeGuiState(state) {
  return {
    ...state,
    updateCheck: serializeUpdateCheckState(state.updateCheck || createUpdateCheckState()),
  };
}

function discoverGuiTemplates(basePaths = PATHS) {
  const modelsDir = basePaths.modelsDir || PATHS.modelsDir;
  const errors = [];
  const templates = [];

  try {
    const resolvedModelsDir = path.resolve(modelsDir);
    const root = path.resolve(basePaths.root || ROOT_DIR);

    if (!resolvedModelsDir.startsWith(root + path.sep) && resolvedModelsDir !== root) {
      throw new Error("Diretório de modelos fora da raiz permitida.");
    }

    if (!fs.existsSync(resolvedModelsDir)) {
      return { errors, ok: true, templates };
    }

    for (const filePath of listMarkdownFiles(resolvedModelsDir)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        if (!content.trim()) continue;
        templates.push({
          baseDir: path.dirname(filePath),
          content,
          context: path.relative(resolvedModelsDir, path.dirname(filePath)).replace(/\\/gu, "/") || ".",
          name: path.basename(filePath, path.extname(filePath)),
          path: path.relative(root, filePath).replace(/\\/gu, "/"),
        });
      } catch (err) {
        errors.push(`${path.basename(filePath)}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(err.message || String(err));
  }

  templates.sort((left, right) => left.path.localeCompare(right.path, "pt-BR"));
  return { errors, ok: errors.length === 0, templates };
}

function listMarkdownFiles(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(entryPath));
    } else if (entry.isFile() && path.extname(entry.name).toLocaleLowerCase("pt-BR") === ".md") {
      files.push(entryPath);
    }
  }
  return files;
}

async function routeGuiRequest(req, res, context) {
  const url = new URL(req.url, `http://${GUI_HOST}`);

  if (req.method === "GET" && url.pathname === "/") {
    sendHtml(res, renderGuiHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/license") {
    sendText(res, readOptionalFile(path.join(ROOT_DIR, "LICENSE")) || "LICENSE não encontrada.");
    return;
  }

  if (req.method === "GET" && url.pathname === "/docs/usage.md") {
    sendText(res, readOptionalFile(path.join(ROOT_DIR, "docs", "usage.md")) || "Documentação não encontrada.");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/identity") {
    sendJson(res, 200, {
      ok: true,
      runtime: context.baseOptions.guiRuntime
        ? context.baseOptions.guiRuntime.publicRecord
        : context.state.runtime || null,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    context.state.sessions = listSessions(context.basePaths);
    sendJson(res, 200, {
      ok: true,
      state: serializeGuiState(context.state),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/update") {
    const payload = await readJsonBody(req);
    const action = String(payload.action || "").trim();
    if (!payload.confirmed || !["whatsapp-web.js", "dependencies", "software", "revert"].includes(action)) {
      sendJson(res, 400, { error: "Ação de atualização inválida ou sem confirmação.", ok: false });
      return;
    }
    if (context.state.update && context.state.update.active) {
      sendJson(res, 409, { error: "Já existe uma atualização em andamento.", ok: false });
      return;
    }
    startGuiUpdate(context.state, action);
    sendJson(res, 202, { message: "Atualização iniciada. Acompanhe o progresso abaixo.", ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/updates/check") {
    const force = url.searchParams.get("force") === "1";
    checkUpdates(context.state.updateCheck, { force, rootDir: ROOT_DIR })
      .then((result) => {
        pushGuiLog(context.state, {
          message: result.updateAvailable
            ? "Atualização disponível detectada."
            : "Verificação de atualização concluída.",
          type: result.updateAvailable ? "warning" : "info",
        });
      })
      .catch((err) => {
        pushGuiLog(context.state, {
          message: `Verificação de atualização inconclusiva: ${err.message || err}`,
          type: "warning",
        });
      });
    sendJson(res, 202, {
      ok: true,
      state: serializeUpdateCheckState(context.state.updateCheck),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/updates/cancel") {
    sendJson(res, 200, {
      cancelled: cancelUpdateCheck(context.state.updateCheck),
      ok: true,
      state: serializeUpdateCheckState(context.state.updateCheck),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/templates") {
    const result = discoverGuiTemplates(context.basePaths);
    context.state.templates = {
      ...context.state.templates,
      items: result.templates,
      lastError: result.errors.join("; "),
      loadedAt: new Date().toISOString(),
    };
    sendJson(res, result.ok ? 200 : 207, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    const sessionId =
      (context.state.activeSession && context.state.activeSession.id) ||
      (context.basePaths.activeSession && context.basePaths.activeSession.id) ||
      "default";
    sendJson(res, 200, {
      ok: true,
      settings: getEnvSettingsSnapshot(ROOT_DIR, sessionId),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    const payload = await readJsonBody(req);
    const sessionId =
      String(payload.sessionId || "").trim() ||
      (context.state.activeSession && context.state.activeSession.id) ||
      "default";

    try {
      const result = saveEnvSettings(
        ROOT_DIR,
        String(payload.scope || "").trim(),
        sessionId,
        payload.values || {},
      );
      sendJson(res, 200, {
        message: "Configurações salvas.",
        ok: true,
        result,
      });
    } catch (err) {
      sendJson(res, 400, {
        error: err.message,
        ok: false,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/stop") {
    sendJson(res, 202, {
      message: "Desligando WhatSend.",
      ok: true,
    });
    setTimeout(() => {
      shutdownCurrentGuiProcess(context, "user_request").catch((err) => {
        context.state.lastError = err.message || String(err);
        context.state.status = "erro";
      });
    }, 50);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/shutdown") {
    const payload = await readJsonBody(req);
    const runtime = context.baseOptions.guiRuntime;

    if (!runtime || payload.token !== runtime.record.token) {
      sendJson(res, 403, {
        error: "Encerramento local não autorizado.",
        ok: false,
      });
      return;
    }

    sendJson(res, 202, {
      message: "Encerrando instância local.",
      ok: true,
    });
    setTimeout(() => {
      shutdownCurrentGuiProcess(context, payload.reason).catch((err) => {
        context.state.lastError = err.message || String(err);
        context.state.status = "erro";
      });
    }, 50);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions/switch") {
    const payload = await readJsonBody(req);
    const sessionId = String(payload.sessionId || "").trim();

    if (!sessionId) {
      sendJson(res, 400, {
        error: "Selecione uma sessão.",
        ok: false,
      });
      return;
    }

    if (context.state.busy) {
      sendJson(res, 409, {
        error: "Não é possível alternar sessão durante um processamento.",
        ok: false,
      });
      return;
    }

    sendJson(res, 202, {
      message: "Alternando sessão. A janela será reaberta.",
      ok: true,
    });
    scheduleGuiRestart(context, sessionId);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions/create") {
    const payload = await readJsonBody(req);
    const name = String(payload.name || "").trim();

    if (!name) {
      sendJson(res, 400, {
        error: "Informe um nome para a nova sessão.",
        ok: false,
      });
      return;
    }

    if (context.state.busy) {
      sendJson(res, 409, {
        error: "Não é possível criar sessão durante um processamento.",
        ok: false,
      });
      return;
    }

    const session = createSession(name, context.basePaths);
    context.state.sessions = listSessions(context.basePaths);
    sendJson(res, 201, {
      message: "Sessão criada. Alternando para autenticação.",
      ok: true,
      session,
    });
    scheduleGuiRestart(context, session.id);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions/rename") {
    const payload = await readJsonBody(req);
    const sessionId = String(payload.sessionId || "").trim();
    const name = String(payload.name || "").trim();

    if (!sessionId || !name) {
      sendJson(res, 400, {
        error: "Informe a sessão e o novo nome.",
        ok: false,
      });
      return;
    }

    const session = renameSession(sessionId, name, context.basePaths);
    context.state.sessions = listSessions(context.basePaths);

    if (context.state.activeSession && context.state.activeSession.id === session.id) {
      context.state.activeSession = session;
    }

    sendJson(res, 200, {
      message: "Sessão renomeada.",
      ok: true,
      session,
      sessions: context.state.sessions,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions/remove") {
    const payload = await readJsonBody(req);
    const sessionId = String(payload.sessionId || "").trim();

    if (!sessionId) {
      sendJson(res, 400, {
        error: "Informe a sessão que será removida.",
        ok: false,
      });
      return;
    }

    if (context.state.busy) {
      sendJson(res, 409, {
        error: "Não é possível remover sessão durante um processamento.",
        ok: false,
      });
      return;
    }

    const targetSession = resolveSessionByIdentifier(
      sessionId,
      listSessions(context.basePaths),
    );
    const activeRemoved =
      context.state.activeSession &&
      context.state.activeSession.id === targetSession.id;

    if (!activeRemoved) {
      const result = removeSession(targetSession.id, context.basePaths);
      context.state.sessions = listSessions(context.basePaths);
      sendJson(res, 200, {
        activeRemoved: false,
        message: "Sessão removida.",
        ok: true,
        remainingPersisted: result.remainingPersisted,
        removed: result.removed,
        sessions: context.state.sessions,
      });
      return;
    }

    const remainingPersisted = listPersistedSessions(context.basePaths).filter(
      (session) => session.id !== targetSession.id,
    );

    sendJson(res, 200, {
      activeRemoved: true,
      message: "Sessão ativa será removida após fechar o WhatsApp com segurança.",
      ok: true,
      remainingPersisted,
      removed: targetSession,
      sessions: listSessions(context.basePaths),
    });

    scheduleActiveSessionRemoval(context, targetSession.id, remainingPersisted[0]);

    return;
  }

  if (req.method === "POST" && url.pathname === "/api/validate") {
    const payload = await readJsonBody(req);
    const result = validateGuiPayload(payload, context.basePaths);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/template/analyze") {
    const payload = await readJsonBody(req);
    const result = analyzeGuiTemplateMedia(payload, context.basePaths);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/template/preview") {
    const payload = await readJsonBody(req);
    const result = buildGuiTemplatePreview(payload, context.basePaths);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    const payload = await readJsonBody(req);
    const validation = validateGuiPayload(payload, context.basePaths);

    if (!validation.ok) {
      sendJson(res, 400, validation);
      return;
    }

    if (
      validation.syntaxIssues &&
      validation.syntaxIssues.length > 0 &&
      !payload.confirmTemplateSyntaxIssues
    ) {
      sendJson(res, 409, {
        error: "Confirme os possíveis erros de sintaxe do modelo antes de enviar.",
        ok: false,
        syntaxIssues: validation.syntaxIssues,
      });
      return;
    }

    if (context.state.busy) {
      sendJson(res, 409, {
        error: "Já existe um processamento em andamento.",
        ok: false,
      });
      return;
    }

    if (!context.state.whatsappReady) {
      sendJson(res, 409, {
        error: "Aguarde o WhatsApp conectar antes de executar.",
        ok: false,
      });
      return;
    }

    runGuiCampaign(payload, context).catch((err) => {
      context.state.busy = false;
      context.state.finishedAt = new Date().toISOString();
      context.state.lastError = err.message || String(err);
      context.state.progress = {
        ...(context.state.progress || createEmptyGuiProgress()),
        active: false,
      };
      context.state.status = "erro";
      pushGuiLog(context.state, {
        message: `Processamento interrompido: ${context.state.lastError}`,
        type: "error",
      });
    });

    sendJson(res, 202, {
      message: "Processamento iniciado.",
      ok: true,
    });
    return;
  }

  sendJson(res, 404, {
    error: "Rota não encontrada.",
    ok: false,
  });
}

async function runGuiCampaign(payload, context) {
  const { state } = context;
  state.busy = true;
  state.finishedAt = null;
  state.lastError = "";
  state.log = [];
  state.progress = {
    active: true,
    current: 0,
    percent: 0,
    total: 0,
  };
  state.startedAt = new Date().toISOString();
  state.status = "validando";

  const executionPaths = materializeGuiExecutionPaths(payload, context.basePaths);
  const options = {
    ...context.baseOptions,
    forceResend: Boolean(payload.forceResend),
    onProgress: (event) => pushGuiLog(state, event),
    resetSent: Boolean(payload.resetSent),
  };

  pushGuiLog(state, {
    message: "Validando arquivos e parâmetros.",
    type: "info",
  });

  const validation = validateRuntimeFiles(executionPaths, {
    checkBrowser: false,
  });

  pushGuiLog(state, {
    message: `Pré-validação RCF concluída. Clientes: ${validation.clientesCount}.`,
    type: "info",
  });
  state.progress = {
    active: true,
    current: 0,
    percent: 0,
    total: validation.clientesCount,
  };

  if (options.resetSent) {
    resetSentLog(executionPaths.sent);
    pushGuiLog(state, {
      message: "Lista de enviados resetada.",
      type: "warning",
    });
  }

  if (options.forceResend) {
    pushGuiLog(state, {
      message: "Reenvio forçado ativo: histórico será ignorado nesta execução.",
      type: "warning",
    });
  }

  state.status = "executando";
  await processCampaign(context.client, executionPaths, options);
  state.busy = false;
  state.finishedAt = new Date().toISOString();
  state.progress = {
    active: false,
    current: state.progress && state.progress.total ? state.progress.total : 0,
    percent: 100,
    total: state.progress ? state.progress.total : 0,
  };
  state.status = "concluido";
  state.whatsappReady = true;
}

function materializeGuiExecutionPaths(payload, basePaths = PATHS) {
  fs.mkdirSync(GUI_RUNTIME_DIR, { recursive: true });

  const paths = {
    ...basePaths,
    mediaCacheDir: path.join(os.tmpdir(), "whatsapp-rcf-media"),
  };

  const templateText = String(payload.templateText || "");
  const templateFileContent = payload.templateFile
    ? String(payload.templateFile.content || "")
    : "";

  if (templateText.trim() || templateFileContent.trim()) {
    const explicitTemplateBaseDir = resolveGuiTemplateBaseDir(payload.templateBaseDir);
    const templatePath = path.join(GUI_RUNTIME_DIR, "template.md");
    fs.writeFileSync(
      templatePath,
      normalizeTextContent(templateText.trim() ? templateText : templateFileContent),
      "utf8",
    );
    paths.template = templatePath;

    if (explicitTemplateBaseDir) {
      paths.templateBaseDir = explicitTemplateBaseDir;
    } else if (templateText.trim()) {
      paths.templateBaseDir = ROOT_DIR;
    } else {
      const providedTemplatePath = resolveGuiProvidedFilePath(payload.templateFile);
      if (providedTemplatePath) {
        paths.templateBaseDir = path.dirname(providedTemplatePath);
      } else {
        delete paths.templateBaseDir;
      }
    }
  }

  if (payload.csvFile && String(payload.csvFile.content || "").trim()) {
    const csvPath = path.join(GUI_RUNTIME_DIR, "clientes.csv");
    fs.writeFileSync(csvPath, normalizeTextContent(payload.csvFile.content || ""), "utf8");
    paths.csv = csvPath;
  }

  const filter = String(payload.filter || "").trim();

  if (filter) {
    paths.listFilter = parseListFilter(filter);
  }

  return paths;
}

function validateGuiPayload(payload = {}, basePaths = PATHS) {
  const errors = [];
  const templateText = String(payload.templateText || "");
  const templateFile = payload.templateFile || null;
  const csvFile = payload.csvFile || null;
  const filter = String(payload.filter || "").trim();
  validateGuiTemplateBaseDir(payload.templateBaseDir, errors);

  if (templateText.trim() && templateFile && String(templateFile.content || "").trim()) {
    errors.push("Use apenas uma fonte de modelo: texto da GUI ou arquivo .md.");
  }

  if (templateFile) {
    validateNamedTextFile(templateFile, ".md", "Arquivo de modelo", errors);
  }

  if (csvFile) {
    validateNamedTextFile(csvFile, ".csv", "Arquivo de clientes", errors);
  }

  const templateCandidate =
    templateText.trim() ||
    (templateFile && String(templateFile.content || "").trim()) ||
    readOptionalFile(basePaths.template);

  const syntaxIssues = inspectTemplateSyntax(templateCandidate);

  if (filter) {
    try {
      const parsed = parseListFilter(filter);

      if (!parsed) {
        errors.push("Filtro inválido: informe uma expressão comparável, como status=ativo.");
      }
    } catch (err) {
      errors.push(`Filtro inválido: ${err.message}`);
    }
  }

  if (csvFile && String(csvFile.content || "").trim()) {
    const tmpPath = path.join(GUI_RUNTIME_DIR, "prevalidate-clientes.csv");
    try {
      fs.mkdirSync(GUI_RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(tmpPath, normalizeTextContent(csvFile.content || ""), "utf8");
      loadCsv(tmpPath);
    } catch (err) {
      errors.push(err.message);
    }
  }

  return errors.length
    ? { errors, ok: false, syntaxIssues }
    : {
        message: syntaxIssues.length
          ? "Validação preliminar aprovada com avisos de sintaxe no modelo."
          : "Validação preliminar aprovada.",
        ok: true,
        syntaxIssues,
      };
}

function analyzeGuiTemplateMedia(payload = {}, basePaths = PATHS) {
  const errors = [];
  const templateText = String(payload.templateText || "");
  const templateFile = payload.templateFile || null;
  const templateFileContent = templateFile ? String(templateFile.content || "") : "";
  const templateCandidate =
    templateText.trim() ||
    templateFileContent.trim() ||
    "";
  const explicitTemplateBaseDir = validateGuiTemplateBaseDir(
    payload.templateBaseDir,
    errors,
  );

  if (!templateCandidate.trim()) {
    return {
      errors,
      mediaIssues: [],
      ok: errors.length === 0,
    };
  }

  const providedTemplatePath = resolveGuiProvidedFilePath(templateFile);
  const templatePath = providedTemplatePath || path.join(GUI_RUNTIME_DIR, "template.md");
  const templateBaseDir =
    explicitTemplateBaseDir ||
    (templateText.trim()
      ? ROOT_DIR
      : providedTemplatePath
        ? path.dirname(providedTemplatePath)
        : undefined);
  const mediaIssues = validateTemplateMediaReferences(
    normalizeTextContent(templateCandidate),
    {
      ...basePaths,
      root: basePaths.root || ROOT_DIR,
      template: templatePath,
      ...(templateBaseDir ? { templateBaseDir } : {}),
    },
  );
  const localMediaCount = parseTemplateParts(templateCandidate)
    .filter((part) => part.type === "media" && !isUrl(part.source) && !isEmbeddedMediaReference(part.source))
    .length;

  return {
    errors,
    localMediaCount,
    mediaIssues,
    ok: errors.length === 0,
    needsTemplateBaseDir: mediaIssues.length > 0 && !explicitTemplateBaseDir,
  };
}

function buildGuiTemplatePreview(payload = {}, basePaths = PATHS) {
  const errors = [];
  const templateText = String(payload.templateText || "");
  const templateFile = payload.templateFile || null;
  const templateFileContent = templateFile ? String(templateFile.content || "") : "";
  const editorBlocks = Array.isArray(payload.editorBlocks)
    ? payload.editorBlocks
        .map((block) => normalizeTextContent(String(block || "")))
        .filter((block) => block.trim())
    : [];
  const templateCandidate =
    templateText.trim() ||
    templateFileContent.trim() ||
    readOptionalFile(basePaths.template) ||
    "";
  const normalized = normalizeTextContent(templateCandidate);

  if (!normalized.trim() && editorBlocks.length === 0) {
    return {
      errors,
      ok: true,
      variants: [],
    };
  }

  try {
    const document = parseEmbeddedTemplate(normalized);
    const variantSources = editorBlocks.length ? editorBlocks : splitTemplateVariants(document.content);
    const variants = variantSources.map((variant, variantIndex) => {
      const postings = splitMessagePostings(variant).map((posting, postingIndex) => {
        const plan = buildSendPlan(parseTemplateParts(posting), document.attachments).map((part) =>
          describePreviewPart(part, document.attachments),
        );

        return {
          index: postingIndex,
          items: plan,
        };
      });

      return {
        index: variantIndex,
        postings,
      };
    });

    return {
      errors,
      ok: true,
      variants,
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      errors,
      ok: false,
      variants: [],
    };
  }
}

function describePreviewPart(part, embeddedAttachments = new Map()) {
  if (part.type === "text") {
    return {
      type: "text",
      value: part.value,
    };
  }

  const source = String(part.source || "");
  const embedded = isEmbeddedMediaReference(source)
    ? embeddedAttachments.get(source.slice("@embed:".length))
    : null;
  const filename = embedded ? embedded.name : path.basename(source) || source;
  const extension = path.extname(filename.split("?")[0]).toLocaleLowerCase("pt-BR");
  const mediaType = isOggSource(source, embeddedAttachments)
    ? "audio"
    : [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(extension)
      ? "image"
      : "document";

  return {
    caption: part.caption || "",
    filename,
    source,
    type: mediaType,
  };
}

function validateNamedTextFile(file, extension, label, errors) {
  const name = String(file.name || "").trim();
  const content = String(file.content || "");

  if (!name) {
    errors.push(`${label}: nome ausente.`);
    return;
  }

  if (path.extname(name).toLocaleLowerCase("pt-BR") !== extension) {
    errors.push(`${label}: use um arquivo ${extension}.`);
  }

  if (!content.trim()) {
    errors.push(`${label}: arquivo vazio.`);
  }
}

function resolveGuiProvidedFilePath(file) {
  if (!file) {
    return "";
  }

  for (const key of ["path", "fullPath", "name"]) {
    const rawPath = String(file[key] || "").trim();

    if (!rawPath || /^([a-z]:)?[\\/]+fakepath[\\/]/iu.test(rawPath)) {
      continue;
    }

    if (path.isAbsolute(rawPath)) {
      return path.normalize(rawPath);
    }

    if (rawPath.includes("/") || rawPath.includes("\\")) {
      return path.resolve(ROOT_DIR, rawPath);
    }
  }

  return "";
}

function resolveGuiTemplateBaseDir(value) {
  const rawValue = String(value || "")
    .trim()
    .replace(/^["'](.+)["']$/, "$1")
    .trim();

  if (!rawValue) {
    return "";
  }

  return path.isAbsolute(rawValue)
    ? path.normalize(rawValue)
    : path.resolve(ROOT_DIR, rawValue);
}

function validateGuiTemplateBaseDir(value, errors = []) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.includes("\0")) {
    errors.push("Pasta de referência dos anexos inválida.");
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(rawValue)) {
    errors.push("Pasta de referência dos anexos deve ser um diretório local, não URL.");
    return "";
  }

  const resolvedPath = resolveGuiTemplateBaseDir(rawValue);

  if (!fs.existsSync(resolvedPath)) {
    errors.push(`Pasta de referência dos anexos não encontrada: ${resolvedPath}`);
    return "";
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    errors.push(`Pasta de referência dos anexos não é um diretório: ${resolvedPath}`);
    return "";
  }

  return resolvedPath;
}

function readOptionalFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch (_) {
    return "";
  }
}

function pushGuiLog(state, event) {
  const entry = {
    at: new Date().toISOString(),
    message: event.message || "",
    type: event.type || "info",
    ...(event.current ? { current: event.current } : {}),
    ...(event.total ? { total: event.total } : {}),
  };

  state.log.push(entry);
  updateGuiProgressFromEvent(state, event);

  if (state.log.length > 300) {
    state.log.splice(0, state.log.length - 300);
  }
}

function updateGuiProgressFromEvent(state, event = {}) {
  const progressTypes = new Set(["done", "error", "sent", "skip"]);
  const total = Number.parseInt(event.total, 10);
  const current = Number.parseInt(event.current, 10);

  if (!state.progress) {
    state.progress = createEmptyGuiProgress();
  }

  if (Number.isFinite(total) && total > 0) {
    state.progress.total = total;
  }

  if (event.type === "done") {
    const finalTotal = state.progress.total || total || 0;
    state.progress = {
      active: false,
      current: finalTotal,
      percent: finalTotal > 0 ? 100 : 0,
      total: finalTotal,
    };
    return;
  }

  if (!progressTypes.has(event.type) || !Number.isFinite(current)) {
    return;
  }

  const safeTotal = Math.max(state.progress.total || total || current, 1);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  state.progress = {
    active: true,
    current: safeCurrent,
    percent: Math.round((safeCurrent / safeTotal) * 1000) / 10,
    total: safeTotal,
  };
}

function scheduleGuiRestart(context, sessionId) {
  context.state.status = "reiniciando_sessao";
  context.state.whatsappReady = false;
  pushGuiLog(context.state, {
    message: "Reiniciando para alternar a sessão do WhatsApp.",
    type: "warning",
  });

  setTimeout(() => {
    restartGuiProcess(context, sessionId).catch((err) => {
      context.state.status = "erro";
      context.state.lastError = err.message;
      pushGuiLog(context.state, {
        message: `Falha ao alternar sessão: ${err.message}`,
        type: "error",
      });
    });
  }, 250);
}

function scheduleActiveSessionRemoval(context, sessionId, nextSession) {
  context.state.status = "reiniciando_sessao";
  context.state.whatsappReady = false;
  pushGuiLog(context.state, {
    message: "Fechando WhatsApp antes de remover a sessão ativa.",
    type: "warning",
  });

  setTimeout(() => {
    restartGuiProcess(context, nextSession ? nextSession.id : "", {
      beforeSpawn: async () => {
        removeSession(sessionId, context.basePaths);
      },
      destroyFailureMessage:
        "A sessão ativa não foi removida porque o navegador não fechou com segurança.",
    }).catch((err) => {
      context.state.status = "erro";
      context.state.lastError = err.message;
      pushGuiLog(context.state, {
        message: `Falha ao remover sessão ativa: ${err.message}`,
        type: "error",
      });
    });
  }, 250);
}

async function restartGuiProcess(context, sessionId, options = {}) {
  const args = [path.join(ROOT_DIR, "main.js"), "--gui"];

  if (sessionId) {
    args.push("--session", sessionId);
  }

  const destroyResult = await destroyWhatsAppClient(context.client);

  if (!destroyResult.destroyed && options.beforeSpawn) {
    throw new Error(
      options.destroyFailureMessage ||
        "O navegador não fechou com segurança; operação cancelada para preservar a sessão.",
    );
  }

  if (options.beforeSpawn) {
    await options.beforeSpawn();
  }

  await closeServer(context.server);

  const child = childProcess.spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    detached: true,
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();
  process.exit(0);
}

async function shutdownCurrentGuiProcess(context, reason) {
  context.state.status = "encerrando";
  context.state.whatsappReady = false;
  pushGuiLog(context.state, {
    message:
      reason === "scripts_changed"
        ? "Encerrando instância para carregar scripts atualizados."
        : "Encerrando instância local.",
    type: "warning",
  });

  await destroyWhatsAppClient(context.client);

  await closeServer(context.server);

  if (
    context.baseOptions.guiRuntime &&
    typeof context.baseOptions.guiRuntime.stop === "function"
  ) {
    context.baseOptions.guiRuntime.stop();
  }

  process.exit(0);
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_JSON_BODY_BYTES) {
        req.destroy(new Error("Payload grande demais."));
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error(`JSON inválido: ${err.message}`));
      }
    });

    req.on("error", reject);
  });
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function sendText(res, text) {
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(text);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function openGuiInBrowser(client, url) {
  if (client && client.pupBrowser && typeof client.pupBrowser.newPage === "function") {
    try {
      const page = await client.pupBrowser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return "controlled";
    } catch (_) {
      // Se a aba no browser controlado falhar, tenta o navegador padrão.
    }
  }

  openSystemBrowser(url);
  return "system";
}

function openGuiWhenBrowserIsAvailable(client, url, state, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs || 20000;
  const intervalMs = options.intervalMs || 250;

  pushGuiLog(state, {
    message: "Interface local iniciada. Abrindo junto ao navegador do WhatsApp quando possível.",
    type: "info",
  });

  const timer = setInterval(async () => {
    if (state.guiOpened) {
      clearInterval(timer);
      return;
    }

    if (client && client.pupBrowser) {
      state.guiOpened = true;
      clearInterval(timer);

      try {
        const target = await openGuiInBrowser(client, url);
        pushGuiLog(state, {
          message:
            target === "controlled"
              ? "Interface aberta no mesmo navegador controlado pelo WhatsApp."
              : "Interface aberta no navegador padrão.",
          type: target === "controlled" ? "info" : "warning",
        });
      } catch (err) {
        state.guiOpened = false;
        pushGuiLog(state, {
          message: `Não foi possível abrir no navegador controlado: ${err.message}`,
          type: "warning",
        });
      }

      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      state.guiOpened = true;
      clearInterval(timer);
      openSystemBrowser(url);
      pushGuiLog(state, {
        message: "Interface aberta no navegador padrão. O navegador do WhatsApp ainda não estava disponível.",
        type: "warning",
      });
    }
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}

function openSystemBrowser(url) {
  const platform = os.platform();
  const command =
    platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args =
    platform === "win32" ? ["/c", "start", "", url] : [url];

  const child = childProcess.spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();
}

function renderGuiHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Disparador WhatsApp</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2933;
      --muted: #667085;
      --line: #d8dde6;
      --accent: #087f5b;
      --accent-strong: #046c4e;
      --danger: #b42318;
      --warn: #a15c07;
      --info: #175cd3;
      --ok: #067647;
      --focus: rgba(8, 127, 91, 0.18);
      --font-sans: "Noto Sans", "Segoe UI", Roboto, Helvetica, Arial, system-ui, -apple-system, BlinkMacSystemFont, "Liberation Sans", sans-serif;
      --shadow: 0 14px 36px rgba(21, 30, 43, 0.07);
    }

    * { box-sizing: border-box; }

    .wa-icon-sprite {
      height: 0;
      overflow: hidden;
      position: absolute;
      width: 0;
    }

    .wa-icon {
      display: inline-block;
      fill: currentColor;
      flex: 0 0 auto;
      height: 1em;
      pointer-events: none;
      vertical-align: -0.125em;
      width: 1em;
    }

    [data-hint] {
      position: relative;
    }

    [data-hint]:hover::after,
    [data-hint]:focus-visible::after {
      background: #101828;
      border-radius: 6px;
      bottom: calc(100% + 8px);
      color: #fff;
      content: attr(data-hint);
      font-size: 12px;
      font-weight: 600;
      left: 50%;
      line-height: 1.35;
      max-width: min(280px, calc(100vw - 24px));
      padding: 7px 9px;
      pointer-events: none;
      position: absolute;
      text-align: center;
      transform: translateX(-50%);
      white-space: normal;
      width: max-content;
      z-index: 1200;
    }

    [data-hint]:hover::before,
    [data-hint]:focus-visible::before {
      border: 6px solid transparent;
      border-top-color: #101828;
      bottom: calc(100% - 3px);
      content: "";
      left: 50%;
      pointer-events: none;
      position: absolute;
      transform: translateX(-50%);
      z-index: 1201;
    }

    .header-actions [data-hint]:hover::after,
    .header-actions [data-hint]:focus-visible::after {
      bottom: auto;
      top: calc(100% + 8px);
    }

    .header-actions [data-hint]:hover::before,
    .header-actions [data-hint]:focus-visible::before {
      border-bottom-color: #101828;
      border-top-color: transparent;
      bottom: auto;
      top: calc(100% - 3px);
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 15px/1.52 var(--font-sans);
    }

    .top-progress {
      background: rgba(214, 224, 235, 0.78);
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
      height: 0.5rem;
      left: 0;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      position: fixed;
      right: 0;
      top: 0;
      transform: translateY(-100%);
      transition: opacity 0.22s ease, transform 0.22s ease;
      z-index: 50;
    }

    .top-progress.active {
      opacity: 1;
      transform: translateY(0);
    }

    .top-progress-bar {
      background: linear-gradient(90deg, #0e9384 0%, #175cd3 52%, #7a5af8 100%);
      border-radius: 0 999px 999px 0;
      box-shadow: 0 0 18px rgba(23, 92, 211, 0.34);
      height: 100%;
      min-width: 0;
      position: relative;
      transform-origin: left center;
      transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      width: 0%;
    }

    .top-progress.active .top-progress-bar::after {
      animation: progress-sheen 1.35s ease-in-out infinite;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      content: "";
      inset: 0;
      position: absolute;
      transform: translateX(-100%);
    }

    @keyframes progress-sheen {
      to { transform: translateX(100%); }
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 34px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 18px;
    }

    .header-actions {
      align-items: center;
      display: flex;
      gap: 10px;
    }

    h1 {
      margin: 0;
      font-size: 27px;
      line-height: 1.15;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 16px;
    }

    p {
      margin: 0;
      color: var(--muted);
    }

    .status-pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--accent-strong);
      background: #eefbf4;
      padding: 7px 12px;
      white-space: nowrap;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
      gap: 16px;
      align-items: start;
    }

    #runForm {
      display: contents;
    }

    .full-card {
      grid-column: 1 / -1;
    }

    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 17px;
      margin-bottom: 16px;
      min-width: 0;
    }

    label {
      display: block;
      font-weight: 700;
      margin-bottom: 8px;
    }

    textarea,
    input[type="text"],
    input[type="file"],
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--text);
      font: inherit;
      padding: 11px 12px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    textarea:focus,
    input[type="text"]:focus,
    input[type="file"]:focus,
    select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--focus);
      outline: none;
    }

    textarea {
      min-height: 205px;
      resize: vertical;
      font-family: var(--font-sans);
      font-size: 14px;
    }

    .wa-editor {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: visible;
      min-width: 0;
    }

    .wa-toolbar {
      align-items: center;
      background: #f8fafc;
      border-bottom: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 42px;
      overflow: visible;
      padding: 7px;
      position: relative;
      z-index: 11;
    }

    .wa-tabs {
      align-items: end;
      background: #f8fafc;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 4px;
      min-height: 35px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 5px 7px 0;
      scrollbar-width: thin;
    }

    .wa-toolbar button,
    .wa-tab {
      align-items: center;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 7px;
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      font-weight: 800;
      gap: 6px;
      justify-content: center;
      min-height: 30px;
      min-width: 32px;
      padding: 5px 9px;
      transition: background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
      white-space: nowrap;
    }

    .wa-toolbar button:hover,
    .wa-tab:hover {
      border-color: #98a2b3;
      box-shadow: 0 3px 8px rgba(16, 24, 40, 0.08);
      transform: translateY(-1px);
    }

    .wa-toolbar-group {
      position: relative;
    }

    .template-menu {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      display: none;
      left: 0;
      max-height: min(320px, 58vh);
      min-width: 260px;
      overflow: auto;
      padding: 7px;
      position: absolute;
      top: calc(100% + 6px);
      z-index: 1002;
    }

    .template-menu.open {
      display: grid;
      gap: 5px;
    }

    .template-menu button {
      justify-content: start;
      min-height: 34px;
      text-align: left;
      width: 100%;
    }

    .template-menu small {
      color: var(--muted);
      display: block;
      font-weight: 600;
    }

    .template-menu button:hover,
    .template-menu button:focus-visible {
      background: var(--brand-dark);
      border-color: var(--brand-dark);
      color: #fff;
    }

    .template-menu button:hover small,
    .template-menu button:focus-visible small {
      color: #fff;
    }

    .toolbar-separator {
      align-self: stretch;
      background: #d8dde6;
      display: inline-block;
      flex: 0 0 1px;
      margin: 4px 4px;
      min-height: 24px;
    }

    .emoji-menu {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      display: none;
      gap: 5px;
      grid-template-columns: repeat(6, 34px);
      left: 0;
      max-height: 250px;
      overflow-y: auto;
      padding: 8px;
      position: fixed;
      top: 0;
      width: max-content;
      z-index: 1000;
    }

    .emoji-menu.open {
      display: grid;
    }

    .emoji-menu button {
      font-size: 18px;
      min-height: 32px;
      min-width: 32px;
      padding: 3px;
    }

    .emoji-menu button:hover {
      background: #ecfdf3;
      border-color: #12b76a;
      transform: scale(1.04);
    }

    .wa-tab {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      font-size: 13px;
      gap: 5px;
      min-height: 30px;
      min-width: 0;
      padding: 4px 7px;
      position: relative;
      top: 1px;
    }

    .wa-tab.active {
      background: #fff;
      border-color: #12b76a;
      border-bottom-color: #fff;
      box-shadow: 0 -1px 0 #12b76a, 0 -3px 8px rgba(18, 183, 106, 0.12);
      color: #067647;
    }

    .wa-tab-create {
      border-radius: 7px 7px 0 0;
      color: #067647;
      font-size: 15px;
      min-width: 32px;
    }

    .wa-tab-delete {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 5px;
      color: var(--danger);
      cursor: pointer;
      display: inline-flex;
      font-size: 14px;
      height: 20px;
      justify-content: center;
      min-height: 0;
      min-width: 20px;
      padding: 0;
      transition: background 0.14s ease, transform 0.14s ease;
      width: 20px;
    }

    .wa-tab-delete:hover {
      background: #fff1f0;
      transform: scale(1.06);
    }

    .danger-tool {
      color: var(--danger);
    }

    .icon-tool {
      font-size: 16px;
    }

    .license-panel {
      background: #fff8f7;
      border-color: #ffd7ce;
      box-shadow: none;
      color: #7a271a;
      font-size: 12px;
    }

    .license-panel h2,
    .license-panel p,
    .license-panel a,
    .license-panel .hint,
    .license-panel strong {
      font-size: inherit;
    }

    .license-panel h2 {
      color: #7a271a;
      margin-bottom: 8px;
    }

    .wa-editor-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 0.78fr);
      min-height: 330px;
      min-width: 0;
    }

    .wa-input-pane {
      position: relative;
      min-height: 330px;
      min-width: 0;
    }

    .wa-highlight,
    .wa-input {
      border: 0;
      border-radius: 0;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      inset: 0;
      line-height: 1.55;
      margin: 0;
      min-height: 330px;
      overflow: auto;
      padding: 13px 14px;
      position: absolute;
      resize: none;
      tab-size: 2;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .wa-highlight {
      color: var(--text);
      pointer-events: none;
      z-index: 1;
    }

    .wa-input {
      background: transparent;
      caret-color: var(--text);
      color: transparent;
      outline: none;
      z-index: 2;
    }

    .wa-input::placeholder {
      color: var(--muted);
    }

    .wa-input::selection {
      background: rgba(23, 92, 211, 0.22);
      color: transparent;
    }

    .wa-marker {
      color: #d92d20;
      font-weight: 900;
    }

    .wa-placeholder-token {
      color: #175cd3;
      font-weight: 800;
    }

    code,
    .syntax-tag {
      background: #f2f4f7;
      border: 1px solid #e4e7ec;
      border-radius: 6px;
      color: #344054;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
      padding: 0.1em 0.35em;
    }

    .syntax-tag {
      display: inline-flex;
      margin: 1px 3px 1px 0;
    }

    .label-with-help {
      align-items: center;
      display: flex;
      gap: 7px;
      justify-content: space-between;
    }

    .help-links {
      align-items: center;
      display: inline-flex;
      gap: 6px;
      margin-left: 6px;
    }

    .help-link {
      align-items: center;
      color: #175cd3;
      display: inline-flex;
      font-size: 14px;
      justify-content: center;
      text-decoration: none;
    }

    .help-link.video-help {
      color: #b42318;
    }

    details.syntax-details {
      margin-top: 10px;
    }

    details.syntax-details summary {
      color: var(--text);
      cursor: pointer;
      font-weight: 800;
      list-style-position: inside;
      margin-bottom: 8px;
    }

    .wa-preview {
      background: #eef7f0;
      border-left: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 430px;
      min-width: 0;
      overflow: auto;
      padding: 14px;
    }

    .wa-preview:hover {
      background: #eaf6ed;
    }

    .wa-preview-empty {
      color: var(--muted);
      font-size: 13px;
      margin: auto;
      text-align: center;
    }

    .wa-preview-group {
      display: grid;
      gap: 7px;
    }

    .wa-preview-variant {
      color: #475467;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .wa-bubble {
      align-self: start;
      background: #fff;
      border: 1px solid rgba(16, 24, 40, 0.08);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
      max-width: 92%;
      padding: 8px 10px;
      white-space: pre-wrap;
      transition: box-shadow 0.14s ease, transform 0.14s ease;
    }

    .wa-bubble:hover {
      box-shadow: 0 4px 12px rgba(16, 24, 40, 0.1);
      transform: translateY(-1px);
    }

    .wa-bubble strong {
      font-weight: 800;
    }

    .wa-bubble em {
      font-style: italic;
    }

    .wa-bubble s {
      text-decoration-thickness: 1.5px;
    }

    .wa-bubble code {
      background: #f2f4f7;
      border: 1px solid var(--line);
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 0.94em;
      padding: 1px 4px;
    }

    .wa-bubble.media {
      min-width: 190px;
    }

    .wa-media-card {
      align-items: center;
      background: #f2f4f7;
      border: 1px solid var(--line);
      border-radius: 7px;
      display: flex;
      gap: 9px;
      min-height: 46px;
      padding: 9px;
    }

    .wa-media-icon {
      align-items: center;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 7px;
      display: inline-flex;
      height: 30px;
      justify-content: center;
      width: 30px;
    }

    .wa-caption {
      margin-top: 7px;
    }

    .visually-hidden-field {
      display: none;
    }

    .hint {
      margin-top: 8px;
      font-size: 13px;
      color: var(--muted);
    }

    .hint strong {
      color: var(--text);
    }

    .field-message {
      border-radius: 8px;
      display: none;
      font-size: 13px;
      margin-top: 8px;
      padding: 9px 10px;
    }

    .field-message.error {
      display: block;
      background: #fff1f0;
      border: 1px solid #fecdca;
      color: var(--danger);
    }

    .field-message.ok {
      display: block;
      background: #ecfdf3;
      border: 1px solid #abefc6;
      color: var(--ok);
    }

    .field-message.info {
      display: block;
      background: #eff8ff;
      border: 1px solid #b2ddff;
      color: #175cd3;
    }

    .template-base-dir {
      display: none;
      margin-top: 10px;
    }

    .template-base-dir.visible {
      display: block;
    }

    .syntax-demo {
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 0;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      margin-top: 10px;
      overflow: hidden;
    }

    .syntax-demo div {
      padding: 9px 10px;
      background: #fff;
    }

    .syntax-demo div:nth-child(odd) {
      background: #f8fafc;
      border-right: 1px solid var(--line);
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }

    details.hint {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 11px;
      background: #fbfcfe;
    }

    details.hint summary {
      cursor: pointer;
      font-weight: 700;
    }

    .compliance-notice {
      background: #fff4f2;
      border: 1px solid #ffd7ce;
      border-left: 3px solid #f97066;
      border-radius: 7px;
      color: #7a271a;
      display: grid;
      gap: 6px;
      font-size: inherit;
      font-weight: 700;
      line-height: 1.45;
      margin: 9px 0 0;
      padding: 9px 10px;
    }

    .compliance-notice.full {
      background: transparent;
      border-left-color: #d92d20;
      margin: 10px 0;
    }

    .compliance-notice p {
      margin: 0;
    }

    .compliance-notice strong {
      color: #7a271a;
      font-weight: 900;
    }

    .global-footer {
      color: #475467;
      font-size: 12px;
      line-height: 1.5;
      margin: 20px auto 0;
      max-width: 1180px;
      padding: 0 2px 28px;
    }

    .global-footer h2,
    .global-footer p,
    .global-footer a,
    .global-footer strong {
      font-size: inherit;
    }

    .global-footer h2 {
      color: var(--text);
      margin: 0 0 8px;
    }

    .global-footer p {
      margin: 5px 0;
    }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
    }

    .session-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      gap: 10px;
      align-items: end;
    }

    .checks label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-weight: 600;
    }

    button {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
      min-height: 44px;
      padding: 0 18px;
      transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
    }

    button:hover {
      background: var(--accent-strong);
      box-shadow: 0 4px 10px rgba(23, 92, 211, 0.16);
      transform: translateY(-1px);
    }
    button:disabled { cursor: not-allowed; opacity: 0.55; }

    .icon-button {
      min-width: 44px;
      padding: 0 12px;
      font-size: 18px;
      line-height: 1;
    }

    .icon-button.update-available {
      background: #b54708;
      box-shadow: 0 0 0 3px rgba(181, 71, 8, 0.12);
    }

    .icon-button.update-available .wa-icon {
      animation: update-pulse 1.8s ease-in-out infinite;
    }

    @keyframes update-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.12); }
    }

    @media (prefers-reduced-motion: reduce) {
      .icon-button.update-available .wa-icon,
      .top-progress.active .top-progress-bar::after {
        animation: none;
      }
    }

    .danger-button {
      background: var(--danger);
    }

    .danger-button:hover {
      background: #912018;
    }

    .shutdown-button {
      background: #7a271a;
      min-width: 44px;
      padding: 0 13px;
      font-size: 18px;
      line-height: 1;
    }

    .shutdown-button:hover {
      background: #631b14;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 15px;
    }

    .message {
      border-radius: 8px;
      margin-top: 14px;
      padding: 10px 12px;
      display: none;
    }

    .message.error {
      display: block;
      background: #fff1f0;
      color: var(--danger);
      border: 1px solid #fecdca;
    }

    .message.ok {
      display: block;
      background: #ecfdf3;
      color: var(--ok);
      border: 1px solid #abefc6;
    }

    .message.warning {
      display: block;
      background: #fffaeb;
      color: var(--warn);
      border: 1px solid #fedf89;
    }

    .log {
      display: grid;
      gap: 6px;
      max-height: 96px;
      overflow: auto;
      padding-right: 4px;
    }

    .log.expanded {
      max-height: min(46vh, 440px);
    }

    .log-row {
      border: 1px solid var(--line);
      border-left: 3px solid var(--info);
      border-radius: 8px;
      padding: 6px 8px;
      background: #fff;
      font-size: 13px;
      line-height: 1.35;
    }

    .log-row.sent { border-left-color: var(--ok); }
    .log-row.skip, .log-row.warning, .log-row.wait { border-left-color: var(--warn); }
    .log-row.error { border-left-color: var(--danger); }

    .log-time {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-bottom: 2px;
    }

    .log-header {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .log-header h2 {
      margin: 0;
    }

    .log-toggle {
      min-height: 32px;
      padding: 0 10px;
    }

    .update-status-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .update-status-item {
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 6px;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 9px 10px;
    }

    .update-status-badge {
      border-radius: 999px;
      background: #eef2f6;
      color: var(--text);
      font-size: 12px;
      font-weight: 800;
      padding: 3px 8px;
      white-space: nowrap;
    }

    .update-status-item.available {
      border-color: #f79009;
    }

    .update-status-item.available .update-status-badge {
      background: #fffaeb;
      color: #b54708;
    }

    .modal-overlay {
      align-items: center;
      background: rgba(15, 23, 42, 0.46);
      display: none;
      inset: 0;
      justify-content: center;
      padding: 20px;
      position: fixed;
      z-index: 60;
    }

    .modal-overlay.visible {
      display: flex;
    }

    .modal-dialog {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
      max-width: 560px;
      padding: 18px;
      width: min(100%, 560px);
    }

    .modal-dialog h2 {
      margin-bottom: 8px;
    }

    .confirm-table {
      border: 1px solid var(--line);
      border-collapse: collapse;
      margin-top: 14px;
      width: 100%;
    }

    .confirm-table th,
    .confirm-table td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      text-align: left;
      vertical-align: top;
    }

    .confirm-table th {
      background: #f8fafc;
      color: var(--muted);
      font-size: 12px;
      width: 36%;
    }

    .settings-grid {
      display: grid;
      gap: 10px;
      margin-top: 14px;
      max-height: min(52vh, 520px);
      overflow: auto;
      padding-right: 4px;
    }

    .settings-group {
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 9px;
      padding: 10px;
    }

    .settings-group h3 {
      color: var(--text);
      font-size: 13px;
      margin: 0;
    }

    .settings-row {
      align-items: center;
      display: grid;
      gap: 8px;
      grid-template-columns: minmax(170px, 1fr) minmax(92px, 0.55fr);
    }

    .settings-row label {
      margin: 0;
    }

    .settings-scope {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
    }

    .settings-scope label {
      align-items: center;
      display: inline-flex;
      gap: 6px;
      margin: 0;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .secondary-button {
      background: #eef2f6;
      color: var(--text);
    }

    .secondary-button:hover {
      background: #e4e7ec;
    }

    @media (max-width: 860px) {
      header,
      .layout,
      .split {
        grid-template-columns: 1fr;
        display: grid;
      }

      .full-card {
        grid-column: auto;
      }

      header {
        align-items: start;
      }

      .syntax-demo {
        grid-template-columns: 1fr;
      }

      .syntax-demo div:nth-child(odd) {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .wa-editor-shell {
        grid-template-columns: 1fr;
      }

      .wa-preview {
        border-left: 0;
        border-top: 1px solid var(--line);
        max-height: 320px;
      }
    }
  </style>
</head>
<body>
  ${renderGuiIconSprite()}
  <div id="topProgress" class="top-progress" aria-hidden="true">
    <div id="topProgressBar" class="top-progress-bar"></div>
  </div>
  <main>
    <header>
      <div>
        <h1>Disparador WhatsApp</h1>
        <p>Acompanhe a conexão do WhatsApp e configure a execução local.</p>
      </div>
      <div class="header-actions">
        <div class="status-pill" id="statusPill">Aguardando</div>
        <button id="updateButton" class="icon-button" type="button" data-hint="${escapeHtml(GUI_HINTS.update)}" aria-label="Atualizar">${renderGuiIcon("f0ed")}</button>
        <button id="settingsButton" class="icon-button" type="button" data-hint="${escapeHtml(GUI_HINTS.settings)}" aria-label="Configurações">${renderGuiIcon("settings")}</button>
        <button id="shutdownButton" class="icon-button shutdown-button" type="button" data-hint="${escapeHtml(GUI_HINTS.shutdown)}" aria-label="Desligar">${renderGuiIcon("power")}</button>
      </div>
    </header>

    <div class="layout">
      <form id="runForm">
        <section>
          <h2>Sessão</h2>
          <div class="session-row">
            <div>
              <label for="sessionSelect">WhatsApp</label>
              <select id="sessionSelect"></select>
            </div>
            <button id="newSessionButton" class="icon-button" type="button" data-hint="Criar sessão" aria-label="Criar sessão">${renderGuiIcon("plus")}</button>
            <button id="renameSessionButton" class="icon-button" type="button" data-hint="Renomear sessão" aria-label="Renomear sessão">${renderGuiIcon("pencil")}</button>
            <button id="removeSessionButton" class="icon-button danger-button" type="button" data-hint="Remover sessão" aria-label="Remover sessão">${renderGuiIcon("trash")}</button>
          </div>
          <div class="hint">Ao alternar, criar ou remover a sessão ativa, o WhatsApp é reiniciado automaticamente. Se a última sessão for removida, a próxima abertura volta ao QR Code.</div>
        </section>

        <section class="license-panel">
          <h2>Licença</h2>
          <p><strong>Autor:</strong> <a href="${AUTHOR_URL}" target="_blank" rel="noreferrer">${AUTHOR}</a></p>
          <p><strong>Licença:</strong> <a href="/license" target="_blank" rel="noreferrer">${LICENSE_NAME}</a> <span class="hint">(${LICENSE_LOCAL_PATH}; <a href="${LICENSE_URL}" target="_blank" rel="noreferrer">${LICENSE_URL}</a>)</span></p>
          <div class="compliance-notice" role="note" aria-label="Aviso legal resumido">${renderComplianceSummaryHtml()}</div>
        </section>

        <section class="full-card template-card">
          <h2>Modelo de mensagem</h2>
          <input id="templateFile" class="visually-hidden-field" type="file" accept=".md,text/markdown,text/plain" tabindex="-1" aria-hidden="true">
          <input id="embeddedAttachmentInput" class="visually-hidden-field" type="file" accept="${getEmbeddedAttachmentAccept()}" tabindex="-1" aria-hidden="true">
          <div id="templateMediaStatus" class="field-message"></div>
          <div id="templateBaseDirBox" class="template-base-dir">
            <label for="templateBaseDir">Pasta de referência dos anexos</label>
            <input id="templateBaseDir" type="text" placeholder="C:/LOCAL/whatsapp/anexos">
            <div class="hint">Use quando o navegador não conseguir informar a pasta real do .md. Deve ser um diretório local existente.</div>
          </div>
          <div class="hint">Use Abrir na toolbar para carregar um .md; se nada for carregado, use o editor abaixo ou o modelo padrão texto.md.</div>

          <div class="label-with-help" style="margin-top:14px">
            <label for="templateEditorInput">Texto do modelo</label>
            <span class="help-links">${renderHelpLink("youtube", HELP_VIDEO_URLS.template, GUI_HINTS.videoTemplate, "video-help")}</span>
          </div>
          <div class="wa-editor">
            <div class="wa-tabs" id="templateTabs" aria-label="Blocos do modelo">
              <button id="newTemplateTabButton" class="wa-tab wa-tab-create" type="button" data-hint="${escapeHtml(GUI_HINTS.newModel)}" aria-label="Novo modelo">${renderGuiIcon("plus")}</button>
            </div>
            <div class="wa-toolbar" aria-label="Ferramentas de edição textual">
              <button type="button" id="saveTemplateLocalButton" data-hint="${escapeHtml(GUI_HINTS.saveLocal)}" aria-label="Salvar localmente">${renderGuiIcon("f0c7")}</button>
              <div class="wa-toolbar-group">
                <button type="button" id="templateModelsButton" data-hint="${escapeHtml(GUI_HINTS.templateModels)}" aria-label="Selecionar modelo" aria-haspopup="menu" aria-expanded="false">${renderGuiIcon("folderOpen")}</button>
                <div id="templateModelsMenu" class="template-menu" role="menu" aria-label="Modelos preexistentes"></div>
              </div>
              <span class="toolbar-separator" aria-hidden="true"></span>
              <button type="button" id="saveTemplateButton" data-hint="${escapeHtml(GUI_HINTS.save)}" aria-label="Salvar">${renderGuiIcon("f56d")}</button>
              <button type="button" id="openTemplateButton" data-hint="${escapeHtml(GUI_HINTS.open)}" aria-label="Abrir">${renderGuiIcon("f574")}</button>
              <span class="toolbar-separator" aria-hidden="true"></span>
              <button type="button" data-wrap="*" data-hint="${escapeHtml(GUI_HINTS.bold)}" aria-label="Negrito">${renderGuiIcon("bold")}</button>
              <button type="button" data-wrap="_" data-hint="${escapeHtml(GUI_HINTS.italic)}" aria-label="Itálico">${renderGuiIcon("italic")}</button>
              <button type="button" data-wrap="~" data-hint="${escapeHtml(GUI_HINTS.strikethrough)}" aria-label="Tachado">${renderGuiIcon("strikethrough")}</button>
              <button type="button" data-wrap="\`\`\`" data-hint="${escapeHtml(GUI_HINTS.code)}" aria-label="Monoespaçado" class="icon-tool">${renderGuiIcon("code")}</button>
              <span class="toolbar-separator" aria-hidden="true"></span>
              ${renderTemplateMarkerButtons()}
              <div class="wa-toolbar-group">
                <button type="button" id="insertEmojiButton" data-hint="${escapeHtml(GUI_HINTS.emoji)}" aria-label="Inserir emoji" aria-haspopup="menu" aria-expanded="false">${renderGuiIcon("emoji")}</button>
                <div id="emojiMenu" class="emoji-menu" role="menu" aria-label="Emojis profissionais"></div>
              </div>
              <button type="button" id="insertAttachmentButton" data-hint="${escapeHtml(GUI_HINTS.attachment)}" aria-label="Inserir anexo">${renderGuiIcon("attachment")}</button>
              <button type="button" id="insertPostingButton" data-hint="${escapeHtml(GUI_HINTS.newPosting)}" aria-label="Inserir nova postagem">${renderGuiIcon("newPosting")}</button>
            </div>
            <div class="wa-editor-shell">
              <div class="wa-input-pane">
                <pre id="templateHighlight" class="wa-highlight" aria-hidden="true"></pre>
                <textarea id="templateEditorInput" class="wa-input" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="$diatarde$, \${nome}.&#10;&#10;Seu valor atualizado é \${(valor+taxa)}."></textarea>
              </div>
              <div id="templatePreview" class="wa-preview" aria-live="polite"></div>
            </div>
          </div>
          <textarea id="templateText" class="visually-hidden-field" tabindex="-1" aria-hidden="true"></textarea>
          <div class="hint">\${campo} aceita colunas/expressões. Use a toolbar para inserir apenas marcação textual do WhatsApp. Anexos em <code>![](arquivo.pdf)</code>, <code>$postagem$</code> e separadores <code>^^^</code> permanecem texto puro. ${renderHelpLink("info", DOCS_USAGE_GITHUB_URL, GUI_HINTS.docs)}</div>
          <details class="syntax-details">
            <summary>Notações suportadas</summary>
            <div class="syntax-demo" aria-label="Demonstração de sintaxe textual">
              <div><span class="syntax-tag">*</span><code>*negrito exemplo*</code></div>
              <div><strong>negrito exemplo</strong></div>
              <div><span class="syntax-tag">_</span><code>_itálico exemplo_</code></div>
              <div><em>itálico exemplo</em></div>
              <div><span class="syntax-tag">~</span><code>~tachado exemplo~</code></div>
              <div><s>taxado exemplo</s></div>
              <div><span class="syntax-tag">\`\`\`</span><code>\`\`\`mono exemplo\`\`\`</code></div>
              <div><code>mono exemplo</code></div>
              <div><code>\${nome}</code> / <code>\${(valor+taxa)*2}</code></div>
              <div>Variáveis e cálculos do CSV</div>
              <div><code>$diatarde$</code></div>
              <div>bom dia / boa tarde</div>
              <div><code>![](arquivo.pdf)</code></div>
              <div>Anexo no plano de envio</div>
              <div><code>$postagem$</code></div>
              <div>Nova postagem sequencial</div>
              <div><code>^^^</code></div>
              <div>Separador de modelos</div>
            </div>
          </details>
        </section>

        <section>
          <div class="split">
            <div>
              <h2>Filtro</h2>
              <div class="label-with-help">
                <label for="filter">Expressão</label>
                <span class="help-links">${renderHelpLink("youtube", HELP_VIDEO_URLS.expression, GUI_HINTS.videoExpression, "video-help")}</span>
              </div>
              <input id="filter" type="text" placeholder="status=ativo && valor>=100">
              <div class="hint">Suporta <code>=</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code>, <code>&amp;&amp;</code>, <code>||</code>, <code>^^</code>, <code>!</code>, funções <code>$.isnum(campo)</code> e matemática simples. ${renderHelpLink("info", DOCS_USAGE_GITHUB_URL, GUI_HINTS.docs)}</div>
            </div>
            <div>
              <h2>Base de clientes</h2>
              <div class="label-with-help">
                <label for="csvFile">Arquivo .csv opcional</label>
                <span class="help-links">${renderHelpLink("youtube", HELP_VIDEO_URLS.clients, GUI_HINTS.videoClients, "video-help")}</span>
              </div>
              <input id="csvFile" type="file" accept=".csv,text/csv,text/plain">
              <div class="hint">CSV com cabeçalho; colunas obrigatórias: nome e telefone. Outras colunas podem ser usadas em <code>\${campo}</code>.</div>
            </div>
          </div>
        </section>

        <section>
          <h2>Execução</h2>
          <div class="checks">
            <label><input id="forceResend" type="checkbox"> Reenviar ignorando histórico</label>
            <label><input id="resetSent" type="checkbox"> Limpar histórico antes de enviar</label>
          </div>
          <div class="actions">
            <button id="runButton" type="submit">Executar</button>
            <p id="summary">Usa os arquivos padrão quando nenhum substituto é informado.</p>
          </div>
          <div id="message" class="message"></div>
        </section>
      </form>

        <section class="full-card log-card">
          <div class="log-header">
            <h2>Andamento</h2>
            <button id="logToggleButton" class="secondary-button log-toggle" type="button" aria-expanded="false" aria-controls="log">Expandir histórico</button>
          </div>
          <div class="log" id="log"></div>
        </section>
    </div>
    <footer class="global-footer">${renderLegalFooterHtml()}</footer>
  </main>

  <div id="settingsOverlay" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
    <div class="modal-dialog">
      <h2 id="settingsTitle">Configurações</h2>
      <p>Altere variáveis operacionais controladas por ENV.</p>
      <div class="settings-scope" role="radiogroup" aria-label="Escopo das configurações">
        <label><input type="radio" name="settingsScope" value="current" checked> Execução atual</label>
        <label><input type="radio" name="settingsScope" value="global"> Global</label>
        <label><input type="radio" name="settingsScope" value="session"> Sessão</label>
      </div>
      <div id="settingsGrid" class="settings-grid"></div>
      <div class="hint">Configurações por sessão são salvas em JSON e entram automaticamente na próxima abertura dessa sessão.</div>
      <div class="modal-actions">
        <button id="settingsCancel" class="secondary-button" type="button">Cancelar</button>
        <button id="settingsSave" type="button">Salvar</button>
      </div>
    </div>
  </div>

  <div id="executionConfirmOverlay" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="executionConfirmTitle">
    <div class="modal-dialog">
      <h2 id="executionConfirmTitle">Confirmar execução</h2>
      <p>Confira a associação entre sessão, modelo e base antes de enviar.</p>
      <table class="confirm-table">
        <tbody id="executionConfirmRows"></tbody>
      </table>
      <div class="modal-actions">
        <button id="executionConfirmCancel" class="secondary-button" type="button">Cancelar</button>
        <button id="executionConfirmOk" type="button">Sim</button>
      </div>
    </div>
  </div>

  <div id="updateOverlay" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="updateTitle">
    <div class="modal-dialog">
      <h2 id="updateTitle">Atualizar</h2>
      <p>Atualizações de software ou dependências podem introduzir incompatibilidades e quebrar um ambiente estável.</p>
      <div id="updateStatusList" class="update-status-list" aria-live="polite"></div>
      <div class="settings-grid" id="updateOptions">
        <button type="button" data-update-action="whatsapp-web.js">Atualizar whatsapp-web.js<br><small>Somente o motor crítico.</small></button>
        <button type="button" data-update-action="dependencies">Atualizar dependências<br><small>Inclui whatsapp-web.js.</small></button>
        <button type="button" data-update-action="software">Atualizar software<br><small>Repositório oficial e sincronização.</small></button>
        <button type="button" data-update-action="revert">Reverter atualização<br><small>Restaura a última atualização válida.</small></button>
      </div>
      <div id="updateWarning" class="hint">Selecione uma operação. A confirmação explícita inicia o processo.</div>
      <div class="modal-actions">
        <button id="updateCancel" class="secondary-button" type="button">Cancelar</button>
        <button id="updateConfirm" type="button" disabled>Confirmar atualização</button>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById("runForm");
    const button = document.getElementById("runButton");
    const message = document.getElementById("message");
    const log = document.getElementById("log");
    const logToggleButton = document.getElementById("logToggleButton");
    const statusPill = document.getElementById("statusPill");
    const topProgress = document.getElementById("topProgress");
    const topProgressBar = document.getElementById("topProgressBar");
    const updateButton = document.getElementById("updateButton");
    const settingsButton = document.getElementById("settingsButton");
    const shutdownButton = document.getElementById("shutdownButton");
    const sessionSelect = document.getElementById("sessionSelect");
    const newSessionButton = document.getElementById("newSessionButton");
    const renameSessionButton = document.getElementById("renameSessionButton");
    const removeSessionButton = document.getElementById("removeSessionButton");
    const templateFileInput = document.getElementById("templateFile");
    const embeddedAttachmentInput = document.getElementById("embeddedAttachmentInput");
    const templateBaseDirInput = document.getElementById("templateBaseDir");
    const templateBaseDirBox = document.getElementById("templateBaseDirBox");
    const templateMediaStatus = document.getElementById("templateMediaStatus");
    const templateTextHidden = document.getElementById("templateText");
    const templateEditorInput = document.getElementById("templateEditorInput");
    const templateHighlight = document.getElementById("templateHighlight");
    const templatePreview = document.getElementById("templatePreview");
    const templateTabs = document.getElementById("templateTabs");
    const newTemplateTabButton = document.getElementById("newTemplateTabButton");
    const openTemplateButton = document.getElementById("openTemplateButton");
    const saveTemplateLocalButton = document.getElementById("saveTemplateLocalButton");
    const saveTemplateButton = document.getElementById("saveTemplateButton");
    const templateModelsButton = document.getElementById("templateModelsButton");
    const templateModelsMenu = document.getElementById("templateModelsMenu");
    const insertEmojiButton = document.getElementById("insertEmojiButton");
    const emojiMenu = document.getElementById("emojiMenu");
    const insertAttachmentButton = document.getElementById("insertAttachmentButton");
    const insertPostingButton = document.getElementById("insertPostingButton");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const settingsGrid = document.getElementById("settingsGrid");
    const settingsCancel = document.getElementById("settingsCancel");
    const settingsSave = document.getElementById("settingsSave");
    const executionConfirmOverlay = document.getElementById("executionConfirmOverlay");
    const executionConfirmRows = document.getElementById("executionConfirmRows");
    const executionConfirmOk = document.getElementById("executionConfirmOk");
    const executionConfirmCancel = document.getElementById("executionConfirmCancel");
    const updateOverlay = document.getElementById("updateOverlay");
    const updateOptions = document.getElementById("updateOptions");
    const updateStatusList = document.getElementById("updateStatusList");
    const updateWarning = document.getElementById("updateWarning");
    const updateCancel = document.getElementById("updateCancel");
    const updateConfirm = document.getElementById("updateConfirm");
    let activeSessionId = "";
    let lastSessionCount = 0;
    let knownSessions = [];
    let pollTimer = null;
    let templateAnalysisTimer = null;
    let templateAnalysisToken = 0;
    let templatePreviewTimer = null;
    let templatePreviewToken = 0;
    let templateFileLoadToken = 0;
    let templateBlocks = [""];
    let templateDirty = false;
    let templateModels = [];
    let selectedTemplatePath = "";
    let activeTemplateBlock = 0;
    let isComposingTemplate = false;
    let scrollSyncSource = "";
    let settingsSnapshot = null;
    const LOCAL_TEMPLATE_STORAGE_KEY = "whatsend.template.local";
    let embeddedFooter = "";
    let selectedUpdateAction = "";
    let logExpanded = false;
    const embeddedAttachmentCapabilities = ${JSON.stringify(getEmbeddedAttachmentCapabilities())};
    const maxEmbeddedAttachmentBytes = ${MAX_EMBEDDED_ATTACHMENT_BYTES};
    const tabDeleteIcon = ${JSON.stringify(renderGuiIcon("trash"))};
    const emojiOptions = [
      ["⚠️", "alerta"],
      ["✅", "concluído"],
      ["❌", "erro"],
      ["📋", "lista"],
      ["👍", "ok"],
      ["ℹ️", "informação"],
      ["📌", "destaque"],
      ["⏰", "prazo"],
      ["⏱️", "economia de tempo"],
      ["📎", "anexo"],
      ["💬", "resposta"],
      ["🚀", "lançamento"],
      ["🎯", "objetivo"],
      ["💡", "ideia"],
      ["🏷️", "preço baixo"],
      ["💸", "baixo custo"],
      ["♻️", "economia de recursos"],
      ["📦", "entrega"],
      ["📈", "crescimento"],
      ["🤝", "parceria"],
      ["🆗", "aprovado"],
      ["☑️", "confirmado"],
      ["🔔", "lembrete"],
      ["📣", "anúncio"],
      ["📢", "comunicado"],
      ["📲", "contato"],
      ["📞", "ligação"],
      ["✉️", "email"],
      ["📝", "cadastro"],
      ["📄", "documento"],
      ["🧾", "comprovante"],
      ["💳", "pagamento"],
      ["💰", "valor"],
      ["🎁", "brinde"],
      ["🔥", "oferta"],
      ["⭐", "favorito"],
      ["🛒", "compra"],
      ["🛍️", "pedido"],
      ["🚚", "frete"],
      ["🔒", "seguro"],
      ["🔐", "acesso"],
      ["🛠️", "suporte"],
      ["🧩", "solução"],
      ["📊", "relatório"],
      ["📉", "redução"],
      ["🧮", "cálculo"],
      ["📅", "agenda"],
      ["🗓️", "data"],
      ["⌛", "aguardando"],
      ["🔄", "atualização"],
      ["⬆️", "aumento"],
      ["⬇️", "desconto"],
      ["➡️", "próximo passo"],
      ["✨", "novidade"],
      ["🎉", "comemoração"],
      ["🏆", "conquista"],
      ["💎", "premium"],
      ["🙏", "agradecimento"],
      ["🙂", "cordialidade"],
      ["😔", "atenção empática"],
    ];

    function showMessage(text, type) {
      message.textContent = text;
      message.className = "message " + type;
    }

    function clearMessage() {
      message.textContent = "";
      message.className = "message";
    }

    function initializeHints(root) {
      const scope = root || document;
      scope
        .querySelectorAll("button, input, select, textarea, a, [data-hint]")
        .forEach((element) => {
          const content =
            element.getAttribute("data-hint") ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            "";

          if (!content) return;

          element.setAttribute("data-hint", content);
          element.removeAttribute("title");
        });
    }

    function setTemplateMediaStatus(text, type) {
      templateMediaStatus.textContent = text || "";
      templateMediaStatus.className = text ? "field-message " + type : "field-message";
    }

    function setTemplateBaseDirVisible(visible) {
      templateBaseDirBox.classList.toggle("visible", Boolean(visible));
    }

    function resetTemplateMediaAnalysis() {
      templateAnalysisToken += 1;
      setTemplateMediaStatus("", "");
      if (!templateBaseDirInput.value.trim()) {
        setTemplateBaseDirVisible(false);
      }
    }

    function readFile(input) {
      const file = input.files && input.files[0];
      if (!file) return Promise.resolve(null);

      return file.arrayBuffer().then((buffer) => ({
        content: decodeUploadedText(buffer),
        name: file.name,
        path: file.path || file.webkitRelativePath || file.name,
      }));
    }

    function decodeUploadedText(buffer) {
      const bytes = new Uint8Array(buffer);
      let text = "";

      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        text = new TextDecoder("utf-8").decode(bytes.slice(3));
        return normalizeUploadedText(text);
      }

      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder("utf-16le").decode(bytes.slice(2));
        return normalizeUploadedText(text);
      }

      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (_) {
        try {
          text = new TextDecoder("windows-1252").decode(bytes);
        } catch (err) {
          text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
        }
      }

      return normalizeUploadedText(text);
    }

    function normalizeUploadedText(text) {
      return String(text || "")
        .replace(/^\\ufeff/u, "")
        .replace(/\\r\\n/g, "\\n")
        .replace(/\\r/g, "\\n")
        .replace(/[\\u2028\\u2029]/gu, "\\n");
    }

    function escapeMarkup(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function hasTemplateSeparator(text) {
      return /^[ \\t]*\\^{3,}[ \\t]*$/mu.test(String(text || ""));
    }

    function splitEditorBlocks(text) {
      const normalized = normalizeUploadedText(text);

      if (!hasTemplateSeparator(normalized)) {
        return [normalized];
      }

      const blocks = normalized
        .split(/^[ \\t]*\\^{3,}[ \\t]*$/gmu)
        .filter((block) => block.trim());

      return blocks.length ? blocks : [""];
    }

    function splitEmbeddedFooter(text) {
      const normalized = normalizeUploadedText(text);
      const match = /(?:^|\\n)@@embedded[ \\t]*\\n[\\s\\S]*\\n@@end[ \\t]*$/u.exec(normalized);
      if (!match) return { content: normalized, footer: "" };
      return { content: normalized.slice(0, match.index).replace(/\\n+$/u, ""), footer: match[0].replace(/^\\n/u, "") };
    }

    function getPersistableTemplateBlocks() {
      const blocks = templateBlocks.map((block) => String(block || ""));
      const nonEmpty = blocks.filter((block) => block.trim());
      return nonEmpty.length ? nonEmpty : [blocks[0] || ""];
    }

    function joinEditorBlocks() {
      const content = getPersistableTemplateBlocks().join("\\n\\n^^^\\n\\n");
      return embeddedFooter ? content.replace(/\\n+$/u, "") + "\\n\\n" + embeddedFooter : content;
    }

    function saveActiveTemplateBlock() {
      if (!templateEditorInput) return;
      templateBlocks[activeTemplateBlock] = templateEditorInput.value;
    }

    function syncTemplateHidden() {
      saveActiveTemplateBlock();
      templateTextHidden.value = joinEditorBlocks();
    }

    function highlightTemplateText(text) {
      const source = String(text || "");
      const monoMarker = String.fromCharCode(96).repeat(3);
      const markerPattern = new RegExp("(" + monoMarker + "|\\\\*|_|~)", "g");
      const highlighted = escapeMarkup(source || " ")
        .replace(/(\\$\\{[^}]*\\})/g, '<span class="wa-placeholder-token">$1</span>')
        .replace(markerPattern, '<span class="wa-marker">$1</span>');
      return highlighted + (source.endsWith("\\n") ? " " : "\\n");
    }

    function renderTemplateHighlight() {
      templateHighlight.innerHTML = highlightTemplateText(templateEditorInput.value);
      syncHighlightScroll();
    }

    function syncHighlightScroll() {
      templateHighlight.scrollTop = templateEditorInput.scrollTop;
      templateHighlight.scrollLeft = templateEditorInput.scrollLeft;
    }

    function getScrollRatio(element) {
      const max = element.scrollHeight - element.clientHeight;
      return max > 0 ? element.scrollTop / max : 0;
    }

    function setScrollRatio(element, ratio) {
      const max = element.scrollHeight - element.clientHeight;
      element.scrollTop = max > 0 ? max * Math.max(0, Math.min(1, ratio)) : 0;
    }

    function syncEditorPreviewScroll(source) {
      if (scrollSyncSource) return;

      const from = source === "preview" ? templatePreview : templateEditorInput;
      const to = source === "preview" ? templateEditorInput : templatePreview;
      const ratio = getScrollRatio(from);

      scrollSyncSource = source;
      window.requestAnimationFrame(() => {
        setScrollRatio(to, ratio);
        syncHighlightScroll();
        window.requestAnimationFrame(() => {
          scrollSyncSource = "";
        });
      });
    }

    function syncPreviewToEditorPosition() {
      const ratio = getScrollRatio(templateEditorInput);
      scrollSyncSource = "render";
      window.requestAnimationFrame(() => {
        setScrollRatio(templatePreview, ratio);
        window.requestAnimationFrame(() => {
          scrollSyncSource = "";
        });
      });
    }

    function renderTemplateTabs() {
      templateTabs.innerHTML = "";
      templateBlocks.forEach((block, index) => {
        const tab = document.createElement("div");
        tab.className = "wa-tab" + (index === activeTemplateBlock ? " active" : "");
        tab.setAttribute("role", "tab");
        tab.tabIndex = 0;
        tab.setAttribute("data-hint", block.trim() ? "Editar modelo " + (index + 1) : "Modelo vazio");
        const label = document.createElement("span");
        label.textContent = "M" + (index + 1);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "wa-tab-delete";
        remove.innerHTML = tabDeleteIcon;
        remove.setAttribute("data-hint", "Excluir modelo");
        remove.setAttribute("aria-label", "Excluir modelo " + (index + 1));

        const activate = () => {
          if (index === activeTemplateBlock) return;
          saveActiveTemplateBlock();
          activeTemplateBlock = index;
          templateEditorInput.value = templateBlocks[activeTemplateBlock] || "";
          syncTemplateHidden();
          renderTemplateTabs();
          renderTemplateHighlight();
          refreshTemplatePreviewNow();
          window.requestAnimationFrame(() => templateEditorInput.focus());
        };

        tab.addEventListener("click", activate);
        tab.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        });
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeTemplateTab(index);
        });
        tab.append(label, remove);
        templateTabs.append(tab);
      });
      templateTabs.append(newTemplateTabButton);
      initializeHints();
    }

    function setEditorContent(text, options = {}) {
      const document = splitEmbeddedFooter(text);
      embeddedFooter = document.footer;
      const blocks = splitEditorBlocks(document.content);
      templateBlocks = blocks.length ? blocks : [""];
      activeTemplateBlock = Math.min(
        Math.max(0, Number(options.activeIndex || 0)),
        templateBlocks.length - 1,
      );
      templateEditorInput.value = templateBlocks[activeTemplateBlock] || "";
      syncTemplateHidden();
      renderTemplateTabs();
      renderTemplateHighlight();
      refreshTemplatePreviewNow();
      templateDirty = Boolean(options.dirty);
    }

    function hasUnsavedTemplateChanges() {
      syncTemplateHidden();
      return templateDirty && Boolean(templateTextHidden.value.trim() || embeddedFooter.trim());
    }

    function confirmDiscardUnsavedTemplateChanges(actionLabel) {
      if (!hasUnsavedTemplateChanges()) return true;
      return window.confirm(
        "Há conteúdo do modelo carregado ou editado que ainda não foi salvo localmente nem baixado em arquivo.\\n\\n" +
        "Deseja descartar essas alterações e " + actionLabel + "?",
      );
    }

    function handleTemplateInputChanged() {
      templateDirty = true;
      if (!isComposingTemplate && hasTemplateSeparator(templateEditorInput.value)) {
        const splitBlocks = splitEditorBlocks(templateEditorInput.value);
        templateBlocks.splice(activeTemplateBlock, 1, ...splitBlocks);
        activeTemplateBlock = Math.min(activeTemplateBlock, templateBlocks.length - 1);
        templateEditorInput.value = templateBlocks[activeTemplateBlock] || "";
        syncTemplateHidden();
        renderTemplateTabs();
        renderTemplateHighlight();
        refreshTemplatePreviewNow();
        return;
      }

      syncTemplateHidden();
      renderTemplateHighlight();
      scheduleTemplatePreview();
    }

    function insertTextAtCursor(text) {
      const scrollTop = templateEditorInput.scrollTop;
      const scrollLeft = templateEditorInput.scrollLeft;
      const start = templateEditorInput.selectionStart;
      const end = templateEditorInput.selectionEnd;
      templateEditorInput.setRangeText(text, start, end, "end");
      handleTemplateInputChanged();
      templateEditorInput.scrollTop = scrollTop;
      templateEditorInput.scrollLeft = scrollLeft;
      syncHighlightScroll();
      templateEditorInput.focus();
    }

    function createEmbeddedId(filename) {
      const slug = String(filename || "arquivo").toLocaleLowerCase("pt-BR")
        .replace(/\\.[^.]+$/u, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "arquivo";
      return ("embed-" + slug + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7)).slice(0, 64);
    }

    function appendEmbeddedDefinition(id, file, data) {
      const definition = "[id=" + id + "]\\nname=" + file.name + "\\nmime=" + file.type + "\\nencoding=base64\\ndata=" + data;
      embeddedFooter = embeddedFooter
        ? embeddedFooter.replace(/\\n@@end[ \\t]*$/u, "\\n\\n" + definition + "\\n@@end")
        : "@@embedded\\n\\n" + definition + "\\n@@end";
    }

    function isSupportedEmbeddedFile(file) {
      const extension = "." + String(file.name || "").split(".").pop().toLocaleLowerCase("pt-BR");
      return embeddedAttachmentCapabilities.some((capability) => capability.extensions.includes(extension) && capability.mime === file.type);
    }

    function readEmbeddedAttachment(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Falha ao ler o anexo selecionado."));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
    }

    function wrapSelection(marker) {
      const scrollTop = templateEditorInput.scrollTop;
      const scrollLeft = templateEditorInput.scrollLeft;
      const start = templateEditorInput.selectionStart;
      const end = templateEditorInput.selectionEnd;
      const value = templateEditorInput.value;
      const selected = value.slice(start, end);
      const firstPrintableOffset = selected.search(/\\S/u);

      if (start === end) {
        templateEditorInput.setRangeText(marker + marker, start, end, "end");
        templateEditorInput.setSelectionRange(start + marker.length, start + marker.length);
      } else if (firstPrintableOffset < 0) {
        templateEditorInput.setSelectionRange(start, end);
      } else {
        const leading = selected.slice(0, firstPrintableOffset);
        const lastPrintableOffset = selected.search(/\\s*$/u);
        const trailing = selected.slice(lastPrintableOffset);
        const core = selected.slice(firstPrintableOffset, lastPrintableOffset);
        const coreStart = start + leading.length;
        const coreEnd = coreStart + core.length;
        const before = value.slice(Math.max(0, coreStart - marker.length), coreStart);
        const after = value.slice(coreEnd, coreEnd + marker.length);
        const coreIsWrapped =
          core.startsWith(marker) && core.endsWith(marker) && core.length >= marker.length * 2;

        if (coreIsWrapped) {
          const replacement = leading + core.slice(marker.length, core.length - marker.length) + trailing;
          templateEditorInput.setRangeText(replacement, start, end, "select");
          templateEditorInput.setSelectionRange(start + leading.length, start + replacement.length - trailing.length);
        } else if (before === marker && after === marker) {
          templateEditorInput.setRangeText("", coreEnd, coreEnd + marker.length, "end");
          templateEditorInput.setRangeText("", coreStart - marker.length, coreStart, "end");
          templateEditorInput.setSelectionRange(coreStart - marker.length, coreEnd - marker.length);
        } else {
          templateEditorInput.setRangeText(marker, coreEnd, coreEnd, "end");
          templateEditorInput.setRangeText(marker, coreStart, coreStart, "end");
          templateEditorInput.setSelectionRange(coreStart + marker.length, coreEnd + marker.length);
        }
      }

      templateEditorInput.scrollTop = scrollTop;
      templateEditorInput.scrollLeft = scrollLeft;
      handleTemplateInputChanged();
      syncHighlightScroll();
      templateEditorInput.focus();
    }

    function removeTemplateTab(index) {
      const confirmed = window.confirm("Excluir este modelo? Esta ação remove a aba da edição atual.");
      if (!confirmed) return;

      saveActiveTemplateBlock();

      if (templateBlocks.length <= 1) {
        templateBlocks = [""];
        activeTemplateBlock = 0;
      } else {
        const removedActive = index === activeTemplateBlock;
        templateBlocks.splice(index, 1);
        if (removedActive) {
          activeTemplateBlock = Math.min(index, templateBlocks.length - 1);
        } else if (index < activeTemplateBlock) {
          activeTemplateBlock -= 1;
        }
      }

      templateEditorInput.value = templateBlocks[activeTemplateBlock] || "";
      syncTemplateHidden();
      renderTemplateTabs();
      renderTemplateHighlight();
      refreshTemplatePreviewNow();
      templateDirty = true;
      templateEditorInput.focus();
    }

    function renderTemplatePreviewLoading() {
      templatePreview.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "wa-preview-empty";
      empty.textContent = "Atualizando prévia...";
      templatePreview.append(empty);
      syncPreviewToEditorPosition();
    }

    function renderTemplatePreview(result) {
      templatePreview.innerHTML = "";

      if (!result || result.ok === false) {
        const empty = document.createElement("div");
        empty.className = "wa-preview-empty";
        empty.textContent = result && result.errors && result.errors.length
          ? result.errors.join("\\n")
          : "Não foi possível gerar a prévia.";
        templatePreview.append(empty);
        syncPreviewToEditorPosition();
        return;
      }

      const variants = result.variants || [];
      if (!variants.length) {
        const empty = document.createElement("div");
        empty.className = "wa-preview-empty";
        empty.textContent = "Digite um modelo para visualizar as postagens.";
        templatePreview.append(empty);
        syncPreviewToEditorPosition();
        return;
      }

      variants.forEach((variant) => {
        const group = document.createElement("div");
        group.className = "wa-preview-group";

        if (variants.length > 1) {
          const label = document.createElement("div");
          label.className = "wa-preview-variant";
          label.textContent = "Modelo " + (variant.index + 1);
          group.append(label);
        }

        (variant.postings || []).forEach((posting) => {
          (posting.items || []).forEach((item) => {
            group.append(renderPreviewItem(item));
          });
        });

        templatePreview.append(group);
      });

      syncPreviewToEditorPosition();
    }

    function renderPreviewItem(item) {
      const bubble = document.createElement("div");
      bubble.className = "wa-bubble" + (item.type === "text" ? "" : " media");

      if (item.type === "text") {
        appendFormattedPreviewText(bubble, item.value || "");
        return bubble;
      }

      const card = document.createElement("div");
      card.className = "wa-media-card";

      const icon = document.createElement("span");
      icon.className = "wa-media-icon";
      icon.textContent = item.type === "audio" ? "♪" : item.type === "image" ? "▧" : "▤";

      const name = document.createElement("strong");
      name.textContent = item.filename || item.source || "anexo";
      card.append(icon, name);
      bubble.append(card);

      if (item.caption) {
        const caption = document.createElement("div");
        caption.className = "wa-caption";
        appendFormattedPreviewText(caption, item.caption);
        bubble.append(caption);
      }

      return bubble;
    }

    function appendFormattedPreviewText(parent, value) {
      const text = String(value || "");
      const monoMarker = String.fromCharCode(96).repeat(3);
      const markerPattern = new RegExp("(" + monoMarker + "|\\\\*|_|~)(\\\\S(?:[\\\\s\\\\S]*?\\\\S)?)\\\\1", "g");
      let cursor = 0;
      let match;

      while ((match = markerPattern.exec(text)) !== null) {
        if (match.index > cursor) {
          parent.append(document.createTextNode(text.slice(cursor, match.index)));
        }

        const marker = match[1];
        const inner = match[2];
        const element = document.createElement(
          marker === "*" ? "strong" : marker === "_" ? "em" : marker === "~" ? "s" : "code",
        );
        appendFormattedPreviewText(element, inner);
        parent.append(element);
        cursor = markerPattern.lastIndex;
      }

      if (cursor < text.length) {
        parent.append(document.createTextNode(text.slice(cursor)));
      }
    }

    function renderEmojiMenu() {
      emojiMenu.innerHTML = "";
      emojiOptions.forEach(([emoji, label]) => {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.title = label;
        option.textContent = emoji;
        option.addEventListener("click", () => {
          insertTextAtCursor(emoji);
          closeEmojiMenu();
        });
        emojiMenu.append(option);
      });
    }

    function closeEmojiMenu() {
      emojiMenu.classList.remove("open");
      insertEmojiButton.setAttribute("aria-expanded", "false");
    }

    function positionEmojiMenu() {
      const buttonRect = insertEmojiButton.getBoundingClientRect();
      const margin = 8;
      const menuWidth = emojiMenu.offsetWidth || 228;
      const menuHeight = emojiMenu.offsetHeight || 250;
      const left = Math.max(
        margin,
        Math.min(buttonRect.left, window.innerWidth - menuWidth - margin),
      );
      const below = buttonRect.bottom + 6;
      const top = below + menuHeight > window.innerHeight
        ? Math.max(margin, buttonRect.top - menuHeight - 6)
        : below;

      emojiMenu.style.left = left + "px";
      emojiMenu.style.top = top + "px";
    }

    function toggleEmojiMenu() {
      const open = !emojiMenu.classList.contains("open");
      emojiMenu.classList.toggle("open", open);
      insertEmojiButton.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        positionEmojiMenu();
      }
    }

    function scheduleTemplatePreview() {
      window.clearTimeout(templatePreviewTimer);
      templatePreviewTimer = window.setTimeout(() => {
        updateTemplatePreview().catch((err) => {
          renderTemplatePreview({ errors: [err.message], ok: false, variants: [] });
        });
      }, 250);
    }

    function refreshTemplatePreviewNow() {
      window.clearTimeout(templatePreviewTimer);
      updateTemplatePreview().catch((err) => {
        renderTemplatePreview({ errors: [err.message], ok: false, variants: [] });
      });
    }

    async function updateTemplatePreview() {
      if (isComposingTemplate) return;

      const token = ++templatePreviewToken;
      saveActiveTemplateBlock();
      syncTemplateHidden();
      const activeText = String(templateBlocks[activeTemplateBlock] || "");

      if (!activeText.trim()) {
        renderTemplatePreview({ errors: [], ok: true, variants: [] });
        return;
      }

      if (!templatePreview.children.length) {
        renderTemplatePreviewLoading();
      }
      const result = await postJson("/api/template/preview", {
        editorBlocks: [activeText],
        templateBaseDir: templateBaseDirInput.value,
        templateText: activeText,
      });

      if (token !== templatePreviewToken) return;

      renderTemplatePreview(result);
    }

    function shouldUseSelectedTemplateFile(templateFile, templateText) {
      if (!templateFile) return false;
      const fileContent = normalizeUploadedText(templateFile.content || "");
      const currentText = normalizeUploadedText(templateText || "");
      return !currentText.trim() || (fileContent.trim() && currentText === fileContent);
    }

    async function loadSelectedTemplateFile() {
      const token = ++templateFileLoadToken;
      const templateFile = await readFile(templateFileInput);

      if (token !== templateFileLoadToken) return;

      if (!templateFile || !String(templateFile.content || "").trim()) {
        resetTemplateMediaAnalysis();
        return;
      }

      selectedTemplatePath = "";
      setEditorContent(normalizeUploadedText(templateFile.content));
      scheduleTemplateMediaAnalysis();
    }

    function downloadTemplateAsFile() {
      syncTemplateHidden();
      const rawName = window.prompt("Nome do arquivo:", "modelo-whatsend");
      const basename = normalizeDownloadBasename(rawName);

      if (!basename) return;

      const blob = new Blob([templateTextHidden.value], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = basename + ".md";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      templateDirty = false;
      showMessage("Modelo baixado em arquivo.", "ok");
    }

    function saveTemplateLocally() {
      syncTemplateHidden();
      try {
        window.localStorage.setItem(LOCAL_TEMPLATE_STORAGE_KEY, templateTextHidden.value);
        templateDirty = false;
        showMessage("Modelo salvo neste navegador.", "ok");
      } catch (err) {
        showMessage("Não foi possível salvar o modelo neste navegador: " + err.message, "error");
      }
    }

    function getStoredTemplate() {
      try {
        return window.localStorage.getItem(LOCAL_TEMPLATE_STORAGE_KEY) || "";
      } catch (_) {
        return "";
      }
    }

    function normalizeDownloadBasename(value) {
      return String(value || "")
        .trim()
        .replace(/\.md$/iu, "")
        .replace(/[<>:"/\\\\|?*\\x00-\\x1f]+/gu, "-")
        .replace(/^\\.+/u, "")
        .replace(/\\.+$/u, "")
        .trim();
    }

    async function openSettingsPanel() {
      settingsOverlay.classList.add("visible");
      settingsGrid.innerHTML = '<div class="wa-preview-empty">Carregando...</div>';

      const data = await getJson("/api/settings");
      settingsSnapshot = data.settings;
      renderSettingsPanel();
    }

    function closeSettingsPanel() {
      settingsOverlay.classList.remove("visible");
    }

    function getSelectedSettingsScope() {
      const selected = document.querySelector('input[name="settingsScope"]:checked');
      return selected ? selected.value : "current";
    }

    function renderSettingsPanel() {
      const scope = getSelectedSettingsScope();
      const values = (settingsSnapshot && settingsSnapshot.scopes && settingsSnapshot.scopes[scope]) || {};
      const definitions = (settingsSnapshot && settingsSnapshot.definitions) || [];
      settingsGrid.innerHTML = "";

      groupSettingsDefinitions(definitions).forEach((group) => {
        const groupBox = document.createElement("div");
        groupBox.className = "settings-group";

        const title = document.createElement("h3");
        title.textContent = group.name;
        groupBox.append(title);

        group.items.forEach((definition) => {
        const row = document.createElement("div");
        row.className = "settings-row";

        const label = document.createElement("label");
        label.setAttribute("for", "setting-" + definition.name);
        label.innerHTML = "<strong>" + escapeMarkup(definition.name) + "</strong><small>" + escapeMarkup(definition.label) + "</small>";

        const input = document.createElement("input");
        input.id = "setting-" + definition.name;
        input.name = definition.name;
        input.type = "number";
        input.step = definition.type === "integer" ? "1" : "any";
        if (definition.min !== undefined) input.min = String(definition.min);
        if (definition.max !== undefined) input.max = String(definition.max);
        input.placeholder = definition.fallback || "";
        input.value = values[definition.name] || "";

        row.append(label, input);
          groupBox.append(row);
        });

        settingsGrid.append(groupBox);
      });

      initializeHints(settingsGrid);
    }

    function groupSettingsDefinitions(definitions) {
      const groups = new Map();

      definitions.forEach((definition) => {
        const name = definition.group || "Geral";
        if (!groups.has(name)) {
          groups.set(name, {
            items: [],
            name,
            order: Number(definition.groupOrder || 100),
          });
        }

        groups.get(name).items.push(definition);
      });

      return Array.from(groups.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    }

    async function saveSettingsPanel() {
      const values = {};
      settingsGrid.querySelectorAll("input[name]").forEach((input) => {
        if (input.value.trim()) {
          values[input.name] = input.value.trim();
        }
      });

      await postJson("/api/settings", {
        scope: getSelectedSettingsScope(),
        sessionId: activeSessionId,
        values,
      });
      showMessage("Configurações salvas.", "ok");
      closeSettingsPanel();
    }

    function validateLocal(payload) {
      const errors = [];

      if (payload.templateText.trim() && payload.templateFile && payload.templateFile.content.trim()) {
        errors.push("Escolha texto do editor ou arquivo .md, não ambos.");
      }

      if (payload.templateFile && !payload.templateFile.name.toLowerCase().endsWith(".md")) {
        errors.push("O arquivo de modelo precisa ser .md.");
      }

      if (payload.csvFile && !payload.csvFile.name.toLowerCase().endsWith(".csv")) {
        errors.push("A base de clientes precisa ser .csv.");
      }

      return errors;
    }

    function shouldConfirmExecutionContext(payload) {
      return Boolean((payload.csvFile && payload.csvFile.name) || knownSessions.length > 1);
    }

    function currentSessionLabel() {
      const selected = knownSessions.find((session) => session.id === activeSessionId);
      return selected ? selected.displayName : (activeSessionId || "Sessão atual");
    }

    function payloadModelLabel(payload) {
      if (payload.templateFile && payload.templateFile.name) {
        return payload.templateFile.name;
      }

      if (payload.templateText && payload.templateText.trim()) {
        return "Texto digitado na GUI";
      }

      return "texto.md padrão";
    }

    function payloadCsvLabel(payload) {
      return payload.csvFile && payload.csvFile.name
        ? payload.csvFile.name
        : "clientes.csv padrão";
    }

    function confirmExecutionContext(payload) {
      if (!shouldConfirmExecutionContext(payload)) {
        return Promise.resolve(true);
      }

      const rows = [
        ["Sessão", currentSessionLabel()],
        ["Modelo", payloadModelLabel(payload)],
        ["Base de clientes", payloadCsvLabel(payload)],
        ["Filtro", payload.filter && payload.filter.trim() ? payload.filter.trim() : "Sem filtro"],
      ];

      executionConfirmRows.innerHTML = "";
      for (const [label, value] of rows) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        const td = document.createElement("td");
        th.textContent = label;
        td.textContent = value;
        row.append(th, td);
        executionConfirmRows.append(row);
      }

      executionConfirmOverlay.classList.add("visible");

      return new Promise((resolve) => {
        const finish = (confirmed) => {
          executionConfirmOverlay.classList.remove("visible");
          executionConfirmOk.removeEventListener("click", onOk);
          executionConfirmCancel.removeEventListener("click", onCancel);
          executionConfirmOverlay.removeEventListener("click", onOverlay);
          document.removeEventListener("keydown", onKeyDown);
          resolve(confirmed);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onOverlay = (event) => {
          if (event.target === executionConfirmOverlay) finish(false);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") finish(false);
        };

        executionConfirmOk.addEventListener("click", onOk);
        executionConfirmCancel.addEventListener("click", onCancel);
        executionConfirmOverlay.addEventListener("click", onOverlay);
        document.addEventListener("keydown", onKeyDown);
        executionConfirmOk.focus();
      });
    }

    function scheduleTemplateMediaAnalysis() {
      window.clearTimeout(templateAnalysisTimer);
      templateAnalysisTimer = window.setTimeout(() => {
        analyzeTemplateMedia().catch((err) => {
          setTemplateBaseDirVisible(true);
          setTemplateMediaStatus(err.message, "error");
        });
      }, 350);
    }

    async function analyzeTemplateMedia() {
      const token = ++templateAnalysisToken;
      const templateFile = await readFile(templateFileInput);
      syncTemplateHidden();

      if (token !== templateAnalysisToken) return;

      if (!templateTextHidden.value.trim() && (!templateFile || !String(templateFile.content || "").trim())) {
        resetTemplateMediaAnalysis();
        return;
      }

      setTemplateMediaStatus("Analisando anexos do modelo...", "info");

      const result = await postJson("/api/template/analyze", {
        templateBaseDir: templateBaseDirInput.value,
        templateFile: shouldUseSelectedTemplateFile(templateFile, templateTextHidden.value) ? templateFile : null,
        templateText: shouldUseSelectedTemplateFile(templateFile, templateTextHidden.value)
          ? ""
          : templateTextHidden.value,
      });

      if (token !== templateAnalysisToken) return;

      if (result.mediaIssues && result.mediaIssues.length) {
        setTemplateBaseDirVisible(true);
        setTemplateMediaStatus(
          "Anexo não localizado. Informe a pasta de referência dos anexos ou use fullpath no modelo.",
          "error",
        );
        return;
      }

      if (result.localMediaCount > 0) {
        setTemplateMediaStatus("Anexos locais localizados.", "ok");
        setTemplateBaseDirVisible(Boolean(templateBaseDirInput.value.trim()));
        return;
      }

      setTemplateMediaStatus("", "");
      setTemplateBaseDirVisible(Boolean(templateBaseDirInput.value.trim()));
    }

    function formatSyntaxIssue(issue, index) {
      const location = "Linha " + issue.line + ", coluna " + issue.column;
      const snippet = issue.snippet ? "\\nTrecho: " + issue.snippet : "";
      return (index + 1) + ". " + location + ": " + issue.message + snippet;
    }

    function confirmTemplateSyntaxIssues(issues) {
      if (!issues || !issues.length) return true;

      return window.confirm(
        "Atenção: foram encontrados possíveis erros de sintaxe no modelo selecionado.\\n\\n" +
        issues.map(formatSyntaxIssue).join("\\n\\n") +
        "\\n\\nO padrão seguro é abortar. Deseja enviar mesmo assim?"
      );
    }

    async function buildPayload() {
      syncTemplateHidden();
      const templateFile = await readFile(templateFileInput);
      const useTemplateFile = shouldUseSelectedTemplateFile(templateFile, templateTextHidden.value);

      return {
        csvFile: await readFile(document.getElementById("csvFile")),
        filter: document.getElementById("filter").value,
        forceResend: document.getElementById("forceResend").checked,
        resetSent: document.getElementById("resetSent").checked,
        templateBaseDir: templateBaseDirInput.value,
        templateFile: useTemplateFile ? templateFile : null,
        templateText: useTemplateFile ? "" : templateTextHidden.value,
      };
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data.errors || [data.error || "Falha na requisição."]).join("\\n"));
      }
      return data;
    }

    async function getJson(url) {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data.errors || [data.error || "Falha na requisição."]).join("\\n"));
      }
      return data;
    }

    function renderStatus(state) {
      const ready = Boolean(state.whatsappReady);
      statusPill.textContent = state.busy ? "Executando" : statusLabel(state.status, ready);
      button.disabled = Boolean(state.busy) || !ready;
      renderTopProgress(state.progress || {});
      renderSessions(state);
      renderUpdateCheck(state.updateCheck || {});

      log.innerHTML = "";
      const items = (state.log || []).slice().sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
      const visibleItems = logExpanded ? items : items.slice(-2);
      if (visibleItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "log-row";
        empty.textContent = "Nenhum registro ainda.";
        log.append(empty);
      }
      const previousScrollTop = log.scrollTop;
      const wasExpanded = logExpanded;
      log.classList.toggle("expanded", logExpanded);
      for (const item of visibleItems) {
        const row = document.createElement("div");
        row.className = "log-row " + (item.type || "info");
        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = new Date(item.at).toLocaleTimeString();
        const text = document.createElement("div");
        const prefix = item.current && item.total ? "[" + item.current + "/" + item.total + "] " : "";
        text.textContent = prefix + item.message;
        row.append(time, text);
        log.append(row);
      }
      log.scrollTop = wasExpanded ? previousScrollTop : log.scrollHeight;
    }

    function renderUpdateCheck(updateCheck) {
      const components = updateCheck.components || {};
      const available = Object.values(components).some((component) => component.updateAvailable);
      updateButton.classList.toggle("update-available", available);
      updateButton.setAttribute("aria-label", available ? "Atualização disponível" : "Atualizar");
      updateButton.setAttribute("data-hint", available ? "Há atualização disponível." : "${escapeHtml(GUI_HINTS.update)}");

      if (!updateStatusList) return;
      updateStatusList.innerHTML = "";
      [["app", "Aplicativo"], ["whatsappWebJs", "whatsapp-web.js"]].forEach(([key, label]) => {
        const component = components[key] || { status: updateCheck.inFlight ? "verificando" : "desconhecido" };
        const item = document.createElement("div");
        item.className = "update-status-item" + (component.updateAvailable ? " available" : "");
        const text = document.createElement("div");
        const version = component.latestVersion ? " " + (component.currentVersion || "?") + " → " + component.latestVersion : "";
        text.textContent = label + version;
        const badge = document.createElement("span");
        badge.className = "update-status-badge";
        badge.textContent = updateStatusLabel(component.status);
        item.append(text, badge);
        updateStatusList.append(item);
      });
    }

    function updateStatusLabel(status) {
      const labels = {
        atualizado: "atualizado",
        atualizacao_disponivel: "disponível",
        consulta_inconclusiva: "inconclusivo",
        desconhecido: "desconhecido",
        falha_temporaria: "falha temporária",
        verificando: "verificando",
      };
      return labels[status] || "indisponível";
    }

    function renderTopProgress(progress) {
      const active = Boolean(progress && progress.active);
      const percent = Number.isFinite(Number(progress.percent))
        ? Math.max(0, Math.min(100, Number(progress.percent)))
        : 0;
      topProgress.classList.toggle("active", active);
      topProgressBar.style.width = active ? Math.max(percent, 3) + "%" : "0%";
    }

    function renderSessions(state) {
      const sessions = state.sessions || [];
      const active = state.activeSession && state.activeSession.id;
      knownSessions = sessions;
      activeSessionId = active || "";
      lastSessionCount = sessions.length;
      sessionSelect.innerHTML = "";
      for (const session of sessions) {
        const option = document.createElement("option");
        option.value = session.id;
        option.textContent = session.displayName;
        option.selected = session.id === active;
        sessionSelect.append(option);
      }
      sessionSelect.disabled = sessions.length <= 1 || Boolean(state.busy);
      newSessionButton.disabled = Boolean(state.busy);
      renameSessionButton.disabled = !active || Boolean(state.busy);
      removeSessionButton.disabled = sessions.length === 0 || Boolean(state.busy);
    }

    function askSessionToRemove() {
      if (!knownSessions.length) return null;

      const activeIndex = knownSessions.findIndex((session) => session.id === activeSessionId);
      const lines = knownSessions.map((session, index) => {
        const marker = session.id === activeSessionId ? " (ativa)" : "";
        return (index + 1) + " - " + session.displayName + marker;
      });
      const answer = window.prompt(
        "Qual sessão deseja remover? Informe o número, nome ou id.\\n\\n" + lines.join("\\n"),
        activeIndex >= 0 ? String(activeIndex + 1) : "1",
      );

      if (!answer || !answer.trim()) return null;

      const trimmed = answer.trim();
      const index = Number.parseInt(trimmed, 10);

      if (String(index) === trimmed && index >= 1 && index <= knownSessions.length) {
        return knownSessions[index - 1];
      }

      const normalized = trimmed.toLocaleLowerCase("pt-BR");
      const digits = trimmed.replace(/\\D/g, "");
      return knownSessions.find((session) => {
        return (
          session.id.toLocaleLowerCase("pt-BR") === normalized ||
          session.name.toLocaleLowerCase("pt-BR") === normalized ||
          (digits && session.phone && session.phone.endsWith(digits))
        );
      }) || { id: trimmed, displayName: trimmed };
    }

    function statusLabel(status, ready) {
      if (ready && status === "conectado") return "WhatsApp conectado";
      const labels = {
        autenticado: "Sessão autenticada",
        autenticando: "Autenticando",
        carregando_whatsapp: "Carregando WhatsApp",
        concluido: "Concluído",
        desconectado: "Desconectado",
        erro: "Erro",
        executando: "Executando",
        falha_autenticacao: "Falha de autenticação",
        iniciando_whatsapp: "Iniciando WhatsApp",
        reiniciando_sessao: "Reiniciando sessão",
        validando: "Validando",
      };
      return labels[status] || "Aguardando";
    }

    async function refreshStatus() {
      const response = await fetch("/api/status", { cache: "no-store" });
      const data = await response.json();
      renderStatus(data.state);
    }

    function startStatusPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        refreshStatus().catch((err) => {
          showMessage("Não foi possível atualizar o status: " + err.message, "error");
        });
      }, 1200);
    }

    async function refreshUpdateCheck(force) {
      await getJson("/api/updates/check" + (force ? "?force=1" : ""));
      startStatusPolling();
    }

    async function loadTemplateModels() {
      const data = await getJson("/api/templates");
      templateModels = data.templates || [];
      renderTemplateModelsMenu();
    }

    function renderTemplateModelsMenu() {
      templateModelsMenu.innerHTML = "";
      const none = document.createElement("button");
      none.type = "button";
      none.setAttribute("role", "menuitem");
      none.textContent = "Nenhum modelo selecionado";
      none.addEventListener("click", () => {
        selectedTemplatePath = "";
        closeTemplateModelsMenu();
      });
      templateModelsMenu.append(none);

      if (!templateModels.length) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.disabled = true;
        empty.textContent = "Nenhum modelo encontrado";
        templateModelsMenu.append(empty);
        return;
      }

      templateModels.forEach((model) => {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.dataset.templateModelIndex = String(templateModels.indexOf(model));
        item.innerHTML = "<span>" + escapeMarkup(model.name || model.path) + "</span><small>" + escapeMarkup(model.context || model.path) + "</small>";
        templateModelsMenu.append(item);
      });
    }

    function selectTemplateModel(model) {
      if (!confirmDiscardUnsavedTemplateChanges("carregar o modelo selecionado")) {
        return;
      }
      selectedTemplatePath = model.path || "";
      templateFileInput.value = "";
      templateBaseDirInput.value = model.baseDir || "";
      setTemplateBaseDirVisible(Boolean(templateBaseDirInput.value.trim()));
      setEditorContent(model.content || "", { dirty: false });
      setTemplateMediaStatus("Modelo carregado: " + (model.path || model.name), "info");
      closeTemplateModelsMenu();
      scheduleTemplateMediaAnalysis();
    }

    function openTemplateModelsMenu() {
      loadTemplateModels().catch((err) => {
        templateModels = [];
        renderTemplateModelsMenu();
        setTemplateMediaStatus("Falha ao listar modelos: " + err.message, "error");
      });
      templateModelsMenu.classList.add("open");
      templateModelsButton.setAttribute("aria-expanded", "true");
    }

    function closeTemplateModelsMenu() {
      templateModelsMenu.classList.remove("open");
      templateModelsButton.setAttribute("aria-expanded", "false");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();
      button.disabled = true;

      try {
        const payload = await buildPayload();
        const localErrors = validateLocal(payload);
        if (localErrors.length) throw new Error(localErrors.join("\\n"));

        const confirmedContext = await confirmExecutionContext(payload);
        if (!confirmedContext) {
          showMessage("Execução cancelada para conferência de sessão e arquivos.", "warning");
          button.disabled = false;
          return;
        }

        const validation = await postJson("/api/validate", payload);

        if (!confirmTemplateSyntaxIssues(validation.syntaxIssues)) {
          showMessage("Envio abortado por possíveis erros de sintaxe no modelo.", "error");
          button.disabled = false;
          return;
        }

        if (validation.syntaxIssues && validation.syntaxIssues.length) {
          payload.confirmTemplateSyntaxIssues = true;
        }

        await postJson("/api/run", payload);
        showMessage(
          "Processamento iniciado. Se áudio ou anexos parecerem lentos, mantenha a aba do WhatsApp Web visível.",
          "warning",
        );
        await refreshStatus();
        startStatusPolling();
      } catch (err) {
        showMessage(err.message, "error");
        button.disabled = false;
      }
    });

    templateEditorInput.addEventListener("input", handleTemplateInputChanged);
    templateEditorInput.addEventListener("paste", () => {
      window.setTimeout(handleTemplateInputChanged, 0);
    });
    templateEditorInput.addEventListener("scroll", () => {
      syncHighlightScroll();
      syncEditorPreviewScroll("editor");
    });
    templatePreview.addEventListener("scroll", () => {
      syncEditorPreviewScroll("preview");
    });
    templateEditorInput.addEventListener("compositionstart", () => {
      isComposingTemplate = true;
    });
    templateEditorInput.addEventListener("compositionend", () => {
      isComposingTemplate = false;
      handleTemplateInputChanged();
    });

    document.querySelectorAll("[data-wrap]").forEach((button) => {
      button.addEventListener("click", () => wrapSelection(button.getAttribute("data-wrap") || ""));
    });

    document.querySelectorAll("[data-insert-marker]").forEach((button) => {
      button.addEventListener("click", () => {
        insertTextAtCursor(button.getAttribute("data-insert-marker") || "");
      });
    });

    openTemplateButton.addEventListener("click", () => {
      if (!confirmDiscardUnsavedTemplateChanges("abrir outro arquivo")) return;
      templateFileInput.value = "";
      templateFileInput.click();
    });

    templateModelsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (templateModelsMenu.classList.contains("open")) {
        closeTemplateModelsMenu();
      } else {
        openTemplateModelsMenu();
      }
    });

    function handleTemplateModelsMenuSelection(event) {
      const item = event.target.closest("[data-template-model-index]");
      if (!item) {
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.type === "click" && item.dataset.templateSelectionHandled === "1") {
        delete item.dataset.templateSelectionHandled;
        return;
      }
      if (event.type === "pointerdown") {
        item.dataset.templateSelectionHandled = "1";
      }
      const index = Number(item.dataset.templateModelIndex);
      const model = templateModels[index];
      if (model) {
        selectTemplateModel(model);
      }
    }

    templateModelsMenu.addEventListener("pointerdown", handleTemplateModelsMenuSelection);
    templateModelsMenu.addEventListener("click", handleTemplateModelsMenuSelection);

    insertEmojiButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleEmojiMenu();
    });

    emojiMenu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (event.target !== insertEmojiButton && !emojiMenu.contains(event.target)) {
        closeEmojiMenu();
      }
      if (event.target !== templateModelsButton && !templateModelsMenu.contains(event.target)) {
        closeTemplateModelsMenu();
      }
    });

    document.addEventListener("focusin", (event) => {
      const insideTemplateModels = event.target === templateModelsButton || templateModelsMenu.contains(event.target);
      if (event.target !== insertEmojiButton && !emojiMenu.contains(event.target)) {
        closeEmojiMenu();
      }
      if (!insideTemplateModels) {
        closeTemplateModelsMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeEmojiMenu();
        closeTemplateModelsMenu();
      }
    });

    window.addEventListener("resize", closeEmojiMenu);
    window.addEventListener("scroll", closeEmojiMenu, true);
    window.addEventListener("resize", closeTemplateModelsMenu);
    window.addEventListener("scroll", closeTemplateModelsMenu, true);

    insertAttachmentButton.addEventListener("click", () => embeddedAttachmentInput.click());

    embeddedAttachmentInput.addEventListener("change", async () => {
      const file = embeddedAttachmentInput.files && embeddedAttachmentInput.files[0];
      embeddedAttachmentInput.value = "";
      if (!file) return;
      if (file.size > maxEmbeddedAttachmentBytes) {
        showMessage("Anexo excede o limite de 8 MiB.", "error");
        return;
      }
      if (!isSupportedEmbeddedFile(file)) {
        showMessage("Formato do anexo não é suportado pelo motor de envio.", "error");
        return;
      }
      try {
        const data = await readEmbeddedAttachment(file);
        const id = createEmbeddedId(file.name);
        appendEmbeddedDefinition(id, file, data);
        insertTextAtCursor("![" + file.name + "](@embed:" + id + ")");
        setTemplateMediaStatus("Anexo incorporado: " + file.name + " (" + Math.ceil(file.size / 1024) + " KiB).", "ok");
      } catch (err) {
        showMessage(err.message, "error");
      }
    });

    insertPostingButton.addEventListener("click", () => {
      insertTextAtCursor("\\n\\n$postagem$\\n\\n");
    });

    newTemplateTabButton.addEventListener("click", () => {
      saveActiveTemplateBlock();
      templateBlocks.push("");
      activeTemplateBlock = templateBlocks.length - 1;
      templateEditorInput.value = "";
      syncTemplateHidden();
      renderTemplateTabs();
      renderTemplateHighlight();
      refreshTemplatePreviewNow();
      templateDirty = true;
      templateEditorInput.focus();
    });

    saveTemplateLocalButton.addEventListener("click", saveTemplateLocally);
    saveTemplateButton.addEventListener("click", downloadTemplateAsFile);
    logToggleButton.addEventListener("click", () => {
      logExpanded = !logExpanded;
      logToggleButton.setAttribute("aria-expanded", String(logExpanded));
      logToggleButton.textContent = logExpanded ? "Recolher histórico" : "Expandir histórico";
      refreshStatus().catch((err) => showMessage(err.message, "error"));
    });

    settingsButton.addEventListener("click", () => {
      openSettingsPanel().catch((err) => {
        showMessage(err.message, "error");
        closeSettingsPanel();
      });
    });

    function closeUpdatePanel() {
      updateOverlay.classList.remove("visible");
      selectedUpdateAction = "";
      updateConfirm.disabled = true;
      updateOptions.querySelectorAll("[data-update-action]").forEach((item) => item.classList.remove("selected"));
    }

    updateButton.addEventListener("click", () => {
      updateOverlay.classList.add("visible");
      refreshUpdateCheck(true).catch((err) => showMessage(err.message, "error"));
    });
    updateOptions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-update-action]");
      if (!option) return;
      selectedUpdateAction = option.getAttribute("data-update-action") || "";
      updateConfirm.disabled = !selectedUpdateAction;
      updateOptions.querySelectorAll("[data-update-action]").forEach((item) => item.classList.toggle("selected", item === option));
      updateWarning.textContent = selectedUpdateAction === "revert"
        ? "A reversão restaura software, dependências e metadados da última atualização válida."
        : "A confirmação explícita inicia a atualização e o progresso será registrado.";
    });
    updateCancel.addEventListener("click", closeUpdatePanel);
    updateOverlay.addEventListener("click", (event) => { if (event.target === updateOverlay) closeUpdatePanel(); });
    updateConfirm.addEventListener("click", async () => {
      if (!selectedUpdateAction) return;
      try {
        updateConfirm.disabled = true;
        await postJson("/api/update", { action: selectedUpdateAction, confirmed: true });
        closeUpdatePanel();
        showMessage("Atualização iniciada. O progresso será mostrado no registro.", "warning");
        startStatusPolling();
      } catch (err) {
        updateConfirm.disabled = false;
        showMessage(err.message, "error");
      }
    });

    settingsCancel.addEventListener("click", closeSettingsPanel);
    settingsSave.addEventListener("click", () => {
      saveSettingsPanel().catch((err) => showMessage(err.message, "error"));
    });
    document.querySelectorAll('input[name="settingsScope"]').forEach((input) => {
      input.addEventListener("change", renderSettingsPanel);
    });

    templateFileInput.addEventListener("change", () => {
      if (!templateFileInput.files || !templateFileInput.files.length) {
        return;
      }

      loadSelectedTemplateFile().catch((err) => {
        setTemplateBaseDirVisible(true);
        setTemplateMediaStatus(err.message, "error");
      });
    });

    templateBaseDirInput.addEventListener("input", () => {
      if (!templateTextHidden.value.trim() && (!templateFileInput.files || !templateFileInput.files.length)) {
        setTemplateBaseDirVisible(Boolean(templateBaseDirInput.value.trim()));
        return;
      }

      scheduleTemplateMediaAnalysis();
    });

    shutdownButton.addEventListener("click", async () => {
      const confirmed = window.confirm("Desligar o WhatSend? O WhatsApp controlado e a interface local serão encerrados.");

      if (!confirmed) return;

      try {
        shutdownButton.disabled = true;
        showMessage("Desligando WhatSend...", "warning");
        await postJson("/api/runtime/stop", {});
      } catch (err) {
        shutdownButton.disabled = false;
        showMessage(err.message, "error");
      }
    });

    sessionSelect.addEventListener("change", async () => {
      const sessionId = sessionSelect.value;
      if (!sessionId || sessionId === activeSessionId) return;

      const selectedText = sessionSelect.options[sessionSelect.selectedIndex].textContent;
      const confirmed = window.confirm("Alternar para " + selectedText + "? O WhatsApp será reiniciado.");

      if (!confirmed) {
        sessionSelect.value = activeSessionId;
        return;
      }

      try {
        await postJson("/api/sessions/switch", { sessionId });
        showMessage("Alternando sessão. A interface será reaberta.", "ok");
      } catch (err) {
        showMessage(err.message, "error");
        sessionSelect.value = activeSessionId;
      }
    });

    newSessionButton.addEventListener("click", async () => {
      const name = window.prompt("Nome da nova sessão:");
      if (!name || !name.trim()) return;

      try {
        await postJson("/api/sessions/create", { name: name.trim() });
        showMessage("Sessão criada. Reiniciando para autenticar.", "ok");
      } catch (err) {
        showMessage(err.message, "error");
      }
    });

    renameSessionButton.addEventListener("click", async () => {
      if (!activeSessionId) return;
      const currentText = sessionSelect.options[sessionSelect.selectedIndex]?.textContent || "";
      const name = window.prompt("Novo nome da sessão:", currentText.replace(/\\s*\\(\\d{4}\\)\\s*$/, ""));
      if (!name || !name.trim()) return;

      try {
        const data = await postJson("/api/sessions/rename", {
          name: name.trim(),
          sessionId: activeSessionId,
        });
        showMessage(data.message || "Sessão renomeada.", "ok");
        await refreshStatus();
      } catch (err) {
        showMessage(err.message, "error");
      }
    });

    removeSessionButton.addEventListener("click", async () => {
      const sessionToRemove = askSessionToRemove();
      if (!sessionToRemove) return;
      const currentText = sessionToRemove.displayName || sessionToRemove.id;
      const activeHint = sessionToRemove.id === activeSessionId
        ? " O WhatsApp será fechado antes da remoção para preservar os dados da sessão."
        : "";
      const confirmed = window.confirm(
        "Remover a sessão " + currentText + "? A autenticação local dessa sessão será apagada." + activeHint
      );

      if (!confirmed) return;

      try {
        const data = await postJson("/api/sessions/remove", {
          sessionId: sessionToRemove.id,
        });
        showMessage(data.message || "Sessão removida.", "ok");
        if (!data.activeRemoved) {
          await refreshStatus();
        }
      } catch (err) {
        showMessage(err.message, "error");
      }
    });

    refreshStatus().catch((err) => {
      showMessage("Não foi possível carregar o status: " + err.message, "error");
    });
    refreshUpdateCheck(false).catch(() => {});
    renderEmojiMenu();
    setEditorContent(getStoredTemplate());
    initializeHints();
    startStatusPolling();
  </script>
</body>
</html>`;
}

function renderTemplateMarkerButtons() {
  return TEMPLATE_MARKER_ACTIONS.map((action) => {
    const id = escapeHtml(action.id);
    const label = escapeHtml(action.label);
    const hint = escapeHtml(action.hint);
    const insert = escapeHtml(action.insert);

    return `<button type="button" id="${id}" data-insert-marker="${insert}" data-hint="${hint}" aria-label="${label}">${renderGuiIcon(action.icon)}</button>`;
  }).join("");
}

function startGuiUpdate(state, action) {
  state.busy = true;
  state.update = { active: true, action, result: "" };
  pushGuiLog(state, { message: `Atualização iniciada: ${action}.`, type: "warning" });
  const child = childProcess.spawn(process.execPath, [
    path.join(ROOT_DIR, "scripts", "update-project.js"),
    "--action", action, "--confirm",
  ], { cwd: ROOT_DIR, windowsHide: true });
  const append = (chunk, type) => String(chunk || "").split(/\r?\n/u).filter(Boolean).forEach((message) => {
    pushGuiLog(state, { message, type });
  });
  child.stdout.on("data", (chunk) => append(chunk, "info"));
  child.stderr.on("data", (chunk) => append(chunk, "error"));
  child.on("error", (error) => {
    state.busy = false;
    state.update = { active: false, action, result: error.message };
    pushGuiLog(state, { message: `Atualização não iniciada: ${error.message}`, type: "error" });
  });
  child.on("close", (code) => {
    const ok = code === 0;
    state.busy = false;
    state.update = { active: false, action, result: ok ? "concluída" : `falhou (código ${code})` };
    pushGuiLog(state, {
      message: ok
        ? "Atualização concluída. Reinicie o WhatSend para carregar as versões instaladas."
        : "Atualização falhou; verifique o erro e a recuperação automática registrada acima.",
      type: ok ? "success" : "error",
    });

  });
}

function renderHelpLink(iconName, href, hint, extraClass = "") {
  const className = ["help-link", extraClass].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" data-hint="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}">${renderGuiIcon(iconName)}</a>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  analyzeGuiTemplateMedia,
  buildGuiTemplatePreview,
  discoverGuiTemplates,
  materializeGuiExecutionPaths,
  openGuiWhenBrowserIsAvailable,
  registerGuiClientHandlers,
  renderGuiHtml,
  resolveGuiProvidedFilePath,
  resolveGuiTemplateBaseDir,
  startGuiServer,
  validateGuiPayload,
  validateGuiTemplateBaseDir,
};
