// Autor: JeanCarloEM.com
// Licenca: Mozilla Public License 2.0
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { runReleaseHook } = require("./.agents/release-hooks");
const { normalizeVersion } = require("./release-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");
const PACKAGE_PATH = path.join(ROOT_DIR, "package.json");
const RELEASE_WORKFLOW = "release.yml";

class UsageError extends Error {}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }

  const version = normalizeVersion(options.version);
  const preflight = inspectPreflight(version, options);
  if (options.dryRun) {
    print({ code: "RELEASE_PUBLISH_DRY_RUN", ...preflight, version });
    return 0;
  }

  assertPreflight(preflight);
  const prepare = runReleaseHook("prepare", { version });
  prepareVersionCommit(version, options);
  run(process.execPath, [resolveNpmCli(), "test"], { timeout: 900000 });
  run(process.execPath, [resolveNpmCli(), "run", "check:test"], { timeout: 900000 });
  const verify = runReleaseHook("verify", { version });
  const triggerCommit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  run("git", ["push", options.remote, options.branch], { timeout: 120000 });
  dispatchRelease(version, options);

  const remote = options.noWatch ? null : waitForRelease(version, triggerCommit, options);
  const published = remote ? runReleaseHook("published", { ...remote, version }) : { executed: false };
  print({
    code: remote ? "RELEASE_PUBLISH_OK" : "RELEASE_TRIGGER_ENVIADO",
    prepare,
    published,
    triggerCommit,
    verify,
    version,
    ...(remote || {}),
  });
  return 0;
}

function parseArgs(argv) {
  const options = {
    branch: process.env.WHATSEND_RELEASE_BRANCH || "dev",
    dryRun: false,
    help: false,
    noWatch: false,
    primary: process.env.WHATSEND_RELEASE_PRIMARY || "main",
    remote: process.env.WHATSEND_RELEASE_REMOTE || "origin",
    version: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--help") options.help = true;
    else if (value === "--no-watch") options.noWatch = true;
    else if (["--branch", "--primary", "--remote"].includes(value)) {
      const key = value.slice(2);
      options[key] = argv[++index] || "";
      if (!options[key]) throw new UsageError(`PARAMETRO_NORMATIVO_AUSENTE:${key}`);
    } else if (value.startsWith("-")) throw new UsageError(`PARAMETRO_INVALIDO:${value}`);
    else if (!options.version) options.version = value;
    else throw new UsageError(`PARAMETRO_INVALIDO:${value}`);
  }
  if (!options.help && !options.version) throw new UsageError("PARAMETRO_NORMATIVO_AUSENTE:version");
  return options;
}

function help() {
  return "Uso: agent:release:publish <versao> [--dry-run] [--no-watch] [--branch <nome>] [--primary <nome>] [--remote <nome>]\n";
}

