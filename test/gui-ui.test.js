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
  createGuiState,
  beginGuiOperation,
  endGuiOperation,
  hasActiveGuiClients,
  hasActiveGuiOperations,
  registerGuiHeartbeat,
  renderGuiHtml,
  resolveGuiIconKey,
  saveEnvSettings,
} = require("../main");

test("GUI usa Font Awesome por sprite, hints e toolbar integrada", () => {
  const html = renderGuiHtml();

  assert.match(html, /wa-icon-sprite/);
  assert.match(html, /id="openTemplateButton"/);
  assert.match(html, /id="newEditionButton"/);
  assert.match(html, /id="openLocalSavesButton"/);
  assert.match(html, /id="saveTemplateLocalButton"/);
  assert.match(html, /id="saveTemplateButton"/);
  assert.match(html, /data-hint="Salvar todas as abas em um arquivo \.md separado por \^\^\^/);
  assert.doesNotMatch(html, /<button[^>]*>💾<\/button>/u);
  assert.equal(resolveGuiIconKey("f56d"), "save");
  assert.equal(resolveGuiIconKey("f574"), "open");
  assert.equal(resolveGuiIconKey("f0c7"), "saveLocal");
  assert.equal(resolveGuiIconKey("f15b"), "newEdition");
  assert.equal(resolveGuiIconKey("f07c"), "folderOpen");
  assert.equal(resolveGuiIconKey("folderOpen"), "folderOpen");
  assert.equal(resolveGuiIconKey("folderOpenRegular"), "folderOpenRegular");
  assert.equal(resolveGuiIconKey("f0ed"), "cloudDownload");
  assert.ok(html.indexOf('id="newEditionButton"') < html.indexOf('id="saveTemplateLocalButton"'));
  assert.ok(html.indexOf('id="newEditionButton"') < html.indexOf('class="toolbar-separator"'));
  assert.ok(html.indexOf('class="toolbar-separator"') < html.indexOf('id="saveTemplateLocalButton"'));
  assert.ok(html.indexOf('id="saveTemplateLocalButton"') < html.indexOf('id="openLocalSavesButton"'));
  assert.ok(html.indexOf('id="openLocalSavesButton"') < html.indexOf('id="templateModelsButton"'));
  assert.ok(html.indexOf('id="templateModelsButton"') < html.indexOf('id="saveTemplateButton"'));
  assert.ok(html.indexOf('id="saveTemplateButton"') < html.indexOf('id="openTemplateButton"'));
  assert.match(html, /id="templateModelsMenu"/);
  assert.match(html, /renderGuiIcon\("folderOpen"\)|wa-icon-folderOpen/);
  assert.match(html, /id="openLocalSavesButton"[\s\S]*wa-icon-folderOpenRegular/);
  assert.match(html, /LEGACY_LOCAL_TEMPLATE_STORAGE_KEY = "whatsend\.template\.local"/);
  assert.match(html, /LOCAL_SAVE_INDEX_KEY = "whatsend\.templateSets\.v1\.index"/);
  assert.match(html, /LOCAL_SAVE_AUTOSAVE_NAME = "\.autosave"/);
  assert.match(html, /LOCAL_SAVE_MAX_NAMED_ITEMS = 10/);
  assert.match(html, /LOCAL_SAVE_MAX_NAMED_ITEMS \+ " salvamentos locais atingido/);
  assert.match(html, /id="localSavesOverlay"/);
  assert.match(html, /function openLocalSavesPanel\(\)/);
  assert.match(html, /function createNewEdition\(\)/);
  assert.match(html, /function autosaveTemplate\(\)/);
  assert.match(html, /header-actions \[data-hint\]:hover::after/);
});

test("GUI emite script de navegador sintaticamente válido", () => {
  const html = renderGuiHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

  assert.ok(scripts.length > 0);
  scripts.forEach((script) => {
    assert.doesNotThrow(() => new Function(script));
  });
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
  assert.match(html, /id="updateStatusList"/);
  assert.match(html, /update-available/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /\/api\/updates\/check/);
  assert.match(html, /Confirmar atualização/);
  assert.doesNotMatch(html, /window\.prompt\("Atualizar/u);
  assert.match(html, /\/api\/update/);
  assert.match(html, /incompatibilidades/);
});

test("GUI organiza modelo e andamento em largura total com log retraível", () => {
  const html = renderGuiHtml();
  assert.match(html, /class="full-card template-card"/);
  assert.match(html, /class="full-card log-card"/);
  assert.match(html, /section \{[\s\S]*min-width: 0;/);
  assert.match(html, /\.wa-toolbar \{[\s\S]*flex-wrap: wrap;/);
  assert.match(html, /@media \(max-width: 860px\)/);
  assert.match(html, /id="logToggleButton"/);
  assert.match(html, /\.log\.expanded/);
  assert.match(html, /visibleItems = logExpanded \? items : items\.slice\(-2\)/);
  assert.doesNotMatch(html, /<aside>/);
});

test("GUI confirma descarte e reseta seleção antes de abrir modelo ou arquivo", () => {
  const html = renderGuiHtml();

  assert.match(html, /function hasUnsavedTemplateChanges\(\)/);
  assert.match(html, /function confirmDiscardUnsavedTemplateChanges\(actionLabel\)/);
  assert.match(html, /ainda não foi salvo localmente nem baixado em arquivo/);
  assert.match(html, /confirmDiscardUnsavedTemplateChanges\("abrir outro arquivo"\)/);
  assert.match(html, /templateFileInput\.value = "";\s*templateFileInput\.click\(\);/);
  assert.match(html, /confirmDiscardUnsavedTemplateChanges\("carregar o modelo selecionado"\)/);
  assert.match(html, /selectedTemplatePath = "";/);
  assert.match(html, /origin: "file"/);
  assert.match(html, /setEditorContent\(normalizeUploadedText\(templateFile\.content\)\)/);
  assert.match(html, /item\.dataset\.templateModelIndex/);
  assert.match(html, /templateModelsMenu\.addEventListener\("pointerdown", handleTemplateModelsMenuSelection\)/);
  assert.match(html, /templateModelsMenu\.addEventListener\("click", handleTemplateModelsMenuSelection\)/);
  assert.match(html, /insideTemplateModels = event\.target === templateModelsButton \|\| templateModelsMenu\.contains\(event\.target\)/);
  assert.match(html, /\.template-menu button:hover,[\s\S]*color: #fff;/);
  assert.match(html, /\.template-menu button:hover small,[\s\S]*color: #fff;/);
  assert.match(html, /templateBlocks = blocks\.length \? blocks : \[""\]/);
  assert.doesNotMatch(html, /if \(!templateFileInput\.files \|\| !templateFileInput\.files\.length\) \{\s*resetTemplateMediaAnalysis\(\);\s*setEditorContent\(""\);/);
});

test("GUI centraliza clientes conectados e operações ativas para encerramento seguro", () => {
  const state = createGuiState();

  assert.equal(hasActiveGuiClients(state), false);
  registerGuiHeartbeat(state, {
    clientId: "cliente-gui-001",
    sessionId: "sessao-gui-001",
  });
  assert.equal(hasActiveGuiClients(state), true);
  assert.equal(hasActiveGuiOperations(state), false);

  const operationId = beginGuiOperation(state, "campaign", { interruptible: false });
  assert.equal(hasActiveGuiOperations(state), true);
  endGuiOperation(state, operationId, "concluido");
  state.busy = false;
  assert.equal(hasActiveGuiOperations(state), false);
});

test("GUI mantém botão de desligar funcional com requisição dedicada", () => {
  const html = renderGuiHtml();

  assert.match(html, /id="shutdownButton"/);
  assert.match(html, /function requestGuiShutdown\(\)/);
  assert.match(html, /fetch\("\/api\/runtime\/stop", \{/);
  assert.match(html, /keepalive: true/);
  assert.match(html, /shutdownButton\.addEventListener\("click", async \(\) => \{/);
  assert.match(html, /await requestGuiShutdown\(\)/);
});

test("GUI incorpora anexos com seletor nativo e Data URI", () => {
  const html = renderGuiHtml();
  assert.match(html, /id="embeddedAttachmentInput"/);
  assert.match(html, /readAsDataURL/);
  assert.match(html, /@embed:/);
  assert.match(html, /@@embedded/);
});
