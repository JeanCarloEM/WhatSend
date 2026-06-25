#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v git >/dev/null 2>&1; then
  echo "Git nao encontrado."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm nao encontrado. Execute start.sh para preparar o ambiente."
  exit 1
fi

echo "Atualizando repositorio..."
git pull --ff-only

echo "Atualizando dependencias estaveis..."
npm install csv-parse@latest dotenv@latest puppeteer-core@latest qrcode-terminal@latest whatsapp-web.js@latest

echo "Verificando navegador compativel..."
node scripts/ensure-browser.js

echo "Atualizacao concluida."
