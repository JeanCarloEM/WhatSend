// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const {
  TEMPLATE_VARIANT_MIN_LENGTH,
} = require("./config");
const {
  evaluateExpression,
  isSimpleIdentifierExpression,
  parseExpression,
} = require("./expression");
const {
  buildCaseInsensitiveDataMap,
  formatNameForMessage,
  normalizeFieldName,
} = require("./utils");

const HTML_NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["cent", "¢"],
  ["copy", "©"],
  ["euro", "€"],
  ["gt", ">"],
  ["hellip", "..."],
  ["laquo", "«"],
  ["lt", "<"],
  ["mdash", "—"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["quot", "\""],
  ["raquo", "»"],
  ["reg", "®"],
  ["aacute", "á"],
  ["agrave", "à"],
  ["acirc", "â"],
  ["atilde", "ã"],
  ["auml", "ä"],
  ["ccedil", "ç"],
  ["eacute", "é"],
  ["ecirc", "ê"],
  ["iacute", "í"],
  ["oacute", "ó"],
  ["ocirc", "ô"],
  ["otilde", "õ"],
  ["uacute", "ú"],
  ["uuml", "ü"],
  ["Aacute", "Á"],
  ["Agrave", "À"],
  ["Acirc", "Â"],
  ["Atilde", "Ã"],
  ["Auml", "Ä"],
  ["Ccedil", "Ç"],
  ["Eacute", "É"],
  ["Ecirc", "Ê"],
  ["Iacute", "Í"],
  ["Oacute", "Ó"],
  ["Ocirc", "Ô"],
  ["Otilde", "Õ"],
  ["Uacute", "Ú"],
  ["Uuml", "Ü"],
]);
const POSTING_SPLIT_MARKER = "$postagem$";
const POSTING_SPLIT_HAS_MARKER_PATTERN = /\$postagem\$/iu;
const POSTING_SPLIT_INLINE_PATTERN = /\$postagem\$/giu;
const POSTING_SPLIT_LINE_PATTERN = /(?:^|\n)[ \t]*\$postagem\$[ \t]*(?:\n|$)/giu;

function applyTemplate(template, data, options = {}) {
  const missingVariables = new Set();
  const dataMap = buildCaseInsensitiveDataMap(data);
  const normalizedTemplate = normalizeTemplateText(template);

  const rendered = replaceDayPeriodMarkers(
    replaceTemplateExpressions(normalizedTemplate, (expression) => {
      const key = normalizeNestedTemplateExpression(String(expression).trim());
      let ast;

      try {
        ast = parseExpression(key);
      } catch (err) {
        notifyMissingTemplateVariable(key, missingVariables, options);
        return "";
      }

      if (isSimpleIdentifierExpression(ast)) {
        const normalizedKey = normalizeFieldName(key.replace(/^\$/, ""));
        const record = dataMap.get(normalizedKey);

        if (!record) {
          notifyMissingTemplateVariable(key, missingVariables, options);
          return "";
        }

        const value = decodeHtmlEntities(record.value ?? "");
        return normalizedKey === "nome" ? formatNameForMessage(value) : value;
      }

      try {
        const result = evaluateExpression(ast, data, {
          identifierMode: "field",
          onMissingField: (field) =>
            notifyMissingTemplateVariable(field, missingVariables, options),
        });

        return expressionResultToString(result.value);
      } catch (err) {
        notifyMissingTemplateVariable(key, missingVariables, options);
        return "";
      }
    }),
    options.now || new Date(),
  );

  return normalizeTemplateText(rendered);
}

function replaceTemplateExpressions(template, callback) {
  let result = "";
  let index = 0;

  while (index < template.length) {
    if (template[index] !== "$" || template[index + 1] !== "{") {
      result += template[index];
      index += 1;
      continue;
    }

    const start = index;
    index += 2;
    let depth = 1;
    let expression = "";

    while (index < template.length) {
      if (template[index] === "$" && template[index + 1] === "{") {
        depth += 1;
        expression += "${";
        index += 2;
        continue;
      }

      if (template[index] === "}") {
        depth -= 1;

        if (depth === 0) {
          index += 1;
          result += callback(expression);
          break;
        }
      }

      expression += template[index];
      index += 1;
    }

    if (depth !== 0) {
      result += template.slice(start);
      break;
    }
  }

  return result;
}

