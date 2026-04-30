---
agent: claude-pageheader-hotfix
started_at: 2026-04-30T17:05-03:00
target_version: v0.11.1
status: in_progress
---

## Tópico

**Hotfix v0.11.1**: páginas internas (configurações, todos os relatórios) caíram com "This page couldn't load — A server error occurred". Causa: commit `0a3bfab` (do agente `claude-conversas-v0.10.4-fix`) marcou `src/components/page-header.tsx` como `"use client"` para usar `useLayoutEffect`, mas o componente recebe `icon: LucideIcon` (função) — funções não podem atravessar fronteira RSC → Client Component. Quebrou todas as 13 call-sites.

## Arquivos que vou tocar

- `src/components/page-header.tsx` — volta a ser Server Component, delega medição via filho.
- `src/components/page-header-height-probe.tsx` (novo) — Client Component que recebe children renderizado e ata ResizeObserver.
- `package.json` — bump 0.11.0 → 0.11.1.
- `CHANGELOG.md` — entrada hotfix.
- `docs/STATUS.md` — versão atual.
- `docs/agents/HISTORY.md` — append.

## Arquivos compartilhados que VOU modificar

- `package.json` (bump patch)
- `CHANGELOG.md`
- `docs/STATUS.md`
- `docs/agents/HISTORY.md`

## Decisões / contexto

- Solução conservadora: dividir em 2 — Server Component (PageHeader) + Client Component (PageHeaderHeightProbe). API pública inalterada — todas as 13 call-sites continuam funcionando.
- `<Icon className="..."/>` é renderizado no servidor (Lucide é universal) e o JSX resultante é passado como `children` ao client filho — isso é serializável e atravessa a fronteira sem problema.

## Bloqueios

- (vazio) — typecheck verde, 551/551 testes passando localmente.