function inspectPreflight(version, options) {
  const tag = `v${version}`;
  const branch = run("git", ["branch", "--show-current"]).stdout.trim();
  const dirty = run("git", ["status", "--porcelain"]).stdout.trim().split(/\r?\n/u).filter(Boolean);
  const packageVersion = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8")).version;
  return {
    branch,
    dirty,
    expectedBranch: options.branch,
    gh: run("gh", ["auth", "status"], { optional: true }).status === 0,
    localTag: run("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { optional: true }).status === 0,
    packageVersion,
    remoteTag: run("git", ["ls-remote", "--exit-code", "--tags", options.remote, tag], { optional: true, timeout: 120000 }).status === 0,
    tag,
    workflow: fs.existsSync(path.join(ROOT_DIR, ".github", "workflows", RELEASE_WORKFLOW)),
  };
}

function assertPreflight(preflight) {
  if (preflight.branch !== preflight.expectedBranch) throw new Error(`BRANCH_RELEASE_INVALIDA:${preflight.branch || "(vazia)"}`);
  if (preflight.dirty.length) throw new Error(`WORKTREE_NAO_LIMPO:${preflight.dirty.join(",")}`);
  if (!preflight.gh) throw new Error("GH_NAO_AUTENTICADO");
  if (preflight.localTag || preflight.remoteTag) throw new Error(`VERSAO_JA_PUBLICADA:${preflight.tag}`);
  if (!preflight.workflow) throw new Error(`WORKFLOW_RELEASE_AUSENTE:${RELEASE_WORKFLOW}`);
}

function prepareVersionCommit(version, options) {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  if (packageJson.version === version) return;
  packageJson.version = version;
  fs.writeFileSync(PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  run("git", ["add", "--", "package.json"]);
  assertOnlyStaged(["package.json"]);
  run("git", ["commit", "-m", `chore: prepara release v${version}`]);
}

function dispatchRelease(version, options) {
  run("gh", [
    "workflow", "run", RELEASE_WORKFLOW,
    "--ref", options.branch,
    "-f", `version=${version}`,
    "-f", "channel=stable",
    "-f", "confirm_official_release=true",
  ], { timeout: 120000 });
}

function waitForRelease(version, triggerCommit, options) {
  const runId = findRun(triggerCommit, options);
  run("gh", ["run", "watch", runId, "--exit-status"], { timeout: 900000 });
  run("git", ["fetch", "--tags", options.remote, options.branch, options.primary], { timeout: 120000 });
  run("git", ["pull", "--ff-only", options.remote, options.branch], { timeout: 120000 });
  const dev = run("git", ["rev-parse", `${options.remote}/${options.branch}`]).stdout.trim();
  const primary = run("git", ["rev-parse", `${options.remote}/${options.primary}`]).stdout.trim();
  if (dev !== primary) throw new Error(`CONVERGENCIA_REMOTA_PENDENTE:${options.branch}=${dev};${options.primary}=${primary}`);
  const release = JSON.parse(run("gh", [
    "release", "view", `v${version}`,
    "--json", "assets,isDraft,isLatest,isPrerelease,tagName,targetCommitish,url",
  ], { timeout: 120000 }).stdout);
  const assetNames = release.assets.map((asset) => asset.name).sort();
  if (release.tagName !== `v${version}` || release.isDraft || release.isPrerelease || !release.isLatest) throw new Error(`RELEASE_REMOTO_INVALIDO:v${version}`);
  if (release.targetCommitish !== triggerCommit) throw new Error(`TAG_RELEASE_DIVERGENTE:${release.targetCommitish};${triggerCommit}`);
  if (!assetNames.includes(`WhatSend-v${version}.zip`) || !assetNames.includes("whatsend-version.json")) throw new Error("ASSETS_RELEASE_INCOMPLETOS");
  return { primary: options.primary, releaseUrl: release.url, workflowRun: Number(runId) };
}

function findRun(triggerCommit, options) {
  for (const delay of [0, 1000, 3000]) {
    if (delay) sleep(delay);
    const result = run("gh", ["run", "list", "--workflow", RELEASE_WORKFLOW, "--branch", options.branch, "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,headSha"], { optional: true, timeout: 120000 });
    if (result.status === 0) {
      const match = JSON.parse(result.stdout).find((entry) => entry.headSha === triggerCommit);
      if (match) return String(match.databaseId);
    }
  }
  throw new Error(`WORKFLOW_RELEASE_NAO_ENCONTRADO:${triggerCommit}`);
}

function assertOnlyStaged(allowed) {
  const files = run("git", ["diff", "--cached", "--name-only"]).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (!files.length || files.some((file) => !allowed.includes(file))) throw new Error(`STAGING_RELEASE_INVALIDO:${files.join(",")}`);
}

function resolveNpmCli() {
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const npmCli = candidates.find((candidate) => fs.existsSync(candidate));
  if (!npmCli) throw new Error("NPM_CLI_NAO_ENCONTRADO");
  return npmCli;
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { cwd: ROOT_DIR, encoding: "utf8", shell: false, timeout: options.timeout || 30000 });
  if (!options.optional && (result.error || result.status !== 0)) {
    throw new Error(`${command} ${args.join(" ")} falhou: ${result.error ? result.error.message : result.stderr || result.stdout}`);
  }
  return result;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

module.exports = { inspectPreflight, main, parseArgs, resolveNpmCli };
