#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm nao encontrado. Execute start.sh para preparar o ambiente."
  exit 1
fi

echo "Atualizando a partir do GitHub sem depender de git..."
node scripts/update-project.js
