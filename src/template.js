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

function applyTemplate(template, data, options = {}) {
  const missingVariables = new Set();
  const dataMap = buildCaseInsensitiveDataMap(data);

  return replaceDayPeriodMarkers(
    replaceTemplateExpressions(String(template || ""), (expression) => {
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

        const value = record.value ?? "";
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

  return String(value);
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
  const parts = [];
  const mediaPattern = /!\[[^\]]*]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = mediaPattern.exec(renderedTemplate)) !== null) {
    const text = renderedTemplate.slice(lastIndex, match.index);

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

  const tail = renderedTemplate.slice(lastIndex);

  if (tail.trim()) {
    parts.push({ type: "text", value: tail });
  }

  return parts;
}

function normalizeMediaSource(source) {
  return String(source || "")
    .trim()
    .replace(/^<(.+)>$/, "$1")
    .replace(/^["'](.+)["']$/, "$1")
    .trim();
}

function splitTemplateVariants(template, minLength = TEMPLATE_VARIANT_MIN_LENGTH) {
  const source = String(template || "");
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
  replaceTemplateExpressions,
  normalizeMediaSource,
  parseTemplateParts,
  splitTemplateVariants,
};
