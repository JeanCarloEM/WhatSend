process.env.MIN_DELAY_MS = "0";
process.env.MAX_DELAY_MS = "0";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyTemplate,
  buildSendPlan,
  formatNameForMessage,
  getTemplateFingerprint,
  loadAlreadySent,
  loadCsv,
  loadSentRecords,
  parseTemplateParts,
  processCampaign,
  resetSentLog,
  sendRenderedTemplate,
  sanitizePhone,
  validateRuntimeFiles,
} = require("../main");

function createFixture(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whatsapp-rcf-"));
  const paths = {
    csv: path.join(root, "clientes.csv"),
    template: path.join(root, "texto.md"),
    logsDir: path.join(root, "logs"),
    sent: path.join(root, "logs", "enviados.csv"),
    errors: path.join(root, "logs", "erros.csv"),
    messageCache: path.join(root, "logs", "mensagens.json"),
    skipped: path.join(root, "logs", "pulos.csv"),
    warnings: path.join(root, "logs", "avisos.csv"),
    auth: path.join(root, ".wwebjs_auth"),
    mediaCacheDir: path.join(root, "media-cache"),
  };

  fs.writeFileSync(
    paths.csv,
    files.csv ?? "nome,telefone,conta\nMaria,(19) 99824-0000,12345\n",
    "utf8",
  );
  fs.writeFileSync(
    paths.template,
    files.template ?? "Olá ${nome}, conta ${conta}. ${extra}",
    "utf8",
  );

  return { root, paths };
}

test("normaliza telefone e adiciona código do Brasil quando necessário", () => {
  assert.equal(sanitizePhone("(19) 99824-0000"), "5519998240000");
  assert.equal(sanitizePhone("+55 19 99824-0000"), "5519998240000");
  assert.equal(sanitizePhone(""), "");
});

test("capitaliza nome e limita em no máximo duas palavras", () => {
  assert.equal(formatNameForMessage("maria eduarda silva extra"), "Maria Eduarda");
  assert.equal(formatNameForMessage("JOÃO"), "João");
  assert.equal(formatNameForMessage("ana-maria exemplo"), "Ana-Maria Exemplo");
});

test("exige as colunas obrigatórias do RCF no CSV", () => {
  const { paths } = createFixture({ csv: "Maria,19998240000\n" });

  assert.throws(
    () => loadCsv(paths.csv),
    /colunas obrigatórias ausentes: nome, telefone, conta/,
  );
});

test("substitui variável ausente por vazio e permite registrar aviso", () => {
  const missing = [];
  const result = applyTemplate("Olá ${nome}. ${inexistente}", { nome: "ana maria silva" }, {
    onMissingVariable: (field) => missing.push(field),
  });

  assert.equal(result, "Olá Ana Maria. ");
  assert.deepEqual(missing, ["inexistente"]);
});

test("interpreta notação markdown de anexo preservando a ordem", () => {
  const parts = parseTemplateParts("Antes\n![](arquivo.pdf)\nDepois");

  assert.deepEqual(parts, [
    { type: "text", value: "Antes\n" },
    { type: "media", source: "arquivo.pdf", raw: "![](arquivo.pdf)" },
    { type: "text", value: "\nDepois" },
  ]);
});

test("combina anexo no início ou final com legenda", () => {
  assert.deepEqual(
    buildSendPlan(parseTemplateParts("Texto\n![](arquivo.pdf)")),
    [
      {
        caption: "Texto",
        source: "arquivo.pdf",
        type: "media",
        raw: "![](arquivo.pdf)",
      },
    ],
  );

  assert.deepEqual(
    buildSendPlan(parseTemplateParts("![](arquivo.pdf)\nTexto")),
    [
      {
        caption: "Texto",
        source: "arquivo.pdf",
        type: "media",
        raw: "![](arquivo.pdf)",
      },
    ],
  );
});

test("pré-validação cria arquivos de auditoria sem iniciar WhatsApp", () => {
  const { paths } = createFixture();
  const result = validateRuntimeFiles(paths, { checkBrowser: false });

  assert.equal(result.clientesCount, 1);
  assert.equal(fs.existsSync(paths.sent), true);
  assert.equal(fs.existsSync(paths.errors), true);
  assert.equal(fs.existsSync(paths.skipped), true);
  assert.equal(fs.existsSync(paths.warnings), true);
});

