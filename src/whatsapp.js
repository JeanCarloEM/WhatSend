const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const { PATHS } = require("./config");
const { buildPuppeteerConfig, getWhatsAppClientId } = require("./browser");
const { processCampaign } = require("./campaign");
const { updateSessionPhone } = require("./sessions");

function createWhatsAppClient(paths = PATHS) {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: paths.auth,
      clientId: paths.sessionClientId || getWhatsAppClientId(),
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
    updateSessionPhone(paths.activeSession, readClientPhone(client));

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

function readClientPhone(client) {
  const wid =
    client &&
    client.info &&
    client.info.wid &&
    (client.info.wid.user || client.info.wid._serialized);

  return String(wid || "").replace(/\D/g, "");
}

module.exports = {
  createWhatsAppClient,
  readClientPhone,
  registerClientHandlers,
};
