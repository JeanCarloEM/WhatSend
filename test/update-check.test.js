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
  checkUpdates,
  compareVersions,
  createUpdateCheckState,
  discoverGuiTemplates,
} = require("../main");

function createFixtureRoot(version = "0.2.2-beta", whatsappVersion = "1.34.7") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whatsend-update-check-"));
  fs.mkdirSync(path.join(root, "node_modules", "whatsapp-web.js"), { recursive: true });
  fs.mkdirSync(path.join(root, "modelos"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    dependencies: { "whatsapp-web.js": `^${whatsappVersion}` },
    version,
  }), "utf8");
  fs.writeFileSync(path.join(root, "node_modules", "whatsapp-web.js", "package.json"), JSON.stringify({
    version: whatsappVersion,
  }), "utf8");
  return root;
}

test("comparação de versões distingue estável e pré-release sem comparação textual ingênua", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
  assert.equal(compareVersions("^1.34.7", "1.34.8"), -1);
});

test("detecção cobre sem atualização, app, whatsapp-web.js, ambos e cache", async () => {
  const root = createFixtureRoot();
  let calls = 0;
  const requestJson = async (url) => {
    calls += 1;
    if (url.includes("api.github.com")) return { tag_name: "v0.2.2-beta", html_url: "https://example.test/release" };
    return { distTags: { latest: "1.34.7" } };
  };
  const state = createUpdateCheckState({ cacheTtlMs: 60000 });
  const current = await checkUpdates(state, { now: 10, requestJson, rootDir: root });
  const cached = await checkUpdates(state, { now: 20, requestJson, rootDir: root });
  assert.equal(current.updateAvailable, false);
  assert.equal(cached, current);
  assert.equal(calls, 2);

  state.cache = null;
  const both = await checkUpdates(state, {
    force: true,
    now: 70000,
    requestJson: async (url) => url.includes("api.github.com")
      ? { tag_name: "v0.2.3-beta" }
      : { distTags: { latest: "1.35.0" } },
    rootDir: root,
  });
  assert.equal(both.components.app.updateAvailable, true);
  assert.equal(both.components.whatsappWebJs.updateAvailable, true);

  fs.rmSync(root, { force: true, recursive: true });
});

test("detecção registra falha inconclusiva e impede execução concorrente equivalente", async () => {
  const root = createFixtureRoot();
  const state = createUpdateCheckState();
  let calls = 0;
  const slow = (url) => new Promise((resolve, reject) => {
    calls += 1;
    setTimeout(() => {
      if (url.includes("api.github.com")) reject(new Error("offline"));
      else resolve({ distTags: { latest: "1.35.0" } });
    }, 25);
  });
  const first = checkUpdates(state, { requestJson: slow, rootDir: root });
  const second = checkUpdates(state, { requestJson: slow, rootDir: root });
  assert.equal(first, second);
  const result = await first;
  assert.equal(result.components.app.status, "falha_temporaria");
  assert.equal(result.components.whatsappWebJs.updateAvailable, true);
  assert.equal(calls, 3);
  fs.rmSync(root, { force: true, recursive: true });
});

test("descoberta de modelos lê apenas markdown válido em modelos", () => {
  const root = createFixtureRoot();
  fs.mkdirSync(path.join(root, "modelos", "campanha"), { recursive: true });
  fs.writeFileSync(path.join(root, "modelos", "campanha", "a.md"), "Olá\n", "utf8");
  fs.writeFileSync(path.join(root, "modelos", "b.txt"), "ignorar\n", "utf8");
  const result = discoverGuiTemplates({ modelsDir: path.join(root, "modelos"), root });
  assert.equal(result.ok, true);
  assert.equal(result.templates.length, 1);
  assert.equal(result.templates[0].context, "campanha");
  fs.rmSync(root, { force: true, recursive: true });
});
