#!/usr/bin/env sh
# Autor: JeanCarloEM.com
# Site do Autor: https://jeancarloem.com
# Licenca: Mozilla Public License 2.0
# Site da Licenca: https://www.mozilla.org/MPL/2.0/
# Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
# Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

set -eu

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm nao encontrado. Execute start.sh para preparar o ambiente."
  exit 1
fi

printf "Atualizar software e dependencias? Versoes novas podem quebrar o ambiente estavel. [s/N]: "
read -r confirm
case "$confirm" in
  s|S|sim|SIM) ;;
  *) exit 0 ;;
esac

echo "Atualizando a partir do GitHub sem depender de git..."
node scripts/update-project.js --action software --confirm
