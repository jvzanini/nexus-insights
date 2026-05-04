---
agent: claude-l8-ui-conexoes
started_at: 2026-05-04T08:30-03:00
target_version: v0.36.0
status: in_progress
---

## Tópico
L8 T8.3-T8.5 UI super_admin /configuracoes/conexoes (Fase 1 do épico Multi-tenant Realtime). Subagent de `claude-multitenant-realtime-fase1`.

## Arquivos que vou tocar (criar)
- `src/app/(protected)/configuracoes/conexoes/page.tsx`
- `src/components/settings/nexus-chat/connection-list.tsx`
- `src/components/settings/nexus-chat/connection-form-dialog.tsx`
- `src/components/settings/nexus-chat/binding-list-sheet.tsx`
- `src/components/settings/nexus-chat/binding-form-dialog.tsx`
- `src/components/settings/nexus-chat/__tests__/*.test.tsx`

## Arquivos compartilhados que VOU modificar
- Nenhum.

## Decisões / contexto importante
- ui-ux-pro-max:ui-ux-pro-max invocada antes de codar — padronização: badges status `bg-{emerald,amber,rose}-500/10 text-{...}-600 dark:text-{...}-400 ring-{...}-500/20`, JobsPanel-like padding (Card `rounded-2xl border border-border bg-muted/30 p-2`), cursor-pointer em todas ações, ARIA labels em ícones-only, mascaramento mono (font-mono tabular-nums) com bullets, Sheet width 480, toast Sonner verde/vermelho, empty state ícone Database muted + CTA.
- Server Actions já prontas (T8.1/T8.2): `src/lib/actions/nexus-chat/{connections,bindings}.ts`.
- Stage só meus arquivos via path explícito; `git commit --only`. Não tocar HISTORY.md. Não push.

## Status
- 🟡 In progress.
