# Disparador Local de Mensagens WhatsApp

Aplicativo local em Node.js para enviar mensagens personalizadas pelo WhatsApp Web usando:

- `clientes.csv` como base de destinatários.
- `texto.md` como modelo da mensagem.
- sessão local persistida em `.wwebjs_auth`.
- logs locais em `logs/`.

O envio só acontece depois da pré-validação dos arquivos e da validação do número no WhatsApp via `client.getNumberId()`.

Todos os nomes, telefones, contas e caminhos abaixo são meramente ilustrativos.

## Requisitos

- Windows 10 ou Windows 11.
- Node.js LTS.
- Google Chrome ou Microsoft Edge instalado.
- WhatsApp ativo no celular para escanear o QR Code na primeira execução.

## Instalação

Na pasta do projeto:

```powershell
cd C:\caminho\do\projeto
npm install
```

Valide a instalação sem iniciar envio:

```powershell
npm run check
```

Se estiver tudo certo, a saída será parecida com:

```text
Pré-validação RCF concluída. Clientes: 1.
```

## Arquivos de Configuração

### `clientes.csv`

O arquivo deve existir na raiz do projeto e conter obrigatoriamente as colunas:

```csv
nome,telefone,conta
Pessoa Exemplo,11999999999,00000
```

Colunas extras também podem ser usadas no template. Exemplo:

```csv
nome,telefone,conta,agencia
Pessoa Exemplo,11999999999,00000,0001
```

Quando `${nome}` for usado na mensagem, o sistema formata o valor automaticamente:

- `pessoa exemplo` vira `Pessoa Exemplo`.
- `pessoa exemplo sobrenome extra` vira `Pessoa Exemplo`.

### `texto.md`

O arquivo deve existir na raiz do projeto e contém a mensagem enviada.

Variáveis usam o formato `${nome}`, `${telefone}`, `${conta}` ou qualquer outra coluna do CSV:

```markdown
Boa tarde ${nome}!

Relativo à sua conta ${conta}, podemos falar agora?
```

Se uma variável não existir no CSV, ela será substituída por vazio e registrada em `logs/avisos.csv`.

Exemplo completo e genérico de `texto.md`:

```markdown
![](./teste-img.png)
Olá ${nome}! Tudo bem? 👋

Este é um modelo genérico para demonstrar os recursos aceitos no `texto.md`.

Aqui você pode usar variáveis do CSV, como:

- Nome: ${nome}
- Telefone: ${telefone}
- Conta ou referência: ${conta}

Você também pode destacar uma informação com *texto em destaque* e usar _texto em itálico_ quando quiser dar outro tom à mensagem.

> Dica: revise os dados antes do envio e rode `npm run check` para validar a campanha.

Exemplo de próximos passos:

1. Conferir as informações principais ✅
2. Responder esta mensagem se houver interesse 💬
3. Ignorar caso o assunto não seja relevante 🙂

Obrigado, ${nome}!
```

Anexos podem ser indicados com a notação Markdown:

```markdown
Segue a imagem:

![](anexos/exemplo.png)

Segue também o documento:

![](C:\caminho\ficticio\arquivo.pdf)

Arquivo remoto:

![](https://exemplo.invalid/arquivo.zip)
```

O caminho pode ser relativo ao `texto.md`, absoluto ou uma URL `http`/`https`. URLs são baixadas para uma pasta temporária e reutilizadas quando o mesmo endereço aparecer novamente. Imagens são enviadas como mídia; outros tipos, como PDF ou ZIP, são enviados como documento.

Se o anexo estiver no início ou no final do `texto.md`, o texto adjacente será enviado como legenda do próprio anexo, evitando uma mensagem de texto separada:

```markdown
Mensagem enviada como legenda do anexo.

![](anexos/exemplo.pdf)
```

Quando o anexo estiver no meio do texto, o sistema envia as partes separadamente para preservar a ordem definida no arquivo.

### `.env` opcional

O projeto tenta encontrar automaticamente Chrome ou Edge no Windows. Se precisar indicar o navegador manualmente, crie um arquivo `.env`:

```env
PUPPETEER_EXECUTABLE_PATH=C:\caminho\para\chrome.exe
```

Também é possível ajustar o intervalo aleatório entre envios:

```env
MIN_DELAY_MS=8000
MAX_DELAY_MS=20000
```

Também é possível ajustar a regra inteligente de reenvio:

```env
MESSAGE_DIFF_THRESHOLD_PERCENT=10
RESEND_AFTER_HOURS=48
```

Por padrão, se o `texto.md` nativo mudar 10% ou mais em relação à versão já enviada para um telefone, o sistema considera uma nova mensagem e permite o envio. Se a mensagem for igual ou muito parecida, ela também pode ser reenviada automaticamente depois de 48 horas.

## Execução

Faça uma validação antes de enviar:

```powershell
npm run check
```

Inicie o disparador:

```powershell
npm start
```

Na primeira execução, escaneie o QR Code exibido no terminal. Depois disso, a sessão fica salva em `.wwebjs_auth`.

Durante o envio, o console exibe uma linha de status compacta com progresso, enviados, pulados, erros e avisos. A linha é atualizada no lugar para evitar excesso de mensagens na tela.

Quando um registro é pulado, o console mostra o motivo. O caso mais comum é o telefone já existir em `logs/enviados.csv`.

Para reenviar mesmo quando o telefone já consta como enviado:

```powershell
npm run start:force
```

Alias em português:

```powershell
node main.js --reenviar
```

Para limpar a lista de enviados antes de iniciar uma nova campanha:

```powershell
npm run start:clear
```

Também existem os aliases:

```powershell
npm run sent:clear
npm run start:reset
```

Alias em português:

```powershell
node main.js --reset-enviados
```

O sistema também evita reenvio de forma inteligente:

- se a mesma mensagem, ou uma mensagem menos de 10% diferente, foi enviada para o telefone há menos de 48 horas, ele pula;
- se o `texto.md` mudou 10% ou mais, ele considera uma mensagem nova e envia sem precisar forçar;
- se passaram mais de 48 horas, ele permite reenviar mesmo que a mensagem seja igual.

Esses limites podem ser ajustados no `.env`. Telefones inválidos ou números não encontrados no WhatsApp continuam sem envio.

## Logs

Os logs ficam em `logs/`:

- `enviados.csv`: números já enviados, usado para evitar duplicidade.
- `erros.csv`: falhas de envio, números inválidos ou números sem WhatsApp.
- `mensagens.json`: cache local das versões nativas de `texto.md` usadas para comparar mudanças.
- `pulos.csv`: registros pulados com o motivo.
- `avisos.csv`: avisos, como variáveis ausentes no template.

Se a execução for interrompida, rode `npm start` novamente. O sistema consulta `logs/enviados.csv` e não reenvia para números já concluídos.

## Testes

Para rodar os testes automatizados:

```powershell
npm test
```

Os testes verificam regras centrais do RCF, incluindo normalização de telefone, CSV obrigatório, deduplicação, validação antes do envio e logs.
