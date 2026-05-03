# Nexus Insights

> Plataforma de relatórios, analytics e Agente IA conversacional construída sobre o Chatwoot — desenvolvida pela Nexus AI para a operação Matrix Fitness Group.

[![Deploy](https://img.shields.io/badge/deploy-portainer-blue)](https://insights.nexusai360.com)
[![Stack](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Stack](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io)
[![Stack](https://img.shields.io/badge/Postgres-16-336791)](https://www.postgresql.org)
[![Stack](https://img.shields.io/badge/Tailwind-v4-06B6D4)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-private-red)]()

---

## 📌 Visão geral

**Nexus Insights** é uma plataforma multi-tenant que conecta-se ao banco PostgreSQL do Chatwoot via leitor read-only e produz:

- **9 relatórios** filtráveis por período, conta, equipe, caixa de entrada, atendente e atributos personalizados.
- **Dashboard Pulse** com KPIs ao vivo, drill-downs interativos e Faixa de Espera (donut de buckets 0-4h / 4-24h / 1-3d / >3d).
- **Agente Nex** — chatbot IA conversacional com 4 sub-páginas (Configuração / Chaves de API / Prompt / Consumo), 118 modelos OpenRouter + OpenAI/Anthropic/Gemini, transcrição via `gpt-4o-mini-transcribe`, base de conhecimento (PDF + TXT + URL com SSRF guard), playground lateral.
- **Integrações Power BI** — provisioner que cria perfil read-only no Postgres + gera M-snippet pronto pra colar no Power Query.
- **Pré-agregação** — 6 tabelas com refresh rolling 7 dias a cada 5min, publicação Redis Pub/Sub, frontend escuta via SSE.
- **Empresa Ativa Global** — sidebar é fonte ÚNICA de verdade da empresa selecionada; toda página, server action e tool do Agente Nex respeita o escopo via `getActiveAccountId(user)` fail-closed.

**URL de produção:** https://insights.nexusai360.com

---

## 🏗️ Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · base-ui · Recharts · Framer Motion |
| **Auth** | NextAuth.js v5 · JWT stateless · bcryptjs · Credentials provider |
| **DB** | PostgreSQL 16 · Prisma v7 (`@prisma/adapter-pg`) · cliente em `src/generated/prisma/client` |
| **Cache/Realtime** | Redis 7 · BullMQ · Redis Pub/Sub · SSE em `/api/events` |
| **LLM** | OpenAI (gpt-5.x · o-series · gpt-4o-mini-transcribe) · Anthropic Claude · Google Gemini · OpenRouter (118 modelos) |
| **Tests** | Jest · jest-mock-extended · @testing-library/react · jsdom |
| **Deploy** | Docker · Portainer · Traefik (SSL Let's Encrypt) · GitHub Actions CI/CD |
| **Infra** | VPS Hostinger · rede `rede_nexusAI` · stacks: `app` · `worker` · `db` · `redis` |

---

## 📁 Arquitetura

```
src/
├── app/
│   ├── (auth)/                  # rotas públicas (login, forgot/reset password)
│   ├── (protected)/             # autenticadas
│   │   ├── dashboard/           # Pulse: KPIs + drill-downs + WaitingBucketsDonut
│   │   ├── relatorios/          # 9 sub-relatórios (conversas, equipe, distribuição, etc)
│   │   ├── agente-nex/          # Suite IA (configuracao · chaves · prompt · consumo)
│   │   ├── integracoes/         # Hub de integrações (Power BI)
│   │   ├── configuracoes/       # Settings globais (super_admin)
│   │   ├── usuarios/            # Gestão de usuários + RBAC
│   │   └── perfil/              # Conta do usuário
│   └── api/
│       ├── health/              # /api/health (DB + Redis + Chatwoot)
│       ├── events/              # SSE pub/sub
│       └── nex/                 # /api/nex/transcribe + /api/nex/chat
├── components/
│   ├── ui/                      # primitivos (Button, Dialog, Sheet, Calendar, CustomSelect, etc)
│   ├── charts/                  # Area · Bar · Donut · Pie · Radial · Tooltip
│   ├── layout/                  # Sidebar · PageShell · ThemeProvider
│   ├── reports/                 # PeriodPills · KpiCard · ConversasTable · FilterToolbar
│   ├── dashboard/               # widgets do dashboard (Faixa de espera, drill-downs)
│   ├── agente-nex/              # PromptPreviewCard · PlaygroundSheet · KbSection · LlmConfigForm
│   ├── llm/                     # ConsumoContent · UsageDetailSheet · UsageTableFilters · ProviderBadge
│   ├── nex/                     # bubble (NexBubble · NexChatPanel · AudioRecorder · AudioPlayer)
│   ├── settings/                # cards de /configuracoes (LlmCredentialsManager, ChatwootUrlsCard)
│   ├── icons/providers/         # SVGs inline (OpenAI · Anthropic · Gemini · OpenRouter)
│   └── tour/                    # tour guiado por relatório
├── lib/
│   ├── actions/                 # Server Actions (consolidadas por domínio)
│   ├── auth.ts · auth.config.ts · auth-helpers.ts # NextAuth v5
│   ├── prisma.ts · pg-pool.ts · redis.ts # singletons
│   ├── tenant.ts                # getAccessibleCompanyIds · buildTenantFilter · assertCompanyAccess
│   ├── chatwoot/                # facts.ts · accounts.ts · queries/ (read-only)
│   ├── reports/                 # period.ts · visibility.ts · filter-state.ts · catalog.ts
│   ├── llm/                     # catalog · pricing · queries · agent (run-nex · usage-logger) · providers
│   ├── nex/                     # prompt · prompt-compose · transcribe · kb · kb-url · audio-storage
│   ├── integrations/power-bi/   # provisioner · admin-pool · m-snippet
│   ├── audit.ts                 # logAudit
│   ├── encryption.ts            # AES-256
│   └── format/                  # date · duration · currency
├── worker/
│   ├── index.ts
│   └── jobs/
│       └── pre-agregacao/       # 5 jobs cron (refresh rolling 7d)
├── generated/prisma/            # Prisma Client gerado (NÃO editar manualmente)
└── middleware.ts                # auth + redirect

prisma/
├── schema.prisma                # ~30 models
└── migrations/                  # SQL aditivas (sem DROP)

docs/
├── STATUS.md                    # estado atual da plataforma
├── runbooks/                    # ops + features (escopo-por-empresa, agente-nex-audio, etc)
├── superpowers/{specs,plans}/   # spec/plan workflow rigoroso (atual + ativos)
└── agents/                      # protocolo multi-agente (active/ + HISTORY.md)

design-system/                   # tokens de design (cores, tipografia, espaçamento)
docker/                          # Dockerfile · docker-compose.yml · entrypoints
.github/workflows/               # build-and-push · portainer-fix · portainer-debug
scripts/                         # clean-build · seed
```

---

## 🚀 Quickstart

### Pré-requisitos

- Node.js 20+
- npm (ou pnpm/yarn)
- Docker + Docker Compose (opcional, recomendado)
- Acesso ao Postgres do Chatwoot (read-only)

### Setup local

```bash
# 1. Clone
git clone https://github.com/jvzanini/nexus-insights.git
cd nexus-insights

# 2. Dependências
npm install

# 3. Env
cp .env.example .env.local
# Editar .env.local com:
#   DATABASE_URL=postgres://...                # banco interno
#   CHATWOOT_DATABASE_URL=postgres://chatwoot_leitura:...
#   REDIS_URL=redis://...
#   NEXTAUTH_SECRET=...
#   NEXTAUTH_URL=http://localhost:3000

# 4. Migrations Prisma (banco interno)
npx prisma migrate dev

# 5. Seed inicial (cria super_admin)
npm run seed

# 6. Dev server
npm run dev
# → http://localhost:3000

# 7. (Opcional) worker
npm run worker:dev
```

### Comandos úteis

```bash
npm run dev               # Next.js dev server
npm run build             # build de produção
npm run start             # serve build
npm run typecheck         # tsc --noEmit
npm test                  # Jest
npm run worker:dev        # worker BullMQ em dev
npm run db:studio         # Prisma Studio
npx prisma migrate deploy # aplicar migrations em produção
```

### Deploy

CI/CD via GitHub Actions:

```bash
git push origin main
# → Build Docker image (~5min)
# → Push to ghcr.io/jvzanini/nexus-insights:latest
# → Trigger Portainer redeploy (Swarm-aware)
# Em seguida, atualizar APP_VERSION via workflow_dispatch:
gh workflow run portainer-fix.yml -f app_version=v0.X.0
```

Verificar deploy: `curl https://insights.nexusai360.com/api/health`

---

## 🎯 Features principais

### 📊 Relatórios

9 sub-páginas em `/relatorios`:

- **Conversas** — lista detalhada com query builder (E/OU), ordenação cadeia, drill-down inline, sticky toolbar/thead, exportação XLSX (14 colunas fixas + dinâmicas top-50 por frequência), virtualização via `@tanstack/react-virtual`.
- **Distribuição** — pie chart por status/equipe/inbox.
- **Equipe** — heatmap por equipe x período.
- **Mensagens não respondidas** — drill-down por equipe + tabela paginada.
- **Origem IA** — comparação Matrix IA vs humano.
- **Performance** — TMA · TME · CSAT.
- **Visão geral** — dashboard executivo.

Filtros padronizados via `<PeriodPills>` (Hoje/Semana/Mês/Tudo/Personalizado) compartilhados com `/agente-nex/consumo`.

### 🤖 Agente Nex

4 sub-páginas em `/agente-nex` (super_admin):

- **Configuração** — provedor + modelo (4 tiers low/medium/high/premium · 118 modelos OpenRouter + diretos OpenAI/Anthropic/Gemini), customMode inline pra modelos novos não listados.
- **Chaves de API** — gestão multi-credencial por provedor com logos SVG inline (OpenAI · Anthropic · Gemini · OpenRouter), AlertDialog em vez de window.confirm.
- **Prompt** — IDENTITY enxuta (~14 linhas) blindando identidade do Agente, Personalidade + Tom + Guardrails configuráveis, Modo manual com AlertDialog de ativação, base de conhecimento (PDF + TXT + URL com SSRF guard), playground em `<Sheet>` lateral, preview client-side via `composeSystemPrompt` isomórfico.
- **Consumo** — KPIs uniformes (chamadas · tokens entrada · tokens saída · custo total 4 casas decimais), gráficos com modo "menor que zero" (max < R$ 0,01), donut tooltip near-mouse, tabela "Histórico de chamadas" com filtros cascade (provider→modelo) + linha total sutil + drill-down em Sheet com cotação USD/BRL aplicada + spread + Whisper nota refinada.

**Bubble flutuante** (qualquer página autenticada) com áudio Whisper (`gpt-4o-mini-transcribe`), persistência IndexedDB, AudioPlayer com speed cíclico (1×→1.25×→1.5×→1.75×→2×).

### 🏢 Empresa Ativa Global

- Sidebar é a **fonte ÚNICA** de verdade da empresa selecionada.
- `getActiveAccountId(user)` retorna fail-closed (lança `NoAccessibleAccountError` quando user sem acesso).
- 8 pages com `assertAccountAccess` (defense in depth de 5 camadas).
- 3 tools introspectivas read-only do Agente Nex: `get_active_company`, `get_integrations_status`, `get_nex_config_summary`.
- Bloco `═══ CONTEXTO ATIVO ═══` injetado no system prompt em `run-nex.ts`.
- Runbook canônico em `docs/runbooks/escopo-por-empresa.md`.

### 🔌 Integrações Power BI

`/integracoes/power-bi`:

- Wizard 4 passos (selecionar conta → configurar perfil → gerar credencial → copiar M-snippet).
- Provisioner cria perfil read-only no Postgres (transação 3 fases idempotente).
- BLOCKED_TABLES_REGEX bloqueia leitura de schemas sensíveis.
- M-snippet pronto pro Power Query (sem senha inline; usa parâmetro).
- Audit log + reconcile periódico.

### 🌳 Pré-agregação

6 tabelas em `chatwoot_facts_*`:

- `chatwoot_facts_daily_by_account`
- `chatwoot_facts_daily_by_inbox`
- `chatwoot_facts_daily_by_agent`
- `chatwoot_facts_daily_by_team`
- `chatwoot_facts_hourly_by_account`
- `chatwoot_facts_meta`

5 jobs cron BullMQ refrescam rolling 7 dias a cada 5min. Publicação `facts:refreshed` no Redis Pub/Sub. Frontend escuta via `useFactsRealtime` (debounce 5s) → `router.refresh()`. Painel `/configuracoes/jobs` (super_admin) controla disparo manual e backfill.

### 📅 Calendar global

`<Calendar>` (react-day-picker v9) configurado com `weekStartsOn=1` (segunda) e `showOutsideDays=false`. Aplicado em `<PeriodPills>`, `<ConsumoContent>` e qualquer outro caller.

### 🌗 Tema

`ThemeProvider` custom com cookie SSR-aware (NUNCA `next-themes`). Persistência via `fetch POST /api/user/theme`. Tokens semânticos: `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, etc.

### 🔔 Toast

`Sonner` customizado (pilha bottom-up, timers independentes).

### 🛡️ Segurança

- AES-256 para dados sensíveis (`src/lib/encryption.ts`).
- Rate limit Redis (login + endpoints sensíveis).
- Audit log universal (`logAudit({ action, target_type, target_id, details })`).
- RBAC duas camadas: `platformRole` (super_admin > admin > manager > viewer) × `companyRole` via `UserCompanyMembership`.
- SSRF guard em KB URL (bloqueia RFC1918 + loopback + link-local + cloud metadata).
- Soft delete padrão (`deletedAt: DateTime?`).

---

## 🧪 Testes

Stack: Jest + jsdom + @testing-library/react + jest-mock-extended.

```bash
npm test                                # full suite
npx jest path/to/test                   # arquivo específico
npx jest --testNamePattern="foo"        # nome
npx jest --coverage                     # cobertura
```

Padrão TDD: test first → red → minimal impl → green → commit. Cobertura atual: 1300+ tests / 150+ suites.

---

## 🤝 Coordenação multi-agente

Há regularmente **2-3 sessões Claude trabalhando em paralelo** no repositório. Sem protocolo: conflito de merge, sobrescrita de trabalho, deploys empilhando.

**Protocolo completo:** `docs/agents/_README.md`. Resumo:

1. Antes de qualquer mudança: criar `docs/agents/active/<agent-id>.md` declarando arquivos compartilhados.
2. Antes de cada commit: `git fetch origin main && git pull --rebase`.
3. Stage **APENAS** seus arquivos (nunca `git add -A`).
4. Append linha em `docs/agents/HISTORY.md` em commits relevantes.
5. Antes de push: `gh run list --limit 5` (não empilhar deploys).
6. Final: deletar `active/<meu-id>.md`.

---

## 🔬 Workflow de feature

1. **Brainstorm** (skill `superpowers:brainstorming`) — alinhar escopo.
2. **Spec v1 → v2 → v3** (skill `superpowers:writing-plans`) com 2 pente-finos REAIS — `docs/superpowers/specs/YYYY-MM-DD-<topico>-design.md`.
3. **Aprovação do usuário.**
4. **Plan v1 → v2 → v3** (skill idem) com 2 pente-finos — `docs/superpowers/plans/YYYY-MM-DD-<topico>.md`.
5. **Aprovação do usuário.**
6. **Implementação** via `superpowers:subagent-driven-development` — 1 subagent fresh por task com revisão entre tasks. TDD obrigatório (`superpowers:test-driven-development`).
7. **UI/layout/componentes** invocam `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar — regra absoluta.
8. **Verificação** com `superpowers:verification-before-completion`.
9. **Code review** com `superpowers:requesting-code-review`.
10. **Finalização** com `superpowers:finishing-a-development-branch`.

Memory absoluta: `~/.claude/projects/<proj>/memory/MEMORY.md` (recente → antigo).

---

## 📚 Documentação

- **CLAUDE.md** — regras supremas do projeto (idioma · skills obrigatórias · double-check · padrões arquiteturais · deploy).
- **AGENTS.md** — checklist obrigatório multi-agente.
- **docs/STATUS.md** — estado atual + release notes consolidadas.
- **docs/runbooks/** — operações e features (escopo-por-empresa, agente-nex-audio-e-kb-url, etc).
- **docs/superpowers/{specs,plans}/** — workflow rigoroso (atual ativo).

---

## 📝 Releases recentes

| Versão | Data | Highlights |
|--------|------|-----------|
| **v0.24.0** | 2026-05-03 | Suite Agente Nex Polish v2: remove EmptyConsumoState · donut espessura+gap+tooltip near-mouse · bar Badge SVG sem cor · linha total sutil + setinha hover · cotação tooltip · Whisper refinada · input bar layout estável · AudioPlayer speed margem |
| **v0.22.0** | 2026-05-02 | Dashboard Polish: PeriodNavigator tag-style · KPIs padrão consumo · drill-downs alinhados · WaitingBucketsDonut |
| **v0.21.0** | 2026-05-02 | Empresa Ativa Global: sidebar fonte única · fail-closed `getActiveAccountId` · 3 tools introspectivas Nex · runbook escopo-por-empresa |
| **v0.20.0** | 2026-05-02 | Suite Agente Nex Polish: Whisper→gpt-4o-mini-transcribe · gráficos `<R$0,01` · IDENTITY enxuta · Maximize=Dialog · chaves limpas + logos SVG · filtro global Provider |
| **v0.18.0** | 2026-05-01 | Integrações Power BI completa |
| **v0.17.0** | 2026-05-01 | Conversas Revamp: virtualização + exportação XLSX + #ID OpenIdLink |
| **v0.16.0** | 2026-05-01 | Suite Agente Nex Refinement: 4 tiers + catálogo 118 modelos + IDENTITY blindada + KB URLs + URLs Chatwoot |
| **v0.15.4** | 2026-05-01 | Bubble audio refinements (player/recorder/IndexedDB) |
| **v0.10.0** | 2026-04-30 | Dashboard Pulse: KPIs coorte única + drill-down central |
| **v0.8.0** | 2026-04-30 | Pré-agregação (6 tabelas + 5 jobs cron + SSE) |

---

## 📞 Suporte

- **Issues:** https://github.com/jvzanini/nexus-insights/issues
- **Mantenedor:** João Vitor Zanini (`zanini107@gmail.com`)
- **Empresa:** Nexus AI

---

## 📄 Licença

Privado — todos os direitos reservados Nexus AI.
