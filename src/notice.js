const LICENSE_LOCAL_PATH = "LICENSE";
const LICENSE_URL = "https://www.mozilla.org/MPL/2.0/";
const REPOSITORY_URL = "https://github.com/JeanCarloEM/whats";
const AUTHOR = "JeanCarloEM.com";
const LICENSE_NAME = "Mozilla Public License 2.0";

const DISCLAIMER =
  "Este software é fornecido estritamente como está e como disponível, sem garantias expressas, implícitas, legais, comerciais, técnicas, operacionais, de disponibilidade, segurança, conformidade, licitude, não infração ou adequação a qualquer finalidade. O projeto é destinado exclusivamente a usos legítimos, proporcionais e consentidos, como comunicação com clientes reais, assinantes, contatos que autorizaram contato ou públicos próprios e legítimos. O autor é expressamente contrário ao uso massivo, abusivo, enganoso, invasivo, como spam, scraping, assédio, fraude, envio sem consentimento ou qualquer prática que viole leis, termos de serviço, privacidade ou direitos de terceiros. O uso, configuração, conteúdo enviado, destinatários, credenciais, automações e consequências são de responsabilidade exclusiva do usuário. Nada constitui consultoria, serviço gerenciado, vínculo, autorização para uso indevido, promessa de resultado ou assunção de responsabilidade pelo autor, que não responderá por danos, perdas, bloqueios, sanções, incidentes, violações, reclamações ou responsabilidades civis, criminais, trabalhistas, administrativas, regulatórias, contratuais ou de qualquer outra natureza.";

function buildNoticeText() {
  return [
    `Autor: ${AUTHOR}`,
    `Licença: ${LICENSE_NAME} (${LICENSE_LOCAL_PATH}; ${LICENSE_URL})`,
    `Repositório: ${REPOSITORY_URL}`,
    `Disclaimer: ${DISCLAIMER}`,
  ].join("\n");
}

function printStartupNotice() {
  console.log(buildNoticeText());
  console.log("");
}

module.exports = {
  AUTHOR,
  DISCLAIMER,
  LICENSE_LOCAL_PATH,
  LICENSE_NAME,
  LICENSE_URL,
  REPOSITORY_URL,
  buildNoticeText,
  printStartupNotice,
};
