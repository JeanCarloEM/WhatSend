<!-- Gerado por npm run agent:handoff. Nao editar manualmente. -->
# Implementacoes em andamento

Resumo operacional gerado de `.agents/continue.ia`.

## FT-004 - Anexos embedded e painel visual de atualizacao

Objetivo: Adicionar anexos embedded Base64 em modelos sem alterar a sintaxe de caminhos nem o pipeline de anexos, substituir o seletor textual de atualizacao por painel visual e publicar 0.2.1-beta somente apos validacao integral.

<table>
<thead><tr><th>Etapa</th><th>Tarefa</th><th>Status</th></tr></thead>
<tbody>
<tr>
<td rowspan="3">Contrato e documentacao</td>
<td>Mapear pontos de extensao, formatos suportados e invariantes de compatibilidade</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Definir sintaxe embedded deterministica, referencia segura e regras de validacao</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Atualizar RCF, README e guia operacional antes ou junto da implementacao</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td rowspan="4">Backend de anexos embedded</td>
<td>Separar definicoes do final global sem interferir em ^^^, postagem, variaveis ou expressoes</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Validar IDs, Base64, MIME, extensao, integridade, referencias e definicoes ociosas</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Resolver bytes na mesma fila, ordem, legenda e retentativa do pipeline atual de anexos</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Assegurar limite e fail-safe sem alterar dados operacionais</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td rowspan="4">GUI</td>
<td>Inserir arquivo pelo seletor nativo a partir das capacidades reais do backend</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Codificar de forma assincrona, criar ID estavel e inserir referencia e definicao sem bloquear a interface</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Preservar cursor, selecao, abas, conteudo e ordem em abrir, editar e salvar</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Substituir prompt de Atualizar por modal visual com acoes, aviso, confirmacao e progresso backend</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td rowspan="4">Validacao</td>
<td>Cobrir caminhos tradicionais, embedded, MIME suportado, ^^^, preview e envio</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Cobrir duplicidade, orfandade, Base64 invalido e definicao ausente ou nao utilizada</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Executar sintaxe, testes, check, build e validacao dist</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td>Confirmar ausencia de regressao no pipeline, GUI estatica, CLI e distribuicao</td>
<td><span style="color:#15803d">&#9679;</span> concluído</td>
</tr>
<tr>
<td rowspan="3">Release 0.2.1-beta</td>
<td>Validar preflight, commits, metadados e artefatos sem falha pendente</td>
<td><span style="color:#ca8a04">&#9679;</span> em andamento</td>
</tr>
<tr>
<td>Publicar obrigatoriamente pelo mecanismo normatizado de release</td>
<td><span style="color:#64748b">&#9679;</span> pendente</td>
</tr>
<tr>
<td>Confirmar commit, tag, assets, Latest, historico e convergencia dev/main</td>
<td><span style="color:#64748b">&#9679;</span> pendente</td>
</tr>
</tbody>
</table>
