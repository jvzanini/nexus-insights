# Changelog

## [v0.7.0] 2026-04-29 — Polimento UX + Agente Nex 2.0

> Polimento amplo após release v0.6.1 — atende feedback crítico do usuário sobre sidebar, filtros, conversas, tour e configuração do Agente Nex.

### Adicionado

- **`<PageShell variant="wide" | "narrow">`** — wrapper de largura por contexto. `wide` = 1600 px (relatórios), `narrow` = 1280 px (admin). Substitui o `max-w-7xl` global do layout protegido. Resolve o problema de monitor 27" ficar com sobra inutilizada.
- **`<Sheet>` + `<CollapsibleSection>` + `<MultiSelectCheckbox>` 2.0 + `<SearchableSelect>` + `<TierBadge>`** — primitivos de UI novos para drawer lateral, seções colapsáveis, multi-select com busca e Selecionar todos/visíveis, single-select com busca, e badge de consumo (FREE / $ / $$ / $$$).
- **Filtros — toolbar compacta + drawer**: substitui o cards-de-multi-select por toolbar com Período + Busca + chip "Filtros · N" que abre drawer lateral com 5 seções colapsáveis (Caixa de entrada, Departamento, Atendente, Status, Prioridade). Cada seção tem busca interna e Selecionar todos/visíveis. Chips de filtros aplicados aparecem inline com X por grupo + "Limpar tudo".
- **Tour de Conversas estendido** de 4 → 9 etapas: período, busca, filtros, ordenação (com explicação shift+click), colunas, page size, tabela, abrir no Chatwoot, refresh.
- **Tours estendidos / criados** para Visão Geral, Performance, Equipe, Distribuição, Origem & IA e Mensagens não respondidas.
- **`getInboxesForUser()`** — helper que respeita `reports.include_matrix_ia` + role. Aplicado nas páginas de Conversas e Mensagens não respondidas, escondendo a inbox 31 dos dropdowns para não-superadmins quando flag OFF.
- **Empty state com "Limpar filtros"** na tabela de Conversas quando há filtros aplicados.
- **PROVIDER_CATALOG (LLM)** — catálogo rico de modelos (abril/2026) por provider, com tier de custo (`free/low/medium/high`), URLs de API key e top-up. OpenAI: GPT-4o, 4.1, o1/o3/o4. Anthropic: Claude 3.5/4.5/4.6/4.7. Gemini: 1.5/2.0/2.5. OpenRouter: ~17 modelos cobrindo open-source free.
- **Configuração Agente Nex 2.0**:
  - Select de modelo via `<SearchableSelect>` com busca interna e badge de tier.
  - Primeira opção sempre **"Outro (digitar manualmente)"** — habilita campo livre.
  - Atalhos abaixo do API key: "Criar API key" + "Adicionar crédito" (links nativos por provider).
  - **Teste de conexão profundo**: detecta `invalid_key`, `model_not_found`, `no_credit`, `rate_limit`, `network`. Por provider: OpenAI usa `/v1/models` antes da chat; Anthropic detecta `credit_balance_too_low`; OpenRouter consulta saldo via `/credits`.
  - **Auto-save após teste OK** (com `creditOk !== false`). Save manual = test + save.

### Mudou

- **Tagline "Relatórios e insights" → "Relatórios Inteligentes"** no login e topo do sidebar.
- **Sidebar — active state**: pílula sólida sutil (`bg-violet-500/10` + violet text). Submenu ativo: dot violet à esquerda + sem pílula full. Sem mais "borda esquerda violet arredondada".
- **Sidebar — `isActive` longest-prefix-match**: corrige bug em que clicar em "Consumo IA" marcava também "Configurações" como ativo. Folhas usam exact / sub-rota; grupos usam prefix.
- **`AdvancedFilters`** completamente refatorado para toolbar+drawer (mantém prop API pública).
- **"Equipe" → "Departamento"** no filtro (mantém key interna `teamIds`).
- **Labels da tabela Conversas**: chips neutros (sem cor por hash). Todas as labels visíveis com `flex-wrap` (sem `+N` por padrão).
- **Atributos da tabela Conversas**: agora exibe chips `chave: valor` (com tooltip completo). `defaultVisible: true`.
- **Coluna "Ações"** da tabela Conversas: refator via `buildColumns(accountId)` factory; `<OpenInChatwoot>` definido direto no `render`.
- **Tour overlay**: popover mede altura real via `ResizeObserver` (sem mais estimativa fixa de 200 px que cortava botões); largura adapta-se a viewports < 480 px.
- **Cópia do toggle Matrix IA** ampliada: deixa explícito que afeta tabelas, gráficos, KPIs e dropdowns.
- **Origem & IA**: gating Matrix IA agora usa a flag canônica `reports.include_matrix_ia` (antes usava feature flag separada — desconexa do toggle).

