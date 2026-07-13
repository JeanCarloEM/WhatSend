// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

module.exports = {
  ...require("./app"),
  ...require("./browser"),
  ...require("./campaign"),
  ...require("./cli"),
  ...require("./config"),
  ...require("./data"),
  ...require("./expression"),
  ...require("./env-settings"),
  ...require("./gui"),
  ...require("./gui-icons"),
  ...require("./logs"),
  ...require("./media"),
  ...require("./media-capabilities"),
  ...require("./notice"),
  ...require("./runtime"),
  ...require("./sessions"),
  ...require("./status"),
  ...require("./template"),
  ...require("./tracking"),
  ...require("./utils"),
  ...require("./whatsapp"),
};
