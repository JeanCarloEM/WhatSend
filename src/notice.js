// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/
// Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
// Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

const LICENSE_LOCAL_PATH = "LICENSE";
const LICENSE_URL = "https://www.mozilla.org/MPL/2.0/";
const REPOSITORY_URL = "https://github.com/JeanCarloEM/WhatSend";
const AUTHOR = "JeanCarloEM.com";
const AUTHOR_URL = "https://jeancarloem.com";
const LICENSE_NAME = "Mozilla Public License 2.0";
const TERMINAL_NOTICE_WIDTH = 100;
const ANSI = {
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
};

const COMPLIANCE_NOTICE = [
  "Aviso de independência e responsabilidade: este software não é afiliado, patrocinado, endossado ou mantido pelo WhatsApp, pela Meta ou por suas empresas afiliadas. Use-o por sua conta e risco.",
  "O uso indevido, abusivo ou em desacordo com leis, termos de serviço ou políticas da plataforma pode resultar em restrições, bloqueio ou banimento da conta do WhatsApp, inclusive com limitações para recuperação ou desbloqueio.",
  "O autor não se responsabiliza por banimentos, bloqueios, perdas, danos ou qualquer uso indevido do software. Leia este aviso e o disclaimer abaixo antes de prosseguir.",
].join("\n");

const COMPLIANCE_NOTICE_SUMMARY =
  "Software independente do WhatsApp/Meta. Uso indevido pode causar restrições, bloqueio ou banimento da conta. Use por sua conta e risco; o autor não se responsabiliza por banimentos, perdas, danos ou uso indevido.";

const DISCLAIMER =
  "Este software é fornecido estritamente como está e como disponível, sem garantias expressas, implícitas, legais, comerciais, técnicas, operacionais, de disponibilidade, segurança, conformidade, licitude, não infração ou adequação a qualquer finalidade. O projeto é destinado exclusivamente a usos legítimos, proporcionais e consentidos, como comunicação com clientes reais, assinantes, contatos que autorizaram contato ou públicos próprios e legítimos. O autor é expressamente contrário ao uso massivo, abusivo, enganoso, invasivo, como spam, scraping, assédio, fraude, envio sem consentimento ou qualquer prática que viole leis, termos de serviço, privacidade ou direitos de terceiros. O uso, configuração, conteúdo enviado, destinatários, credenciais, automações e consequências são de responsabilidade exclusiva do usuário. Nada constitui consultoria, serviço gerenciado, vínculo, autorização para uso indevido, promessa de resultado ou assunção de responsabilidade pelo autor, que não responderá por danos, perdas, bloqueios, sanções, incidentes, violações, reclamações ou responsabilidades civis, criminais, trabalhistas, administrativas, regulatórias, contratuais ou de qualquer outra natureza.";

function buildNoticeText() {
  return [
    `Autor: ${AUTHOR} (${AUTHOR_URL})`,
    `Licença: ${LICENSE_NAME} (${LICENSE_LOCAL_PATH}; ${LICENSE_URL})`,
    `Repositório: ${REPOSITORY_URL}`,
    `Disclaimer: ${DISCLAIMER}`,
  ].join("\n");
}

function buildLegalFooterText() {
  return [
    `Autor: ${AUTHOR} (${AUTHOR_URL})`,
    `Repositório: ${REPOSITORY_URL}`,
    `Licença: ${LICENSE_NAME} (${LICENSE_LOCAL_PATH}; ${LICENSE_URL})`,
    "",
    COMPLIANCE_NOTICE,
    "",
    `Disclaimer: ${DISCLAIMER}`,
  ].join("\n");
}

function renderComplianceSummaryHtml() {
  return `<p>${formatComplianceNoticeLine(COMPLIANCE_NOTICE_SUMMARY)}</p>`;
}

