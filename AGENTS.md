# AGENTS.md

## Coordenação multi-agente (REGRA ABSOLUTA)

> **Hoje há 2–3 sessões Claude trabalhando simultaneamente neste repositório, em features distintas.**
> Sem este protocolo, dá conflito de merge, sobrescrita de trabalho, commits que quebram o build, deploys empilhando.

### Protocolo completo

O protocolo está descrito em **`docs/agents/_README.md`**. Resumo aqui — e os arquivos que materializam:

- **`docs/agents/active/<agent-id>.md`** — quem está trabalhando agora (1 arquivo por agente, criado no início, deletado no fim).
- **`docs/agents/HISTORY.md`** — log append-only do que foi feito (1 linha por commit relevante).
- **Este `AGENTS.md`** — checklist obrigatório (abaixo).

### Início da sessão (obrigatório)

1. `git fetch origin main && git status` — pegar o estado mais recente do remoto.
2. `git log --oneline HEAD..origin/main` (commits remotos novos) e `git log --oneline -10` (atividade recente).
3. `ls docs/agents/active/` — quais agentes estão ativos.
4. Para cada `docs/agents/active/<other-agent>.md` ALHEIO: ler, entender o tópico do outro, identificar arquivos compartilhados.
5. `tail -30 docs/agents/HISTORY.md` — atividade recente registrada.
6. Se houver mudanças remotas: `git pull --rebase origin main`.
7. **Criar `docs/agents/active/<meu-agent-id>.md`** descrevendo o que vou fazer.

### Antes de QUALQUER mudança em arquivo

- Se ainda não criei `docs/agents/active/<meu-id>.md` — criar AGORA.
- Verificar se outro `active/*.md` declarou o mesmo arquivo na seção "Arquivos compartilhados que VOU modificar". Se sim → **PARAR e coordenar**.

### Antes de mexer em arquivo compartilhado

Estes arquivos têm alta probabilidade de conflito porque toda feature toca neles:

- `package.json` (versão, dependências)
- `CHANGELOG.md`
- `docs/STATUS.md`
- `CLAUDE.md`
- `AGENTS.md`
- `prisma/schema.prisma`
- `src/lib/queue.ts`
- `src/worker/index.ts`
- `src/components/layout/sidebar.tsx`

Antes de tocar:
1. `git log -3 --oneline -- <arquivo>` — ver quem mexeu recente.
2. Se commit muito recente (< 30 min), provável que outro agente esteja trabalhando nesse arquivo agora. Avaliar:
   - Se a mudança é independente: pode prosseguir.
   - Se há sobreposição: **PARAR**, esperar o outro agente terminar (até 1h).
3. Se vai bumpar versão (`package.json`): leia o número atual antes — pode ter sido bumpado por outro agente.

### Antes de commitar

1. **`git fetch origin main`** de novo.
2. Se há commits remotos novos durante seu trabalho:
   - `git pull --rebase origin main`.
   - Resolver conflitos manualmente (não force-push).
   - Re-rodar `npm run typecheck` e `npm test`.
3. Stage **APENAS** os arquivos que você modificou para a sua feature. **Nunca** `git add -A` ou `git add .` — pega trabalho dos outros.
4. Se aparecer untracked file que não é seu: deixar quieto. Outro agente vai commitar.
5. **Append uma linha em `docs/agents/HISTORY.md`** quando o commit é "relevante" (bump de versão, migration, mudança em arquivo compartilhado, novo spec/plan, fix urgente). Veja formato no `_README.md`.

### Antes de PUSH (deploy automático)

> Push em `main` dispara CI → Portainer redeploy. Múltiplos pushes em sequência empilham builds (~5 min cada) e o último ganha. Cuidado.

1. `gh run list --limit 5` — verificar se há build queued/in-progress.
2. Se há build de outro agente em curso:
   - Esperar terminar OU
   - Confirmar que o seu push não conflita com o que está sendo deployado.
3. Verificar status atual de produção (`curl /api/health`) — não pushar se já está caindo.
4. Push.
5. (Opcional) `gh run watch <id>` pra acompanhar.

### Fim da sessão

