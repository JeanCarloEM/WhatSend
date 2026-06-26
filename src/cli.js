const { isListFilterExpression } = require("./data");
const { stripWrappingQuotes } = require("./utils");

function readOptionValue(argv, index) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Opção ${argv[index]} requer um valor.`);
  }

  return { nextIndex: index + 1, value };
}

function readListOptionValue(argv, index) {
  const first = argv[index + 1];

  if (!first || first.startsWith("--")) {
    throw new Error(`Opção ${argv[index]} requer um valor.`);
  }

  const operator = stripWrappingQuotes(argv[index + 2] || "");
  const third = argv[index + 3];

  if (
    ["=", "!=", "<", ">", "<=", ">="].includes(operator) &&
    third &&
    !third.startsWith("--")
  ) {
    return {
      nextIndex: index + 3,
      value: `${first}${operator}${third}`,
    };
  }

  return { nextIndex: index + 1, value: first };
}

function parseExecutionOptions(argv = process.argv.slice(2)) {
  const positionalArgs = [];
  const options = {
    check: false,
    checkCsvPath: undefined,
    checkTemplatePath: undefined,
    forceResend: false,
    gui: false,
    help: false,
    listArg: undefined,
    newSessionName: undefined,
    removeSession: undefined,
    resetSent: false,
    renameSession: undefined,
    session: undefined,
    templateName: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg.startsWith("--check-csv=") || arg.startsWith("--check-clientes=")) {
      options.checkCsvPath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--check-csv", "--check-clientes"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.checkCsvPath = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg.startsWith("--check-template=") || arg.startsWith("--check-modelo=")) {
      options.checkTemplatePath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--check-template", "--check-modelo"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.checkTemplatePath = result.value;
      index = result.nextIndex;
      continue;
    }

    if (["--gui", "--interface", "--tela"].includes(arg)) {
      options.gui = true;
      continue;
    }

    if (["--force-resend", "--reenviar", "--no-skip-sent"].includes(arg)) {
      options.forceResend = true;
      continue;
    }

    if (["--help", "-h"].includes(arg)) {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--session=") || arg.startsWith("--sessao=")) {
      options.session = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--session", "--sessao"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.session = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg.startsWith("--new-session=") || arg.startsWith("--nova-sessao=")) {
      options.newSessionName = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--new-session", "--nova-sessao"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.newSessionName = result.value;
      index = result.nextIndex;
      continue;
    }

    if (["--rename-session", "--renomear-sessao"].includes(arg)) {
      const from = readOptionValue(argv, index);
      const to = readOptionValue(argv, from.nextIndex);
      options.renameSession = { from: from.value, to: to.value };
      index = to.nextIndex;
      continue;
    }

    if (arg.startsWith("--remove-session=") || arg.startsWith("--remover-sessao=")) {
      options.removeSession = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--remove-session", "--remover-sessao"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.removeSession = result.value;
      index = result.nextIndex;
      continue;
    }

    if (
      [
        "--reset-sent",
        "--reset-enviados",
        "--clear-sent",
        "--clear-enviados",
        "--limpar-enviados",
      ].includes(arg)
    ) {
      options.resetSent = true;
      continue;
    }

    if (arg.startsWith("--modelo=") || arg.startsWith("--model=")) {
      options.templateName = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--modelo", "--model"].includes(arg)) {
      const result = readOptionValue(argv, index);
      options.templateName = result.value;
      index = result.nextIndex;
      continue;
    }

    if (
      arg.startsWith("--lista=") ||
      arg.startsWith("--list=") ||
      arg.startsWith("--csv=")
    ) {
      options.listArg = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (["--lista", "--list", "--csv"].includes(arg)) {
      const result = readListOptionValue(argv, index);
      options.listArg = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Opção desconhecida: ${arg}`);
    }

    positionalArgs.push(arg);
  }

  applyPositionalExecutionArgs(options, positionalArgs);

  if (!options.check && (options.checkCsvPath || options.checkTemplatePath)) {
    throw new Error("Use --check-csv e --check-template apenas junto com --check.");
  }

  return options;
}

function applyPositionalExecutionArgs(options, positionalArgs) {
  if (positionalArgs.length > 2) {
    throw new Error(
      `Use no máximo um modelo e uma lista por execução. Recebidos: ${positionalArgs.join(", ")}`,
    );
  }

  if (positionalArgs.length === 0) {
    return;
  }

  for (const arg of positionalArgs) {
    if (!options.listArg && isListFilterExpression(arg)) {
      options.listArg = arg;
      continue;
    }

    if (!options.templateName) {
      options.templateName = arg;
      continue;
    }

    if (!options.listArg) {
      options.listArg = arg;
      continue;
    }

    throw new Error(
      `Argumento posicional inesperado: ${arg}. Use no máximo um modelo e uma lista.`,
    );
  }
}

function printHelp() {
  console.log(`Uso:
  npm start
  node main.js [opções] [modelo] [lista]

Opções:
  --check             Valida arquivos e configuração sem enviar.
  --check-csv PATH    Usa um CSV específico somente na validação --check.
  --check-template PATH
                      Usa um Markdown específico somente na validação --check.
  --gui               Abre a interface gráfica local após autenticar.
  --force-resend      Ignora logs/enviados.csv nesta execução e reenvia.
  --session VALOR     Usa uma sessão pelo nome, id ou últimos dígitos do telefone.
  --new-session NOME  Cria uma nova sessão e força nova autenticação.
  --rename-session ANTIGO NOVO
                      Renomeia uma sessão salva e encerra.
  --remove-session VALOR
                      Remove uma sessão salva pelo nome, id ou últimos dígitos.
  --lista VALOR       Usa ./listas/VALOR.csv ou filtra clientes.csv se contiver = ou !=.
  --modelo VALOR      Usa ./modelos/VALOR.md.
  --reset-sent        Limpa logs/enviados.csv antes de iniciar.
  --clear-sent        Alias de --reset-sent.
  --reenviar          Alias de --force-resend.
  --reset-enviados    Alias de --reset-sent.
  --help              Mostra esta ajuda.

Modelo e lista:
  O primeiro argumento posicional é o modelo em ./modelos.
  O segundo argumento posicional é a lista em ./listas.
  Se a lista contiver = ou !=, ela vira filtro sobre ./clientes.csv.

Exemplos:
  node main.js faturamento lista_exemplo
  node main.js --lista lista_exemplo
  node main.js faturamento "status=ativo"`);
}

module.exports = {
  parseExecutionOptions,
  printHelp,
};