function renderLegalFooterHtml() {
  return [
    "<h2>Licença e disclaimer</h2>",
    `<p><strong>Autor:</strong> <a href="${AUTHOR_URL}" target="_blank" rel="noreferrer">${AUTHOR}</a></p>`,
    `<p><strong>Repositório:</strong> <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">${REPOSITORY_URL}</a></p>`,
    `<p><strong>Licença:</strong> <a href="/license" target="_blank" rel="noreferrer">${LICENSE_NAME}</a> (${LICENSE_LOCAL_PATH}; <a href="${LICENSE_URL}" target="_blank" rel="noreferrer">${LICENSE_URL}</a>)</p>`,
    `<div class="compliance-notice full" role="note" aria-label="Aviso legal completo">${renderComplianceNoticeHtml()}</div>`,
    `<p><strong>Disclaimer:</strong> ${escapeHtml(DISCLAIMER)}</p>`,
  ].join("");
}

function renderComplianceNoticeHtml() {
  return COMPLIANCE_NOTICE
    .split("\n")
    .map((line) => `<p>${formatComplianceNoticeLine(line)}</p>`)
    .join("");
}

function formatComplianceNoticeLine(line) {
  const highlights = [
    "não é afiliado, patrocinado, endossado ou mantido",
    "Use-o por sua conta e risco",
    "restrições, bloqueio ou banimento",
    "O autor não se responsabiliza",
    "disclaimer abaixo",
  ];
  let html = escapeHtml(line);

  for (const phrase of highlights) {
    const escapedPhrase = escapeHtml(phrase);
    html = html.split(escapedPhrase).join(`<strong>${escapedPhrase}</strong>`);
  }

  return html;
}

function printStartupNotice() {
  console.log("");
  console.log(`Autor: ${AUTHOR} (${AUTHOR_URL})`);
  console.log(`Repositório: ${REPOSITORY_URL}`);
  console.log("");
  console.log(buildTerminalNoticeBox());
  console.log("");
}

function buildTerminalNoticeBox(options = {}) {
  const color = options.color !== false && !process.env.NO_COLOR;
  const width = options.width || TERMINAL_NOTICE_WIDTH;
  const innerWidth = Math.max(40, width - 4);
  const lines = [
    {
      color: "yellow",
      text: `Licença: ${LICENSE_NAME} (${LICENSE_LOCAL_PATH}; ${LICENSE_URL})`,
    },
    { text: "" },
    ...COMPLIANCE_NOTICE.split("\n").flatMap((line) =>
      wrapText(line, innerWidth).map((text) => ({ color: "red", text })),
    ),
    { text: "" },
    { color: "cyan", text: "Disclaimer:" },
    ...wrapText(DISCLAIMER, innerWidth).map((text) => ({ text })),
  ];
  const top = `┌${"─".repeat(innerWidth + 2)}┐`;
  const bottom = `└${"─".repeat(innerWidth + 2)}┘`;
  const body = lines.map((line) => {
    const text = padRight(line.text, innerWidth);
    const value = colorize(text, line.color, color);
    return `│ ${value} │`;
  });

  return [
    colorize(top, "dim", color),
    ...body,
    colorize(bottom, "dim", color),
  ].join("\n");
}

function wrapText(text, width) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }

    if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
      continue;
    }

    lines.push(line);
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function padRight(text, width) {
  const value = String(text || "");
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function colorize(text, colorName, enabled) {
  if (!enabled || !colorName || !ANSI[colorName]) {
    return text;
  }

  return `${ANSI[colorName]}${text}${ANSI.reset}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  AUTHOR,
  AUTHOR_URL,
  COMPLIANCE_NOTICE,
  COMPLIANCE_NOTICE_SUMMARY,
  DISCLAIMER,
  LICENSE_LOCAL_PATH,
  LICENSE_NAME,
  LICENSE_URL,
  REPOSITORY_URL,
  buildLegalFooterText,
  buildTerminalNoticeBox,
  buildNoticeText,
  renderComplianceNoticeHtml,
  renderComplianceSummaryHtml,
  renderLegalFooterHtml,
  printStartupNotice,
};
