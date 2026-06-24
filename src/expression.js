class ExpressionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExpressionError";
  }
}

const TRUE_WORDS = new Set([
  "1",
  "aprovado",
  "ativo",
  "habilitado",
  "sim",
  "true",
  "valido",
  "verdadeiro",
  "vigente",
]);

const FALSE_WORDS = new Set([
  "0",
  "cancelado",
  "desabilitado",
  "false",
  "falso",
  "inapto",
  "inativo",
  "invalido",
  "nao",
  "nao",
  "reprovado",
  "suspenso",
  "vencido",
]);

const COMPARISON_OPERATORS = new Set(["=", "!=", "<", "<=", ">", ">="]);
const LOGICAL_OPERATORS = new Set(["||", "&&", "^^"]);
const MATH_OPERATORS = new Set(["+", "-", "*", "/"]);

function parseExpression(source) {
  const tokens = tokenizeExpression(source);
  const parser = new Parser(tokens, source);
  return parser.parse();
}

function evaluateExpression(sourceOrAst, data = {}, options = {}) {
  const ast =
    typeof sourceOrAst === "string" ? parseExpression(sourceOrAst) : sourceOrAst;
  const context = {
    data,
    identifierMode: options.identifierMode || "auto",
    missingFields: new Set(),
    onMissingField: options.onMissingField,
  };

  const result = evaluateAst(ast, context);
  return {
    missingFields: [...context.missingFields],
    value: result.value,
  };
}

function evaluateFilterExpression(sourceOrAst, data = {}) {
  const { value } = evaluateExpression(sourceOrAst, data, {
    identifierMode: "auto",
  });

  return toBoolean(value);
}

function tokenizeExpression(source) {
  const input = String(source || "");
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    const two = input.slice(index, index + 2);

    if (["||", "&&", "^^", "!=", "<=", ">="].includes(two)) {
      tokens.push({ type: "operator", value: two });
      index += 2;
      continue;
    }

    if (two === "$.") {
      tokens.push({ type: "dollarDot", value: "$." });
      index += 2;
      continue;
    }

    if ("=<>+-*/!".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "$") {
      tokens.push({ type: "dollar", value: "$" });
      index += 1;
      continue;
    }

    if ("(),".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const result = readQuotedString(input, index);
      tokens.push({ type: "string", value: result.value });
      index = result.nextIndex;
      continue;
    }

    if (isNumberStart(input, index)) {
      const result = readNumberToken(input, index);
      tokens.push({ type: "number", value: result.value });
      index = result.nextIndex;
      continue;
    }

    const result = readIdentifier(input, index);

    if (!result.value) {
      throw new ExpressionError(`Caractere inesperado no filtro: ${char}`);
    }

    tokens.push({ type: "identifier", value: result.value });
    index = result.nextIndex;
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function readQuotedString(input, start) {
  const quote = input[start];
  let value = "";
  let index = start + 1;

  while (index < input.length) {
    const char = input[index];

    if (char === "\\") {
      value += input[index + 1] || "";
      index += 2;
      continue;
    }

    if (char === quote) {
      return { nextIndex: index + 1, value };
    }

    value += char;
    index += 1;
  }

  throw new ExpressionError("Texto entre aspas não foi fechado.");
}

function isNumberStart(input, index) {
  const char = input[index];
  const next = input[index + 1];

  return /\d/u.test(char) || ([".", ","].includes(char) && /\d/u.test(next));
}

function readNumberToken(input, start) {
  let index = start;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (/\d/u.test(char)) {
      value += char;
      index += 1;
      continue;
    }

    if ([".", ","].includes(char) && /\d/u.test(next)) {
      value += char;
      index += 1;
      continue;
    }

    break;
  }

  return { nextIndex: index, value };
}

function readIdentifier(input, start) {
  let index = start;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    const two = input.slice(index, index + 2);

    if (
      /\s/u.test(char) ||
      ["||", "&&", "^^", "!=", "<=", ">=", "$."].includes(two) ||
      "=<>+-*/!$(),".includes(char) ||
      char === "'" ||
      char === '"'
    ) {
      break;
    }

    value += char;
    index += 1;
  }

  return { nextIndex: index, value: value.trim() };
}

class Parser {
  constructor(tokens, source) {
    this.tokens = tokens;
    this.source = source;
    this.position = 0;
  }

  parse() {
    const expression = this.parseOr();
    this.expect("eof");
    return expression;
  }

  parseOr() {
    return this.parseBinary(() => this.parseXor(), ["||"]);
  }

  parseXor() {
    return this.parseBinary(() => this.parseAnd(), ["^^"]);
  }

