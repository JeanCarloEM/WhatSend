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
  parseWorkFronts,
  renderImplementationsStatus,
} = require("../scripts/generate-agents-status");
const {
  collectRemoteGovernanceFiles,
  compareRemoteFiles,
  normalizeGovernanceRelativePath,
  parseArgs,
} = require("../scripts/update-agents");

test("agents:status gera resumo HTML a partir de continue.ia sem detalhar memoria completa", () => {
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

test("agents:update normaliza paths legados de cenario sem capturar arquivos locais", () => {
  assert.deepEqual(parseArgs(["--check"]), {
    check: true,
    dryRun: false,
    force: false,
  });
  assert.equal(normalizeGovernanceRelativePath("./agents/webPageLike.md"), ".agents/webPageLike.md");
  assert.equal(normalizeGovernanceRelativePath("./.agents/webPageLike.md"), ".agents/webPageLike.md");
});

test("agents:update compara apenas arquivos gerenciados pelo lock anterior", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "whatsender-agents-test-"));

  try {
    fs.mkdirSync(path.join(rootDir, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "AGENTS.md"), "local\n", "utf8");
    fs.writeFileSync(path.join(rootDir, ".agents", "continue.ia"), "nao gerenciado\n", "utf8");

    const changes = compareRemoteFiles(rootDir, [
      {
        content: Buffer.from("remote\n"),
        relativePath: "AGENTS.md",
      },
    ], {
      managedFiles: [
        { path: "AGENTS.md" },
        { path: ".agents/oldScenario.md" },
      ],
    });

    assert.deepEqual(changes.map((change) => [change.action, change.relativePath.replace(/\\/gu, "/")]), [
      ["remove", ".agents/oldScenario.md"],
      ["update", "AGENTS.md"],
    ]);
  } finally {
    fs.rmSync(rootDir, { force: true, recursive: true });
  }
});

test("agents:update coleta AGENTS e cenarios referenciados", () => {
  const remoteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whatsender-agents-remote-"));

  try {
    fs.mkdirSync(path.join(remoteRoot, ".agents"), { recursive: true });
    fs.writeFileSync(
      path.join(remoteRoot, "AGENTS.md"),
      "# AGENTS.md\n\n- [Web](./.agents/webPageLike.md)\n",
      "utf8",
    );
    fs.writeFileSync(path.join(remoteRoot, ".agents", "webPageLike.md"), "# cenario\n", "utf8");

    const files = collectRemoteGovernanceFiles(remoteRoot).map((entry) => entry.relativePath.replace(/\\/gu, "/"));

    assert.deepEqual(files.sort(), [
      ".agents/webPageLike.md",
      "AGENTS.md",
    ]);
  } finally {
    fs.rmSync(remoteRoot, { force: true, recursive: true });
  }
});
