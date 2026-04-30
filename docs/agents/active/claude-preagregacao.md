---
agent: claude-preagregacao
started_at: 2026-04-30T11:00-03:00
target_version: v0.8.0 (já deployada)
status: in_progress
---

## Tópico

Hotfix Bad Gateway + release v0.8.0 (pré-agregação) + ajustes pós-deploy (Portainer worker fix + correção getAccountsToRefresh).

## Arquivos que estou tocando agora

- `docs/agents/*` — protocolo de coordenação multi-agente (peça 1 desta sessão).
- `AGENTS.md` — atualização do checklist com referências aos novos arquivos.
- `CLAUDE.md` — link curto pro novo protocolo.
- `.github/workflows/portainer-{debug,fix}.yml` — operação remota.
- `src/lib/actions/jobs.ts`, `src/worker/jobs/pre-agregacao/shared.ts` — fix do bug `revoked_at`.

## Arquivos compartilhados que VOU modificar

- `AGENTS.md` (atualização da seção de coordenação)
- `CLAUDE.md` (linha pequena referenciando docs/agents/)

> NÃO toco em: package.json (já v0.9.0 pelo agente paralelo), CHANGELOG.md (idem), prisma/schema.prisma (estável desde a migration de v0.8.0).

## Decisões / contexto

- v0.8.0 já está em produção. App v0.9.0 (env Portainer atualizada via workflow `portainer-fix`).
- Worker em produção tinha 2 bugs: (a) Args apontavam pra path inexistente, (b) faltava copiar `src/lib` no Dockerfile, (c) entrypoint detectava worker mode só em `$1`. Os 3 corrigidos no commit `9f85481`. Build em curso.
- Erro vermelho na tela `/configuracoes/jobs` era `column "revoked_at" does not exist`, não tabela ausente. Corrigido em `479be9a`. Build em curso.

## Bloqueios

- **Build do main quebrado pelo agente `claude-dashboard-v0.10`** (run 25179079666 falhou com `Property 'topTeams' does not exist on type DashboardData...` em arquivo de dashboard que NÃO toquei). Meu fix de `getAccountsToRefresh` (commit 479be9a) só chega em produção depois que ele terminar e build verde. Aplicando o próprio protocolo de coordenação: NÃO mexo no código dele — espero terminar.
- Quando build verde, reaplicar `portainer-fix` para garantir Args do worker.

## Outros agentes detectados nesta sessão

- **claude-conversas-poderoso**: feature já deployada como v0.9.0 (commits intercalados com os meus durante a tarde). Provavelmente concluiu.
- **claude-dashboard-v0.10**: spec em `docs/superpowers/specs/2026-04-30-dashboard-v0.10-design.md`. Em progresso. Toca em `src/components/charts/*.tsx`, `src/components/dashboard/*`, queries de dashboard. **Não toquei**, mesmo encontrando typecheck error transitório nele.