function inspectTemplateSyntax(template) {
  const source = normalizeTemplateText(template);
  const issues = [];
  const reportedBareBracePositions = new Set();
  let index = 0;

  while (index < source.length) {
    if (source[index] === "$" && source[index + 1] === "{") {
      const result = readTemplateExpression(source, index);

      if (!result.closed) {
        issues.push(buildTemplateSyntaxIssue(
          "UNCLOSED_TEMPLATE_EXPRESSION",
          source,
          index,
          "Marcador ${...} aberto e não fechado.",
        ));
        index += 2;
        continue;
      }

      const expression = result.expression.trim();

      if (!expression) {
        issues.push(buildTemplateSyntaxIssue(
          "EMPTY_TEMPLATE_EXPRESSION",
          source,
          index,
          "Marcador ${...} vazio.",
        ));
      } else {
        try {
          parseExpression(normalizeNestedTemplateExpression(expression));
        } catch (err) {
          issues.push(buildTemplateSyntaxIssue(
            "INVALID_TEMPLATE_EXPRESSION",
            source,
            index,
            `Expressão inválida em \${...}: ${err.message}`,
          ));
        }
      }

      index = result.nextIndex;
      continue;
    }

    if (source[index] === "{") {
      const closingIndex = findBareBraceClosingIndex(source, index);

      if (closingIndex !== -1 && !reportedBareBracePositions.has(index)) {
        reportedBareBracePositions.add(index);
        issues.push(buildTemplateSyntaxIssue(
          "BRACES_WITHOUT_DOLLAR",
          source,
          index,
          "Trecho entre chaves sem '$' antes. Se for variável, use ${campo}.",
        ));
        index = closingIndex + 1;
        continue;
      }
    }

    if (source[index] === "}") {
      issues.push(buildTemplateSyntaxIssue(
        "UNMATCHED_CLOSING_BRACE",
        source,
        index,
        "Chave '}' sem abertura correspondente.",
      ));
    }

    index += 1;
  }

  return issues;
}

function readTemplateExpression(source, start) {
  let index = start + 2;
  let depth = 1;
  let expression = "";

  while (index < source.length) {
    if (source[index] === "$" && source[index + 1] === "{") {
      depth += 1;
      expression += "${";
      index += 2;
      continue;
    }

    if (source[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          closed: true,
          expression,
          nextIndex: index + 1,
        };
      }
    }

    expression += source[index];
    index += 1;
  }

  return {
    closed: false,
    expression,
    nextIndex: source.length,
  };
}

function findBareBraceClosingIndex(source, start) {
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === "\n" || char === "{") {
      return -1;
    }

    if (char === "}") {
      return index;
    }
  }

  return -1;
}

function buildTemplateSyntaxIssue(code, source, index, message) {
  const location = getLineColumn(source, index);
  return {
    code,
    column: location.column,
    line: location.line,
    message,
    snippet: getLineSnippet(source, index),
  };
}

function getLineColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split("\n");
  return {
    column: lines[lines.length - 1].length + 1,
    line: lines.length,
  };
}

function getLineSnippet(source, index) {
  const start = source.lastIndexOf("\n", index - 1) + 1;
  const endIndex = source.indexOf("\n", index);
  const end = endIndex === -1 ? source.length : endIndex;
  return source.slice(start, end).trim().slice(0, 160);
}

function normalizeTemplateText(text) {
  const normalized = normalizeTemplateLineBreaks(String(text || "")
    .replace(/^\ufeff/u, "")
  );

  return normalizeTemplateLineBreaks(decodeHtmlEntities(normalized));
}

function normalizeTemplateLineBreaks(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u2028\u2029]/gu, "\n");
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
      if (HTML_NAMED_ENTITIES.has(name)) {
        return HTML_NAMED_ENTITIES.get(name);
      }

      const lowerName = name.toLocaleLowerCase("en-US");
      return HTML_NAMED_ENTITIES.has(lowerName)
        ? HTML_NAMED_ENTITIES.get(lowerName)
        : match;
    })
    .replace(
      /&#x([0-9a-f]{1,6});|&#x([0-9a-f]{1,6})(?=$|[^\p{L}\p{N}])/giu,
      (match, withSemicolon, withoutSemicolon) =>
        decodeCodePoint(withSemicolon || withoutSemicolon, 16, match),
    )
    .replace(
      /&#([0-9]{1,7});|&#([0-9]{1,7})(?=$|[^\p{L}\p{N}])/gu,
      (match, withSemicolon, withoutSemicolon) =>
        decodeCodePoint(withSemicolon || withoutSemicolon, 10, match),
    );
}

