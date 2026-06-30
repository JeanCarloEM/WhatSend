// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const RELEASE_NOTES_RELATIVE_PATH = "dist/release-notes.md";
const RELEASE_NOTES_PATH = path.join(ROOT_DIR, "dist", "release-notes.md");
const ZERO_SHA = /^0+$/u;

function generateReleaseNotes(startHash, endHash, options = {}) {
  const git = options.git ?? runGit;
  const start = resolveCommit(startHash, git);
  const end = resolveCommit(endHash, git);
  const messages = getCommitMessages(start, end, git);
  const notes = buildReleaseNotesMarkdown(start, end, messages);

  validateReleaseNotesContent(notes, { expectedEnd: end, expectedStart: start });

  fs.mkdirSync(path.dirname(RELEASE_NOTES_PATH), { recursive: true });
  fs.writeFileSync(RELEASE_NOTES_PATH, notes, "utf8");

  return notes;
}

function buildReleaseNotesMarkdown(startHash, endHash, commitMessages) {
  const categorized = categorizeCommitMessages(commitMessages);

  return [
    "# Rastreio",
    "",
    `\`${startHash} → ${endHash}\``,
    "",
    "# Melhorias",
    "",
    ...formatSectionItems(categorized.improvements, "Nenhuma melhoria relevante para o usuário final."),
    "",
    "# Correções",
    "",
    ...formatSectionItems(categorized.fixes, "Nenhuma correção relevante para o usuário final."),
    "",
  ].join("\n");
}

function categorizeCommitMessages(commitMessages) {
  const fixes = [];
  const improvements = [];
  const seen = new Set();

  for (const message of commitMessages) {
    const summary = normalizeCommitSummary(message);

    if (!summary || isTrivialCommit(summary)) {
      continue;
    }

    const item = toUserFacingItem(summary);
    const key = item.toLocaleLowerCase("pt-BR");

    if (!item || seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (isFixCommit(summary)) {
      fixes.push(item);
    } else {
      improvements.push(item);
    }
  }

  return { fixes, improvements };
}

function validateReleaseNotesContent(content, options = {}) {
  const normalized = String(content || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headings = lines.filter((line) => line.startsWith("# "));
  const expectedHeadings = ["# Rastreio", "# Melhorias", "# Correções"];

  if (headings.join("\n") !== expectedHeadings.join("\n")) {
    throw new Error("release-notes.md deve conter exatamente os títulos: # Rastreio, # Melhorias e # Correções.");
  }

  const traceSection = getSection(normalized, "# Rastreio", "# Melhorias");

  if (!/`[0-9a-f]{7,40} → [0-9a-f]{7,40}`/iu.test(traceSection)) {
    throw new Error("release-notes.md deve informar o intervalo no formato `commit A → commit B`.");
  }

  if (options.expectedStart && !traceSection.includes(shortHash(options.expectedStart))) {
    throw new Error("release-notes.md não contém o hash inicial esperado.");
  }

  if (options.expectedEnd && !traceSection.includes(shortHash(options.expectedEnd))) {
    throw new Error("release-notes.md não contém o hash final esperado.");
  }

  for (const heading of ["# Melhorias", "# Correções"]) {
    const section = getSection(normalized, heading);

    if (!section.trim()) {
      throw new Error(`${heading} deve conter ao menos um item ou declaração explícita.`);
    }
  }

  return true;
}

function validateReleaseNotesCommitPolicyFromStaged(options = {}) {
  const git = options.git ?? runGit;
  const files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]).split(/\r?\n/u);
  return validateChangedFilesForSingleCommit(files);
}

function validateReleaseNotesCommitPolicyFromCommits(commits, options = {}) {
  const git = options.git ?? runGit;

  for (const commit of commits) {
    const files = git([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "--root",
      commit,
    ]).split(/\r?\n/u);

    validateChangedFilesForSingleCommit(files, commit);
  }

  return true;
}

function resolveGithubCommits(options = {}) {
  const git = options.git ?? runGit;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME || "";

  if (!eventPath || !fs.existsSync(eventPath)) {
    return resolveCommitRange(process.env.GITHUB_BASE_SHA, process.env.GITHUB_SHA, git);
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    try {
      return resolveCommitRange(event.pull_request?.base?.sha, event.pull_request?.head?.sha, git);
    } catch {
      return resolveCommitRange(event.pull_request?.base?.sha, "HEAD", git);
    }
  }

  return resolveCommitRange(event.before, event.after || process.env.GITHUB_SHA, git);
}

function resolveCommitRange(base, head, git = runGit) {
  const resolvedHead = resolveCommit(head || "HEAD", git);

  if (!base || ZERO_SHA.test(base)) {
    return [resolvedHead];
  }

  const resolvedBase = resolveCommit(base, git);
  const output = git(["rev-list", "--reverse", `${resolvedBase}..${resolvedHead}`]);
  const commits = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);

  return commits.length > 0 ? commits : [resolvedHead];
}

function validateChangedFilesForSingleCommit(files, commit = "") {
  const normalizedFiles = files
    .map(normalizeGitPath)
    .filter(Boolean);

  if (!normalizedFiles.includes(RELEASE_NOTES_RELATIVE_PATH)) {
    return true;
  }

  if (normalizedFiles.length === 1) {
    return true;
  }

  throw new Error(buildMixedCommitError(normalizedFiles, commit));
}