### Corrigido

- **`MATRIX_IA_INBOX_ID = 31`** centralizado em `src/lib/constants/matrix-ia.ts` (evita magic number).

### Testes

- 6 novos componentes UI base com cobertura TDD: `Sheet` (3), `CollapsibleSection` (4), `MultiSelectCheckbox` (6), `SearchableSelect` (4), `TierBadge` (4), `PageShell` (3).
- `getInboxesForUser` (6 cenários: super_admin, manager flag ON/OFF, viewer, admin, stale).
- `isLeafActive` longest-prefix-match (12 cenários incluindo `/configuracoes/consumo`).
- `LabelsChips` neutro sem cap (4).
- Filtros: `AppliedFiltersChips` (8) + `FiltersDrawer` (8).
- LLM 2.0: `PROVIDER_CATALOG` shape; `deepTest` por provider mocking `fetch`.

### Quebras / migrações

- O `MultiSelectFilter` interno de `mensagens-nao-respondidas-filters.tsx` foi substituído pelo `<MultiSelectCheckbox>` 2.0 (drop-in compatível).
- Páginas em `src/app/(protected)/*` agora envolvem o conteúdo em `<PageShell>` (não havia `max-w-*` direto no `page.tsx` antes — era do layout). Sem impacto funcional.

---

## [v0.6.1] 2026-04-29 — Tabela Conversas parruda + Busca global + Tour + Toggle Nex/Matrix IA

### Corrigido (crítico)
- **Erro 500 em `/relatorios/performance`, `/equipe`, `/distribuicao`, `/visao-geral`, `/origem-ia`**: Server Components passavam funções (`render`, `formatValue`) diretamente para Client Components — proibido em React 19/Next 16. Criados 4 client wrappers (tempos-resposta-bar, sla-policies-table, ranking-atendentes-table, por-estado-table) e 10 contents foram envolvidos em try/catch com `<ErrorState>` em vez de propagar exception.
- **Bug `column t.color does not exist` em /relatorios/conversas**: schema da tabela `tags` do Chatwoot tem só id/name/taggings_count. Removida referência a `t.color`. `<LabelsChips>` agora gera cor determinística via hash do nome.
- **BadgeSelect dropdown não abria** (status na tabela /usuarios + nível no dialog Editar): classes `scale-95 opacity-0 fill-mode-forwards` deixavam o popover invisível para sempre. Removidas. Z-index elevado para 1000.

### Adicionado
- **Wizard 3 etapas no Novo/Editar Usuário** voltou: Identidade → Acesso (condicional por nível) → Confirmação. Super_admin pula etapa Acesso (banner "Acesso total"); admin/viewer com multi-select de contas; gerente com contas + departamentos. Stepper visual no topo.
- **Dropdown Nível de acesso** virou combobox vertical (não pill) com ícone + label semibold + descrição + check, via portal/fixed pra não ser cortado pelo dialog.
- **Owner immutability total**: owner não pode ser editado/deletado por NINGUÉM (incluindo si mesmo via /usuarios — edita-se via /perfil). Super_admin pode editar/deletar OUTROS super_admin não-owner. 28 testes em `permissions.ts`.
- **Busca global Cmd/Ctrl+K** na sidebar:
  - Barrinha no topo da sidebar (substitui o conteúdo onde estava o account switcher)
  - Modal full-screen com portal + backdrop blur
  - Busca em Empresas (contas Chatwoot) + Usuários (super_admin/admin) + Páginas
  - Setas ↑↓ navegam, Enter abre, ESC fecha
  - Resultados agrupados com contadores
  - Atalho Cmd+K (Mac) / Ctrl+K (outros) detectado automaticamente