function decodeCodePoint(value, radix, fallback) {
  const codePoint = Number.parseInt(value, radix);

  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return fallback;
  }

  return codePoint === 0xa0 ? " " : String.fromCodePoint(codePoint);
}

function normalizeNestedTemplateExpression(expression) {
  return String(expression || "").replace(/\$\{([^{}]+)\}/g, "($1)");
}

function expressionResultToString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "";
    }

    if (Number.isInteger(value)) {
      return String(value);
    }

    return value.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      useGrouping: false,
    });
  }

  return decodeHtmlEntities(String(value));
}

function notifyMissingTemplateVariable(field, missingVariables, options = {}) {
  if (!missingVariables.has(field) && options.onMissingVariable) {
    options.onMissingVariable(field);
  }

  missingVariables.add(field);
}

function replaceDayPeriodMarkers(template, now = new Date()) {
  return String(template || "").replace(/\$diatarde\$/gi, (marker, offset) => {
    const phrase = Number(now.getHours()) >= 12 ? "boa tarde" : "bom dia";

    if (shouldCapitalizeDayPeriodMarker(template, offset)) {
      return phrase.replace(/^\p{L}/u, (letter) =>
        letter.toLocaleUpperCase("pt-BR"),
      );
    }

    return phrase;
  });
}

function shouldCapitalizeDayPeriodMarker(template, offset) {
  const before = String(template || "").slice(0, offset);
  return before.trim().length === 0 || /\.\s*$/.test(before);
}

function parseTemplateParts(renderedTemplate) {
  const source = normalizeTemplateText(renderedTemplate);
  const parts = [];
  const mediaPattern = /!\[[^\]]*]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = mediaPattern.exec(source)) !== null) {
    const text = source.slice(lastIndex, match.index);

    if (text.trim()) {
      parts.push({ type: "text", value: text });
    }

    parts.push({
      type: "media",
      source: normalizeMediaSource(match[1]),
      raw: match[0],
    });

    lastIndex = mediaPattern.lastIndex;
  }

  const tail = source.slice(lastIndex);

  if (tail.trim()) {
    parts.push({ type: "text", value: tail });
  }

  return parts;
}

function splitMessagePostings(renderedTemplate) {
  const source = normalizeTemplateText(renderedTemplate);

  if (!POSTING_SPLIT_HAS_MARKER_PATTERN.test(source)) {
    return [source];
  }

  const normalizedSource = source.replace(
    POSTING_SPLIT_LINE_PATTERN,
    (match, offset) => (offset === 0 || match.endsWith("\n") ? POSTING_SPLIT_MARKER : `\n${POSTING_SPLIT_MARKER}`),
  );

  return normalizedSource
    .split(POSTING_SPLIT_INLINE_PATTERN)
    .filter((part) => part.trim().length > 0);
}

function normalizeMediaSource(source) {
  return String(source || "")
    .trim()
    .replace(/^<(.+)>$/, "$1")
    .replace(/^["'](.+)["']$/, "$1")
    .trim();
}

function splitTemplateVariants(template, minLength = TEMPLATE_VARIANT_MIN_LENGTH) {
  const source = normalizeTemplateText(template);
  const parts = source.split(/^[ \t]*\^{3,}[ \t]*$/gmu);

  if (parts.length <= 1) {
    return [source];
  }

  const trimmed = parts.map((part) => part.trim());
  const valid = trimmed.every((part) => part.length >= minLength);

  return valid ? trimmed : [source];
}

module.exports = {
  applyTemplate,
  decodeHtmlEntities,
  inspectTemplateSyntax,
  normalizeTemplateText,
  replaceTemplateExpressions,
  normalizeMediaSource,
  parseTemplateParts,
  POSTING_SPLIT_MARKER,
  splitMessagePostings,
  splitTemplateVariants,
};
