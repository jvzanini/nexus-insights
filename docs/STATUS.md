# Status — Nexus Insights

**Última atualização:** 2026-05-03
**Versão atual em produção:** v0.34.0
**URL:** https://insights.nexusai360.com

---

## Em produção (v0.34.0)

### Release v0.34.0 (2026-05-03) — Suite Agente Nex Polish v5

Feature grande + 6 polish cirúrgicos + bug fix cotação inflada (>R$6/USD). Workflow rigoroso (plan v1→v2→v3 com 50 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD · ui-ux-pro-max em toda task UI · two-stage review automático). 17 commits granulares + release commit. Bump 0.32→0.34 (pula 0.33 — agente paralelo Multi-tenant Realtime Fase 1 já commitou T0.X com prefix v0.33).

**Schema:** 4 columns aditivas em `nex_settings` (terminology JSONB + suggestions_enabled BOOLEAN + seeded_v3_at TIMESTAMPTZ + pre-seed Matrix idempotente — 8 termos: estados→inboxes, equipe→agentes, departamento→teams) + 1 column em `llm_usage` (is_playground BOOLEAN).

**Configuração:** Hardcode spread=1.10 (fix cotação inflada) · remove Spread/UsdRateTicker UI · remove botão "Criar API key" inline · toggle Nex ativo redesign (linha única).

**Prompt:** Section "Nomenclaturas e termos" entre Tom e Guardrails (cap 50 termos) · toggle "Sugestões em botões" · composeSystemPrompt injeta seções condicionais · remove frase "Preview somente leitura" · KB "Adicionar documento" → "Adicionar conhecimento".

**Bubble:** SuggestionsBar componente compartilhado · runNex extractSuggestions parser ancorado em início-de-linha · RunNexResult.suggestions não-opcional · logUsage SEMPRE chamado com is_playground flag · sendNexMessage propaga options.isPlayground · render botões clicáveis na última assistant message (Bubble + Playground).

**Consumo:** DonutWithCenter espessura mais fina (innerR 75 outerR 110) + tooltip fixo top-right (não follow-mouse) · Período "Hoje" vira hourly (24 buckets) · coluna "Origem" badge Bubble/Playground · filtro "Ambiente" CustomSelect.

### Em produção (v0.32.0)

### Release v0.32.0 (2026-05-03) — Conversas Filtros Polish v5 (Documento + redesign Avançado + Export pipeline)

9 fixes/features no menu de filtros após feedback do João sobre v0.30. Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em 4 batches sequenciais · ui-ux-pro-max em todas tasks UI). 14 commits granulares + release · 100+ tests novos verde · typecheck 0 erros.

**Destaques:**
- **F1 NEW** — filtro Documento (CPF/CNPJ/Sem) multi-select no Simples.
- **F3** — AlertDialog ao trocar Simples↔Avançado se houver dados (descarta tab origem).
- **F4** — "Limpar todos" respeita só o tab ativo.
- **F6 BUG FIX** — contador "Aplicar (N)" fantasma corrigido (não inflava mais ao trocar tabs).
- **F7 ARQUITETURAL** — operador E/OU per-par no Avançado (refator schema; codec v1→v2 auto-migra).
- **F8 VISUAL** — redesign completo do where-clause builder (ícones Filter/FolderOpen distinguem condição/grupo, conector chip clicável, indentação grupos com border-l violet, animations sutis).
- **F9 NEW** — export respeita pipeline client (searchClient + conditionGroup + documentTypes + sortStack). XLSX agora bate exatamente com a tabela visível.

**Polish:** F2 cursor-pointer nos tabs · F5 remove botões internos do `<ConditionalFilters>` (single source of truth no rodapé do FiltersDialog).

**Coordenação multi-agente:** `claude-agente-nex-polish-v031` ativo em escopo `/agente-nex/*` (skip v0.31). Commits intercalados via rebase.

### Release v0.30.0 (2026-05-03) — Conversas Polish v4 (correções v0.29: cells single-line + X adesivo)

2 fixes urgentes após feedback duro do João sobre v0.29: (1) cells da tabela voltam pra single-line com `whitespace-nowrap overflow-hidden` + larguras maiores (name 280, inbox 220, team 180, assignee 240) — sem ellipsis (clip default), casos extremos cortam discretamente; (2) X dos chips Filtros/Ordenação volta pra h-5 (pouco maior que v0.29 que era h-4) + ícone X h-3 + offset `-right-2/-top-2` (adesivo na quina superior direita do botão, 8px fora da borda).

Workflow rigoroso: plan v1→v2→v3 com 22 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em T1+T2 · ui-ux-pro-max em todas as tasks UI · 3 commits granulares · tests verde · typecheck 0 erros.

### Release v0.29.0 (2026-05-03) — Conversas Polish v3 (X duplo, X chips, colunas truncate)

3 fixes pontuais reportados pelo João via screenshots após v0.27/v0.28 LIVE: (1) X duplo no input de busca — esconde X nativo `<input type="search">` via CSS global; (2) X chips Filtros/Ordenação volta ao comportamento "discreto idle + hover vermelho" igual ao X do search (h-4 + X h-2.5 — diminuído sutilmente); (3) colunas Estado/Departamento/Atendente sem truncate (whitespace-normal + larguras maiores: 180/160/200 px) mostrando texto completo via wrap multi-line; virtualizer measureElement remede altura dinâmica.

Workflow rigoroso: plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em T2/T3 · ui-ux-pro-max em todas tasks UI · 4 commits granulares · 308/308 tests verde · typecheck 0 erros.

### Release v0.28.0 (2026-05-03) — Suite Agente Nex Polish v4 (correções v0.26)

