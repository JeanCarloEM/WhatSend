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

Um arquivo pode conter multiplas variacoes separadas por uma linha com `^^^`. Quando todos os blocos atingem o tamanho minimo configurado, a distribuicao entre destinatarios e circular.

## Listas e filtros

A lista padrao e `clientes.csv`. Listas alternativas ficam em `listas/`:

```powershell
node main.js --lista base_exemplo
node main.js faturamento base_exemplo
```

Se o parametro tiver expressao de filtro, ele sera aplicado sobre `clientes.csv`:

```powershell
node main.js --lista "status=ativo"
node main.js --lista "valor>=10,5 && status!=cancelado"
node main.js --lista "($.isnum(valor) && valor>0) || $.istrue(vigente)"
```

Comparadores aceitos:

```text
=  !=  <  <=  >  >=
```

Operadores logicos:

```text
&&  ||  ^^  !
```

Tambem sao aceitos parenteses, `+`, `-`, `*`, `/` e funcoes:

```text
$.vazio(coluna)
$.isnum(coluna)
$.isfloat(coluna)
$.isint(coluna)
$.isbool(coluna)
$.istrue(coluna)
$.istring(coluna)
```

Numeros podem usar `.` ou `,` como separador decimal. Valores booleanos reconhecem variacoes comuns como `sim`, `nao`, `true`, `false`, `1`, `0`, `ativo`, `inativo`, `vigente`, `cancelado`, `valido` e `invalido`, com tratamento de acentos quando aplicavel.

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

URLs sao baixadas uma vez para cache temporario e reutilizadas quando a mesma URL aparece novamente. Arquivos locais inexistentes falham na pre-validacao.

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

## Validacao

Use:

```powershell
npm run check
npm test
```

`npm run check` valida a campanha real e depende dos arquivos locais operacionais. `npm test` usa fixtures em `test/` e nao deve alterar `clientes.csv` nem `texto.md`.
