# Plan v1 — Suite Agente Nex · Polish (v0.20.0)

**Status:** rascunho alto-nível, 19 tasks. Pente-fino #1 abaixo.

## Tasks

**T0 — Auditoria (2)**
- T0a: ler `prompt.test.ts` para confirmar quais asserções precisam atualizar.
- T0b: ler `bar-chart.tsx` para entender estrutura do tick antes de adicionar custom tick.

**T1 — Backend (6)**
- T1a: `pricing.ts` + entry `gpt-4o-mini-transcribe` + tests.
- T1b: `transcribe.ts` migra para gpt-4o-mini-transcribe + fallback whisper-1 + retorna tokens.
- T1c: `/api/nex/transcribe` passa tokens reais para logUsage.
- T1d: `prompt-compose.ts` IDENTITY_BASE enxuta + atualizar tests.
- T1e: `ensure-tables.ts` adiciona seed Personality/Tom (idempotente).
- T1f: `usage-stats.ts → getUsageStats` aceita filtro `provider?: string` (afeta 4 queries internas).

**T2 — UI (9)**
- T2a: `<PromptPreviewCard>` refactor (B1 banner + B5 explicação + B6 layout fix + B7 Sheet→Dialog + botão Editar).
- T2b: `<KbSection>` remove botão "Adicionar API Chatwoot (sugerida)".
- T2c: `<InteractiveAreaChart>` + `<InteractiveBarChart>` modo "menor que zero" (A3).
- T2d: `<DonutWithCenter>` outerRadius 80→88 + fonte central text-2xl→text-xl.
- T2e: `<InteractiveBarChart>` custom XAxis tick com provider tag (3.E + providersByModel prop).
- T2f: `<ConsumoContent>` integra linha total destaque (A2) + filtro global Provider (3.F) + pageSize CustomSelect (3.G) + passa providersByModel pra bar chart (3.E).
- T2g: `<UsageDetailSheet>` nota condicional whisper-1 vs gpt-4o-mini-transcribe (A1).
- T2h: criar 4 ProviderIcons SVG (`src/components/icons/providers/{openai,anthropic,gemini,openrouter}-icon.tsx`) + index `getProviderIcon`.
- T2i: `<LlmCredentialsManager>` — botão sem gradient (C1) + condicional 0/≥1 (C2) + integrar ProviderIcons (C3).

**T3 — Doc/release (1)**
- T3a: bump 0.18 → 0.20 + CHANGELOG + STATUS + runbook + memory.

**T4 — Verify/Deploy (1)**
- T4a: typecheck + jest + build + push + gh run watch + portainer-fix + /api/health + HISTORY.

**Total: 19 tasks.**

## Pente-fino #1

1. **T2f gigante:** consumo-content cobre 4 mudanças. Quebrar em sub-tasks ou aceitar como uma. v2: aceitar (todas tocam o mesmo arquivo, sequencial inevitável).
2. **T2c +T2e ambas mexem em bar-chart.tsx:** combinar ou sequenciar. v2: combinar em uma task T2-CHART.
3. **T1d testes:** pode quebrar muitos testes. v2: T1d inclui task de varredura.
4. **T2i +T2h interdependentes (ícones precisam existir antes):** v2: T2h DEPOIS T2i? Não, T2h primeiro (cria), T2i usa.
5. **T1f mudança no shape de retorno:** pode quebrar callers. v2: confirmar via grep antes de bumpar shape.
6. **T2a cobre 4 mudanças (B1+B5+B6+B7):** ok agrupar — tudo no mesmo componente.
7. **T1b fallback vs single attempt:** v2 cravar 1 retry max, se ambos falham propaga erro.
8. **T2c modo subcent edge case:** maxValue=0 (todos zeros) NÃO ativa modo. v2 cravar.

8 achados. v2 corrige.
