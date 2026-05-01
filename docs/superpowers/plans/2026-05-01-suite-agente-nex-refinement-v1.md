# Plan — Suite Agente Nex · Refinamento (v0.16.0) — v1

**Status:** rascunho de alto nível (44 tasks). Pente-fino #1 abaixo. Plan v2 detalha; plan v3 final.

## Tasks (alto nível)

### T0 — Auditoria preliminar (5)
- T0a: Ler `src/components/ui/alert-dialog.tsx` e documentar API exata para uso em A3, C2, D13.
- T0b: Ler `usage-logger.ts` + `exchange-rate.ts` e documentar como spread cartão é aplicado em `cost_brl` (afeta D13 drill-down).
- T0c: Ler `CHANGELOG.md` head + `ls docs/runbooks/` e documentar formato/path.
- T0d: Validar OpenRouter API com curl em top-10 IDs novos (DeepSeek V4, Qwen 3.6, Grok 4.20, etc).
- T0e: SQL diagnóstico Whisper tokens vs painel OpenAI (definir hipótese real).

### T1 — Schema & Migration (4)
- T1a: Atualizar `prisma/schema.prisma` (enum NexKbKind, NexKbDocument.kind/sourceUrl, NexSettings.seededDefaultsAt, ChatwootAccountUrl).
- T1b: Gerar migration SQL `20260501_v0_16_kb_url_chatwoot_urls_audit/migration.sql`.
- T1c: Aplicar local + `prisma generate`; rodar typecheck.
- T1d: Backfill SQL guardrails default + setar seededDefaultsAt.

### T2 — Backend libs (5)
- T2a: `src/lib/llm/format.ts` (formatBrl4/formatUsd4) + tests round half-up.
- T2b: `src/lib/format/date.ts` (formatXAxisDate, formatDuration) + tests.
- T2c: `src/lib/nex/kb-url.ts` (assertPublicUrl SSRF guard + fetcher + html-to-text) + tests (incluindo SSRF).
- T2d: `src/lib/chatwoot/accounts.ts → listKnownAccountIds()` + tests.
- T2e: Update `src/lib/nex/prompt.ts` (composeSystemPrompt 3º arg accountUrls + IDENTITY_BASE atualizado) + tests.

### T3 — Catálogo (2)
- T3a: `src/lib/llm/catalog.ts` (4 tiers + 118 modelos OpenRouter + reclassificações OpenAI/Anthropic).
- T3b: Atualizar `__tests__/catalog.test.ts` e `pricing.test.ts` para nova faixa.

### T4 — Server Actions (3)
- T4a: `addKbUrlAction` + `refreshKbUrlAction` em `src/lib/actions/nex-prompt.ts` + tests.
- T4b: `setChatwootAccountUrlAction` + `listChatwootAccountUrlsAction` em `src/lib/actions/settings.ts` + tests.
- T4c: Update `getUsageDetails` (filtros provider/model + totals server-side) + tests.

### T5 — UI Components (12)
- T5a: `<TierBadge>` 4 variantes (low/medium/high/premium) + tests.
- T5b: `<SearchableSelect>` customMode (input editable inline + X reset) + tests.
- T5c: `<KpiCard>` subtitle prop + min-h-[128px] + tests.
- T5d: `<Calendar>` defaults (weekStartsOn=1, showOutsideDays=false) + snapshot test maio/2026.
- T5e: `<InteractiveAreaChart>` props yAxisCurrency/xAxisFontSize/xAxisPadding + tests.
- T5f: `<InteractiveBarChart>` mesmos props + tests.
- T5g: `<DonutWithCenter>` tooltipPosition + tests.
- T5h: `<PromptPreviewCard>` (Copiar/Maximizar/identidade collapsible) + tests.
- T5i: `<PlaygroundSheet>` (substitui playground.tsx; max 20 msgs FIFO) + tests.
- T5j: `<KbUrlForm>` + integração em `<KbUploadDialog>` tabs + tests.
- T5k: `<UsageDetailSheet>` (drill-down) + tests.
- T5l: `<UsageTableFilters>` (cascade provider→modelo) + tests.

