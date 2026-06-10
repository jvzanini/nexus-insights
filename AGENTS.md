# AGENTS.md

## Fluxo de trabalho (REGRA ABSOLUTA deste projeto)

> **Decisão do dono (João, 2026-06-10):** trabalhar **sempre direto na `main`**, em **sessão única**. **Sem worktrees, sem pasta `branches/`, sem branches de feature, sem PRs internos.** O protocolo multi-agente/worktrees de outros projetos **NÃO se aplica aqui** e sobrescreve qualquer regra global em contrário. Detalhes em `docs/agents/_README.md`.

### Ciclo de cada alteração

1. **Editar direto na `main`.** Investigar → implementar (TDD quando há código testável) → validar.
2. **Validar antes de commitar:** `npx tsc --noEmit` + `npm test` (ao menos da área tocada) verdes.
3. **Commits atômicos** (um assunto por commit), Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
4. **Registrar** uma linha em `docs/agents/HISTORY.md` a cada commit/release relevante (formato no `_README.md`).
5. **Atualizar docs canônicas** numa release: `CHANGELOG.md`, `STATUS.md`.

### Antes de PUSH (push em `main` dispara deploy)

> Push em `main` → GitHub Actions (`build.yml`) builda → GHCR → Portainer redeploy. Pushes em sequência empilham builds (~5 min cada). Evitar pushes redundantes.

1. `gh run list --limit 5` — não pushar com build em curso (esperar terminar).
2. `curl /api/health` — checar produção.
3. `git push origin main`.
4. Após o build: `portainer-fix.yml -f app_version=vX.Y.Z -f fix_worker_cmd=false` carimba o `APP_VERSION` (o build não seta sozinho).
5. Validar `/api/health` (`version`, `status=ok`). Cold start mostra `down` por ~10-20s e recupera.

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