- **Deletar `docs/agents/active/<meu-id>.md`** — sinaliza pros outros que terminou.
- Última entrada em `HISTORY.md` se ainda não foi.

### Conflito de spec/plan

- Cada feature deve ter spec/plan próprio em `docs/superpowers/{specs,plans}/YYYY-MM-DD-<topico>-design.md`.
- Antes de iniciar: listar `docs/superpowers/specs/` e ver se há feature em progresso (data recente, `_design.md` mas sem `plans/...` correspondente, ou `plans/...` sem implementação completa).
- Se há overlap conceitual entre features (ex.: dois agentes mexendo no Dashboard), **escolher um**: o que tem spec mais antiga geralmente continua, o outro espera ou pivota.

### Como saber em que outros agentes estão trabalhando

Sinais que indicam trabalho em paralelo:

- `git status`: arquivos modificados (sem staged) que você não tocou.
- `git log --oneline -10`: commits muito recentes (< 30 min) com hash diferente do seu.
- `docs/superpowers/specs/`: arquivos `*-design.md` recentes não escritos por você.
- `package.json` versão bumpada quando você não bumpou.
- `CHANGELOG.md` com entrada nova.

Se identificar o tópico de outro agente (ex.: "Conversas Poderoso", "Dashboard v0.10"):
- **Não toque nos arquivos da feature dele**, mesmo se parece simples.
- Use os commits/specs dele como contexto pra evitar duplicação.
- Se sua feature **depende** de algo que ele está fazendo: pause sua execução, anote o ponto, retome quando ele commitar e push.

### Em caso de dúvida: PERGUNTAR ao João

Se não está claro se uma mudança vai colidir com trabalho de outro agente — pergunta. É barato. Conflito de merge é caro.

---

## Regras de runtime (Next.js 16)

### Server Actions — apenas funções async no export

Arquivos `src/lib/actions/**/*.ts` (ou qualquer outro com a diretiva `"use server"` no topo) **só podem exportar funções `async`**. TypeScript types e interfaces também são permitidos (são erased no build).

**PROIBIDO** em qualquer arquivo `"use server"`:
- `export const FOO = 123;` ou outras constantes runtime.
- `export { FOO };` re-exportando uma const/objeto/classe vinda de outro módulo.
- `export function fn() {...}` síncrona — só `async function`.
- `export default <objeto/classe>`.

Next.js 16 valida em **runtime** (não no build/typecheck/jest) e lança o erro fatal:

```
⨯ Error: A "use server" file can only export async functions, found <type>.
  digest: '<hash>@E352'
```

Isso aparece como tela full-screen "This page couldn't load — A server error occurred" + logout. Para o usuário fica completamente quebrado em produção.

Se precisa expor uma constante derivada da action: importe-a direto da lib não-server (`@/lib/llm/exchange-rate`, `@/lib/...`) no consumer. Não re-exporte do arquivo da action.

Histórico: incidente v0.12.0–v0.12.1 (commit `327655a`/`5f3788f` ainda continham o problema; corrigido em v0.12.2).

---

## Dev environment tips
- Install dependencies with `npm install` before running scaffolds.
- Use `npm run dev` for the interactive TypeScript session that powers local experimentation.
- Run `npm run build` to refresh the CommonJS bundle in `dist/` before shipping changes.
- Store generated artefacts in `.context/` so reruns stay deterministic.

## Testing instructions
- Execute `npm run test` to run the Jest suite.
- Append `-- --watch` while iterating on a failing spec.
- Trigger `npm run build && npm run test` before opening a PR to mimic CI.
- Add or update tests alongside any generator or CLI changes.

## PR instructions
- Follow Conventional Commits (for example, `feat(scaffolding): add doc links`).
- Cross-link new scaffolds in `docs/README.md` and `agents/README.md` so future agents can find them.
- Attach sample CLI output or generated markdown when behaviour shifts.
- Confirm the built artefacts in `dist/` match the new source changes.

## Repository map
- Document the major directories so agents know where to work.

## AI Context References
- Documentation index: `.context/docs/README.md`
- Agent playbooks: `.context/agents/README.md`
- Contributor guide: `CONTRIBUTING.md`