6 fixes críticos da v0.26 reportados pelo super_admin: (1) Editar do Prompt agora abre `IdentityBaseEditor` (Textarea grande pra editar IDENTITY_BASE direto) — não mais o `PromptConfigForm` que duplicava o que está em Comportamento; (2) `<pre>` do prompt completo SEMPRE visível (collapse removido); (3) PlaygroundSheet input bar = bubble exata (`<footer>` HTML normal + Mic/Send alinhados igual ao nex-chat-panel) + placeholder "Pergunte ao agente Nex"; (4) Playground usa `sendNexMessage` com histórico (qualidade idêntica à bubble — antes usava `testNexPromptAction` sem contexto entre turnos); (5) AudioPlayer speed tag compacta (h-5 min-w-[34px] text-[9px]) cabe no balão sem vazar nas velocidades 1.25x/1.75x; (6) Dialog "Ver prompt usado" aparece corretamente via pattern Sheet suppress + z-[70] + toast.error explícito.

**Schema additive:** column `nex_settings.identity_base TEXT NULL` (NULL = usa IDENTITY_BASE hardcoded default, valor setado = override). Server Actions `saveIdentityBaseAction` e `resetIdentityBaseAction` super_admin-gated.

**Workflow rigoroso:** plan v1→v2→v3 com 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em todas as tasks UI · 9 commits granulares (E1a/E1b/E1c/E2/E3+E4/E5/E6) · typecheck 0 erros.

### Release v0.27.0 (2026-05-03) — Conversas Fixes (regressões v0.25 + bug match digits-only)

9 fixes em `/relatorios/conversas` reportados pelo João via screenshots. Workflow rigoroso (plan v1→v2→v3 com 48 achados em 2 pentes-finos · subagent-driven-development com TDD em 4 batches · ui-ux-pro-max em todas as tasks UI · code review final aprovado com 1 issue fixada). 11 commits granulares · 311/311 tests verde · typecheck 0 erros.

**Destaque (BUG FIX) — match respeita ordem dos caracteres:** removida heurística `isPhoneOrDocLike` da v0.25. Busca "3380" retornava rows com display_id 3803 (mesmos dígitos, ordem diferente) — heurística ativava match digits-only que ignorava ordem. Agora é `haystack.includes(needle)` puro: substring contígua estrita. Trade-off documentado: máscaras divergentes do haystack deixam de bater (telefones/documentos cobertos via formatos múltiplos no haystack).

**Destaque (BUG FIX) — tabela com larguras fixas:** ao rolar a tabela com virtualizer, colunas mexiam (Estado/Departamento desalinhavam). Causa: `table-layout: auto` + `min-w` nas cells. Fix: `tableLayout: fixed` + `<colgroup>` com `<col width=Xpx>` por coluna.

**Polish:** paginação volta a 1000 (era regredida pra 100); reticências volta no algoritmo (`[1, ..., page, ..., N]`); input busca lupa roxa quando ativa + X canto direito (remove tag "Filtrando" overstated); X chips Filtros/Ordenação volta ao estilo fosco (`bg-destructive/15`); Calendar DayButton ganha cursor-pointer (afeta todos os calendários); tour reordena (presets antes de export) + bump v5; "Chatwoot" → "Nexus Chat" em 3 arquivos UI user-facing do escopo.

### Release v0.26.0 (2026-05-03) — Suite Agente Nex Polish v3

Polimento dirigido por feedback do super_admin nos 4 submenus do Agente Nex. Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD · ui-ux-pro-max em toda task UI · two-stage review automático após cada task). 14 commits granulares · todos tests verde · typecheck 0 erros · sem schema change destrutivo.

**Configuração:** Reorg em 4 sections (Toggle Nex / LLM+ações inline / USD ticker reativo / Spread destacado violet card). `UsdRateTicker` novo client-side com auto-refresh hourly + manual + badge fonte (live/cache/fallback). Server Action `getCurrentUsdBrlRateAction` super_admin-gated. Dialog primitive ganha prop `overlayClassName` opcional pra override de z-index.

**Prompt:** `IDENTITY_BASE` anti-Chatwoot (regra "Nunca use 'Chatwoot'" + sempre "Nexus Chat") + máximo 3 frases por resposta. Backfill idempotente removendo guardrail "Sempre cite a fonte do número" via flag `seeded_v2_at` (match EXATO preserva customs). `PromptPreviewCard` com collapse oculto default + remoção do Maximizar + Editar **só super_admin** (Dialog max-edit com PromptConfigForm dentro + onSaved callback). Help text dos guardrails atualizado.

**Playground:** Botão "Abrir playground" destacado (variant=default violet + Sparkles + ring + min-h-44). PlaygroundSheet input bar refatorada igual à bubble (`nex-chat-panel`): Mic externo + inner area unificada + Send violet gradient + AudioRecorder embedded + transcribe API. `submitMessage(text)` único helper elimina closure stale. **Fix crítico:** Dialog "Ver prompt usado" agora com z-[60] (content + overlay) — abre POR CIMA do Sheet (era bug onde ficava por trás).

**Consumo:** DonutWithCenter defaults bumped (innerR 60→80 / outerR 80→120 / height 320→360 — mais respiro). Total no filtro destaque (text-sm + bg-violet-500/5 dark:/10 + font-bold + border-border/60). CustomBarTick case-mixed (OpenAI/Anthropic/Gemini/OpenRouter — sem `.toUpperCase`; letterSpacing 0.3; largura length*6+14). `PROVIDER_LABELS.gemini` "Google Gemini" → "Gemini". `transcribe.ts` console.warn agora inclui body do erro 4xx do gpt-4o-mini-transcribe (debug em prod do motivo do fallback whisper-1).

### Release v0.25.0 (2026-05-03) — Conversas Polish + busca client-side global

