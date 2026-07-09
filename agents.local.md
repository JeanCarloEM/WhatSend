# AGENTS.md

Este projeto segue o contrato funcional descrito em [RCF.md](RCF.md).

Ao alterar o sistema:

- Ao término indicar um texto detalhado para commit, com até 512 caracteres, separando melhorias, fix e ajustes.
- Preserve `main.js` como ponto de execução principal e RCF operacional.
- Mantenha a lógica de negócio em `src/`, evitando alterações diretas em `node_modules/`.
- Atualize [RCF.md](RCF.md) quando uma regra funcional ou não funcional mudar.
- Mantenha compatibilidade com CLI sempre que adicionar novas entradas pela GUI.
- Rode `npm test` e `npm run check` quando a mudança tocar parser, template, CSV, anexos, browser, GUI ou envio.
- Não altere `clientes.csv`, `texto.md` ou arquivos reais do usuário durante validação ou teste.

## Frentes de Trabalho

- Toda implementação relevante deve pertencer a uma Frente de Trabalho (FT) registrada em `continue.ia`.
- Cada FT deve ter identificador permanente, nome, objetivo, prioridade, status e planejamento por etapas.
- Cada etapa deve indicar posição `X/N`, nome, objetivo e dependências quando existirem; microetapas devem ser registradas quando úteis para retomada.
- `continue.ia` é a memória operacional oficial do projeto e deve ser atualizado durante a execução, incluindo microetapas concluídas, decisões, verificações, falhas objetivas e mudanças de planejamento.
- Não repita análises, comandos ou tentativas já registrados sem nova evidência ou ganho técnico esperado.
- Sempre que tecnicamente possível, cada etapa funcional deve terminar com validação, commit e push antes da próxima etapa.
- Ao mudar arquitetura, regras, UX, documentação, build ou distribuição, sincronize implementação, `AGENTS.md`, `RCF.md`, `README.md`, documentação pertinente e `continue.ia`.
