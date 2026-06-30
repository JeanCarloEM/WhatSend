// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const {
  resolveCommitRange,
  resolveGithubCommits,
  validateReleaseNotesCommitPolicyFromCommits,
  validateReleaseNotesCommitPolicyFromStaged,
} = require("./release-notes-policy");

function main(argv) {
  if (argv.includes("--staged")) {
    validateReleaseNotesCommitPolicyFromStaged();
    return;
  }

  if (argv.includes("--github")) {
    validateReleaseNotesCommitPolicyFromCommits(resolveGithubCommits());
    return;
  }

  const rangeIndex = argv.indexOf("--range");

  if (rangeIndex !== -1) {
    const range = argv[rangeIndex + 1] || "";
    const [base, head] = range.split("..");
    validateReleaseNotesCommitPolicyFromCommits(resolveCommitRange(base, head || "HEAD"));
    return;
  }

  throw new Error("Uso: node scripts/validate-release-notes-policy.js --staged | --github | --range A..B");
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