  parseAnd() {
    return this.parseBinary(() => this.parseComparison(), ["&&"]);
  }

  parseComparison() {
    return this.parseBinary(() => this.parseAdditive(), [
      "=",
      "!=",
      "<",
      "<=",
      ">",
      ">=",
    ]);
  }

  parseAdditive() {
    return this.parseBinary(() => this.parseMultiplicative(), ["+", "-"]);
  }

  parseMultiplicative() {
    return this.parseBinary(() => this.parseUnary(), ["*", "/"]);
  }

  parseBinary(readOperand, operators) {
    let left = readOperand();

    while (this.current().type === "operator" && operators.includes(this.current().value)) {
      const operator = this.advance().value;
      const right = readOperand();
      left = { left, operator, right, type: "BinaryExpression" };
    }

    return left;
  }

  parseUnary() {
    if (
      this.current().type === "operator" &&
      ["!", "+", "-"].includes(this.current().value)
    ) {
      const operator = this.advance().value;
      return {
        argument: this.parseUnary(),
        operator,
        type: "UnaryExpression",
      };
    }

    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();

    if (token.type === "number") {
      this.advance();
      return { raw: token.value, type: "NumberLiteral", value: token.value };
    }

    if (token.type === "string") {
      this.advance();
      return { type: "StringLiteral", value: token.value };
    }

    if (token.type === "identifier") {
      this.advance();
      return { name: token.value, type: "Identifier" };
    }

    if (token.type === "dollar") {
      this.advance();
      const identifier = this.expect("identifier");
      return { name: identifier.value, type: "FieldIdentifier" };
    }

    if (token.type === "dollarDot") {
      this.advance();
      const name = this.expect("identifier").value;
      this.expect("(");
      const args = [];

      if (this.current().type !== ")") {
        do {
          args.push(this.parseOr());

          if (this.current().type !== ",") {
            break;
          }

          this.advance();
        } while (true);
      }

      this.expect(")");
      return { args, name, type: "FunctionCall" };
    }

    if (token.type === "(") {
      this.advance();
      const expression = this.parseOr();
      this.expect(")");
      return { expression, type: "GroupExpression" };
    }

    throw new ExpressionError(`Expressão inválida perto de "${token.value}".`);
  }

  current() {
    return this.tokens[this.position];
  }

  advance() {
    const token = this.current();
    this.position += 1;
    return token;
  }

  expect(type) {
    const token = this.current();

    if (token.type !== type) {
      throw new ExpressionError(`Esperado "${type}", recebido "${token.value}".`);
    }

    this.position += 1;
    return token;
  }
}

function evaluateAst(node, context) {
  switch (node.type) {
    case "NumberLiteral":
      return { value: parseSmartNumber(node.value).value };
    case "StringLiteral":
      return { value: node.value };
    case "Identifier":
      return evaluateIdentifier(node.name, context);
    case "FieldIdentifier":
      return evaluateFieldIdentifier(node.name, context);
    case "GroupExpression":
      return evaluateAst(node.expression, context);
    case "UnaryExpression":
      return evaluateUnary(node, context);
    case "BinaryExpression":
      return evaluateBinary(node, context);
    case "FunctionCall":
      return evaluateFunction(node, context);
    default:
      throw new ExpressionError(`Tipo de expressão não suportado: ${node.type}`);
  }
}

function evaluateIdentifier(name, context) {
  const field = getDataField(context.data, name);

  if (field.found) {
    return { value: field.value };
  }

  if (context.identifierMode === "field") {
    registerMissingField(name, context);
    return { value: "" };
  }

  return { value: name };
}

function evaluateFieldIdentifier(name, context) {
  const field = getDataField(context.data, name);

  if (!field.found) {
    registerMissingField(name, context);
    return { value: "" };
  }

  return { value: field.value };
}

function evaluateUnary(node, context) {
  const value = evaluateAst(node.argument, context).value;

  if (node.operator === "!") {
    return { value: !toBoolean(value) };
  }

  if (node.operator === "+") {
    return { value: toMathNumber(value) };
  }

  return { value: -toMathNumber(value) };
}

function evaluateBinary(node, context) {
  if (LOGICAL_OPERATORS.has(node.operator)) {
    return evaluateLogicalBinary(node, context);
  }

  if (COMPARISON_OPERATORS.has(node.operator)) {
    const left = evaluateComparisonOperand(node.left, context, "left");
    const right = evaluateComparisonOperand(node.right, context, "right");
    return { value: compareValues(left, right, node.operator) };
  }

  const left = evaluateAst(node.left, context).value;
  const right = evaluateAst(node.right, context).value;

  if (MATH_OPERATORS.has(node.operator)) {
    return { value: calculateValues(left, right, node.operator) };
  }

  throw new ExpressionError(`Operador não suportado: ${node.operator}`);
}

