// Autor: JeanCarloEM.com
// Site do Autor: https://jeancarloem.com
// Licenca: Mozilla Public License 2.0
// Site da Licenca: https://www.mozilla.org/MPL/2.0/

const path = require("path");

const MAX_EMBEDDED_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MEDIA_CAPABILITIES = Object.freeze([
  { extensions: [".gif"], mime: "image/gif" },
  { extensions: [".jpeg", ".jpg"], mime: "image/jpeg" },
  { extensions: [".ogg", ".opus"], mime: "audio/ogg" },
  { extensions: [".pdf"], mime: "application/pdf" },
  { extensions: [".png"], mime: "image/png" },
  { extensions: [".webp"], mime: "image/webp" },
  { extensions: [".zip"], mime: "application/zip" },
]);

function getMediaCapability(fileName) {
  const extension = path.extname(String(fileName || "")).toLocaleLowerCase("pt-BR");
  return MEDIA_CAPABILITIES.find((item) => item.extensions.includes(extension));
}

function inferSupportedMediaMimeType(fileName) {
  return getMediaCapability(fileName)?.mime || "application/octet-stream";
}

function getEmbeddedAttachmentAccept() {
  return MEDIA_CAPABILITIES.flatMap((item) => item.extensions).join(",");
}

function getEmbeddedAttachmentCapabilities() {
  return MEDIA_CAPABILITIES.map((item) => ({ ...item, extensions: [...item.extensions] }));
}

module.exports = {
  MAX_EMBEDDED_ATTACHMENT_BYTES,
  getEmbeddedAttachmentAccept,
  getEmbeddedAttachmentCapabilities,
  getMediaCapability,
  inferSupportedMediaMimeType,
};
