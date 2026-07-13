const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { snapshotUpdate, updatePaths } = require("../scripts/update-project");

test("snapshot de atualização registra auditoria sem copiar dados operacionais", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whatsend-update-test-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0", dependencies: {} }), "utf8");
    fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }), "utf8");
    fs.writeFileSync(path.join(root, "main.js"), "module.exports = {};", "utf8");
    fs.writeFileSync(path.join(root, "clientes.csv"), "nome,telefone", "utf8");
    fs.mkdirSync(path.join(root, ".wwebjs_auth"), { recursive: true });
    fs.writeFileSync(path.join(root, ".wwebjs_auth", "session"), "privado", "utf8");

    const snapshot = snapshotUpdate("dependencies", root);
    const audit = JSON.parse(fs.readFileSync(path.join(snapshot.directory, "audit.json"), "utf8"));

    assert.equal(audit.action, "dependencies");
    assert.equal(fs.existsSync(path.join(snapshot.software, "main.js")), true);
    assert.equal(fs.existsSync(path.join(snapshot.software, "clientes.csv")), false);
    assert.equal(fs.existsSync(path.join(snapshot.software, ".wwebjs_auth")), false);
    assert.equal(updatePaths(root).directory, path.join(root, ".runtime", "updates"));
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