function evaluateComparisonOperand(node, context, side) {
  if (side === "left" && node.type === "StringLiteral") {
    const field = getDataField(context.data, node.value);

    if (field.found) {
      return field.value;
    }
  }

  return evaluateAst(node, context).value;
}

function evaluateLogicalBinary(node, context) {
  const left = toBoolean(evaluateAst(node.left, context).value);

  if (node.operator === "&&") {
    return { value: left && toBoolean(evaluateAst(node.right, context).value) };
  }

  if (node.operator === "||") {
    return { value: left || toBoolean(evaluateAst(node.right, context).value) };
  }

  return { value: left !== toBoolean(evaluateAst(node.right, context).value) };
}

function evaluateFunction(node, context) {
  const functionName = normalizeText(node.name);
  const value = readFunctionValue(node.args[0], context);

  switch (functionName) {
    case "vazio":
      return { value: String(value ?? "").trim() === "" };
    case "isnum":
      return { value: parseSmartNumber(value).ok };
    case "isfloat": {
      const parsed = parseSmartNumber(value);
      return { value: parsed.ok && !Number.isInteger(parsed.value) };
    }
    case "isint": {
      const parsed = parseSmartNumber(value);
      return { value: parsed.ok && Number.isInteger(parsed.value) };
    }
    case "isbool":
      return { value: parseBooleanValue(value).matched };
    case "istrue": {
      const parsed = parseBooleanValue(value);
      return { value: parsed.matched && parsed.value === true };
    }
    case "istring":
    case "isstring":
      return {
        value:
          typeof value === "string" &&
          value.trim() !== "" &&
          !parseSmartNumber(value).ok,
      };
    default:
      throw new ExpressionError(`Função lógica desconhecida: $.${node.name}().`);
  }
}

function readFunctionValue(node, context) {
  if (!node) {
    return undefined;
  }

  if (node.type === "Identifier" || node.type === "FieldIdentifier") {
    return evaluateFieldIdentifier(node.name, context).value;
  }

  return evaluateAst(node, context).value;
}

function compareValues(left, right, operator) {
  const leftBoolean = parseBooleanValue(left);
  const rightBoolean = parseBooleanValue(right);

  if (leftBoolean.matched && rightBoolean.matched) {
    return comparePrimitive(leftBoolean.value, rightBoolean.value, operator);
  }

  const leftNumber = parseSmartNumber(left);
  const rightNumber = parseSmartNumber(right);

  if (leftNumber.ok && rightNumber.ok) {
    return comparePrimitive(leftNumber.value, rightNumber.value, operator);
  }

  return comparePrimitive(
    String(left ?? "").trim(),
    String(right ?? "").trim(),
    operator,
  );
}

function comparePrimitive(left, right, operator) {
  switch (operator) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      throw new ExpressionError(`Comparador não suportado: ${operator}`);
  }
}

function calculateValues(left, right, operator) {
  const leftNumber = toMathNumber(left);
  const rightNumber = toMathNumber(right);

  switch (operator) {
    case "+":
      return leftNumber + rightNumber;
    case "-":
      return leftNumber - rightNumber;
    case "*":
      return leftNumber * rightNumber;
    case "/":
      if (rightNumber === 0) {
        throw new ExpressionError("Divisão por zero na expressão.");
      }

      return leftNumber / rightNumber;
    default:
      throw new ExpressionError(`Operador matemático não suportado: ${operator}`);
  }
}

function toMathNumber(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value === null || value === undefined || String(value).trim() === "") {
    return 0;
  }

  const booleanValue = parseBooleanValue(value);

  if (booleanValue.matched) {
    return booleanValue.value ? 1 : 0;
  }

  const numberValue = parseSmartNumber(value);

  if (numberValue.ok) {
    return numberValue.value;
  }

  throw new ExpressionError(`Valor não numérico em operação matemática: ${value}`);
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const booleanValue = parseBooleanValue(value);

  if (booleanValue.matched) {
    return booleanValue.value;
  }

  const numberValue = parseSmartNumber(value);

  if (numberValue.ok) {
    return numberValue.value !== 0;
  }

  return String(value ?? "").trim() !== "";
}

function parseBooleanValue(value) {
  const normalized = normalizeText(value);

  if (TRUE_WORDS.has(normalized)) {
    return { matched: true, value: true };
  }

  if (FALSE_WORDS.has(normalized)) {
    return { matched: true, value: false };
  }

  return { matched: false, value: undefined };
}

function parseSmartNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, raw: String(value), value }
      : { ok: false, raw: String(value), value: undefined };
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return { ok: false, raw, value: undefined };
  }

  if (!/^[+-]?[\d.,]+$/u.test(raw) || !/\d/u.test(raw)) {
    return { ok: false, raw, value: undefined };
  }

  const sign = raw.startsWith("-") || raw.startsWith("+") ? raw[0] : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const normalizedUnsigned = normalizeNumericText(unsigned);

  if (!normalizedUnsigned || !/^\d+(?:\.\d+)?$/u.test(normalizedUnsigned)) {
    return { ok: false, raw, value: undefined };
  }

  const normalized = `${sign}${normalizedUnsigned}`;
  const number = Number(normalized);

  return Number.isFinite(number)
    ? { ok: true, raw, value: number }
    : { ok: false, raw, value: undefined };
}

function normalizeNumericText(value) {
  if (value.includes(",")) {
    if ((value.match(/,/gu) || []).length > 1) {
      return "";
    }

    return value.replace(/\./gu, "").replace(",", ".");
  }

  const dotCount = (value.match(/\./gu) || []).length;

  if (dotCount <= 1) {
    return value;
  }

  const pieces = value.split(".");
  const last = pieces[pieces.length - 1];

  if (last.length === 3) {
    return pieces.join("");
  }

  return `${pieces.slice(0, -1).join("")}.${last}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");
}

function getDataField(data, name) {
  const normalizedName = normalizeText(name);

  for (const [key, value] of Object.entries(data || {})) {
    if (normalizeText(key) === normalizedName) {
      return { found: true, key, value };
    }
  }

  return { found: false, key: undefined, value: undefined };
}

function registerMissingField(name, context) {
  context.missingFields.add(name);

  if (context.onMissingField) {
    context.onMissingField(name);
  }
}

function isSimpleIdentifierExpression(ast) {
  return ast && (ast.type === "Identifier" || ast.type === "FieldIdentifier");
}

function expressionLooksLikeFilter(source) {
  const value = String(source || "").trim();
  return /(?:\|\||&&|\^\^|!=|<=|>=|=|<|>|\$\.)/u.test(value);
}

function collectReferencedFields(ast) {
  const fields = new Set();

  collectFields(ast, fields, "expression");
  return [...fields];
}

function collectFields(node, fields, role) {
  if (!node) {
    return;
  }

  if (node.type === "FieldIdentifier") {
    fields.add(node.name);
    return;
  }

  if (node.type === "Identifier") {
    if (role !== "literal") {
      fields.add(node.name);
    }

    return;
  }

  if (node.type === "FunctionCall") {
    for (const arg of node.args) {
      collectFields(arg, fields, "field");
    }

    return;
  }

  if (node.type === "GroupExpression") {
    collectFields(node.expression, fields, role);
    return;
  }

  if (node.type === "UnaryExpression") {
    collectFields(node.argument, fields, role);
    return;
  }

  if (node.type === "BinaryExpression") {
    if (LOGICAL_OPERATORS.has(node.operator)) {
      collectFields(node.left, fields, "expression");
      collectFields(node.right, fields, "expression");
      return;
    }

    if (MATH_OPERATORS.has(node.operator)) {
      collectFields(node.left, fields, "field");
      collectFields(node.right, fields, "field");
      return;
    }

    if (COMPARISON_OPERATORS.has(node.operator)) {
      collectFields(node.left, fields, "field");
      collectFields(node.right, fields, containsExplicitField(node.right) ? "field" : "literal");
    }
  }
}

function containsExplicitField(node) {
  if (!node) {
    return false;
  }

  if (node.type === "FieldIdentifier" || node.type === "FunctionCall") {
    return true;
  }

  if (node.type === "GroupExpression") {
    return containsExplicitField(node.expression);
  }

  if (node.type === "UnaryExpression") {
    return containsExplicitField(node.argument);
  }

  if (node.type === "BinaryExpression") {
    return (
      MATH_OPERATORS.has(node.operator) ||
      containsExplicitField(node.left) ||
      containsExplicitField(node.right)
    );
  }

  return false;
}

module.exports = {
  ExpressionError,
  collectReferencedFields,
  evaluateExpression,
  evaluateFilterExpression,
  expressionLooksLikeFilter,
  isSimpleIdentifierExpression,
  parseBooleanValue,
  parseExpression,
  parseSmartNumber,
  toBoolean,
};