test("carrega enviados ignorando o cabeçalho de auditoria", () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.writeFileSync(
    paths.sent,
    "telefone;mensagem_hash;data_hora\n5519998240000;abc;2026-06-23\n",
  );

  assert.deepEqual([...loadAlreadySent(paths.sent)], ["5519998240000"]);
  assert.deepEqual(loadSentRecords(paths.sent), [
    {
      dataHora: "2026-06-23",
      mensagemHash: "abc",
      telefone: "5519998240000",
    },
  ]);
});

test("não envia duplicado e não revalida número já enviado", async () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  const template = fs.readFileSync(paths.template, "utf8");
  const { hash } = getTemplateFingerprint(template);
  fs.writeFileSync(
    paths.sent,
    `telefone;mensagem_hash;data_hora\n5519998240000;${hash};${new Date().toISOString()}\n`,
  );

  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return { _serialized: `${phone}@c.us` };
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  await processCampaign(client, paths);

  assert.deepEqual(calls, []);
  assert.match(fs.readFileSync(paths.skipped, "utf8"), /JA_ENVIADO_MENSAGEM_SIMILAR/);
  assert.match(fs.readFileSync(paths.skipped, "utf8"), /Mensagem similar/);
});

test("force resend ignora histórico de enviados nessa execução", async () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  const template = fs.readFileSync(paths.template, "utf8");
  const { hash } = getTemplateFingerprint(template);
  fs.writeFileSync(
    paths.sent,
    `telefone;mensagem_hash;data_hora\n5519998240000;${hash};${new Date().toISOString()}\n`,
  );

  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return { _serialized: `${phone}@c.us` };
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  await processCampaign(client, paths, { forceResend: true });

  assert.deepEqual(calls, [
    ["getNumberId", "5519998240000"],
    ["sendMessage", "5519998240000@c.us", "Olá Maria, conta 12345. "],
  ]);
});

test("resetSentLog limpa a lista de enviados preservando cabeçalho", () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.writeFileSync(
    paths.sent,
    "telefone;mensagem_hash;data_hora\n5519998240000;abc;2026-06-23\n",
  );

  resetSentLog(paths.sent);

  assert.equal(
    fs.readFileSync(paths.sent, "utf8"),
    "telefone;mensagem_hash;data_hora\n",
  );
});

test("mensagem nativa diferente em mais de 10% permite novo envio", async () => {
  const { paths } = createFixture({
    template: "Mensagem totalmente nova para ${nome}.",
  });
  fs.mkdirSync(paths.logsDir, { recursive: true });
  const previous = getTemplateFingerprint("Conteúdo anterior bem diferente.");

  fs.writeFileSync(
    paths.sent,
    `telefone;mensagem_hash;data_hora\n5519998240000;${previous.hash};${new Date().toISOString()}\n`,
  );
  fs.writeFileSync(
    paths.messageCache,
    JSON.stringify({
      messages: {
        [previous.hash]: {
          content: previous.content,
          createdAt: new Date().toISOString(),
          hash: previous.hash,
        },
      },
      version: 1,
    }),
  );

  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return { _serialized: `${phone}@c.us` };
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  await processCampaign(client, paths);

  assert.deepEqual(calls, [
    ["getNumberId", "5519998240000"],
    ["sendMessage", "5519998240000@c.us", "Mensagem totalmente nova para Maria."],
  ]);
});

test("mensagem igual pode reenviar após o prazo configurado", async () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  const template = fs.readFileSync(paths.template, "utf8");
  const { hash } = getTemplateFingerprint(template);
  const oldDate = new Date(Date.now() - 49 * 3600000).toISOString();

  fs.writeFileSync(
    paths.sent,
    `telefone;mensagem_hash;data_hora\n5519998240000;${hash};${oldDate}\n`,
  );

  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return { _serialized: `${phone}@c.us` };
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  await processCampaign(client, paths);

  assert.deepEqual(calls, [
    ["getNumberId", "5519998240000"],
    ["sendMessage", "5519998240000@c.us", "Olá Maria, conta 12345. "],
  ]);
});

