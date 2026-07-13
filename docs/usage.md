# Guia Avancado de Uso

Este guia complementa o [README](../README.md) com detalhes operacionais. O contrato de regras permanece em [RCF.md](../RCF.md).

## Modelos

O modelo padrao e `texto.md`. Modelos alternativos ficam em `modelos/` e sao selecionados pelo nome sem extensao:

```powershell
npm start -- faturamento
node main.js faturamento
```

Regras aplicadas ao modelo:

- `${campo}` busca qualquer coluna do CSV sem diferenciar maiusculas/minusculas.
- `${nome}` e capitalizado e limitado a duas palavras.
- `${(valor+taxa)*2}` executa conta simples.
- `$diatarde$` vira `bom dia` antes das 12h e `boa tarde` a partir das 12h.
- `![](CAMINHO_OU_URL)` vira anexo no ponto em que aparece.
- `![Contrato](@embed:contrato)` referencia um anexo Base64 definido no rodapé global `@@embedded`.
- Quebras Windows (`CRLF`), Linux/macOS (`LF`), `CR` isolado e separadores Unicode sao normalizados para `LF` antes do envio; recuos, espacos e tabulacoes intencionais sao preservados.
- Entidades HTML numericas e nomeadas comuns, como `&#x20;`, `&#32;`, `&nbsp;`, `&amp;`, `&lt;` e `&ccedil;`, sao convertidas para caracteres Unicode reais antes do envio e antes da interpretacao de anexos.

Antes do envio efetivo, o modelo e analisado por potenciais erros de sintaxe. Exemplos: `{nome}` sem `$`, `${valor+}` com expressão inválida, `${nome` sem fechamento e `}` solto. Na GUI, a tela abre uma confirmação; na CLI, o terminal pergunta `sim` ou `não`, aceitando variações de maiúsculas/minúsculas e acentos. Se a resposta for vazia, inválida ou negativa, o envio é abortado.

Funcoes de formatacao em `${...}`:

```markdown
${$.moeda(valor)}
${$.decimal(valor)}
${$.numero(quantidade)}
${$.digito1(conta)}
${$.digito2(conta)}
${$.round(valor)}
${$.ceil(valor)}
${$.floor(valor)}
${$.int(valor)}
```

Um arquivo pode conter multiplas variacoes separadas por uma linha com `^^^`. Quando todos os blocos atingem o tamanho minimo configurado, a distribuicao entre destinatarios e circular. Na GUI, cada bloco separado por `^^^` aparece como uma aba visual do editor; salvar ou enviar recombina as abas com o mesmo separador, sem alterar a regra do backend.

O editor da GUI trabalha sempre com texto cru. A toolbar por ícones apenas insere ou remove marcadores textuais, como `*`, `_`, `~`, três crases para monoespaçado, `![](arquivo.pdf)`, `$diatarde$`, `$postagem$` e `^^^`; emojis são escolhidos por menu suspenso. Nenhum HTML ou conteúdo rico é persistido no modelo. A prévia renderiza negrito, itálico, tachado e monoespaçado para aproximar o resultado visual sem mudar o texto do editor, sempre limitada à aba ativa e com rolagem proporcional sincronizada.

A toolbar começa por Salvar localmente (disquete), Salvar todas as abas em `.md` e Abrir. O primeiro conserva o modelo integral em `localStorage`, sem nome, arquivo ou versionamento.

O quadro de notações da GUI é retrátil e recolhido por padrão. Ao adicionar novas marcações, a implementação, a GUI, o RCF, o README e este guia devem ser atualizados na mesma alteração para evitar divergência.

Cada postagem gerada por `$postagem$` é normalizada individualmente antes da prévia e do envio: sobras no início/fim e caracteres não imprimíveis excedentes são removidos, enquanto recuos intencionais de pelo menos quatro espaços em linha de conteúdo são preservados.

## Emojis profissionais

Lista complementar de 60 emojis sugeridos para uso moderado em mensagens profissionais:

