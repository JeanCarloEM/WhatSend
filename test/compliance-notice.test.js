// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMPLIANCE_NOTICE,
  COMPLIANCE_NOTICE_SUMMARY,
  buildTerminalNoticeBox,
  renderGuiHtml,
} = require("../main");

test("aviso de conformidade é idêntico no terminal e na GUI", () => {
  const box = buildTerminalNoticeBox({ color: false, width: 300 });
  const html = renderGuiHtml();
  const plainHtml = stripTags(html);

  for (const line of COMPLIANCE_NOTICE.split("\n")) {
    const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(box, new RegExp(escaped));
    assert.match(plainHtml, new RegExp(escaped));
  }

  assert.match(html, /<strong>não é afiliado, patrocinado, endossado ou mantido<\/strong>/);
  assert.match(html, /<strong>restrições, bloqueio ou banimento<\/strong>/);
  assert.match(html, /<footer class="global-footer">/);
  assert.match(html, /aria-label="Aviso legal resumido"/);
  assert.match(plainHtml, new RegExp(COMPLIANCE_NOTICE_SUMMARY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /aria-label="Aviso legal completo"/);
});

function stripTags(html) {
  return String(html || "").replace(/<[^>]*>/g, "");
}
