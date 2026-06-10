# Fluxo de trabalho deste projeto

> **Decisão do dono (João, 2026-06-10):** este projeto trabalha **sempre direto na `main`**, em **uma única sessão por vez**. **Não usar worktrees, não criar a pasta `branches/`, não criar branches de feature.** O protocolo multi-agente/worktrees de outros projetos **NÃO se aplica aqui** (sobrescreve qualquer regra global em contrário).

## Como trabalhar

1. **Tudo na `main`.** Editar, commitar e pushar direto na `main`. Sem branch intermediária, sem PR, sem worktree.
2. **Commits atômicos** por unidade de trabalho (um assunto por commit), com mensagem clara (Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
3. **Antes de pushar:** `npx tsc --noEmit` + `npm test` da área tocada verdes; e `gh run list --limit 5` para não empilhar deploys (push em `main` dispara build → Portainer redeploy).
4. **Deploy:** push em `main` → GitHub Actions (`build.yml`) builda, sobe pro GHCR e redeploya no Portainer. Depois, `portainer-fix.yml -f app_version=vX.Y.Z` carimba o `APP_VERSION` (o build não seta sozinho). Validar `/api/health`.
5. **Documentação canônica a cada release:** `CHANGELOG.md`, `STATUS.md`, e uma linha em `docs/agents/HISTORY.md`.

## `docs/agents/HISTORY.md` (mantido)

Log **append-only**, uma linha por commit/release relevante. Formato:

```
2026-06-10 13:10 | agent=claude-main | commit=<sha7> | scope=<feat|fix|docs|infra|release|revert> | summary=<1 linha>
```

Serve de rastro cronológico do que mudou e por quê — útil para retomar contexto entre sessões.

## O que foi descontinuado

- `docs/agents/active/` (arquivos de sessão ativa) — **não usar**.
- Worktrees em `branches/<slug>/`, `agente start/end/handoff` — **não usar neste projeto**.
- Checklist de coordenação entre 2–3 sessões simultâneas — **não se aplica** (sessão única).

As **regras de runtime** (ex.: Server Actions só exportam `async` — ver `AGENTS.md`) continuam **valendo**.