### T6 — Page integrations (6)
- T6a: `/agente-nex/chaves` + `LlmCredentialsManager` refactor (header de provedor + AlertDialog).
- T6b: `/agente-nex/configuracao` integration (respiro + customMode + 4 tiers + catálogo).
- T6c: `/agente-nex/prompt` (preview card no topo + override AlertDialog ativação + playground action no header).
- T6d: `/agente-nex/consumo` refactor amplo (PeriodPills + KPIs + gráficos + tabela).
- T6e: `/configuracoes` ganha ChatwootUrlsCard.
- T6f: `<KbSection>` AlertDialog excluir + atalho API Chatwoot.

### T7 — Doc / release (4)
- T7a: Bump package.json + CHANGELOG entries v0.16.0.
- T7b: STATUS.md + design-system update.
- T7c: 3 runbooks: agente-nex-prompt-v0.16, consumo-drill-down-v0.16, chatwoot-account-urls.
- T7d: Memory project_v0.16_release.md + MEMORY.md update.

### T8 — Verification & Deploy (3)
- T8a: Full test suite + typecheck + build local.
- T8b: Smoke visual em ambos os temas (light/dark) + responsivo (375/768/1280px).
- T8c: Push origin/main + gh run watch + /api/health verificar; HISTORY.md update.

**Total: 44 tasks.**

---

## Pente-fino #1 — achados (plan v1)

1. **Ordem de tasks vs schema:** T1a-T1d criam schema; T2e (composeSystemPrompt) e T4 (server actions) dependem do schema. T1 deve vir antes de T2/T4. **Ordem v2:** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.
2. **T0d depende de OPENROUTER_KEY do `.env`** — se key não existe localmente, smoke curl precisa pular ou usar API pública sem auth (OpenRouter expõe `/api/v1/models` sem auth para listar). **v2: usar endpoint público.**
3. **T2c html-to-text dep**: `node-html-parser` não está no projeto. T1 ou T2 deve incluir `npm install node-html-parser`.
4. **T3 vs T5a:** `<TierBadge>` 4 variantes muda assinatura; catálogo (T3) usa `tier` literal. T3 e T5a são interdependentes — fazer T5a antes (component) ou simultâneo. **v2: T3 e T5a juntas como bloco T3-T5.**
5. **T6 são tasks gigantes:** T6d (consumo refactor) sozinho cobre ~6 mudanças (D1, D11, D12, D13, D15, D16, D17, D18) — vai consumir muito do subagent. **v2: quebrar T6d em 4-5 sub-tasks (D1+D11; D12+D15; D13; D16+D17+D18).**
6. **T8c push antes da migration:** se schema mudou e migration não rodou em produção, build/runtime quebra. **v2: T8 começa com aplicação manual da migration via runbook + only then push.**
7. **T5d snapshot test:** `react-day-picker` snapshot pode ser frágil (versões mudam HTML). **v2: usar test funcional que verifica DOM via getByRole/getByText em vez de snapshot.**
8. **Audit logs:** Tasks T4a/T4b mencionam mas T1d (backfill) não. Backfill deveria logar `setting_seeded` também. **v2: T1d log opcional pois é bootstrap — mas adicionar nota.**
9. **Falta task de remoção de `playground.tsx` antigo:** T5i menciona "substitui playground.tsx" mas remover arquivo é parte de T6c (integration). **v2: T6c explícita "remover src/components/agente-nex/playground.tsx".**
10. **T3a vs reclassificação tests:** quando reclassifica gpt-5.5-pro → premium, pode quebrar testes que esperavam `tier: "high"`. **v2: T3b detalha update por modelo afetado.**

10 achados. v2 corrige.