7 ajustes em `/relatorios/conversas` (6 polish + busca client-side global) + 1 bug fix (HighlightedText sem normalize de acentos). Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos · subagent-driven-development com TDD em todas as tasks · ui-ux-pro-max em toda task UI · code review final aprovado com 2 issues fixadas antes do push). 16 commits granulares · 298/298 tests verde nas áreas tocadas · typecheck 0 erros · sem schema change.

**Destaque arquitetural — busca client-side global:** `search` saiu dos `reportFilters` que iam pra SQL (eliminando quebra quando o Chatwoot estava stale e a invalidação de cache a cada keystroke). Virou state local em `ConversasPageClient` que filtra rows hidratadas via `matchSearchClient` — algoritmo OR sobre 11 campos (display_id ±#, name, phone com/sem máscara, identifier CPF/CNPJ com/sem máscara, inbox/team/assignee, status pt-BR, prioridade pt-BR, labels[], custom_attributes ignorando `_*`). Normaliza acentos via NFD + remove combining marks. Esc limpa busca. Cap defensivo de 50.000 conversas por período (banner amarelo informativo quando ultrapassa). pageSize SQL bumpado de 1k → 50k; MAX_LIMIT em conversas-list.ts de 10k → 50k; clamp interno paralelo bumpado de 5k → MAX_LIMIT. Cache key Redis estável durante busca. URL `?q=` é hidratada na montagem (compat com URLs antigas) mas não volta pra URL (efêmera).

**Polish:** SORT_OPTIONS ganha "Documento" (chip não mostra mais label em inglês); Etiquetas no chip sem `(N)` padroniza summarize; sort dialog "Adicionar critério" sem coluna pré-selecionada (placeholder "Selecione uma coluna" + Aplicar disabled se algum critério tem key vazio + React key fix); X destrutivo nos chips Filtros/Ordenação (h-5 + bg-destructive ring no hover); cursor-pointer global em 13 arquivos da seção Conversas; paginação simplificada `[1, page, N]` sem reticências (atual no meio continua dropdown).

**Bug fix:** `<HighlightedText>` agora normaliza NFD — busca "joao" destaca "João" (antes encontrava match mas não pintava). `buildIndexMap` walk char-a-char preserva acentos no render.

### Release v0.24.0 (2026-05-03) — Suite Agente Nex Polish v2 (anterior)

### Release v0.23.0 (2026-05-03) — Conversas Polish (busca funciona, single-day fix, paginação no topo, badge Enter, X adesivo, sorting anti-dup, highlight)

19 ajustes em `/relatorios/conversas` incluindo 3 bugs críticos: busca não filtrava (`page.tsx` descartava `search`), single-day filter retornava 0 (TZ em datetime-core), sorting permitia duplicar coluna em múltiplos critérios. Polish: badge ↵ Enter inline (estilo Command+K, layout não quebra mais), highlight em violet das matches da busca em todas colunas + drill-down, paginação no TOPO da tabela com formato "Mostrando X-Y de Z conversas", ConversasPagination simplificado (1/1-2/1-2-3/1-2-3-4/1...N/1...mid...N) com Popover dropdown nas reticências e Popover no atual no meio, FiltersDialog (sections fechadas + "Limpar todos" só zera filtros + header dinâmico simples/avançado), X "adesivo" na quina dos chips Filtros/Ordenação (remove lixeirinhas separadas), calendar padrão da plataforma (`defaultMonth=today` + text-xs/h-7 — afeta 8+ telas), tour `conversas-v4` ganha step "Total + paginação". Spec v3 com 25+33 achados de pente-fino · plan v3 com 20+18 achados · ui-ux-pro-max em todas tasks UI.

### Release v0.24.0 (2026-05-03) — Suite Agente Nex Polish v2

Polish dirigido por feedback do super_admin (após v0.20.0 LIVE) na Suite Agente Nex. Workflow rigoroso (spec v3 com 25 achados em pente-fino + plan v3 com 9 tasks TDD + ui-ux-pro-max em todas as tasks UI). 6 commits granulares · 1311 testes PASS · typecheck 0 erros · sem schema change.

**A. Consumo do Agente Nex** — `EmptyConsumoState` removido (dashboard SEMPRE renderiza zerado, com KPIs "0", `EmptyChartState` nos gráficos e "Nenhuma chamada no período." na tabela; tela "Ir para Configurações" escondia o dashboard inteiro); donut volta à espessura padrão (`innerRadius` 60 + `outerRadius` 80) + centro com `px-6` para respiro; tooltip do donut segue o cursor (default Recharts + `offset={12}`, removido `position={{x:0,y:0}}` que prendia no top-right; prop `tooltipPosition` marcada `@deprecated`); bar chart com Badge SVG (rect transparent + stroke opacity 0.3 + text uppercase opacity 0.6, largura dinâmica) substitui `(OpenAI)` entre parênteses; linha total sutil (`bg-muted/30` + `text-xs uppercase font-semibold` + label "Total no filtro" puro, troca o destaque violet+Sigma+contagem); `<ChevronRight>` opacity 0 → 60 no hover indica clicabilidade nas linhas; tooltip explicativo na cotação USD→BRL (`cursor-help` + `underline decoration-dotted` + `title` citando AwesomeAPI cache 4h + spread cartão).

**B. Bubble do Agente Nex** — drill-down de chamada `whisper-1` cita "(legado)" + redireciona pra `gpt-4o-mini-transcribe` (v0.20+) + aponta runbook `agente-nex-audio-e-kb-url.md`; hint "Enter envia · Shift+Enter quebra linha" usa `invisible` (não `null`) na transição idle ↔ gravando, preservando altura do container e eliminando reflow do componente; AudioPlayer speed button ganha `min-w-[44px]` para acomodar todos os labels (1×, 1.25×, 1.5×, 1.75×, 2×) sem stretch — não vaza mais para fora do balão violet.

### Release v0.22.0 (2026-05-02) — Dashboard Polish

Pacote de polish do `/dashboard` dirigido por feedback visual e bugs reais. Workflow rigoroso (spec v3 com 22 achados de pente-fino + plan v3 com 18 achados + subagent-driven-development com TDD por task + ui-ux-pro-max em UI). 9 commits granulares · 34 testes novos · typecheck verde.

**A. PeriodNavigator tag-style (G1)** — text-sm font-medium + h-7 botões + chevrons h-4 + padding generoso (px-2 py-1.5 rounded-lg). Mesma fonte/altura das checkboxes Recebidas/Abertas/Resolvidas/Pendentes.

**B. KPIs do topo no padrão consumo (G3, G4)** — `KpiClickableCard` reorganizado: label UPPERCASE em cima, valor 3xl bold, trend abaixo, subtitle "no período" muted, ícone top-right; sparkline e hover "ver detalhes" preservados. min-h 8rem.

**C. Drill-downs alinhados (G4, G8)** — "Inbox" → "Estado" em UI; coluna **Departamento** adicionada (JOIN teams); tag âmbar pill em "Quando"; `<TotalBadge n>` violeta nos títulos das seções; Distribuição por estado com yAxisWidth 160 + altura proporcional (todos os labels visíveis); Distribuição por hora labels HH:00. `DrillDownSection.title` aceita ReactNode.

**D. Drill-down "Conversas sem resposta" (G5, G6, G7)** — `<WaitingBucketsDonut>` substitui "Resumo / Snapshot atual" com 4 buckets (0–4h, 4–24h, 1–3d, >3d); **bugfix de contagem 31 vs 11**: `getNoResponseDrillDown` alinhado ao widget (`last_activity_at` + `message_type IN (0,1)` no `last_msg`); tabela perde "Última msg" (redundante) e ganha Departamento + tag âmbar em "Esperando há".

**E. Investigação G2 (chart Semana/Mês ≠ Dia)** — 7 sanity tests provam invariant client-side (soma horária == agregado diário). Diagnostic logging server-side em `dashboardData()`. Hotfix v0.22.1 após análise de logs em produção, se persistir.

**F. Cache keys bumpadas** — received-v4, resolved-v4, status-v4, no-response-v2, by-team-v2.

**Notas:** sem schema change · 34 testes novos · coordenação multi-agente respeitada (não tocou `dashboard/page.tsx`, charts genéricos, `agente-nex/*`, `prompt.ts`).

### Release v0.21.0 (2026-05-02) — Empresa Ativa Global (auditoria + 3 tools Nex + contexto)

Tornar o `AccountSwitcher` do sidebar a fonte ÚNICA e GLOBAL de escopo. Workflow rigoroso (spec v3 com 13+12 achados em 2 pente-finos + plan v3 com 15 achados + subagent-driven-development com TDD). 11 commits granulares · 15 testes novos · typecheck verde · code review autônomo APROVADO.

**A. Hardening do helper** — `getActiveAccountId(user)` envolto em `cache()` do React, valida via `getAccessibleAccountIds` e devolve a **primeira conta permitida** (fail-closed) em vez do antigo `DEFAULT_ACCOUNT_ID=9` hardcoded; lança `NoAccessibleAccountError` quando o user não tem nenhuma conta. **Layout DRY** — `(protected)/layout.tsx` deixa de duplicar a lógica e passa a chamar o mesmo helper. **`assertAccountAccess` em todas as 8 pages** (defense in depth de 5 camadas: cookie HttpOnly + helper + assertAccountAccess + WHERE account_id + chatwoot_readonly somente SELECT).

**B. Tools introspectivas do Agente Nex (read-only, sem secrets)** — `get_active_company` (`{ id, name, platformRole, companyRole, isOwner }` com fallback "Empresa #N"); `get_integrations_status` (filtrado por `accountIdFilter`, gating super_admin para `lastSyncAt`); `get_nex_config_summary` (provider/model/KB/audio/visibilidades, NUNCA secrets); `buildActiveCompanyContext` injeta bloco "═══ CONTEXTO ATIVO ═══" no system prompt em `run-nex.ts` (sem tocar `prompt.ts`).

**C. Documentação canônica** — runbook `docs/runbooks/escopo-por-empresa.md` (tabela 22 surfaces + invariantes + comando de auditoria contínua + follow-ups). Spec + plan + 2 pente-finos cada um, commitados para rastreabilidade.

**Notas:** sem schema change · cookie `nexus_active_account` mantido · 15 testes novos · coordenação multi-agente respeitada (não tocou `prompt.ts`/`schema.prisma`/`agente-nex/*` do `claude-nex-suite-polish-v020`).

Runbook: `docs/runbooks/escopo-por-empresa.md`.

### Release v0.20.0 (2026-05-02) — Suite Agente Nex Polish

Pacote consolidado de polish da Suite Agente Nex (lançada em v0.15.x e refinada em v0.16.0), dirigido por feedback do super_admin. Workflow rigoroso (spec v3 com 49 achados de pente-fino + plan v3 com 14 tasks granulares TDD + ui-ux-pro-max em todas as tasks de UI). 1235 testes verde · schema sem mudanças (apenas seed adicional).

**A. Consumo do Agente Nex** — Whisper migrado para `gpt-4o-mini-transcribe` (50% mais barato, $0.003/min, retorna tokens reais via `usage.input_token_details.audio_tokens`; fallback silencioso para `whisper-1` em qualquer 4xx/5xx; histórico legado mantém "—"); linha total na tabela com destaque (`bg-violet-500/15` + ícone Sigma + label "Total no filtro" uppercase + colspan=3); Y-axis "menor que zero" (max < R$ 0,01 → 2 ticks "R$ 0,00" + "< R$ 0,01"); donut outerRadius 80→88 + valor central text-2xl→text-xl; **filtro global de Provider** ao lado do PeriodPills com URL state shareable (`?provider=openai`) afetando KPIs + 3 gráficos + sync com tabela; bar chart "Custo por modelo" exibe nome + tag "(Provider)" embaixo; PageSize migrado para `<CustomSelect>` (não nativo).

**B. Prompt do Agente Nex** — **PromptPreviewCard** com banner "Preview somente leitura" + botão "Editar" + cursor-text/aria-readonly; **IDENTITY_BASE radicalmente enxuta** (~14 linhas, 1063 chars vs ~3000 antes — sem se apresentar a cada turno, sem jargão técnico interno; lista de proibição preservada; asserção `length < 1500` anti-regressão); Personality + Tom default seedados (idempotente via `seeded_defaults_at`, não sobrescreve); "Modo override avançado" renomeado para **"Modo manual"** com tooltip + AlertDialog de ativação; "Mostrar identidade fixa" renomeado para "Ver identidade fixa do agente (somente leitura)"; **Maximizar via Dialog** centralizado (max-w 900px max-h 85vh, substitui Sheet lateral); KB perde atalho "Adicionar API Chatwoot (sugerida)".

**C. Chaves de API** — Botão "Nova chave" sem gradient (variant="default" consistente); lógica condicional 0/≥1 (provider vazio → CTA só no empty state; com chaves → só no header); **logos SVG dos 4 providers** (OpenAI / Anthropic / Google Gemini / OpenRouter) com `currentColor` substituem iniciais.

Runbook: `docs/runbooks/agente-nex-audio-e-kb-url.md` (transcribe gpt-4o-mini-transcribe + KB URL pipeline + erros UX + bug `output_tokens=0`).

### Release v0.19.0 (2026-05-02) — Conversas Polish (paginação 1k + drill-down + filtros UX + calendar fix)

Polimento + hotfixes do `/relatorios/conversas`: paginação clássica 1.000-em-1.000 com indicador total + páginas + elipsis substitui cursor pagination + banner amarelo + bug do `limit` faltando; drill-down visual minimal (border-l violet + animação fade-in + sempre todos atributos com cap defensivo 200); busca UX (banner pendente exclui search + hint sutil + skip-link sr-only puro); chips +N expansíveis em popover com X individual + "Remover todos"; X dos chips com hover destrutivo; calendar `showOutsideDays={false}` (fix do PeriodPills, propaga pra 8+ telas da plataforma); minDate reset por accountId; tour `conversas-v3` + step Atalhos. Spec v3 com 30+18 achados de pente-fino · plan v3 com 20+33 achados · ui-ux-pro-max em todas tasks UI.

### Release v0.18.0 (2026-05-01) — Integrações + Power BI (super_admin only)

Novo menu **Integrações** com primeira integração **Power BI**. Workflow rigoroso (spec v3 + plan v3 com double-check, ~140 testes verde, typecheck 0 erros).

- **Novo menu Integrações** (super_admin only) — sidebar entre Agente Nex e Usuários, hub `/integracoes` com 5 cards (Power BI ativo + Looker Studio, Tableau, Excel/CSV, Webhooks "Em breve").
- **Power BI integration completa** — `/integracoes/power-bi` com lista de perfis + wizard 4 passos (Identificação → Tabelas 5 facts + 5 dims → Colunas com essential pré-marcadas → Filtros opcionais por account/team), detail page (Resumo / Whitelist / Credenciais / Auditoria) com banner retry, connect page com 3 abas (Desktop passo a passo + Service/Gateway recomendado + Snippet M accordion).
- **Provisioning automático** — schema isolada `powerbi` no banco interno, 1 user Postgres + senha AES-256-GCM por perfil, views derivadas com RLS opcional, GRANTs explícitos + CONNECTION LIMIT 5, idempotente via catch `42710`, `pg_terminate_backend` antes de DROP USER. Reveal/rotate rate-limited Redis (5/dia / 10/dia), soft-delete com confirm-by-typing.
- **Worker dim-sync** (cron 30 min, UPSERT em transação) + **reconcile** (cron 6h, drift detection vs `pg_roles`/`pg_views`).
- **10 camadas de segurança** — schema isolada + `BLOCKED_TABLES_REGEX` + views derivadas + GRANTs explícitos + connection limit + TLS obrigatório + IP allowlist + auditoria 100% + AES-256-GCM + rate limit.
- **Schema** — 2 tables (`integration_profiles`, `integration_audit_logs`), 3 enums novos, 6 valores adicionados ao `AuditAction`. Migration `20260501_add_integrations_power_bi` (manual deploy).

Runbook: `docs/runbooks/integracoes-power-bi.md` (pré-requisitos infra + sequência deploy + smoke staging 17 etapas + rollback + troubleshooting).

> v0.17.0 foi tomada pelo agente paralelo Conversas Revamp; Power BI Integrations bumpou pra v0.18.0 (fallback declarado no protocolo multi-agente).

### Release v0.17.0 (2026-05-01) — Conversas Revamp (export + busca + drill-down + virtualização)

Revamp do `/relatorios/conversas`: export XLSX completo (50k linhas, colunas dinâmicas top-50 por chave de `custom_attributes`, header congelado, status/prioridade pt-BR), busca server-side por Enter (ILIKE OR em 11 campos com escape E'\\'), drill-down inline 3 seções (WhatsApp/Etiquetas/Atributos sem espaço fantasma), coluna #ID clicável substitui coluna Ações (hover violet + tooltip + nova aba), remoção de paginação visual + botão Carregar mais + seletor 100/Todos, virtualização com `@tanstack/react-virtual` (preserva thead sticky), LoadingOverlay polish (label dinâmico + blur-md + fade-in motion-safe), tour `conversas-v2` atualizado. Spec v3 com 27+19 achados de pente-fino · plan v3 com 14 tasks TDD · ui-ux-pro-max em toda task UI.


### Release v0.16.0 (2026-05-01) — Suite Agente Nex · Refinement

Pacote consolidado de polish da Suite Agente Nex (lançada em v0.15.x). Workflow rigoroso (spec v1→v2→v3 com 51 achados de pente-fino + plan v1→v2→v3 com 50 tasks granulares TDD + ui-ux-pro-max em todas as tasks de UI). 982 testes verde · typecheck 0 erros · build verde.

**A. Tela "Chaves de API"** — header padronizado (ícone + label + atalho "Criar API key" + botão "Nova chave" gradient), AlertDialog substituiu `window.confirm` na exclusão, card vazio com 2 CTAs amigáveis.

**B. Tela "Configuração do Agente Nex"** — `space-y-8` com sections `border-t`, modelo customizado **inline** (`<SearchableSelect customMode>`), 4 tiers (low / medium / high / **premium** novo para >$30/M output), catálogo OpenRouter expandido para **118 modelos** (DeepSeek V3/V4/R1, Qwen 2.5/3/3.6, Llama 3.1/3.3/4, Mistral, Cohere R/R+, xAI Grok 2/3/4/4.20/4.3, Phi-4, Hermes 3, Liquid LFM, Reka, Perplexity Sonar, Inflection, etc).

**C. Tela "Prompt do Agente Nex"** — **PromptPreviewCard** novo (preview client-side em tempo real via `composeSystemPrompt` isomórfico), "Modo override avançado" → **"Modo prompt manual"** com AlertDialog warning, **PlaygroundSheet** lateral substitui playground inline (max 20 msgs FIFO efêmero), IDENTITY_BASE blindada contra "ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google" como identidade, guardrails default seedados via `seeded_defaults_at` (idempotente), KB aceita **URL** com SSRF guard (`assertPublicUrl` bloqueia RFC1918 + loopback + link-local + cloud metadata) + fetcher 10s/5MB/html-to-text.

**D. Tela "Consumo do Agente Nex"** — PeriodPills compartilhada com /relatorios/conversas, KPIs uniformes 4 casas decimais (`formatBrl4`/`formatUsd4`) + `min-h-[128px]`, ícone `Activity` (era `PhoneCall`), gráficos com eixo Y `R$` 2 casas + fonte 13px + datas `30/ABR`, donut tooltip top-right (não cobre mais o donut/centro), tabela renomeada **"Histórico de chamadas"**, filtros server-side cascateados Provider→Modelo, linha total sticky no topo, drill-down `<UsageDetailSheet>` com 5 seções (Identificação/Tokens/Duração/Custo/Erro) + spread embutido + Whisper "—" tokens, paginação 3-zonas (25/50/100), USD/BRL bruto na tabela.

**E. Calendar global** — `weekStartsOn=1` (segunda-feira) + `showOutsideDays=false` por default em todos os usages (resolve bug visual maio 1-2 não aparecendo em abril).

**F. URLs Públicas Chatwoot** — card novo em `/configuracoes` (super_admin only): lista accounts via `listKnownAccountIds()` (DISTINCT em `chatwoot_facts_daily_by_account`) + input URL + Salvar explícito por linha (UPSERT; URL vazia → DELETE; audit). Schema novo `model ChatwootAccountUrl`. Agente Nex injeta seção "## URLs públicas das contas" no system prompt (apenas com override desligado e ≥ 1 account configurada). Deep-links formato `{publicUrl}/app/accounts/{accountId}/conversations/{conversationId}`.

**G. Schema, Audit, Deploy** — migration aditiva `20260501_v0_16_kb_url_chatwoot_urls_audit`: `nex_kb_documents` ganha `kind` + `source_url`; `nex_settings` ganha `seeded_defaults_at`; tabela `chatwoot_account_urls` nova; backfill condicional dos 5 guardrails default. Audit log universal em toda mutação (prompt config, KB doc, ChatwootAccountUrl).

Runbooks: `docs/runbooks/agente-nex-prompt-v0.16.md`, `docs/runbooks/consumo-drill-down-v0.16.md`, `docs/runbooks/chatwoot-account-urls.md`.

---

## Releases recentes

### v0.15.x — Suite Agente Nex (sidebar dedicado + áudio + prompt config)

- **v0.15.0** (2026-05-01) — Menu lateral `/agente-nex` (4 sub-páginas: Configuração / Chaves / Prompt / Consumo). Gravação de áudio na bolha (Whisper, cap 5 min), AudioPlayer custom (5 velocidades + seek), copy button universal, system prompt configurável (personalidade/tom/guardrails/override), KB PDF/TXT (`pdf-parse`, cap 30k chars), playground inline, toggles audio+KB, redirect 308 `/configuracoes/consumo` → `/agente-nex/consumo`.
- **v0.15.1** — Hotfix microfone bloqueado por `Permissions-Policy: microphone=()` → `microphone=(self)`.
- **v0.15.2** — Hotfix UX bubble audio (3 bugs): input bar reorganizado, timer respeita pause via `recordedMsRef + segmentStartedAtRef`, AudioPlayer speed dropdown vira botão cíclico Gauge.
- **v0.15.3** — Hotfix AudioRecorder unmount loop: instância única sempre montada; só siblings (textarea + Send) renderizam condicional.
- **v0.15.4** — Hotfix UX bubble audio refinements (4 ajustes): AudioPlayer speed sem ícone Gauge (texto puro + border-violet); input bar layout estável (`flex items-end gap-2` idêntico em idle e gravando); player aparece imediatamente ao enviar (audioMsg + loadingMsg antes do Whisper); persistência IndexedDB para áudios (`src/lib/nex/audio-storage.ts` saveAudio/getAudio/deleteAudio/clearAllAudios + skeleton "carregando áudio…").

### v0.14.x — Dashboard polish

- **v0.14.0** (2026-05-01) — Pill "Hoje"→"Dia", PeriodNavigator (← →) no canto sup-direito do chart, eixo X cobrindo todo o range (semana/mês inteiros), `forcedGranularity`, `formatWaiting` centralizado, cache key v5→v6.
- **v0.14.2** (2026-05-01) — Coorte por `last_activity_at` em open/pending/no-response/byTeam/topInboxes/byStatus(0,2,3); received/resolved e byStatus(1) mantêm `created_at`. Bug crítico resolvido: conversa criada 30/04 reaberta 01/05 não aparecia em "Abertas". SQL chart com FULL OUTER JOIN de 2 CTEs. Cache v6→v7.
- **v0.14.3** (2026-05-01) — Bug "Tudo respondido" mesmo com conversa do contato sem resposta: CTE `last_msg` pegava activity (msg_type=2) e template (msg_type=3) como "última msg". Fix: `WHERE m.message_type IN (0,1)`. Cache v7→v8.

### v0.13.x — Dashboard configurabilidade + LLM hotfixes

- **v0.13.0** (2026-04-30) — Configurações de Dashboard (início da semana + modo current/rolling), drill-down de status completo, paginação server-side 50/pg, eixo X cheio 0–24h, pills `7 dias`→`Semana`/`30 dias`→`Mês`.
- **v0.13.1** — Backfill BRL: `cost_brl` + `usd_to_brl_rate` em rows BRL=NULL (cotação atual cartão como aproximação retroativa).
- **v0.13.2/v0.13.3** — Rollback parcial (ConversationsLineChart simplificado + `getDashboardPeriod`/`getDashboardSettings` removidos por ReferenceError em runtime).
- **v0.13.4** — `deepTestOpenAI`: 404 e 400 capturam o body e exibem mensagem oficial da OpenAI no toast.
- **v0.13.5** — `PROVIDER_CATALOG.openai` reescrito com 19 IDs reais (validados em developers.openai.com/api/docs/models/all). Removidos IDs inventados (gpt-5.1-mini etc).
- **v0.13.6** — Probe "Testar conexão" usa `max_completion_tokens=256` e trata "max_tokens limit reached" como `reachable=true`. `translateProviderMessage(raw, model)` mapeia padrões EN→PT em todos os providers.
- **v0.13.7/v0.13.8/v0.13.9** — Dashboard chart redesenhado: `formatDuration "1 dia"/"3 dias"`, `actions/dashboard.ts` voltam com try/catch defensivo + FALLBACK_SETTINGS, 4 séries multi-cor, eixo X cheio. Hotfix RSC error: `dashboard-settings` simplificado (sem `server-only` + WHERE key IN literal). Visibility Agente Nex Matrix IA fix.

### v0.12.x — Credenciais LLM + BRL

- **v0.12.0** (2026-04-30) — Credenciais (API keys) gerenciáveis por provedor (CRUD com ponto verde marcando a ativa). Cotação USD→BRL cartão capturada por chamada (`llm_usage.cost_brl` + `usd_to_brl_rate`, AwesomeAPI cache 4h, spread `app_settings.llm.usd_brl.card_spread` default 1.10). Custo BRL como primário no Consumo Nex. "Agente IA" → "Agente Nex" em todos call-sites. Schema (runtime via `ensureLlmTables`): `llm_credentials`, `llm_configs.credential_id` (NULL), `encrypted_api_key` NULLABLE.
- **v0.12.1** — GPT-5.x/o-series usam `max_completion_tokens` sem `temperature`. `MODEL_PRICING` atualizado abril/2026. Card Agente Nex com abas internas (Configuração/Chaves de API). Spread cartão sem limite superior + custos com 3 casas decimais. Visibility Matrix IA "Ninguém" respeitada inclusive para super_admin. Tarja preta no overscroll eliminada. `safeAction` wrapper em Server Actions.
- **v0.12.2** — Root cause "couldn't load": `src/lib/actions/exchange-rate.ts` tinha `export { DEFAULT_CARD_SPREAD }` em arquivo `"use server"`. Next.js 16 só aceita exports de funções async. Regra: arquivos em `src/lib/actions/**` só exportam funções async + tipos.
- **v0.12.3** — `GET /v1/models` valida só a chave; `POST /v1/chat/completions` valida o modelo. `backfillUsageCosts()` recalcula `cost_usd` em rows com `cost_usd=0`. `runNexAgent` registra `logUsage` por iteração de tool-call.

### v0.11.x — Visibilidade granular

- **v0.11.0** — Visibilidade granular por relatório (Todos / Somente super admin / Ninguém) para 7 relatórios + Matrix IA. Catálogo LLM cutoff abril/2026 (GPT-5 família + Sonnet/Opus 4.7 + Gemini 2.0 Pro + OpenRouter expandido).
- **v0.11.1** — Hotfix PageHeader (Server Component) — fix "This page couldn't load" desde v0.10.4.

### v0.10.0 — Dashboard Pulse

KPIs coorte única + sem-resposta hero + distribuições clicáveis (bar/donut toggle) + drill-down central + TZ fix + account selector consolidado no sidebar.

### v0.9.0 — Conversas Poderoso

Query builder E/OU + painel ordenação cadeia + drill-down inline + sticky toolbar/thead + status feminino + etiquetas + tipografia.

### v0.8.0 — Pré-agregação + infraestrutura

Pipeline assíncrono (5 jobs BullMQ a cada 5 min) popula 6 tabelas de fatos no banco interno; relatórios `volumetria-heatmap` e `volumetria-dow` migrados; SSE de invalidação dispara `router.refresh()` ao concluir job. Página `/configuracoes/jobs` (super_admin) com botão "Backfill 90 dias". Hotfix Bad Gateway: Dockerfile com chown correto em `/app/.next` resolve EACCES; `instrumentation.ts` adiciona handlers globais; `prisma/seed.ts` com adapter (Prisma 7).

### v0.7.0 — Polimento UX + Agente Nex 2.0

Sidebar/filtros/tour/largura + catálogo 42 modelos atualizados + deep test + auto-save.

---

## Plataforma

### Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui (`render` prop, NUNCA `asChild`)
- **Auth:** NextAuth v5 (JWT, Credentials, bcryptjs, session refresh por requisição via callback `jwt`)
- **DB app:** Postgres + Prisma v7 (`@prisma/adapter-pg`, client de `@/generated/prisma/client`)
- **DB Chatwoot:** Postgres read-only
- **Cache/queue/realtime:** Redis 7 + BullMQ + Redis Pub/Sub + SSE em `/api/events`
- **Tema:** ThemeProvider customizado via cookie SSR-aware (NUNCA `next-themes`); `fetch POST /api/user/theme`
- **Toast:** Sonner customizado (pilha bottom-up, timers independentes)
- **Ícones:** Lucide React (emojis proibidos em UI)
- **Encryption:** AES-256 (`src/lib/encryption.ts`)
- **Audit:** `src/lib/audit.ts → logAudit()`
- **Rate limit:** Redis para login + endpoints sensíveis
- **Soft delete:** padrão `deletedAt: DateTime?`
- **Testes:** Jest (`jest-mock-extended`, mocks de `@/lib/prisma`, `@/lib/auth`, `@/lib/audit`, `next/cache`)
- **Deploy:** GitHub Actions → GHCR (`ghcr.io/jvzanini/nexus-insights`) → Portainer Swarm + Traefik (SSL automático Let's Encrypt)

### Estrutura de pastas

- `src/app/(auth)` (rotas públicas) e `src/app/(protected)` (autenticadas)
- `src/lib/actions/` consolidado para Server Actions (regra: só exporta async functions + tipos)
- `src/lib/tenant.ts` (`getAccessibleCompanyIds`, `buildTenantFilter`, `assertCompanyAccess`)
- `src/lib/auth-helpers.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`
- `src/lib/nex/*` — prompt, kb, transcribe, audio-storage, ensure-tables
- `src/lib/llm/*` — credentials, get-active-config, pricing, exchange-rate, providers, queries, agent
- `src/components/nex/*` — bubble, chat-panel, message, audio-player, audio-recorder
- `src/components/agente-nex/*` — llm-config-form, prompt-config-form, resources-toggles, kb-section, kb-upload-dialog, playground
- `src/app/(protected)/agente-nex/*` — page, layout, configuracao, chaves, prompt, consumo
- `src/app/api/nex/transcribe/route.ts` — Whisper Route Handler

### RBAC

Duas camadas: `platformRole` (super_admin > admin > manager > viewer) + `companyRole` (Chatwoot multi-account, via `UserCompanyMembership`).

### Relatórios disponíveis (7)

- Dashboard / Visão Geral
- Performance
- Equipe
- Distribuição
- Origem & IA
- Conversas (15 colunas + filtros toolbar+drawer + ordenação multi-sort + busca interna)
- Mensagens não respondidas

### Funcionalidades

- **Filtros** — toolbar compacta + drawer lateral com busca interna, "Selecionar todos/visíveis", chips aplicados
- **Tour interativo** com botão `?` por relatório
- **Sidebar** com active state pílula sólida + dot violet (longest-prefix-match)
- **PageShell** com variantes wide (1600px) / narrow (1280px)
- **Visibilidade granular** por relatório (Todos / super_admin / Ninguém) + Matrix IA
- **Agente Nex** (chatbot IA bubble flutuante) com Suite dedicada `/agente-nex` (Configuração / Chaves / Prompt / Consumo)
  - 19 modelos OpenAI canônicos (validados em developers.openai.com)
  - Multi-provider (Anthropic, Gemini, OpenRouter — 42 modelos catalogados)
  - Áudio Whisper + system prompt config + KB (PDF/TXT) + playground
  - Custo BRL primário (cotação cartão por chamada)
- **Pré-agregação** — 6 tabelas de fatos refrescadas a cada 5 min via BullMQ + SSE; runbook em `docs/runbooks/pre-agregacao.md`

---

## Como continuar (em outra sessão / outro terminal)

Abrir o projeto e dizer **um dos seguintes**:

### Caso A — feature/bug pontual
> "Lê `docs/STATUS.md` (estado atual em produção) e me ajuda com [tópico]."

### Caso B — review do que está em produção
> "Faz um pente fino na produção (https://insights.nexusai360.com). Lista o que está bom e o que poderia melhorar."

### Caso C — continuar com novos relatórios
> "Lê `docs/superpowers/brainstorms/2026-04-30-novos-relatorios.md` (52 ideias categorizadas) e me ajuda a definir o que vem depois da Suite Agente Nex."

---

## Documentação canônica

- **`CLAUDE.md`** — regras supremas (skills obrigatórias + double-check + padrão arquitetural).
- **`AGENTS.md`** — protocolo multi-agente (active files + HISTORY).
- **`CHANGELOG.md`** — log de releases.
- **`docs/STATUS.md`** — este arquivo (estado atual + histórico curto).
- **`docs/agents/_README.md`** — protocolo coordenação detalhado.
- **`docs/agents/HISTORY.md`** — log append-only de atividade dos agentes.
- **`docs/superpowers/specs/`** — design docs (uma por feature).
- **`docs/superpowers/plans/`** — implementation plans (uma por feature).
- **`docs/runbooks/`** — runbooks operacionais.

Detalhes técnicos por release em `CHANGELOG.md` + design docs em `docs/superpowers/specs/`.