- **Account Switcher movido pro fundo da sidebar** (acima do user info).
- **Pill "Todos"** nos filtros de período: cobre desde o epoch (1970-01-01) até agora — pega TUDO do banco.
- **Custom range ILIMITADO**: removido cap de 90 dias. `mín = primeiro registro do banco` (busca via `getMinReportDate(accountId)`); `máx = hoje`.
- **`<RefreshButton>`** ícone giratório em todas as pages de relatório (router.refresh + useTransition).
- **`<LoadingOverlay>`** durante filter transitions com spinner + texto "Carregando relatório...". Provider compartilhado `<FilterTransitionProvider>` envolve `AdvancedFilters` + `PeriodSelectorUrl` + filters.
- **Toggle Matrix IA** em /configuracoes (super_admin only): Switch ON/OFF na key `reports.include_matrix_ia`. OFF: esconde inbox 31 dos não-super_admin. Super_admin sempre vê tudo. Helper `shouldExcludeMatrixIA()` aplicado em todas queries.
- **Tabela Conversas parruda** (refatoração 100%):
  - 16 colunas configuráveis: #, Nome, WhatsApp, **Documento** (CPF/CNPJ via detectDocument), Estado, Departamento, Atendente, Status, Prioridade, Labels, **Sem resposta há**, **Aberta há**, **Criado em**, **Última atualização**, atributos custom, Ações.
  - **Sort clicável** com cycle `null → asc → desc → null`, indicador `ChevronUp/Down`.
  - **Multi-sort hierárquico** via Shift+click (badge numerado 1, 2, 3 nos headers).
  - **Esconder colunas**: botão "Colunas" abre popover com checkboxes (persistido em localStorage chave `conversas-table-cols`). Padrão: todas selecionadas. Atalhos "Selecionar todas" / "Desmarcar todas".
  - **Selector de quantidade**: 50 / 100 / Todos (max 10000) — persistido em localStorage.
  - **Tempo sem resposta**: status=1 → "—". Aberta + última msg incoming → `now - last_incoming_at`. Caso contrário → "—".
  - **Tempo aberta**: status=1 → "—". Aberta + última msg outgoing → `now - last_outgoing_at`. Caso contrário → "—".
  - Cálculo via `EXTRACT(EPOCH FROM ...)` no Postgres com `CASE` por status.
  - Mobile vira cards com mesmas informações.
- **Tour/Tutorial passo-a-passo** com botão "?" no header dos relatórios:
  - `<TourProvider>` context montado no protected layout
  - `<TourOverlay>` com SVG-mask spotlight no target + halo violeta + popover adaptivo
  - Backdrop blur, animações Framer Motion respeitando `prefers-reduced-motion`
  - Tours definidos: dashboard, conversas, mensagens-não-respondidas
  - Esc fecha, setas navegam, "Pular tour" disponível
- **Toggle ON/OFF do Agente Nex bubble** em /configuracoes:
  - Bloco "Status do agente" no topo do `<LlmConfigCard>` com Switch + dot esmeralda glow (ON) / cinza (OFF)
  - Setting `nex.bubble_enabled` em `app_settings`. Default: ON quando há LLM config ativa, OFF caso contrário.
  - Layout protegido renderiza `<NexBubble />` condicionalmente.
  - Switch desabilitado quando não há config LLM (com tooltip).

### Mudanças de comportamento
- `PeriodKey` agora tem 5 valores canônicos: `hoje | semana_atual | mes_atual | todos | custom`.
- Custom range não é mais 90 dias máx — é todo o histórico do banco.
- Conversas table state (sort/cols/page-size) persistido por usuário em localStorage.