`⚠️` alerta, `✅` concluido, `❌` erro, `📋` lista, `👍` ok, `ℹ️` informacao, `📌` destaque, `⏰` prazo, `⏱️` economia de tempo, `📎` anexo, `💬` resposta, `🚀` lancamento, `🎯` objetivo, `💡` ideia, `🏷️` preco baixo, `💸` baixo custo, `♻️` economia de recursos, `📦` entrega, `📈` resultado, `🤝` parceria/tamo junto, `🆗` aprovado, `☑️` confirmado, `🔔` lembrete, `📣` anuncio, `📢` comunicado, `📲` contato, `📞` ligacao, `✉️` email, `📝` cadastro, `📄` documento, `🧾` comprovante, `💳` pagamento, `💰` valor, `🎁` brinde, `🔥` oferta, `⭐` favorito, `🛒` compra, `🛍️` pedido, `🚚` frete, `🔒` seguro, `🔐` acesso, `🛠️` suporte, `🧩` solucao, `📊` relatorio, `📉` reducao, `🧮` calculo, `📅` agenda, `🗓️` data, `⌛` aguardando, `🔄` atualizacao, `⬆️` aumento, `⬇️` desconto, `➡️` proximo passo, `✨` novidade, `🎉` comemoracao, `🏆` conquista, `💎` premium, `🙏` agradecimento, `🙂` cordialidade, `😔` atencao empatica.

## Listas e filtros

A lista padrao e `clientes.csv`. Listas alternativas ficam em `listas/`:

```powershell
node main.js --lista base_exemplo
node main.js faturamento base_exemplo
```

O carregamento do CSV tenta aceitar exportações comuns do Excel, Bloco de Notas e planilhas em geral. A leitura detecta UTF-8 com ou sem BOM, UTF-16 e ANSI/Windows-1252, preservando acentuação, `ç` e símbolos comuns. O parser também infere delimitadores frequentes: vírgula, ponto e vírgula, tabulação e `|`, com texto delimitado por aspas duplas ou simples.

Se o parametro tiver expressao de filtro, ele sera aplicado sobre `clientes.csv`:

```powershell
node main.js --lista "status=ativo"
node main.js --lista "valor>=10,5 && status!=cancelado"
node main.js --lista "($.isnum(valor) && valor>0) || $.istrue(vigente)"
```

Numeros podem usar `.` ou `,` como separador decimal. Valores booleanos reconhecem variacoes comuns como `sim`, `nao`, `true`, `false`, `1`, `0`, `ativo`, `inativo`, `vigente`, `cancelado`, `valido` e `invalido`, com tratamento de acentos quando aplicavel.

## Estrutura de Decisão e ação

### Operadoras matemáticos

```text
+  -  *  /  %  **
```

| Operador | EN-US | PT-BR | Descrição |
|:---------:|:-----:|:------:|-----------|
| `+` | ADDITION | ADIÇÃO | Soma os operandos. |
| `-` | SUBTRACTION | SUBTRAÇÃO | Subtrai o operando da direita do operando da esquerda. |
| `*` | MULTIPLICATION | MULTIPLICAÇÃO | Multiplica os operandos. |
| `/` | DIVISION | DIVISÃO | Divide o operando da esquerda pelo da direita. |
| `%` | MODULO | MÓDULO | Retorna o resto da divisão inteira entre os operandos. |
| `**` | EXPONENTIATION (POWER) | EXPONENCIAÇÃO (POTENCIAÇÃO) | Eleva o operando da esquerda à potência do operando da direita,  prefira usar o conjunto dentro de ```()```. |


### Comparadores aceitos

```text
=  !=  <  <=  >  >=
```

| Operador | EN-US | PT-BR | Descrição |
|:---------:|:-----:|:------:|-----------|
| `=` | EQUAL TO | IGUAL A | Verdadeiro se os operandos forem iguais. |
| `!=` | NOT EQUAL TO | DIFERENTE DE | Verdadeiro se os operandos forem diferentes. |
| `<` | LESS THAN | MENOR QUE | Verdadeiro se o operando à esquerda for menor que o da direita. |
| `<=` | LESS THAN OR EQUAL TO | MENOR OU IGUAL A | Verdadeiro se o operando à esquerda for menor ou igual ao da direita. |
| `>` | GREATER THAN | MAIOR QUE | Verdadeiro se o operando à esquerda for maior que o da direita. |
| `>=` | GREATER THAN OR EQUAL TO | MAIOR OU IGUAL A | Verdadeiro se o operando à esquerda for maior ou igual ao da direita. |

### Operadores logicos

```text
&&  ||  ^^  !
```

Tambem sao aceitos parenteses, `+`, `-`, `*`, `/`, conforme tabela:

