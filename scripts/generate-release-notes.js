// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const { RELEASE_NOTES_RELATIVE_PATH, generateReleaseNotes } = require("./release-notes-policy");

function main(argv) {
  const [startHash, endHash] = argv;

  if (!startHash || !endHash) {
    throw new Error("Uso: npm run release-notes:generate -- HASH_INICIAL HASH_FINAL");
  }

  generateReleaseNotes(startHash, endHash);
  console.log(`Release notes gerado em ${RELEASE_NOTES_RELATIVE_PATH}`);
  console.log("Lembrete: este arquivo deve ser commitado sozinho.");
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`Falha ao gerar release notes: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