test("valida existência no WhatsApp antes de enviar", async () => {
  const { paths } = createFixture();
  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return null;
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  validateRuntimeFiles(paths, { checkBrowser: false });
  await processCampaign(client, paths);

  assert.deepEqual(calls, [["getNumberId", "5519998240000"]]);
  assert.match(fs.readFileSync(paths.errors, "utf8"), /NAO_REGISTRADO/);
});

test("envia somente após validação positiva e registra variáveis ausentes", async () => {
  const { paths } = createFixture();
  const calls = [];
  const client = {
    async getNumberId(phone) {
      calls.push(["getNumberId", phone]);
      return { _serialized: `${phone}@c.us` };
    },
    async sendMessage(to, message) {
      calls.push(["sendMessage", to, message]);
    },
  };

  validateRuntimeFiles(paths, { checkBrowser: false });
  await processCampaign(client, paths);

  assert.deepEqual(calls, [
    ["getNumberId", "5519998240000"],
    ["sendMessage", "5519998240000@c.us", "Olá Maria, conta 12345. "],
  ]);
  assert.match(fs.readFileSync(paths.sent, "utf8"), /5519998240000/);
  assert.match(fs.readFileSync(paths.warnings, "utf8"), /VARIAVEL_AUSENTE;extra/);
});

test("envia anexo local no ponto da notação markdown", async () => {
  const { paths } = createFixture();
  const mediaPath = path.join(path.dirname(paths.template), "arquivo.pdf");
  fs.writeFileSync(mediaPath, "conteúdo fictício", "utf8");

  const calls = [];
  const client = {
    async sendMessage(to, content, options) {
      calls.push({
        filename: content && content.filename,
        mimetype: content && content.mimetype,
        options,
        text: typeof content === "string" ? content : undefined,
        to,
      });
    },
  };

  await sendRenderedTemplate(
    client,
    "5511999999999@c.us",
    "Antes\n![](arquivo.pdf)\nDepois",
    paths,
  );

  assert.deepEqual(calls.map((call) => call.text || call.filename), [
    "Antes\n",
    "arquivo.pdf",
    "\nDepois",
  ]);
  assert.equal(calls[1].mimetype, "application/pdf");
  assert.equal(calls[1].options.sendMediaAsDocument, true);
});

test("envia anexo final com texto como legenda da mesma mensagem", async () => {
  const { paths } = createFixture();
  const mediaPath = path.join(path.dirname(paths.template), "arquivo.pdf");
  fs.writeFileSync(mediaPath, "conteúdo fictício", "utf8");

  const calls = [];
  const client = {
    async sendMessage(to, content, options) {
      calls.push({
        filename: content && content.filename,
        options,
        text: typeof content === "string" ? content : undefined,
        to,
      });
    },
  };

  await sendRenderedTemplate(
    client,
    "5511999999999@c.us",
    "Texto da mensagem\n![](arquivo.pdf)",
    paths,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].filename, "arquivo.pdf");
  assert.equal(calls[0].options.caption, "Texto da mensagem");
  assert.equal(calls[0].options.sendMediaAsDocument, true);
});

test("envia anexo inicial com texto como legenda da mesma mensagem", async () => {
  const { paths } = createFixture();
  const mediaPath = path.join(path.dirname(paths.template), "imagem.png");
  fs.writeFileSync(mediaPath, "conteúdo fictício", "utf8");

  const calls = [];
  const client = {
    async sendMessage(to, content, options) {
      calls.push({
        filename: content && content.filename,
        options,
        text: typeof content === "string" ? content : undefined,
        to,
      });
    },
  };

  await sendRenderedTemplate(
    client,
    "5511999999999@c.us",
    "![](imagem.png)\nTexto da mensagem",
    paths,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].filename, "imagem.png");
  assert.equal(calls[0].options.caption, "Texto da mensagem");
  assert.equal(calls[0].options.sendMediaAsDocument, false);
});

test("baixa URL de anexo uma única vez e reutiliza o cache", async () => {
  const { paths } = createFixture();
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from("imagem fictícia"));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/anexo.png`;
    const client = {
      async sendMessage() {},
    };

    await sendRenderedTemplate(client, "5511999999999@c.us", `![](${url})`, paths);
    await sendRenderedTemplate(client, "5511999999999@c.us", `![](${url})`, paths);

    assert.equal(requests, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