### Tests
- 279 testes Jest passando (241 → 279 desde v0.6.0).

---

## [v0.6.0] 2026-04-29 — Refazer fiel ao Roteador + Agente Nex IA + relatórios consolidados

### Corrigido
- **Filtros que aplicavam automaticamente** virou filtros com botão "Aplicar" via novo `<AdvancedFilters>` (estado interno draft vs URL applied).
- **Cap artificial de 90 dias** no custom range removido — agora cobre desde a primeira linha do banco.
- **Loading state ausente** virou skeleton screens em todas as pages (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard sem gráficos** virou /dashboard com line chart Recharts (Recebidas + Resolvidas) + 4 KPIs clicáveis com sparkline + Top 5 cards + Recent Conversations table + drill-down sheets.
- **/perfil divergente do Roteador** refeito fielmente (4 cards stack vertical: Informações Pessoais com avatar+Membro desde / E-mail / Senha / Aparência 3 toggles).
- **/usuarios divergente** refeito fielmente (BadgeSelect inline pra Nível/Status, modal único Criar/Editar — sem wizard de 3 passos, lápis + lixeira nas Ações, owner imutável).

### Adicionado
- **`<BadgeSelect>`** componente reutilizável (dropdown com badges coloridos + ícones) — usado em /usuarios pra Nível/Status inline.
- **`<AdvancedFilters>`** filtros multi-campo com botão Aplicar (não auto-apply), estado draft vs URL applied, indicador "X filtros pendentes", multi-select por inbox/team/atendente/status/prioridade.
- **`<SortableTable>`** + **`<GroupableTable>`** + **`useSortableData`** hook — ordenação clicável por coluna (asc/desc/null cycle) + agrupamento + a11y (aria-sort).
- **`<ConditionalFilters>`** Where-clause builder (AND/OR + 10 operadores eq/neq/gt/lt/contains/in/etc., grupos aninhados) + `applyConditions()` puro.
- **Charts library** (`src/components/charts/`): InteractivePieChart, DonutWithCenter, InteractiveBarChart, InteractiveAreaChart, InteractiveRadialBarChart, ChartTooltip, EmptyChartState — todos com animação 800ms, hover dim, tooltip rico, prefers-reduced-motion respeitado.
- **`<ErrorState>`** + **`<ErrorStateRetry>`** + skeleton variants (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard drill-down**: clique em qualquer KPI abre `<DrillDownSheet>` lateral com gráficos detalhados (LineChart + BarChart + AreaChart + tabela) e queries específicas por KPI.
- **5 super-relatórios** consolidando os 12 antigos:
  - `/relatorios/visao-geral` (Status pie + Volumetria)
  - `/relatorios/performance` (Tempos resposta + SLA + CSAT)
  - `/relatorios/equipe` (Ranking + Por departamento)
  - `/relatorios/distribuicao` (Por estado + Horário)
  - `/relatorios/origem-ia` (Leads + Matrix IA)
- **Standalone**: `/relatorios/conversas`, `/relatorios/mensagens-nao-respondidas`.
- **Redirects 302** das 10 rotas antigas (status-conversas, sla, tempos-resposta, ranking-atendentes, por-departamento, por-estado, volumetria, leads-recebidos, matrix-ia, csat) para os super-relatórios.
- **Catálogo de relatórios** + **toggle ON/OFF** em /configuracoes (super_admin) — sidebar respeita imediatamente após salvar (revalidatePath).
- **Footer "Nexus AI © 2026. Todos os direitos reservados"** fixo no rodapé da sidebar.

### Agente Nex (IA com query no DB Chatwoot)
- **Bubble flutuante** `<NexBubble>` bottom-right em todas pages protegidas — gradient violet com glow pulsante, indicador online, respeita prefers-reduced-motion.
- **Chat panel** `<NexChatPanel>` (sheet bottom-right desktop / fullscreen mobile) com markdown rendering, persistência localStorage (40 msgs cap), sugestões iniciais, textarea auto-grow, Enter envia / Shift+Enter quebra.
- **7 tools (function calling):** `query_conversations`, `query_messages`, `query_users`, `query_contacts`, `aggregate_conversations`, `get_top_agents`, `get_dashboard_summary`.
- **Multi-provider LLM:**
  - Adapters via `fetch` puro pra OpenAI / Anthropic / Gemini / OpenRouter — interface comum `ProviderClient.chat({messages, tools})`.
  - Mock automático quando API key vazia/MOCK (permite UI testável sem key real).
  - Pricing por modelo (gpt-4o, claude-3-5-sonnet, gemini-2.0-flash, etc.).
- **UI config** em /configuracoes (super_admin): card "Agente IA (Nex)" com select de provider + modelo + API key (encrypted AES-256-GCM no DB) + botão "Testar conexão" + status badge.
- **Dashboard de consumo** `/configuracoes/consumo` (super_admin): KPIs (chamadas/tokens/custo), gráficos (custo por dia, distribuição por provider, custo por modelo), tabela paginada, filtros sem cap superior (mín = data de criação do sistema), pill "Tudo" cobre desde o início.
- Tabelas DB novas: `llm_configs` + `llm_usage` (criadas via `CREATE TABLE IF NOT EXISTS` idempotente).
- Logging automático de cada chamada do agente em `llm_usage`.

### Mudanças de comportamento
- `PeriodKey` canônico: 4 valores (`hoje | semana_atual | mes_atual | custom`). Fallback síncrono em `getPeriod` pra chaves legadas (ontem/7d/30d/mes_anterior) ainda funciona via Date local.
- Filtros condicionais: novo padrão Where-clause builder disponível mas ainda não aplicado em pages (uso futuro).
- Charts dos relatórios devem usar componentes de `src/components/charts/*` (B6) — Recharts direto agora é exceção.

### Removido
- 10 pages antigas de relatórios (substituídas por redirects 302 para os super-relatórios).
- `kpi-clickable.tsx`, `top5-card.tsx` (substituídos por StatsCard / KpiClickableCard / Top5ListCard).
- `edit-user-dialog.tsx`, `users-table.tsx`, `role-badge.tsx` (consolidados em `users-content.tsx` + `user-form-dialog.tsx`).
- `conversas-filters.tsx`, `period-selector.tsx` (substituídos por `AdvancedFilters` + `PeriodPills`).

### Tests
- 241 testes Jest passando (95 → 241 desde v0.5.0).
- Cobertura: helpers (datetime, filter-state, format-document, generate-temp-password, apply-conditions, calculateCost, charts colors), hooks (useSortableData), tools (Nex definitions + run-nex), providers (mock factory + interface), queries (usage-stats, catalog).

### Stack atualizado
- Recharts 3 (charts)
- Framer Motion 12 (animações)
- date-fns + date-fns-tz (datas com TZ)
- base-ui (Popover, Dialog, Sheet, Tabs)
- Lucide (icons)

---

## [v0.5.0] 2026-04-29 — Foundation + UX shell + dashboards operacionais

### Crítico (corrigido)
- **Login quebrado** (`?error=Configuration`): pg-node SCRAM falhava ao resolver `db` (DNS overlay Swarm devolvia 2 IPs, um stale). Corrigido em duas frentes: (1) `pg_hba.conf` do db container alterado pra `trust` no overlay interno; (2) `DATABASE_URL` aponta agora pra `nexus-insights_db:5432` (FQDN do serviço Swarm) em vez de `db:5432`.
- **Owner trancado pós regen-senha:** botão regen-senha **escondido** (não disabled) pra `isOwner`. Idem botão delete e dropdown de status.
- **Auth bypass Prisma:** `authorizeCredentials` e `logAudit` agora usam `pgPool` raw (`@/lib/pg-pool`) — adapter do Prisma 7 + SCRAM tava dando `AuthenticationFailed` esporádico.

### Adicionado
- **Helpers datetime** (`src/lib/datetime.ts` + `src/lib/datetime-core.ts`): `getPlatformTz()`, `getPlatformLocale()`, `getPeriodInTz()`, etc. Cache 60s, fallback `America/Sao_Paulo` / `pt-BR`. Server action `updatePlatformSettings` (super_admin) com invalidação de cache reports.
- **`platform.timezone` e `platform.locale` em AppSetting**: chaves novas, lazy default (sem migration). UI em `/configuracoes` (super_admin).
- **Senha temporária simples** (`generateTempPassword`): 8 chars alfanuméricos, sem confundíveis (`0`, `1`, `i`, `l`, `o`, `I`, `L`, `O`).
- **/perfil 4 cards** no padrão Roteador Webhook Meta: Informações Pessoais, E-mail, Senha, Aparência (3 toggles grandes Escuro/Claro/Sistema). Layout 2x2 desktop, stack mobile.
- **/usuarios redesign:** Switch de status virou Select dropdown; coluna Ações com lápis editar (EditUserDialog 3 tabs); regen + delete escondidos pra owner; NewUserDialog vira wizard 3 passos com preview da senha temp gerada.
- **Filtros pills mobile-friendly:** 4 períodos (Hoje / Esta semana / Este mês / Personalizado) com `overflow-x-auto snap-x` no mobile, Popover com calendário no desktop, Sheet bottom no mobile. Range custom max 90 dias.
- **Account switcher condicional:** escondido quando user só tem ≤1 conta.
- **TZ Brasil em todos os relatórios:** helper `resolvePeriod(searchParams)` em `src/lib/reports/resolve-period.ts`.
- **Dashboard novo:** 4 KPIs clicáveis (Em Aberto, Pendentes, Resolvidas no período, Mensagens não respondidas) + 3 cards Top 5 (atendentes mais rápidos, mais conversas em aberto, inboxes mais carregados).
- **Mensagens não respondidas (nova tela):** `/relatorios/mensagens-nao-respondidas`. Lista conversas open com última msg incoming. KPIs no topo (Total / Tempo médio / Mais antigo). Mobile cards.
- **Conversas redesign:** 11 colunas (Nome | WhatsApp | Documento | Estado | Departamento | Atendente | Status | Prioridade | Labels | Ações). Removida "Última mensagem". Documento detectado via `identifier` → `additional_attributes.cpf|cnpj` → regex. Labels via `json_agg` com cor de fundo + contraste por luminância. Mobile vira cards.
- **Sidebar reorganizado** com seções (Dashboard / Relatórios / Administração) + item "Mensagens não respondidas".
- **Middleware** com `REDIRECT_MAP` pronto pra ativar consolidação 11→4 (futuro v0.5.1).
- **30+ testes Jest novos:** total 114 testes passando.

### Mudanças de comportamento
- `PeriodKey` reduzido pra 4 valores canônicos (`hoje | semana_atual | mes_atual | custom`). Chaves legadas (`ontem | 7d | 30d | mes_anterior`) ainda funcionam via fallback síncrono.
- Build target: client bundle não puxa mais `pg`/`pg-pool` graças ao split `datetime-core` (puro) vs `datetime` (server-only).

### Pendente (próximo release v0.5.1)
- Consolidar os 11 relatórios em 4 dashboards (`/relatorios/operacao`, `/relatorios/atendentes`, `/relatorios/distribuicao`, `/relatorios/origem-resultado`) com Tabs internas + redirects 302. `REDIRECT_MAP` em `src/middleware.ts` já está com a estrutura pronta.

---

## [PR-B] 2026-04-14 — Pipeline ingest via @nexusai360/webhook-routing

### Adicionado
- `PrismaWebhookAdapter` (`src/lib/webhook/adapter.ts`) implementando `WebhookAdapter` do pacote — mapeia tipos Prisma ↔ records do pacote, captura P2002 retornando inbound existente.
- `instrumentation.ts` (raiz) configura adapter no boot do Next runtime (Node.js).
- `src/worker/index.ts` chama `configureWebhookRouting(webhookAdapter)` no startup.
- Helper `src/lib/webhook/enqueue.ts` — preserva `InboundWebhook.processingStatus = "queued"` com BullMQ jobId determinístico.
- Migration `prisma/migrations/20260414000000_inbound_unique_dedupe/migration.sql` com `UNIQUE(companyId, dedupeKey)` — **criada, não aplicada** (operador roda `prisma migrate deploy` em ambiente conectado; cleanup de duplicatas documentado no `.sql`).
- Flag `USE_PACKAGE_PIPELINE` (default off) — opt-in para o novo pipeline no handler POST.
- `src/app/api/webhook/[webhookKey]/route-inline.ts` mantém pipeline antigo como fallback (deletado em PR-C ~7d após estável).
- Helpers legacy congelados em `src/lib/webhook/legacy/{normalizer-legacy,deduplicator-legacy}.ts` (+ testes movidos para `legacy/__tests__/`).
- Helper de testes `src/__tests__/utils/fake-adapter.ts` (adapter in-memory).
- Testes novos: `adapter.test.ts` (7 cases), `webhook-ingest.test.ts` reescrito (8 cases pipeline novo + flag off), `normalizer.test.ts` reescrito para o novo NormalizedEvent (7 cases).
- Script `scripts/smoke-webhook.mjs` — tráfego sintético HMAC-assinado a cada 30s.
- Runbook `docs/runbooks/webhook-routing-cutover.md`.
- Dev dep: `jest-mock-extended@^4.0.0` (Jest 30 compat).

### Mudanças de comportamento
- `listRoutes` é chamado UMA vez por callback (antes: por evento). Rotas criadas durante processamento de callback multi-evento não recebem deliveries para eventos posteriores no mesmo callback. Diferença teórica — callbacks Meta típicos têm 1–3 eventos.
- Dedupe de `errors.*` (eventos sem ID natural) recomeça do zero pós-deploy: `hashPayloadDeterministic` recursivo do pacote difere do `hashContent` top-level antigo. Aceitável: errors são raros, downstream apenas enfileira HTTP delivery.
- `messages.*` / `statuses.*` / `calls.*` mantêm chave de dedupe **byte-idêntica** (verificado spec I1).
- `normalizer.ts` mudou assinatura: agora recebe `(payload, companyId)` (2º arg é fallback de sourceId). Consumidores legacy continuam via `legacy/normalizer-legacy.ts`.

### Cutover
1. Merge com flag default OFF — produção segue inline.
2. `USE_PACKAGE_PIPELINE=true` em staging por 24h com tráfego sintético (`scripts/smoke-webhook.mjs`).
3. Flip em produção, monitorar 24h (runbook).
4. PR-C deleta `route-inline.ts`, flag, helpers legacy após 7d estáveis.

## [PR-A] 2026-04-14 — Helpers via @nexusai360/webhook-routing@0.2.1

### Adicionado
- Dependência `@nexusai360/webhook-routing@0.2.1` via vendor tarball + verify SHA256.
- Peer deps (tambem via vendor tarball): `@nexusai360/types@0.2.0`, `@nexusai360/core@0.2.1`, `@nexusai360/multi-tenant@0.2.1`.
- Script `scripts/verify-vendor.mjs` + `preinstall` hook validando checksums dos tarballs.
- Config Jest: `moduleNameMapper` resolvendo o pacote e subpaths para `dist/*.cjs`.

### Mudanças de comportamento (SSRF — bloqueios novos no egress de webhooks)
- **CGNAT (100.64.0.0/10)** agora bloqueado. Rotas configuradas para esse range passam a falhar.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d` decimal e `::ffff:hhhh:hhhh` hex) bloqueado quando mapeia para IPv4 privado.
- **Hostnames extras bloqueados:** `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `broadcasthost`.

### Mudanças cosméticas
- Mensagens de erro SSRF agora são códigos estruturados (`private_ipv4`, `non_https_protocol`, `blocked_hostname`, etc.) em vez de strings em português.

### Sem mudanças
- Pipeline de ingest, normalizer, deduplicator, schema Prisma, worker — intactos. Vão ser migrados em PR-B.
