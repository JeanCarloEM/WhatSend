// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyStartupEnvSettings,
  getEnvSettingsSnapshot,
  renderGuiHtml,
  resolveGuiIconKey,
  saveEnvSettings,
} = require("../main");

test("GUI usa Font Awesome por sprite, hints e toolbar integrada", () => {
  const html = renderGuiHtml();

  assert.match(html, /wa-icon-sprite/);
  assert.match(html, /id="openTemplateButton"/);
  assert.match(html, /id="saveTemplateLocalButton"/);
  assert.match(html, /id="saveTemplateButton"/);
  assert.match(html, /data-hint="Salvar todas as abas em um arquivo \.md separado por \^\^\^/);
  assert.doesNotMatch(html, /<button[^>]*>💾<\/button>/u);
  assert.equal(resolveGuiIconKey("f56d"), "save");
  assert.equal(resolveGuiIconKey("f574"), "open");
  assert.equal(resolveGuiIconKey("f0c7"), "saveLocal");
  assert.equal(resolveGuiIconKey("f0ed"), "cloudDownload");
  assert.ok(html.indexOf('id="saveTemplateLocalButton"') < html.indexOf('id="saveTemplateButton"'));
  assert.ok(html.indexOf('id="saveTemplateButton"') < html.indexOf('id="openTemplateButton"'));
  assert.match(html, /LOCAL_TEMPLATE_STORAGE_KEY/);
  assert.match(html, /header-actions \[data-hint\]:hover::after/);
});

test("configurações ENV persistem por escopo global e sessão", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whatsend-env-"));

  saveEnvSettings(root, "global", "default", {
    MIN_DELAY_MS: "10",
  });
  saveEnvSettings(root, "session", "campanha teste", {
    MAX_DELAY_MS: "20",
  });

  const snapshot = getEnvSettingsSnapshot(root, "campanha-teste");
  assert.equal(snapshot.scopes.global.MIN_DELAY_MS, "10");
  assert.equal(snapshot.scopes.session.MAX_DELAY_MS, "20");

  delete process.env.MAX_DELAY_MS;
  applyStartupEnvSettings(root, ["--session", "campanha teste"]);
  assert.equal(process.env.MAX_DELAY_MS, "20");
});

test("GUI expõe atualização com confirmação explícita", () => {
  const html = renderGuiHtml();
  assert.match(html, /id="updateButton"/);
  assert.match(html, /id="updateOverlay"/);
  assert.match(html, /Confirmar atualização/);
  assert.doesNotMatch(html, /window\.prompt\("Atualizar/u);
  assert.match(html, /\/api\/update/);
  assert.match(html, /incompatibilidades/);
});

test("GUI incorpora anexos com seletor nativo e Data URI", () => {
  const html = renderGuiHtml();
  assert.match(html, /id="embeddedAttachmentInput"/);
  assert.match(html, /readAsDataURL/);
  assert.match(html, /@embed:/);
  assert.match(html, /@@embedded/);
});
