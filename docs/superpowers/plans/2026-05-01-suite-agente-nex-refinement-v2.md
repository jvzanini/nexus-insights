# Plan — Suite Agente Nex · Refinamento (v0.16.0) — v2

**Status:** rascunho intermediário (50 tasks, ordem ajustada). Pente-fino #2 abaixo. Plan v3 final em `2026-05-01-suite-agente-nex-refinement.md`.

## Tasks (alto nível, ordem corrigida pelos achados v1)

### Bloco T0 — Auditoria preliminar (5)
- T0a, T0b, T0c, T0d (usar endpoint público OpenRouter — não requer auth), T0e.

### Bloco T1 — Schema & Migration (4 + dep)
- T1a, T1b, T1c, T1d.
- **Pré-T1**: `npm install node-html-parser` (dependência de T2c).

### Bloco T2 — Backend libs (5)
- T2a, T2b, T2c (depende node-html-parser), T2d, T2e.

### Bloco T3+T5a — Catálogo + TierBadge (interdependentes) (3)
- T3-T5a: `<TierBadge>` 4 variantes (atualiza tipo CostTier).
- T3a: `catalog.ts` (catálogo + tiers usando novo tipo).
- T3b: tests.

### Bloco T4 — Server Actions (3)
- T4a, T4b, T4c.

### Bloco T5 — UI Components restantes (11)
- T5b (SearchableSelect customMode), T5c (KpiCard subtitle), T5d (Calendar — usar test funcional, não snapshot), T5e (AreaChart), T5f (BarChart), T5g (Donut), T5h (PromptPreviewCard), T5i (PlaygroundSheet), T5j (KbUrlForm), T5k (UsageDetailSheet), T5l (UsageTableFilters).

### Bloco T6 — Page integrations (10 — quebrado de 6)
- T6a: chaves + LlmCredentialsManager (header padronizado + AlertDialog).
- T6b: configuracao (respiro + customMode + 4 tiers + catálogo).
- T6c: prompt (preview card + override AlertDialog + playground action; **remove playground.tsx**).
- T6d-1: consumo — PeriodPills + título "Histórico de chamadas" + ícone Activity (D1+D5+D11).
- T6d-2: consumo — gráficos (AreaChart + BarChart + Donut) (D7-D10).
- T6d-3: consumo — KPIs uniformes 4 casas + min-h (D4+D6).
- T6d-4: consumo — tabela colunas + filtros (D15+D16).
- T6d-5: consumo — tabela total + drill-down + paginação (D12+D13+D14+D17+D18).
- T6e: configuracoes ChatwootUrlsCard.
- T6f: KbSection AlertDialog + atalho Chatwoot API.

### Bloco T7 — Doc / release (4)
- T7a, T7b, T7c, T7d.

### Bloco T8 — Verification & Deploy (4 — quebrado de 3)
- T8a: tests + typecheck + build local.
- T8b: smoke visual.
- T8c: **migration manual em produção via runbook** (antes do push).
- T8d: push + gh run watch + /api/health + HISTORY.

**Total: 50 tasks** (com sub-tasks de T6d).

---

## Pente-fino #2 — achados (plan v2)

11. **T0e (Whisper) precisa de credencial DB produção** — local dev pode não ter dados reais. **v3: documentar que T0e roda em produção (read-only) com SQL específico, e fica registrado mesmo sem ação imediata se discrepância for explicada.**
12. **T2e IDENTITY_BASE atualizado** — qualquer test existente de `composeSystemPrompt` que assertava texto antigo (string literal) vai quebrar. **v3: T2e inclui update dos tests existentes em `__tests__/prompt.test.ts`.**
13. **T4c subselect SQL pesado em ranges grandes** — totals com `WITH filtered AS (...)` em milhões de rows pode estourar. **v3: T4c usa `EXPLAIN ANALYZE` antes de mergear; index existente em `created_at` deve cobrir; documentar em comentário.**
14. **T5b customMode UX edge case**: usuário cola texto colado com newlines no input. **v3: trim newlines + sanitize antes de submit.**
15. **T5h preview card depende de composeSystemPrompt isomorphic.** **v3: T2e tem subtask explícita "garantir prompt.ts não importa node:fs nem dynamic deps"; sinalizar em comentário.**
16. **T5i PlaygroundSheet vs sidebar do app** — Sheet com side="right" não pode brigar com sidebar lateral existente. **v3: confirmar z-index hierarchy; sheet z-1900 > sidebar z-???.**
17. **T6d-5 paginação "X por página" altera URL** — se URL tem `?page=2&pageSize=25` e usuário muda para 50, página atual provavelmente vira inválida. **v3: trocar pageSize reseta page=1.**
18. **T6e ChatwootUrlsCard UX**: super_admin com 0 accounts no banco (sistema novo) → card vazio. **v3: empty state "Nenhuma conta Chatwoot detectada ainda. Aguarde a sincronização rodar."**
19. **T7a CHANGELOG conflict** — se outro agente paralelo bumpar versão durante esse trabalho, conflito. **v3: T8d primeiro `git fetch` + `git pull --rebase`; T7a o mais perto do fim possível.**
20. **T8c migration deploy em produção** — usuário precisa do comando exato. **v3: runbook `chatwoot-account-urls.md` documenta o `psql ... < migration.sql` ou `prisma migrate deploy --schema=prisma/schema.prisma` exato.**
21. **T6c playground action depende de cfg + provider** — entry point precisa saber config atual pra mostrar `{Provider} · {model}` no header. **v3: T6c passa `currentConfig` como prop pro PlaygroundSheet; se não configurado, botão "Abrir playground" disabled com tooltip "Configure provider e modelo primeiro".**
22. **T5d Calendar weekStartsOn**: `react-day-picker` v9+ aceita `weekStartsOn` como número (0-6) na prop direta OU via locale. **v3: T5d sub-task de leitura `node_modules/react-day-picker/package.json` para versão exata, depois decisão.**
23. **T6d-2 gráficos**: tooltip do AreaChart usa coordinates do mouse — diferente do Donut. **v3: T6d-2 não toca em coordenadas do tooltip do AreaChart (mantém follow-mouse), só do Donut.**
24. **T6d-5 drill-down e mobile**: Sheet em mobile precisa ocupar `w-full`. **v3: confirmar `w-full sm:w-[520px]` (já especificado na spec).**
25. **T7d MEMORY.md ordem**: novo arquivo no topo da lista (recente primeiro). **v3: T7d insere linha após "Modo autônomo total" ou no topo do bloco "Releases".**

15 achados (cumulativos: 25 total no plan).

v3 incorpora todos.
