// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const fs = require("fs");
const path = require("path");
const { VERSION_FILE_NAME } = require("./release-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");

function main(argv = process.argv.slice(2), env = process.env) {
  const metadataPath = resolveMetadataPath(argv);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const outputs = {
    artifact_name: metadata.artifactName,
    channel: metadata.channel,
    metadata_path: path.relative(ROOT_DIR, metadataPath).replace(/\\/gu, "/"),
    release_title: `WhatSend ${metadata.tagName}`,
    tag_name: metadata.tagName,
    version: metadata.version,
    zip_path: `dist/${metadata.artifactName}`,
  };
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);

  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  } else {
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

function resolveMetadataPath(argv) {
  const metadataIndex = argv.indexOf("--metadata");

  if (metadataIndex !== -1 && argv[metadataIndex + 1]) {
    return path.resolve(ROOT_DIR, argv[metadataIndex + 1]);
  }

  return path.join(ROOT_DIR, "dist", VERSION_FILE_NAME);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Falha ao imprimir outputs de release: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  resolveMetadataPath,
};
