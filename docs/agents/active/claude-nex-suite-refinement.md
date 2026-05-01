---
agent: claude-nex-suite-refinement
started_at: 2026-05-01T20:30-03:00
target_version: v0.16.0
status: in_progress
---

## Tópico
Refinamento da Suite Agente Nex (chaves-api UI + configuração UI + 4º tier + catálogo expandido + prompt redesign + KB URLs + per-account URLs + playground drawer + consumo polish + calendar global) v0.16.0.

## Arquivos que provavelmente vou tocar
- src/app/(protected)/agente-nex/{chaves,configuracao,prompt,consumo}/page.tsx
- src/app/(protected)/configuracoes/page.tsx (per-account URLs)
- src/components/agente-nex/{llm-config-form,prompt-config-form,playground,kb-section,kb-upload-dialog,resources-toggles}.tsx
- src/components/ui/calendar.tsx (segunda-feira + remover dias overflow)
- src/lib/llm/catalog.ts (4º tier + 200+ modelos)
- src/lib/llm/pricing.ts
- src/lib/actions/nex-prompt.ts (KB URL)
- src/lib/actions/nex-chat.ts (prompt baseline + URL per account)
- src/lib/nex/prompt.ts (system prompt update — Nexus Chat / Insights)
- src/lib/reports/cost-detail.ts (drill-down)
- prisma/schema.prisma (KbDocument tipo URL + ChatwootAccountUrl mapping?)
- src/components/reports/usage-table.tsx + usage-charts (custo polish)

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.15.4 → 0.16.0)
- CHANGELOG.md (release notes v0.16.0)
- docs/STATUS.md
- prisma/schema.prisma (KbDocumentType + per-account URL)

## Decisões / contexto importante
- Workflow rigoroso: spec v1→v2→v3 (2 pente-finos), plan v1→v2→v3 (2 pente-finos), depois subagent-driven-development com TDD por task, ui-ux-pro-max em todas tasks UI.
- 4º tier de classificação de preço: $/$$/$$$/$$$$ (azul/amarelo/laranja/vermelho).
- KB aceita PDF, TXT e URL agora.
- Per-account URLs: /configuracoes ganha card de mapeamento (account_id → URL pública), Agente Nex monta deep-links.
- Calendar global: começa segunda + dias overflow escondidos (não selecionáveis).
- Casas decimais KPIs: 4 (round half up). Tabela detalhada: bruto.

## Bloqueios
- (vazio)

## T0a — AlertDialog API (lida)
- Componentes: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogMedia`, `AlertDialogPortal`, `AlertDialogOverlay`.
- Base: `@base-ui/react/alert-dialog`.
- AlertDialogAction = `<Button>` do projeto (aceita `variant="destructive"` etc).
- AlertDialogCancel = `<Button variant="outline" size="default">` por default (aceita override).
- `<AlertDialogContent size="default" | "sm">`. Trigger via `<AlertDialogTrigger render={...}>` ou usar `open`/`onOpenChange` direto na Root.
- AlertDialog (Root) aceita `open` e `onOpenChange` via `AlertDialogPrimitive.Root.Props`.

## T0b — Como spread cartão é aplicado em `cost_brl` (decisão de drill-down)
- `getUsdBrlRate()` retorna `{ rate, commercial, spread, source, fetchedAt }`. `rate = commercial × spread` (já tem spread embutido).
- `usage-logger.logUsage` salva `usd_to_brl_rate = r.rate` (com spread) e `cost_brl = costUsd × r.rate` (com spread).
- Spread por chamada **não é persistido** — é setting global em `app_settings.llm.usd_brl.card_spread`.
- **Decisão para drill-down (D13):**
  - Linha "Cotação USD/BRL aplicada" → `usdToBrlRate` da row (taxa final com spread embutido).
  - Linha "Spread cartão atual (informativo)" → `getCardSpread()` lido em runtime + nota "Spread vigente — pode ter sido diferente na época desta chamada."
  - Linha "Custo final BRL" → `cost_brl` da row.
  - Linha "Cotação base (sem spread, estimada)" → `usdToBrlRate / spread_atual` com nota "estimativa usando spread atual."
- Migration futura (fora desta release) poderia adicionar `card_spread` por linha em `llm_usage` para auditoria precisa. Documentado no runbook.

## T0c — CHANGELOG e runbooks
- CHANGELOG.md formato Keep-a-Changelog adaptado: header `## [vX.Y.Z] YYYY-MM-DD — título`. Subseções `### Fix`, `### Implementação`, `### Compat`, `### Notas`.
- `docs/runbooks/` existe com 5 runbooks. Padrão de naming: `<topico>.md`.
- 3 runbooks novos a criar: `agente-nex-prompt-v0.16.md`, `consumo-drill-down-v0.16.md`, `chatwoot-account-urls.md`.

## T0d — react-day-picker
- v9.14.0 instalado. v9+ aceita `weekStartsOn` como prop direta (0=Domingo, 1=Segunda).

## Status
- Spec v1 → v2 → v3 escrita ✅ (51 achados de pente-fino aplicados).
- Plan v1 → v2 → v3 escrito ✅ (50 tasks granulares com TDD + ui-ux-pro-max em UI).
- T0 (auditoria preliminar) executada ✅ (achados documentados aqui).
- T1-T8 (implementação + verificação + deploy) **a executar em sessão dedicada via subagent-driven-development**. Com 50 tasks, cada uma com test-first + ui-ux-pro-max + commit, é trabalho de várias horas — não cabe em sessão única sem context compaction.

## Próximos passos (handoff)
1. Sessão nova invoca `superpowers:subagent-driven-development` com este plan.
2. Executar T1a → T8d em ordem.
3. Push + gh run watch + /api/health.
4. Atualizar HISTORY.md + deletar este active file.
