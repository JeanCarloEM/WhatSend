const LICENSE_LOCAL_PATH = "LICENSE";
const LICENSE_URL = "https://www.mozilla.org/MPL/2.0/";
const AUTHOR = "JeanCarloEM.com";
const LICENSE_NAME = "Mozilla Public License 2.0";

const DISCLAIMER =
  "Disponibilizado como está, sem garantias expressas, implícitas, legais ou de adequação a finalidade específica; o uso é de responsabilidade exclusiva do usuário, sem caráter vinculante e sem assunção de responsabilidade civil, criminal, trabalhista, regulatória ou de qualquer outra natureza pelo autor.";

function buildNoticeText() {
  return [
    `Autor: ${AUTHOR}`,
    `Licença: ${LICENSE_NAME} (${LICENSE_LOCAL_PATH}; ${LICENSE_URL})`,
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
  buildNoticeText,
  printStartupNotice,
};