| Operador | EN-US | PT-BR | Descrição |
|:---------:|:-----:|:------:|-----------|
| `&&` | AND | E | Verdadeiro apenas se ambas as expressões forem verdadeiras. |
| `\|\|` | OR | OU | Verdadeiro se pelo menos uma das expressões for verdadeira. |
| `^^` | XOR (Exclusive OR) | OU Exclusivo (XOU) | Verdadeiro apenas se exatamente uma das expressões for verdadeira. |
| `!` | NOT | NÃO | Inverte o valor lógico da expressão. |

### Funções

```text
$.vazio(coluna)
$.isnum(coluna)
$.isfloat(coluna)
$.isint(coluna)
$.isbool(coluna)
$.istrue(coluna)
$.istring(coluna)
```

## Anexos

A notacao Markdown de imagem e usada como marcador generico de anexo:

```markdown
Segue o documento:

![](anexos/exemplo.pdf)
```

O caminho pode ser:

- relativo ao arquivo de modelo em uso;
- absoluto;
- URL `http` ou `https`.

Quando o caminho for relativo, com ou sem `./` ou `.\`, a busca usa primeiro a pasta do `.md` selecionado. Se o arquivo não existir ali, o sistema faz uma segunda tentativa na raiz do projeto. Na GUI, isso funciona com o diretório real do `.md` quando ele estiver disponível; uploads feitos pelo navegador podem ocultar esse caminho por segurança, então o fallback para a raiz do projeto continua disponível.

Na GUI, ao escolher um arquivo `.md`, o conteúdo é carregado no editor textual, as variações `^^^` são exibidas como abas e os anexos locais são analisados em segundo plano. Se algum não for localizado, a própria seção do arquivo exibe um alerta e abre um campo para informar a pasta local de referência dos anexos. O campo aceita apenas diretório local existente; URLs ou caminhos inexistentes são rejeitados antes do envio.

URLs sao baixadas uma vez para cache temporario e reutilizadas quando a mesma URL aparece novamente. Arquivos locais inexistentes falham na pre-validacao.

Para anexar sem depender de caminho local, use `![rótulo](@embed:id)` e mantenha ao fim do modelo uma única seção editável:

```text
@@embedded

[id=contrato]
name=contrato.pdf
mime=application/pdf
encoding=base64
data=data:application/pdf;base64,BASE64
@@end
```

O editor da GUI cria essa seção pelo seletor nativo, com limite de 8 MiB e formatos derivados das capacidades do backend. IDs duplicados, Base64 inválido, MIME/extensão divergentes, referências ausentes ou definições sem uso impedem o envio. A seção não integra `^^^` nem `$postagem$`; caminhos e URLs continuam com o mesmo comportamento.

Quando o anexo aparece no inicio ou fim do modelo, o texto adjacente pode ser enviado como legenda do proprio anexo quando o WhatsApp Web permitir. Quando aparece no meio, a ordem do modelo e preservada com partes separadas.

Arquivos `.ogg` sao inspecionados. Se forem apenas audio, sao enviados como mensagem de voz separada exatamente naquela posicao do modelo.

## Navegador

O projeto detecta Chrome, Chromium ou Edge automaticamente. Para indicar manualmente:

```env
PUPPETEER_EXECUTABLE_PATH=C:\caminho\ficticio\chrome.exe
```

Para reutilizar um navegador ja aberto, ele precisa ter sido iniciado com depuracao remota:

```powershell
& "C:\caminho\ficticio\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\pasta\ficticia\chrome-whatsapp"
```

Depois configure:

```env
BROWSER_URL=http://127.0.0.1:9222
```

Uma janela comum aberta sem depuracao remota nao pode ser controlada pelo Puppeteer.

## Sessoes

Sessoes independentes podem ser controladas por CLI ou GUI:

```powershell
node main.js --new-session Comercial --gui
node main.js --session Comercial --gui
node main.js --remove-session Comercial
```

Se houver multiplas sessoes e a CLI nao receber `--session`, o terminal solicita uma escolha. A GUI permite alternar ao vivo reiniciando o client, porque o perfil do WhatsApp precisa ser definido antes de abrir o WhatsApp Web.

## Ambiente

Variaveis opcionais comuns:

```env
MIN_DELAY_MS=8000
MAX_DELAY_MS=20000
MESSAGE_DIFF_THRESHOLD_PERCENT=10
RESEND_AFTER_HOURS=48
TEMPLATE_VARIANT_MIN_LENGTH=96
GUI_PORT=3137
WA_CLIENT_ID=campanha_teste
```

Se `GUI_PORT` estiver ocupada, a interface tenta automaticamente portas próximas, como `3138` e `3139`, e informa a URL efetiva no console.

A GUI permite ajustar parâmetros operacionais em três escopos: execução atual, global e sessão. A herança efetiva é execução, sessão, global e default. Configurações de sessão são persistidas em JSON local e carregadas automaticamente na próxima abertura da sessão correspondente. As restrições de mínimos, máximos e relações entre parâmetros são centralizadas em `src/config-restrictions.json`.

## Atualizacao

Os inicializadores de atualizacao nao dependem de `git` nem de existir `.git` na pasta local. Eles consultam a API oficial de `https://github.com/JeanCarloEM/WhatSend`, priorizam a Release marcada como Latest e usam a branch `main` somente quando nao houver release valida. Quando a Release tiver asset `WhatSend-v<versao>[-<canal>].zip`, esse ZIP distribuivel e preferido ao tarball de codigo-fonte.