function buildMixedCommitError(files, commit = "") {
  const commitLabel = commit ? ` no commit ${shortHash(commit)}` : "";
  const fileList = files.map((file) => `- ${file}`).join("\n");

  return [
    `Commit inválido${commitLabel}: ${RELEASE_NOTES_RELATIVE_PATH} deve estar em commit exclusivo.`,
    "",
    "Motivo: release-notes.md representa a criação formal de uma release e não pode ser misturado com código, documentação ou configuração.",
    "",
    "Arquivos detectados:",
    fileList,
    "",
    "Para remover apenas release-notes.md do commit local antes de confirmar, preservando as demais alterações staged:",
    "",
    "Windows PowerShell:",
    `  git restore --staged -- ${RELEASE_NOTES_RELATIVE_PATH}`,
    "",
    "Linux/macOS:",
    `  git restore --staged -- ${RELEASE_NOTES_RELATIVE_PATH}`,
    "",
    "Se o commit já foi criado localmente e ainda não foi enviado:",
    "  git reset --soft HEAD~1",
    `  git restore --staged -- ${RELEASE_NOTES_RELATIVE_PATH}`,
    "  git commit -m \"mensagem das alterações\"",
    `  git add ${RELEASE_NOTES_RELATIVE_PATH}`,
    "  git commit -m \"release: registra notas da versão\"",
  ].join("\n");
}

function getCommitMessages(startHash, endHash, git = runGit) {
  const output = git(["log", "--reverse", "--format=%B%x1e", `${startHash}..${endHash}`]);

  return output
    .split("\x1e")
    .map((message) => message.trim())
    .filter(Boolean);
}

function resolveCommit(hash, git = runGit) {
  const value = String(hash || "").trim();

  if (!value) {
    throw new Error("Informe hash inicial e hash final. Exemplo: npm run release-notes:generate -- A B");
  }

  return git(["rev-parse", "--verify", `${value}^{commit}`]).trim();
}

function runGit(args, options = {}) {
  const result = childProcess.spawnSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    throw new Error(stderr || `Comando git falhou: git ${args.join(" ")}`);
  }

  return String(result.stdout || "");
}

function normalizeCommitSummary(message) {
  return String(message || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function isTrivialCommit(summary) {
  const normalized = summary.toLocaleLowerCase("pt-BR");

  return [
    /^wip\b/u,
    /^merge\b/u,
    /^docs?:/u,
    /^chore:/u,
    /^style:/u,
    /continue\.ia/u,
    /release-notes\.md/u,
    /^ajuste de formata/u,
  ].some((pattern) => pattern.test(normalized));
}

function isFixCommit(summary) {
  return /(^|\b)(fix|corrige|corre[çc][aã]o|erro|falha|bug|robustez)(\b|:)/iu.test(summary);
}

function toUserFacingItem(summary) {
  let cleaned = summary
    .replace(/^[a-f0-9]{7,40}\s+/iu, "")
    .replace(/^(melhoria|fix|corre[çc][aã]o|feat|feature|bugfix|test|teste)\s*:\s*/iu, "")
    .replace(/\s+/gu, " ")
    .trim();

  cleaned = cleaned
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^(teste|test|docs?|rcf)\s*:/iu.test(part))
    .filter((part) => !/\b(RCF documenta|cobertura automatizada|suite automatizada)\b/iu.test(part))
    .join("; ")
    .trim();

  cleaned = normalizeKnownPortugueseTypos(cleaned);

  if (!cleaned) {
    return "";
  }

  const capitalized = cleaned.charAt(0).toLocaleUpperCase("pt-BR") + cleaned.slice(1);
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized.replace(/[;\s]+$/u, "")}.`;
}

function normalizeKnownPortugueseTypos(value) {
  return String(value || "")
    .replace(/\buim\b/giu, "um")
    .replace(/\brelase\b/giu, "release")
    .replace(/\bautm[aá]tica\b/giu, "automática")
    .replace(/\bautm[aá]tico\b/giu, "automático")
    .replace(/\balterarar\b/giu, "alternar")
    .replace(/\bconte[úu]do release\b/giu, "conteúdo de release")
    .replace(/\bvalidado de forma autom[aá]tica pelo test\b/giu, "validado por testes automatizados")
    .replace(/\bfix de problemas\b/giu, "correções de problemas")
    .replace(/;\s*fix:\s*/giu, "; corrige ")
    .replace(/;\s*corrige\s+(evita|reduz|aumenta|adiciona|exibe|mant[ée]m)\b/giu, "; $1")
    .replace(/\bFix de instala[çc][aã]o\/start\b/giu, "correções de instalação e inicialização");
}

function formatSectionItems(items, fallback) {
  const values = items.length > 0 ? items : [fallback];
  return values.map((item) => `- ${item}`);
}

function getSection(content, heading, nextHeading = "") {
  const start = content.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const bodyStart = start + heading.length;
  const end = nextHeading ? content.indexOf(nextHeading, bodyStart) : content.length;

  return content.slice(bodyStart, end === -1 ? content.length : end).trim();
}

function normalizeGitPath(value) {
  return String(value || "").trim().replace(/\\/gu, "/");
}

function shortHash(hash) {
  return String(hash || "").trim().slice(0, 12);
}

module.exports = {
  RELEASE_NOTES_PATH,
  RELEASE_NOTES_RELATIVE_PATH,
  buildMixedCommitError,
  buildReleaseNotesMarkdown,
  categorizeCommitMessages,
  generateReleaseNotes,
  resolveCommitRange,
  resolveGithubCommits,
  validateChangedFilesForSingleCommit,
  validateReleaseNotesCommitPolicyFromCommits,
  validateReleaseNotesCommitPolicyFromStaged,
  validateReleaseNotesContent,
};
