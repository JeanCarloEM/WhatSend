process.env.MIN_DELAY_MS = "0";
process.env.MAX_DELAY_MS = "0";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyTemplate,
  formatNameForMessage,
  loadAlreadySent,
  loadCsv,
  processCampaign,
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
    warnings: path.join(root, "logs", "avisos.csv"),
    auth: path.join(root, ".wwebjs_auth"),
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

test("pré-validação cria arquivos de auditoria sem iniciar WhatsApp", () => {
  const { paths } = createFixture();
  const result = validateRuntimeFiles(paths, { checkBrowser: false });

  assert.equal(result.clientesCount, 1);
  assert.equal(fs.existsSync(paths.sent), true);
  assert.equal(fs.existsSync(paths.errors), true);
  assert.equal(fs.existsSync(paths.warnings), true);
});

test("carrega enviados ignorando o cabeçalho de auditoria", () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.writeFileSync(paths.sent, "telefone;data_hora\n5519998240000;2026-06-23\n");

  assert.deepEqual([...loadAlreadySent(paths.sent)], ["5519998240000"]);
});

test("não envia duplicado e não revalida número já enviado", async () => {
  const { paths } = createFixture();
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.writeFileSync(paths.sent, "telefone;data_hora\n5519998240000;2026-06-23\n");

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
