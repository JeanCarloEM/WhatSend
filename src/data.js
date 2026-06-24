const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const { PATHS, REQUIRED_COLUMNS } = require("./config");
const {
  collectReferencedFields,
  evaluateFilterExpression,
  expressionLooksLikeFilter,
  parseExpression,
} = require("./expression");
const {
  buildCaseInsensitiveDataMap,
  getRecordValue,
  normalizeFieldName,
  stripWrappingQuotes,
} = require("./utils");

function readTextFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} não é um arquivo: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function loadTemplate(filePath = PATHS.template) {
  return readTextFile(filePath, "Template");
}

function loadCsv(filePath = PATHS.csv) {
  const csv = readTextFile(filePath, "CSV de clientes");
  let rows;

  try {
    rows = parse(csv, {
      bom: true,
      relax_column_count_less: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new Error(`CSV inválido: ${err.message}`);
  }

  if (rows.length === 0) {
    throw new Error("CSV inválido: arquivo vazio.");
  }

  const header = rows[0].map((column) => String(column).trim());
  const normalizedHeader = header.map(normalizeFieldName);
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !normalizedHeader.includes(normalizeFieldName(column)),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `CSV inválido: colunas obrigatórias ausentes: ${missingColumns.join(", ")}.`,
    );
  }

  try {
    return parse(csv, {
      columns: (columns) => columns.map((column) => String(column).trim()),
      relax_column_count_less: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch (err) {
    throw new Error(`CSV inválido: ${err.message}`);
  }
}

function loadClientes(paths = PATHS) {
  const clientes = loadCsv(paths.csv);

  if (!paths.listFilter) {
    return clientes;
  }

  return applyListFilter(clientes, paths.listFilter);
}

function applyListFilter(clientes, filter) {
  if (!filter) {
    return clientes;
  }

  if (filter.field) {
    const hasColumn = clientes.some((cliente) =>
      buildCaseInsensitiveDataMap(cliente).has(normalizeFieldName(filter.field)),
    );

    if (!hasColumn) {
      throw new Error(`Filtro de lista inválido: coluna não encontrada: ${filter.field}.`);
    }

    return clientes.filter((cliente) => {
      const value = String(getRecordValue(cliente, filter.field) ?? "").trim();
      const expectedValue = String(filter.expectedValue ?? "").trim();

      if (filter.operator === "!=") {
        return value !== expectedValue;
      }

      return value === expectedValue;
    });
  }

  const ast = parseExpression(filter.expression);
  validateListFilterColumns(clientes, ast);

  return clientes.filter((cliente) => evaluateFilterExpression(ast, cliente));
}

function validateListFilterColumns(clientes, ast) {
  const identifiers = collectReferencedFields(ast);
  const availableColumns = new Set();

  for (const cliente of clientes) {
    for (const key of buildCaseInsensitiveDataMap(cliente).keys()) {
      availableColumns.add(key);
    }
  }

  for (const column of identifiers) {
    if (!availableColumns.has(normalizeFieldName(column))) {
      throw new Error(`Filtro de lista inválido: coluna não encontrada: ${column}.`);
    }
  }
}

function resolveModelTemplatePath(templateName, paths = PATHS) {
  const rawName = String(templateName || "")
    .trim()
    .replace(/^["'](.+)["']$/, "$1")
    .trim();

  if (!rawName) {
    return paths.template;
  }

  if (path.isAbsolute(rawName) || rawName.includes("/") || rawName.includes("\\")) {
    throw new Error(
      "Modelo inválido. Informe apenas o nome do arquivo dentro de ./modelos, sem caminho.",
    );
  }

  const ext = path.extname(rawName);

  if (ext && ext.toLocaleLowerCase("pt-BR") !== ".md") {
    throw new Error("Modelo inválido. Use o nome do arquivo sem extensão .md.");
  }

  const modelBaseName = ext ? rawName.slice(0, -ext.length) : rawName;

  if (!modelBaseName || modelBaseName === "." || modelBaseName === "..") {
    throw new Error("Modelo inválido. Informe um nome de arquivo válido.");
  }

  const modelsDir = paths.modelsDir || path.resolve(path.dirname(paths.template), "modelos");
  return path.resolve(modelsDir, `${modelBaseName}.md`);
}

function isListFilterExpression(value) {
  try {
    return expressionLooksLikeFilter(stripWrappingQuotes(value));
  } catch (_) {
    return false;
  }
}

function parseListFilter(value) {
  const expression = stripWrappingQuotes(value);

  if (!isListFilterExpression(expression)) {
    return null;
  }

  const legacyFilter = parseLegacyListFilter(expression);

  if (legacyFilter) {
    return legacyFilter;
  }

  parseExpression(expression);
  return { expression };
}

function parseLegacyListFilter(expression) {
  let quote = "";

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];

    if (quote) {
      if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "!" && expression[index + 1] === "=") {
      return buildLegacyListFilter(expression, index, "!=");
    }

    if (char === "=") {
      return buildLegacyListFilter(expression, index, "=");
    }
  }

  return null;
}

function buildLegacyListFilter(expression, index, operator) {
  if (/[()<>+\-*/]|\|\||&&|\^\^|\$\./u.test(expression)) {
    return null;
  }

  const operatorLength = operator.length;
  const field = stripWrappingQuotes(expression.slice(0, index));
  const expectedValue = stripWrappingQuotes(expression.slice(index + operatorLength));

  if (!field) {
    throw new Error("Filtro de lista inválido. Informe a coluna antes do operador.");
  }

  return {
    expectedValue,
    expression,
    field,
    operator,
  };
}

function resolveListCsvPath(listName, paths = PATHS) {
  const rawName = stripWrappingQuotes(listName);

  if (!rawName) {
    return paths.csv;
  }

  if (path.isAbsolute(rawName) || rawName.includes("/") || rawName.includes("\\")) {
    throw new Error(
      "Lista inválida. Informe apenas o nome do arquivo dentro de ./listas, sem caminho.",
    );
  }

  const ext = path.extname(rawName);

  if (ext && ext.toLocaleLowerCase("pt-BR") !== ".csv") {
    throw new Error("Lista inválida. Use o nome do arquivo sem extensão .csv.");
  }

  const listBaseName = ext ? rawName.slice(0, -ext.length) : rawName;

  if (!listBaseName || listBaseName === "." || listBaseName === "..") {
    throw new Error("Lista inválida. Informe um nome de arquivo válido.");
  }

  const listsDir = paths.listsDir || path.resolve(path.dirname(paths.csv), "listas");
  return path.resolve(listsDir, `${listBaseName}.csv`);
}

function resolveListSelection(listArg, paths = PATHS) {
  if (!listArg) {
    return {};
  }

  const filter = parseListFilter(listArg);

  if (filter) {
    return {
      csv: paths.csv,
      listFilter: filter,
    };
  }

  return {
    csv: resolveListCsvPath(listArg, paths),
    listName: stripWrappingQuotes(listArg),
  };
}

function resolveExecutionPaths(paths = PATHS, options = {}) {
  const listSelection = resolveListSelection(options.listArg, paths);

  return {
    ...paths,
    ...listSelection,
    template: options.templateName
      ? resolveModelTemplatePath(options.templateName, paths)
      : paths.template,
  };
}

module.exports = {
  applyListFilter,
  isListFilterExpression,
  loadClientes,
  loadCsv,
  loadTemplate,
  parseListFilter,
  readTextFile,
  resolveExecutionPaths,
  resolveListCsvPath,
  resolveListSelection,
  resolveModelTemplatePath,
};
