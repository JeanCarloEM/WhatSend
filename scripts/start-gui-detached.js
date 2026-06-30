// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const child = childProcess.spawn(
  process.execPath,
  [path.join(ROOT_DIR, "main.js"), "--gui", ...args],
  {
    cwd: ROOT_DIR,
    detached: true,
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  },
);

child.unref();
console.log(`Interface local iniciada em segundo plano. PID: ${child.pid}`);
