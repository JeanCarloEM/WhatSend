// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseWorkFronts,
  renderImplementationsStatus,
} = require("../scripts/update-agents");

test("agents:update gera resumo HTML a partir de continue.ia sem detalhar memoria completa", () => {
  const fronts = parseWorkFronts([
    "FT-001|nome=Governanca|escopo=Tecnico|status=em_andamento",
    "objetivo=Validar fluxo operacional.",
    "1/1 Etapa atual [em_andamento]",
    "  1/2 Tarefa feita [concluido]",
    "  2/2 Tarefa aberta [pendente]",
  ].join("\n"));
  const markdown = renderImplementationsStatus("continue.ia", fronts);

  assert.equal(fronts.length, 1);
  assert.match(markdown, /<table>/);
  assert.match(markdown, /rowspan="2"/);
  assert.match(markdown, /Validar fluxo operacional\./);
  assert.match(markdown, /Tarefa feita/);
  assert.doesNotMatch(markdown, /decisoes=/);
});
