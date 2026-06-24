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
    String(template || "").replace(/\$\{([^}]+)\}/g, (_, expression) => {
      const key = String(expression).trim();
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

function expressionResultToString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
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

module.exports = {
  applyTemplate,
  normalizeMediaSource,
  parseTemplateParts,
};
