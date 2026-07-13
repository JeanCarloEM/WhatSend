# Release operacional

Subordinado a `cli.md`, cenário `../release.md` e `MN-VAL`. Abrange versão, metadado, notas, tag, asset, GitHub/fornecedor, marcador e convergência. `release:publish` DEVE aceitar versão explícita, `--dry-run`, `--help` e extensões declaradas; prepara commits isolados, envia somente gatilho autorizado e confirma estado remoto quando cliente/API estiver disponível. Configuração local e hooks formais especializam remoto, branch, workflow ou observação; segredo não integra log, asset ou metadado.
