// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

// RCF operacional: consulte ./RCF.md.
require("./src/env-settings").applyStartupEnvSettings(__dirname, process.argv.slice(2));
const app = require("./src");

if (require.main === module) {
  app.main();
}

module.exports = app;