```powershell
.\atualizar.cmd
```

```bash
sh ./atualizar.sh
```

Antes de baixar o pacote remoto, o atualizador compara os metadados da API com `whatsend-version.json`, arquivo operacional pequeno mantido no root e publicado junto da release. Para Releases, a comparacao usa `tag` e commit SHA; para `main`, usa o commit SHA da branch. Se a versao instalada ja corresponder a remota, o pacote nao e baixado e `npm install` nao e executado.

Durante a copia, arquivos operacionais locais sao preservados, incluindo `clientes.csv`, `texto.md`, `.env`, `logs/`, `.wwebjs_auth/`, `.runtime/` e `node_modules/`. Depois disso, o script roda `npm install` com download automatico do Puppeteer desativado, valida o navegador com `scripts/ensure-browser.js` e so entao grava o novo `whatsend-version.json`.

O botão Atualizar da GUI abre painel visual para atualizar somente `whatsapp-web.js`, todas as dependências, o software oficial ou reverter a última atualização. A seleção e confirmação são obrigatórias porque versões novas podem quebrar o ambiente estável. O backend registra um snapshot em `.runtime/updates`, poda dependências órfãs e tenta restaurar automaticamente software, dependências e metadados se uma operação falhar; sessões, configurações, dados e logs não entram no snapshot nem são alterados.

## Releases

O comando abaixo gera `dist/`, `dist/whatsend-version.json` e o ZIP distribuivel:

```powershell
npm run build:dist -- --version 1.2.0 --channel beta --commit-sha HASH_COMPLETO --official-release
```

Regras de nome:

```text
stable -> WhatSend-v1.2.0.zip
beta   -> WhatSend-v1.2.0-beta.zip
alpha  -> WhatSend-v1.2.0-alpha.zip
```

Em terminal local, dados ausentes sao perguntados interativamente. Em CI ou scripts, informe `--version`, `--channel`, `--commit-sha` e `--official-release` para um build oficial deterministico.

Para publicar, parta de `dev` com worktree limpo e use `npm run agent:release:publish -- VERSAO`. O adaptador local valida a autenticacao, atualiza o manifesto, executa os testes e aciona o workflow `Release`. O workflow roda as validacoes, gera o ZIP, publica tag, assets e Latest, cria o marcador `release: vVERSAO` e faz fast-forward para `main`. A interface web continua disponível por `workflow_dispatch`, desde que a branch selecionada seja `dev`.

## Validacao

Use:

```powershell
npm run check
npm run check:test
npm test
```

`npm run check` valida a campanha real e depende dos arquivos locais operacionais. `npm run check:test` usa fixtures versionadas em `test/check-clientes.csv` e `test/check-texto.md`, sem alterar `clientes.csv` nem `texto.md`.

Tambem e possivel informar paths especificos para a validacao:

```powershell
node main.js --check --check-csv test/check-clientes.csv --check-template test/check-texto.md
```

Os parametros `--check-csv` e `--check-template` sao aceitos apenas junto com `--check`. O caminho pode ser relativo ao diretorio atual ou absoluto. `npm test` usa fixtures em `test/` e nao deve alterar arquivos operacionais reais.
