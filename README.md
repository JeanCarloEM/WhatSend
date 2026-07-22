# WhatSend

[![CI](https://github.com/JeanCarloEM/WhatSend/actions/workflows/ci.yml/badge.svg)](https://github.com/JeanCarloEM/WhatSend/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-LTS-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#requisitos)

Aplicativo local em Node.js para enviar mensagens personalizadas pelo WhatsApp Web usando CSV, modelo Markdown, interface grafica local, sessoes persistidas e logs auditaveis.

Todos os nomes, telefones, contas, caminhos e URLs deste README sao exemplos ficticios.

## Sumario

- [Visao geral](#visao-geral)
- [Requisitos](#requisitos)
- [Instalacao](#instalacao)
- [Uso rapido](#uso-rapido)
- [Arquivos de entrada](#arquivos-de-entrada)
- [GUI](#gui)
- [CLI](#cli)
- [Sessoes](#sessoes)
- [Logs e reenvio](#logs-e-reenvio)
- [Atualizacao](#atualizacao)
- [Releases](#releases)
- [Testes](#testes)
- [Documentacao](#documentacao)
- [Licenca e disclaimer](#licenca-e-disclaimer)

## Visao geral

O WhatSend usa `clientes.csv` como base de destinatarios e `texto.md` como modelo padrao. Antes de enviar, valida arquivos, anexos, logs, navegador e numeros do WhatsApp com `client.getNumberId()`.

Principais recursos:

- GUI local para configurar modelo, CSV, filtro, sessao e reenvio.
- Editor textual na GUI com abas `^^^`, toolbar por ícones, hints, menu de emojis, monoespaçado e prévia realista da aba ativa.
- CLI preservada para automacao.
- Variaveis `${campo}` insensiveis a maiusculas/minusculas.
- Apenas `nome` e `telefone` obrigatorios no CSV.
- Expressoes matematicas e filtros logicos com funcoes.
- Anexos por caminho/URL `![](CAMINHO_OU_URL)` e embedded Base64 `![rótulo](@embed:id)`.
- `.ogg` apenas de audio enviado como mensagem de voz.
- Marcador `$postagem$` para dividir uma mensagem em postagens consecutivas.
- Controle inteligente de reenvio por telefone, conteudo nativo e tempo.
- Compatibilidade com Windows, macOS e Linux quando as dependencias tambem forem compativeis.

O contrato funcional completo fica em [RCF.md](RCF.md).
O andamento operacional das FTs fica em [handoff.md](handoff.md), gerado por `npm run agent:handoff` a partir de [`.ia.rules/continue.ia`](.ia.rules/continue.ia).

## Requisitos

- Node.js LTS.
- npm.
- Google Chrome, Chromium ou Microsoft Edge.
- WhatsApp ativo no celular para autenticar a primeira sessao.

Os inicializadores tentam preparar dependencias e navegador automaticamente. Se nao houver Chrome, Chromium ou Edge, o projeto tenta instalar um Chrome compativel via Puppeteer.

## Instalacao

Windows:

```powershell
cd C:\caminho\ficticio\WhatSend
.\start.cmd
```

macOS/Linux:

```bash
cd /caminho/ficticio/WhatSend
sh ./start.sh
```

Instalacao manual:

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD="true"
npm install
Remove-Item Env:\PUPPETEER_SKIP_DOWNLOAD -ErrorAction SilentlyContinue
npm run browser:ensure
npm run check
```

`npm run check` exige os arquivos operacionais (`clientes.csv` e `texto.md`) e nao envia mensagens.
Para validar o RCF com fixtures versionadas, sem depender desses arquivos reais:

```powershell
npm run check:test
```

## Uso rapido

1. Crie `clientes.csv` na raiz.
2. Crie `texto.md` na raiz ou escolha um modelo em `modelos/`.
3. Rode `npm run check`.
4. Abra a GUI com `npm run start:gui` ou use `.\start.cmd`.
5. Escaneie o QR Code quando solicitado.
6. Execute o envio pela GUI ou por `npm start`.

## Arquivos de entrada

`clientes.csv` minimo:

```csv
nome,telefone
Pessoa Exemplo,11999999999
```

Colunas extras sao opcionais e podem ser usadas em `${campo}`:

```csv
nome,telefone,valor,status
Pessoa Exemplo,11999999999,"120,50",ativo
```

O CSV pode estar em UTF-8 ou ANSI/Windows-1252 e o parser tenta inferir delimitadores comuns de planilha, como `,`, `;`, tab e `|`, preservando acentos e `ç`.

`texto.md` exemplo:

```markdown
$diatarde$, ${nome}.

Seu valor atualizado e ${$.moeda(valor)}.

*Importante:* responda esta mensagem para confirmar.

![](anexos/exemplo.pdf)
```

Para forçar múltiplas postagens consecutivas ao mesmo destinatário, use o marcador literal `$postagem$`:

```markdown
Primeira postagem para ${nome}.

$postagem$

Segunda postagem, enviada somente após confirmação da primeira.
```

O marcador `$postagem$` é removido do texto enviado. Quando estiver sozinho em uma linha, a própria linha do marcador funciona como separador. Se o template também usar múltiplos modelos com `^^^`, o sistema primeiro seleciona a variante por `^^^` e só depois divide a variante escolhida por `$postagem$`.

Anexos em `![](arquivo.pdf)` ou `![](./arquivo.pdf)` são buscados primeiro a partir da pasta do modelo `.md` em uso; se não forem encontrados ali, o sistema tenta a raiz do projeto. Caminhos absolutos e URLs `http/https` também são aceitos.

O clipe da GUI incorpora formatos suportados pelo backend (até 8 MiB), insere `![arquivo](@embed:id)` no cursor e mantém a definição no rodapé global `@@embedded`, usando `data:MIME;base64,...`. O caminho manual continua compatível. Integridade, MIME/extensão, IDs, referências e definições sem uso são validados antes do envio.

Demonstracao de sintaxe textual:

| Marcacao crua | Resultado visual esperado no WhatsApp |
| --- | --- |
| `*negrito exemplo*` | <strong>negrito exemplo</strong> |
| `_italico exemplo_` | <em>italico exemplo</em> |
| `~taxado exemplo~` | <del>taxado exemplo</del> |
| `` ```mono exemplo``` `` | <code>mono exemplo</code> |
| `1. item` | lista enumerada |
| `- item` | lista simples |

Arquivos salvos no Windows, Linux ou macOS podem usar quebras diferentes. O sistema normaliza quebras para o formato compatível com WhatsApp Web e preserva recuos, espaços e tabulações intencionais. Entidades HTML como `&#x20;`, `&#32;`, `&nbsp;` e `&amp;` sao convertidas para caracteres reais antes do envio, pois o WhatsApp nao aceita essa sintaxe crua.

Antes do envio, o sistema alerta sobre possíveis erros de sintaxe no modelo, como `{nome}` sem `$`, `${...}` aberto sem fechamento ou expressão inválida. A GUI pede confirmação e a CLI pergunta `sim`/`não`; o padrão seguro é abortar.


## GUI

Execute:

```powershell
npm run start:gui
```

A interface local abre no inicio do fluxo, mostra autenticacao/carregamento do WhatsApp e libera o botao de envio somente quando o WhatsApp estiver pronto. Ela permite:

- selecionar, criar, renomear e remover sessoes;
- informar modelo por editor textual cru ou arquivo `.md`;
- informar filtro;
- anexar CSV opcional;
- forcar reenvio ou limpar historico de enviados;
- atualizar o motor do WhatsApp, dependências, software ou reverter a última atualização após confirmação;
- acompanhar andamento sem inundar a tela.

O editor da GUI não salva HTML nem formato rico: a toolbar por ícones apenas insere ou remove texto compatível com WhatsApp, como `*negrito*`, `_itálico_`, `~tachado~`, monoespaçado com três crases, emoji pelo menu suspenso, `![](arquivo.pdf)`, `$diatarde$`, `$postagem$` e `^^^`. Linhas `^^^` viram abas visuais automaticamente; ao salvar ou enviar, as abas são recombinadas com o mesmo separador. A prévia lateral mostra somente a aba ativa, renderiza a marcação básica como resultado visual e mantém rolagem sincronizada com o editor.

Antes do download `.md` e de Abrir, a toolbar oferece Salvar localmente: conserva o modelo integral neste navegador por `localStorage`, sem nome, arquivo ou versionamento.

O quadro de notações fica recolhido por padrão e não depende de JavaScript. Links de documentação e ajuda em vídeo ficam próximos dos campos de modelo, expressão e CSV.

Ao selecionar um `.md`, a GUI carrega o conteúdo no editor, separa abas por `^^^`, atualiza a prévia e analisa anexos locais em segundo plano. Se algum não for localizado, aparece um aviso ao lado do seletor e um campo para informar a pasta de referência dos anexos. Se o arquivo for enviado sem edição, ele continua podendo ser usado como fonte para preservar a resolução relativa de anexos; se houver edição no editor, o texto editado passa a ser a fonte da execução.

A engrenagem da GUI permite ajustar parâmetros operacionais de ENV para a execução atual, globalmente ou apenas para a sessão selecionada. Configurações por sessão são gravadas em JSON local e carregadas automaticamente na próxima abertura dessa sessão, respeitando a hierarquia execução, sessão, global e default.

## CLI

Comandos principais:

| Comando | Funcao |
| --- | --- |
| `.\start.cmd` | Prepara dependencias e abre a GUI no Windows. |
| `sh ./start.sh` | Prepara dependencias e abre a GUI no macOS/Linux. |
| `npm install` | Instala dependencias manualmente. |
| `npm run browser:ensure` | Verifica Chrome/Chromium/Edge e instala Chrome compativel se necessario. |
| `npm run check` | Valida a campanha real sem enviar. |
| `npm run check:test` | Valida com fixtures em `test/`, sem depender de `clientes.csv` real. |
| `node main.js --check --check-csv test/check-clientes.csv --check-template test/check-texto.md` | Valida usando paths especificos de CSV e Markdown. |
| `npm run start:gui` | Inicia a interface grafica local. |
| `npm start` | Envia via CLI usando `clientes.csv` e `texto.md`. |
| `npm start -- faturamento` | Usa `modelos/faturamento.md`. |
| `node main.js --check faturamento` | Valida um modelo especifico sem enviar. |
| `node main.js --lista base_exemplo` | Usa `listas/base_exemplo.csv`. |
| `node main.js faturamento base_exemplo` | Usa modelo e lista nomeados. |
| `node main.js --lista "status=ativo"` | Filtra `clientes.csv` por coluna. |
| `node main.js --lista "valor>=100 && status=ativo"` | Usa filtro composto com comparacao e logica. |
| `npm run start:force` | Ignora historico de enviados nesta execucao. |
| `npm run start:clear` | Limpa `logs/enviados.csv` antes de iniciar. |
| `npm run sent:clear` | Alias para limpar enviados. |
| `npm run start:reset` | Alias legado para limpar enviados. |
| `node main.js --new-session Comercial --gui` | Cria sessao nomeada e abre a GUI. |
| `node main.js --session Comercial --gui` | Abre a GUI usando uma sessao existente. |
| `node main.js --rename-session Comercial Financeiro` | Renomeia uma sessao. |
| `node main.js --remove-session Comercial` | Remove sessao e autenticacao local correspondente. |
| `npm test` | Roda a suite automatizada. |
| `npm run build:dist` | Gera `dist/`, `dist/whatsend-version.json` e o ZIP distribuível. |
| `npm run validate:dist` | Valida estrutura, segurança e execução do `dist`. |
| `npm run release-notes:generate -- HASH_INICIAL HASH_FINAL` | Gera `dist/release-notes.md` para uma release formal. |
| `npm run release-notes:validate` | Valida localmente que `dist/release-notes.md` esteja em commit exclusivo. |
| `npm run agents:update` | Verifica e sincroniza a governanca operacional remota definida em `.ia.rules/core/update/upstream.json`. |
| `npm run agent:handoff` | Atualiza o resumo operacional gerado a partir de `.ia.rules/continue.ia`. |
| `npm run update -- --action software --confirm` | Atualiza o software oficial após confirmação explícita. |
| `.\atualizar.cmd` | Atualiza pela Release Latest do GitHub, ou por `main` se nao houver release valida, no Windows. |
| `sh ./atualizar.sh` | Atualiza pela Release Latest do GitHub, ou por `main` se nao houver release valida, no macOS/Linux. |

Use `npm run <script> -- argumento` quando passar parametros por scripts npm. Exemplo: `npm run start:force -- faturamento`.

## Sessoes

A sessao padrao usa `.wwebjs_auth/session`. Sessoes nomeadas usam perfis independentes e logs separados.

```powershell
node main.js --new-session Comercial --gui
node main.js --session Comercial --gui
node main.js --rename-session Comercial Financeiro
node main.js --remove-session Comercial
```

Na GUI, alternar, criar ou remover a sessao ativa reinicia automaticamente o client do WhatsApp. Se a ultima sessao for removida, a proxima abertura volta ao fluxo inicial com QR Code.

O botao de remover permite escolher qualquer sessao listada, mesmo que ela nao esteja ativa ou ainda nao tenha sido autenticada. Quando a sessao removida for a ativa, o navegador e fechado antes da exclusao local para preservar a gravacao do perfil.

## Logs e reenvio

Os logs ficam em `logs/`:

- `enviados.csv`: telefones enviados.
- `erros.csv`: falhas e numeros invalidos.
- `pulos.csv`: registros pulados com motivo.
- `avisos.csv`: avisos de template.
- `mensagens.json`: versoes nativas usadas no controle inteligente.

Por padrao, uma mensagem igual ou menos de 10% diferente nao e reenviada para o mesmo telefone dentro de 48 horas. Ajustes:

```env
MESSAGE_DIFF_THRESHOLD_PERCENT=10
RESEND_AFTER_HOURS=48
MIN_DELAY_MS=1500
MAX_DELAY_MS=4000
MESSAGE_SEND_RETRIES=3
MESSAGE_SEND_RETRY_DELAY_MS=1200
MESSAGE_SEND_RETRY_MAX_DELAY_MS=10000
MEDIA_SEND_RETRIES=5
MEDIA_SEND_RETRY_DELAY_MS=1200
MEDIA_SEND_RETRY_MAX_DELAY_MS=10000
```

## Atualizacao

Os scripts `.\atualizar.cmd` e `sh ./atualizar.sh` nao dependem de Git nem de um clone local. Eles consultam a API oficial do GitHub, priorizam a Release marcada como Latest e usam a branch `main` apenas se nao houver release valida.

Quando a Release Latest possuir asset `WhatSend-v<versao>[-<canal>].zip`, o atualizador baixa esse pacote distribuivel. Antes de baixar o pacote, ele compara a versao remota com `whatsend-version.json`, arquivo operacional pequeno mantido no root e tambem publicado na release. Quando o identificador local corresponde ao `tag`/commit da Release ou ao commit da `main`, o download e a reinstalacao de dependencias sao pulados.

Na GUI, o ícone Atualizar verifica em segundo plano o aplicativo e `whatsapp-web.js`, com cache, timeout, retentativa limitada e estados independentes. Quando houver atualização disponível, o ícone muda de cor e pulsa por CSS, respeitando redução de movimento. O painel visual mostra qual componente está atualizado, disponível, em verificação, inconclusivo ou em falha temporária, e mantém as quatro ações: somente `whatsapp-web.js`, todas as dependências, software oficial e reversão da última atualização. Cada ação exige seleção e confirmação explícitas, alerta que versões novas podem quebrar um ambiente estável e mostra o progresso no registro. Antes da alteração, o sistema cria um snapshot local mínimo em `.runtime/updates`; em falha tenta restaurá-lo, preservando sessões, configurações, dados de clientes e logs. Ao concluir, reinicie o WhatSend para carregar as versões instaladas.

A GUI lista modelos Markdown válidos de `modelos/` pelo backend local. O botão com ícone Font Awesome `folder-open` (`f07c`) fica na toolbar do editor logo após Salvar localmente; a seleção é opcional, não escolhe automaticamente o primeiro item e pede confirmação antes de substituir edição não salva. O card Modelo de mensagem ocupa a largura total do grid, e o card Andamento fica próximo ao progresso global, retraído por padrão com até dois registros recentes e expansão manual para o histórico completo.

## Releases

Para gerar um pacote local:

```powershell
npm run build:dist -- --version 1.2.0 --channel beta --commit-sha HASH_COMPLETO --official-release
```

O build gera:

- `dist/whatsend-version.json`
- `dist/WhatSend-v1.2.0-beta.zip`

Sem parametros e em terminal interativo, o comando pergunta versao, canal e se o artefato e uma Release oficial. Em automacao, passe os parametros explicitamente.

A publicacao oficial parte de `dev` e pode usar `npm run agent:release:publish -- VERSAO`, que exige worktree limpo, confirma a autenticacao GitHub, versiona o manifesto, executa testes e acompanha o workflow GitHub Actions `Release`. O workflow recebe versao, canal e confirmacao, gera o mesmo ZIP pelo `build:dist`, cria ou atualiza a tag e a Release correspondente, anexa o ZIP e `whatsend-version.json`, marca a Release como Latest e conclui com `release: vVERSAO` antes do fast-forward para `main`. Pela interface web, execute o mesmo workflow selecionando a branch `dev`.

## Testes

```powershell
npm test
```

Os testes cobrem parser, filtros, template, anexos, logs, sessoes e validacoes centrais do RCF. `npm run check` valida a campanha real sem enviar, mas depende dos arquivos operacionais locais.

Para gerar e validar a release distribuível:

```powershell
npm run build:dist
npm run validate:dist
```

`dist/release-notes.md`, quando existir, é protegido: o build preserva seu conteúdo e ele só deve ser gerado por `npm run release-notes:generate -- HASH_INICIAL HASH_FINAL`. Esse arquivo deve ser commitado sozinho.

O `dist` usa manifesto de runtime próprio: dependências e scripts exclusivos de desenvolvimento, teste, build, minificação e validação não são instalados na distribuição. Recursos visuais incorporados, como ícones da GUI, são reduzidos aos itens efetivamente usados.

## Documentacao

- [RCF.md](RCF.md): contrato funcional e nao funcional.
- [docs/usage.md](docs/usage.md): guia avancado de modelos, filtros, anexos, navegador e operacao.
- [AGENTS.md](AGENTS.md): instrucoes para manutencao assistida.

## Licenca e disclaimer

Autor: JeanCarloEM.com

Repositorio: <https://github.com/JeanCarloEM/WhatSend>

Licenca: [Mozilla Public License 2.0](LICENSE), tambem disponivel em <https://www.mozilla.org/MPL/2.0/>.

Aviso:

Aviso de independência e responsabilidade: este software não é afiliado, patrocinado, endossado ou mantido pelo WhatsApp, pela Meta ou por suas empresas afiliadas. Use-o por sua conta e risco.

O uso indevido, abusivo ou em desacordo com leis, termos de serviço ou políticas da plataforma pode resultar em restrições, bloqueio ou banimento da conta do WhatsApp, inclusive com limitações para recuperação ou desbloqueio.

O autor não se responsabiliza por banimentos, bloqueios, perdas, danos ou qualquer uso indevido do software. Leia este aviso e o disclaimer abaixo antes de prosseguir.

Disclaimer:

Este software é fornecido estritamente como está e como disponível, sem garantias expressas, implícitas, legais, comerciais, técnicas, operacionais, de disponibilidade, segurança, conformidade, licitude, não infração ou adequação a qualquer finalidade. O projeto é destinado exclusivamente a usos legítimos, proporcionais e consentidos, como comunicação com clientes reais, assinantes, contatos que autorizaram contato ou públicos próprios e legítimos. O autor é expressamente contrário ao uso massivo, abusivo, enganoso, invasivo, como spam, scraping, assédio, fraude, envio sem consentimento ou qualquer prática que viole leis, termos de serviço, privacidade ou direitos de terceiros. O uso, configuração, conteúdo enviado, destinatários, credenciais, automações e consequências são de responsabilidade exclusiva do usuário. Nada constitui consultoria, serviço gerenciado, vínculo, autorização para uso indevido, promessa de resultado ou assunção de responsabilidade pelo autor, que não responderá por danos, perdas, bloqueios, sanções, incidentes, violações, reclamações ou responsabilidades civis, criminais, trabalhistas, administrativas, regulatórias, contratuais ou de qualquer outra natureza.
