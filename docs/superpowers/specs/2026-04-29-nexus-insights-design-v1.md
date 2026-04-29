# Nexus Insights — Design Spec (v1)

**Status:** v1 (rascunho inicial — ainda passa por dois pente-finos)
**Data:** 2026-04-29
**Autor:** Claude (Anthropic) sob direção de João Zanini
**Documentos relacionados:**
- `docs/discovery/2026-04-29-chatwoot-schema-discovery.md` (levantamento do banco)
- `docs/discovery/2026-04-29-decisoes-consolidadas.md` (regras já aprovadas)
- `CLAUDE.md` (regras supremas do projeto)

---

## 1. Contexto e objetivo

A Matrix Fitness Group é uma distribuidora nacional de equipamentos de academia. Sua operação de atendimento usa **Chatwoot** (instância customizada em `chatwoot.znsolucoes.com.br`), com 23 inboxes representando estados brasileiros + 1 inbox de IA + ZZ-Outros, totalizando ~8 mil conversas e 260 mil mensagens em 13 meses de histórico.

A diretoria precisa de uma **plataforma web própria de relatórios e insights** sobre essa operação — apenas leitura, sem ações sobre o Chatwoot — com filtros cruzados (estado × departamento × atendente × período × status), botão de "Abrir no Chatwoot" para deep-linking em conversas específicas, e atualização automática em pseudo-tempo-real (polling com cache).

### Escopo
- **MVP:** plataforma de relatórios (≥10 relatórios), gestão de usuários com RBAC hierárquico de 4 níveis, autenticação completa, painel de configurações dinâmico, branding "Nexus Insights" idêntico ao Roteador Webhook Meta, deploy via Portainer/Traefik com SSL.
- **Fora de escopo:** ações no Chatwoot (responder, atribuir, fechar), integração com CRM externo, pipeline de vendas, módulos de e-commerce.

---

## 2. Glossário

| Termo | Significado |
|------|-------------|
| **Account** (Chatwoot) | Tenant nativo do Chatwoot (`accounts.id`). Foco do produto: `id=9` Matrix Fitness Group; visível pra super admin: `id=2` Invest Soluções. |
| **Inbox** (Chatwoot) | Canal de atendimento. No Matrix, é 1 por estado brasileiro + IA + ZZ-Outros (23 inboxes). |
| **Team** (Chatwoot) | Departamento interno: 💰 Financeiro, 🛠️ Assistência Técnica, 🛍️ Comercial, 💎 Qualidade. |
| **User** (Chatwoot) | Atendente/agente do Chatwoot. Não é o mesmo que o usuário do Nexus Insights. |
| **Conversation** | Conversa entre contato e atendente. Identificada externamente por `display_id` e internamente por `id`. |
| **`reporting_events`** | Eventos pré-agregados do Chatwoot (`first_response`, `reply_time`, `conversation_resolved`) que aceleram cálculos de tempo. |
| **Owner** (Nexus Insights) | Super Admin principal seedado no banco. Imutável e indeletável. |
| **RBAC** | Role-Based Access Control — 4 níveis: Super Admin, Admin, Gerente, Visualizador. |
| **Polling** | Mecanismo de atualização automática em que o backend re-consulta o Chatwoot em intervalos fixos. |
| **`display_id`** | ID público da conversa no Chatwoot, usado nas URLs de deep-link. |
| **Inbox 31** | `00-Matrix IA` — canal automatizado, exibido apenas para Super Admin. |

---

## 3. Visão geral da arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                     NEXUS INSIGHTS (Next.js 16)                  │
│                                                                  │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐    │
│  │  app/(auth)  │   │ app/(protected)│   │   app/api/*      │    │
│  │  login/      │   │ dashboard/     │   │   /events (SSE)  │    │
│  │  forgot/     │   │ relatorios/    │   │   /chatwoot/*    │    │
│  │  reset/      │   │ usuarios/      │   │   /settings/*    │    │
│  │  verify-email│   │ configuracoes/ │   │   /auth/*        │    │
│  └──────────────┘   │ perfil/        │   └──────────────────┘    │
│                     └────────────────┘                           │
│                                                                  │
│  ┌─────────────────── src/lib/ ────────────────────────────┐     │
│  │  actions/    schemas/    validations/    constants/      │     │
│  │  chatwoot/   reports/    auth-helpers    tenant          │     │
│  │  prisma      redis       queue           realtime        │     │
│  │  audit       encryption  rate-limit      app-settings    │     │
│  └──────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
                │                                  │
                │ Prisma (escrita+leitura)         │ pg (somente leitura)
                ▼                                  ▼
       ┌────────────────┐                 ┌─────────────────────┐
       │  Postgres 16   │                 │  Postgres 14.20     │
       │  (nosso DB)    │                 │  (Chatwoot remoto)  │
       │  nexus_insights│                 │  82.112.245.232     │
       │  - users       │                 │  - conversations    │
       │  - sessions    │                 │  - messages         │
       │  - app_settings│                 │  - contacts         │
       │  - audit_logs  │                 │  - reporting_events │
       │  - access      │                 │  - inboxes/teams... │
       └────────────────┘                 └─────────────────────┘
                ▲                                  ▲
                │                                  │
                ▼                                  │
       ┌────────────────┐                          │
       │   Redis 7      │◀─ pub/sub eventos        │
       │   - cache TTL  │   ─ polling jobs ────────┘
       │   - rate-limit │     (BullMQ)
       │   - sessions   │
       └────────────────┘
                ▲
                │
       ┌────────────────┐
       │   Worker       │
       │   (BullMQ)     │
       │   ─ polling-job│
       │   ─ refresh-job│
       │   ─ cleanup    │
       └────────────────┘
                ▲
                │ SSE / pub/sub Redis
                ▼
       ┌────────────────┐
       │   Browser      │
       │   (React 19)   │
       └────────────────┘
```

### Containers (idêntico ao Roteador, 4 serviços)
1. **`app`** — Next.js (`server.js` standalone, porta 3000, exposto via Traefik).
2. **`worker`** — Node consumindo filas BullMQ (polling proativo, jobs de cleanup, etc.).
3. **`db`** — Postgres 16-alpine (banco do Nexus Insights, 1 volume `postgres_data`).
4. **`redis`** — Redis 7-alpine (cache + pub/sub + sessions, 1 volume `redis_data`).

### Rede e SSL
- Container `app` exposto via **Traefik** com labels:
  - `traefik.http.routers.nexus-insights.rule=Host("insights.nexusai360.com")`
  - SSL Let's Encrypt automático.
- Demais containers em rede interna `internal`.
- Stack publicada no Portainer da Nexus AI (URL `painel.nexusai360.com`, endpoint id=1).

### Conexão com o Chatwoot
- TCP direto na porta 5432 do host `82.112.245.232` (mesmo servidor onde a Nexus AI hospeda; rede pública mas banco protegido por usuário read-only).
- Pool `pg` dedicado em `src/lib/chatwoot/pool.ts`, configuração:
  - `min: 2`, `max: 8` (suficiente pro volume).
  - `idleTimeoutMillis: 30000`.
  - `statement_timeout: 30000` (30s — corta queries que enroscam).
  - `application_name: 'nexus-insights'` (aparece no `pg_stat_activity` do Chatwoot pra debug).

---

## 4. Stack tecnológica

(Idêntico ao Roteador Webhook Meta — repetido aqui pra completude.)

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript 5 strict |
| Styling | Tailwind CSS 4 + base-ui (shadcn-style) |
| Auth | NextAuth.js 5 (Credentials + JWT stateless + bcryptjs) |
| ORM próprio | Prisma 7 (`@prisma/adapter-pg`) |
| Acesso ao Chatwoot | `pg` 8.x (driver puro), queries SQL escritas à mão, validação Zod |
| Cache & pub/sub | Redis 7 + ioredis |
| Filas | BullMQ 5 |
| Realtime | SSE em `/api/events` |
| Validação | Zod 4 |
| Email | Resend + React Email |
| Charts | Recharts 3 |
| Ícones | Lucide React (proibido emoji em UI) |
| Animações | Framer Motion 12 (`as const`) |
| Toasts | Sonner customizado (pilha bottom-up) |
| Tema | ThemeProvider custom (cookie SSR) |
| Tests | Jest 30 + jest-mock-extended |
| Encryption | Node crypto AES-256 |
| Container | Docker + Traefik labels |
| Registry | `ghcr.io/jvzanini/nexus-insights` |
| CI/CD | GitHub Actions → GHCR → Portainer redeploy |

---

## 5. Estrutura de pastas (cópia da árvore do Roteador)

```
nexus-insights/
├── src/
│   ├── auth.ts                     # NextAuth setup
│   ├── auth.config.ts              # Callbacks, maxAge
│   ├── middleware.ts               # Proteção de rotas
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   └── verify-email/page.tsx
│   │   ├── (protected)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── relatorios/
│   │   │   │   ├── page.tsx                     # índice (catálogo de relatórios)
│   │   │   │   ├── conversas/page.tsx           # relatório principal de conversas
│   │   │   │   ├── leads-recebidos/page.tsx
│   │   │   │   ├── volumetria/page.tsx
│   │   │   │   ├── tempos-resposta/page.tsx
│   │   │   │   ├── ranking-atendentes/page.tsx
│   │   │   │   ├── por-departamento/page.tsx
│   │   │   │   ├── por-estado/page.tsx
│   │   │   │   ├── status-conversas/page.tsx
│   │   │   │   ├── csat/page.tsx
│   │   │   │   ├── sla/page.tsx
│   │   │   │   └── matrix-ia/page.tsx           # super admin only
│   │   │   ├── usuarios/page.tsx
│   │   │   ├── configuracoes/page.tsx           # super admin only
│   │   │   └── perfil/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── events/route.ts                  # SSE
│   │       ├── user/theme/route.ts              # persistência tema
│   │       ├── settings/route.ts                # CRUD app_settings
│   │       └── chatwoot/refresh/route.ts        # botão "Atualizar agora"
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx                       # adaptado (menus do Insights)
│   │   │   ├── command-palette.tsx               # ⌘K — busca em conversas/atendentes/relatórios
│   │   │   ├── notification-bell.tsx             # opcional MVP
│   │   │   └── breadcrumbs.tsx
│   │   ├── login/
│   │   │   ├── login-branding.tsx                # logo + título "Nexus AI" + subtítulo
│   │   │   ├── login-content.tsx
│   │   │   └── login-form.tsx
│   │   ├── reports/
│   │   │   ├── filters-bar.tsx                   # estado×team×agente×período×status
│   │   │   ├── period-selector.tsx
│   │   │   ├── inbox-multi-select.tsx
│   │   │   ├── team-multi-select.tsx
│   │   │   ├── agent-multi-select.tsx
│   │   │   ├── status-multi-select.tsx
│   │   │   ├── refresh-button.tsx                # respeita app_settings.polling.refresh_button_enabled
│   │   │   ├── kpi-card.tsx
│   │   │   ├── chart-line.tsx
│   │   │   ├── chart-bar.tsx
│   │   │   ├── chart-heatmap.tsx                 # hora × dia da semana
│   │   │   ├── data-table.tsx
│   │   │   ├── pagination.tsx
│   │   │   └── open-in-chatwoot.tsx              # botão deep-link
│   │   ├── users/
│   │   │   ├── users-table.tsx
│   │   │   ├── user-form-dialog.tsx              # criação/edição
│   │   │   ├── role-select.tsx                   # custom select com 4 níveis (igual screenshot)
│   │   │   ├── account-multi-select.tsx          # multi-select de contas
│   │   │   ├── department-multi-select.tsx       # multi-select de departamentos
│   │   │   └── delete-user-dialog.tsx
│   │   ├── settings/
│   │   │   ├── polling-settings-form.tsx
│   │   │   ├── account-toggle.tsx                # super admin troca de account
│   │   │   └── feature-flags.tsx
│   │   ├── providers/
│   │   │   ├── session-provider.tsx
│   │   │   └── theme-provider.tsx
│   │   └── ui/                                    # 100% copiado do Roteador
│   │       └── (40 primitivos)
│   ├── lib/
│   │   ├── actions/                               # Server Actions consolidados
│   │   │   ├── users.ts
│   │   │   ├── settings.ts
│   │   │   ├── reports/
│   │   │   │   ├── conversas.ts
│   │   │   │   ├── leads-recebidos.ts
│   │   │   │   ├── volumetria.ts
│   │   │   │   ├── tempos-resposta.ts
│   │   │   │   ├── ranking-atendentes.ts
│   │   │   │   ├── por-departamento.ts
│   │   │   │   ├── por-estado.ts
│   │   │   │   ├── status-conversas.ts
│   │   │   │   ├── csat.ts
│   │   │   │   ├── sla.ts
│   │   │   │   └── matrix-ia.ts
│   │   │   ├── auth.ts
│   │   │   ├── password-reset.ts
│   │   │   ├── profile.ts
│   │   │   └── audit.ts
│   │   ├── chatwoot/
│   │   │   ├── pool.ts                            # pg.Pool dedicado, singleton
│   │   │   ├── queries/
│   │   │   │   ├── conversas-list.ts
│   │   │   │   ├── leads-recebidos.ts
│   │   │   │   ├── volumetria-por-dia.ts
│   │   │   │   ├── volumetria-por-hora-dia.ts
│   │   │   │   ├── tempos-primeira-resposta.ts
│   │   │   │   ├── tempo-resolucao.ts
│   │   │   │   ├── ranking-atendentes.ts
│   │   │   │   ├── leads-por-team.ts
│   │   │   │   ├── leads-por-inbox.ts
│   │   │   │   ├── status-distribution.ts
│   │   │   │   ├── conversas-orfas.ts
│   │   │   │   ├── ia-metrics.ts
│   │   │   │   ├── ia-sem-resposta.ts
│   │   │   │   ├── csat-summary.ts
│   │   │   │   └── sla-summary.ts
│   │   │   ├── schemas.ts                         # Zod parsers de cada query
│   │   │   ├── filters.ts                         # WHERE builder canônico
│   │   │   └── deep-link.ts                       # gera URL Chatwoot (display_id)
│   │   ├── reports/
│   │   │   ├── kpi-helpers.ts                     # formatação tempo, %, etc.
│   │   │   └── period.ts                          # getPeriodRange(periodType) → {start, end}
│   │   ├── cache/
│   │   │   ├── keys.ts                            # nomenclatura canônica (cacheKey('report', 'conversas', filters))
│   │   │   ├── pull-through.ts                    # withCache(key, ttl, fetcher)
│   │   │   └── invalidate.ts
│   │   ├── settings/
│   │   │   ├── get.ts                             # cached getter por chave
│   │   │   └── update.ts
│   │   ├── tenant.ts                              # getAccessibleAccountIds, getAccessibleTeamIds
│   │   ├── permissions.ts                         # canCreateRole, canSeeMatrixIA, canDeleteUser
│   │   ├── auth-helpers.ts                        # authorizeCredentials, getCurrentUser, requireRole
│   │   ├── prisma.ts                              # singleton Prisma
│   │   ├── redis.ts                               # singleton Redis
│   │   ├── queue.ts                               # BullMQ queues
│   │   ├── realtime.ts                            # publishRealtimeEvent + canais
│   │   ├── audit.ts                               # logAudit
│   │   ├── encryption.ts                          # AES-256
│   │   ├── theme.ts                               # cookie SSR
│   │   ├── rate-limit/
│   │   │   └── login.ts
│   │   ├── validations/                           # Zod schemas (forms)
│   │   │   ├── user.ts
│   │   │   ├── settings.ts
│   │   │   └── filters.ts
│   │   ├── schemas/                               # Zod schemas (responses)
│   │   │   └── reports/
│   │   ├── constants/
│   │   │   ├── roles.ts                           # 4 níveis + estilos badge
│   │   │   ├── settings-keys.ts                   # POLLING_LIVE_SECONDS etc.
│   │   │   ├── periods.ts                         # hoje, ontem, 7d, 30d, etc.
│   │   │   ├── status-labels.ts                   # 0=Aberto, 1=Resolvida, ...
│   │   │   └── nav.ts                             # menus por role
│   │   └── utils/
│   │       ├── cn.ts
│   │       ├── format-cpf.ts                       # extrai e formata CPF/CNPJ
│   │       ├── format-time.ts                      # 1.36h → "1h 22min"
│   │       └── slugify.ts
│   ├── worker/
│   │   ├── index.ts                                # entrypoint BullMQ
│   │   ├── jobs/
│   │   │   ├── prewarm-live-cache.ts               # job a cada 30s
│   │   │   ├── prewarm-historical-cache.ts         # job a cada 5min
│   │   │   ├── invalidate-on-change.ts             # opcional: cleanup periódico
│   │   │   └── audit-cleanup.ts                    # purga audit > 90d
│   │   └── shared/
│   │       ├── prisma.ts
│   │       ├── redis.ts
│   │       └── chatwoot-pool.ts
│   ├── __tests__/
│   │   └── utils/
│   ├── types/
│   │   └── index.ts
│   └── generated/
│       └── prisma/                                  # Prisma client gerado
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                                      # cria owner com ADMIN_EMAIL/PASSWORD + isOwner=true
│   └── migrations/
├── public/
│   └── logo-nexus-ai.png                             # mesma imagem do Roteador
├── docker/
│   └── Dockerfile
├── docker-compose.yml
├── docs/
│   ├── discovery/
│   ├── superpowers/
│   │   ├── specs/
│   │   └── plans/
│   └── runbooks/
├── design-system/
│   └── nexus-insights/
│       └── MASTER.md                                 # cópia adaptada do MASTER do Roteador
├── .env.example
├── .github/workflows/
│   └── deploy.yml
├── tsconfig.json
├── jest.config.ts
├── eslint.config.mjs
├── package.json
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
└── AGENTS.md
```

---

## 6. Modelo de dados próprio (Prisma)

Schema do nosso banco em `prisma/schema.prisma`. Mantém quase tudo do Roteador, removendo as entidades de webhook (`Company`, `WebhookRoute`, `CompanyCredential`, `InboundWebhook`, `RouteDelivery`, `MetaSubscriptionState`, etc.) e adicionando o que é específico do Insights.

### 6.1 Modelos

```prisma
generator client { provider = "prisma-client-js" output = "../src/generated/prisma" }
datasource db    { provider = "postgresql" url = env("DATABASE_URL") }

enum PlatformRole { super_admin admin manager viewer }
enum Theme        { dark light system }
enum AuditAction  { user_created user_updated user_deleted user_role_changed
                    user_access_granted user_access_revoked
                    setting_updated login_succeeded login_failed
                    password_reset_requested password_reset_completed
                    profile_updated session_revoked
                    account_switched }

model User {
  id                 String   @id @default(uuid()) @db.Uuid
  email              String   @unique
  password           String
  name               String
  platformRole       PlatformRole
  isOwner            Boolean  @default(false)        // único user com isOwner=true (seed)
  isActive           Boolean  @default(true)
  avatarUrl          String?
  theme              Theme    @default(system)
  emailVerifiedAt    DateTime?
  lastLoginAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  createdById        String?  @db.Uuid
  createdBy          User?    @relation("UserCreator", fields: [createdById], references: [id])
  createdUsers       User[]   @relation("UserCreator")
  accountAccess      UserAccountAccess[]
  teamAccess         UserTeamAccess[]
  audits             AuditLog[]
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens  EmailChangeToken[]

  @@index([platformRole, isActive])
}

// IDs de "account" são os ids do Chatwoot (2 = Invest, 9 = Matrix). Não temos FK pro DB do Chatwoot.
model UserAccountAccess {
  id                  String  @id @default(uuid()) @db.Uuid
  userId              String  @db.Uuid
  user                User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatwootAccountId   Int                                  // ex.: 9
  chatwootAccountName String                               // cache local pra exibir sem ir no Chatwoot
  grantedAt           DateTime @default(now())
  grantedById         String?  @db.Uuid
  @@unique([userId, chatwootAccountId])
}

// Departamentos (teams). Aplicado para gerente e viewer (admin tem todos automaticamente).
model UserTeamAccess {
  id                String  @id @default(uuid()) @db.Uuid
  userId            String  @db.Uuid
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatwootAccountId Int
  chatwootTeamId    Int
  chatwootTeamName  String
  grantedAt         DateTime @default(now())
  @@unique([userId, chatwootAccountId, chatwootTeamId])
}

// Configurações dinâmicas (key-value). Read via cache; write via super admin no /configuracoes.
model AppSetting {
  key         String   @id
  value       Json                                          // string|number|boolean|object
  description String?
  category    String                                        // ex.: 'polling','realtime','feature_flags'
  updatedAt   DateTime @updatedAt
  updatedById String?  @db.Uuid
}

model AuditLog {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String?     @db.Uuid
  user        User?       @relation(fields: [userId], references: [id])
  action      AuditAction
  targetType  String?                                       // 'User','AppSetting','Conversation'(deeplink), etc.
  targetId    String?
  ipAddress   String?
  userAgent   String?
  details     Json?
  createdAt   DateTime    @default(now())

  @@index([userId, createdAt])
  @@index([action, createdAt])
}

model PasswordResetToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique                              // bcrypt(token); o token cru vai por email
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, expiresAt])
}

model EmailChangeToken {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  newEmail     String
  tokenHash    String   @unique
  expiresAt    DateTime
  consumedAt   DateTime?
  createdAt    DateTime @default(now())
}
```

### 6.2 Seed (`prisma/seed.ts`)
- Lê `ADMIN_EMAIL` e `ADMIN_PASSWORD` do env (`nexusai360@gmail.com` / `nexus.AI@360`).
- Cria 1 User com `platformRole = super_admin`, `isOwner = true`, `name = "João Zanini"`, `isActive = true`, `emailVerifiedAt = now()`.
- Cria `UserAccountAccess` para `chatwootAccountId = 9` ("Matrix Fitness Group") e `id = 2` ("Invest Soluções"), cacheando os nomes.
- Idempotente: se já existir owner, atualiza dados não-sensíveis e não recria.
- Popula `AppSetting` com valores default:
  - `polling.live_seconds = 30`
  - `polling.historical_seconds = 300`
  - `polling.refresh_button_enabled = true`
  - `realtime.sse_enabled = true`
  - `feature_flags.matrix_ia_visible_to_super_admin_only = true`
  - `feature_flags.csat_enabled = true` (mostra a tela mesmo sem dados)
  - `feature_flags.sla_enabled = true`

### 6.3 Multi-account (sem FK pra Chatwoot)
Os IDs `chatwootAccountId` e `chatwootTeamId` são **referências lógicas** ao banco do Chatwoot — não há foreign key cross-database.

Para evitar drift (admin removeu account do Chatwoot, nosso DB ainda tem registro orfão), o worker tem um **job diário `sync-chatwoot-meta`** que:
1. Lê `accounts`, `teams`, `users`, `inboxes` do Chatwoot.
2. Atualiza os nomes em `UserAccountAccess.chatwootAccountName` e `UserTeamAccess.chatwootTeamName` (cache de display).
3. Loga warning se algum `chatwootAccountId/TeamId` em uso pelo Insights deixou de existir no Chatwoot.

---

## 7. Camada de acesso ao Chatwoot (`src/lib/chatwoot/`)

### 7.1 Pool dedicado (`pool.ts`)
```typescript
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getChatwootPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 2,
    max: 8,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: 'nexus-insights',
  });
  pool.on('error', (err) => console.error('[chatwoot-pool] error:', err));
  return pool;
}
```
Uma única instância no processo Next.js. O worker BullMQ tem o seu próprio pool em `src/worker/shared/chatwoot-pool.ts` (mesma config).

### 7.2 Queries (`queries/*.ts`)
Cada arquivo exporta uma função tipada com:
- Input: objeto `{ filters: ReportFilters, accountId: number }`.
- SQL parametrizado (sempre `$1`, `$2`, etc. — nunca interpolação string pra evitar SQL injection).
- Output: tipado por um schema Zod em `schemas.ts`.

Exemplo (`queries/leads-recebidos.ts`):
```typescript
import { z } from 'zod';
import { getChatwootPool } from '../pool';
import { buildBaseFilter } from '../filters';
import type { ReportFilters } from '@/lib/schemas/filters';

const RowSchema = z.object({
  bucket: z.string(),                       // '2026-04-29'
  total: z.number().int().nonnegative(),
});
const ResultSchema = z.array(RowSchema);
export type LeadsRecebidosRow = z.infer<typeof RowSchema>;

export async function leadsRecebidos(args: {
  accountId: number;
  filters: ReportFilters;
  granularity: 'day' | 'week' | 'month';
}) {
  const pool = getChatwootPool();
  const { whereSql, params } = buildBaseFilter(args.filters, args.accountId);
  const trunc = args.granularity === 'day' ? 'day'
              : args.granularity === 'week' ? 'week'
              : 'month';

  const sql = `
    SELECT to_char(date_trunc('${trunc}', c.created_at), 'YYYY-MM-DD') AS bucket,
           COUNT(*)::int AS total
    FROM conversations c
    WHERE ${whereSql}
    GROUP BY 1
    ORDER BY 1
  `;
  const { rows } = await pool.query(sql, params);
  return ResultSchema.parse(rows);
}
```

### 7.3 Filter builder canônico (`filters.ts`)
Aplica os 5 eixos universais (account × inbox × team × agent × period × status), respeitando:
- `accountId` (sempre `account_id = $X`).
- `inboxIds[]` (`inbox_id = ANY($X)`).
- `teamIds[]` (`team_id = ANY($X)`).
- `assigneeIds[]` (`assignee_id = ANY($X)`).
- `period.start`, `period.end` (`created_at BETWEEN $X AND $Y`).
- `statuses[]` (`status = ANY($X)`).
- `excludeMatrixIA` (default `true` exceto pra super admin com toggle desligado): `inbox_id <> 31`.

Retorna `{ whereSql, params }` para concatenação.

### 7.4 Deep-link Chatwoot (`deep-link.ts`)
```typescript
const BASE = process.env.CHATWOOT_BASE_URL || 'https://chatwoot.znsolucoes.com.br';
export function chatwootConversationUrl(accountId: number, displayId: number) {
  return `${BASE}/app/accounts/${accountId}/conversations/${displayId}`;
}
```
Sempre usa `display_id`, nunca o `id` interno. Botão `<OpenInChatwoot />` aplica `target="_blank"` e `rel="noopener"`.

---

## 8. Cache e polling

### 8.1 Estratégia híbrida
- **Pull-through (lazy):** ao receber request, server action verifica Redis. Cache hit → devolve. Cache miss → roda query, guarda no Redis com TTL, devolve.
- **Pré-aquecimento (proativo, BullMQ):** worker roda jobs a cada cadência configurada que pré-aquecem caches dos painéis "ao vivo" (home dashboard, backlog, contadores). Resultado: usuário sempre encontra cache hit em telas de alta frequência.

### 8.2 Chave de cache
Padrão definido em `src/lib/cache/keys.ts`:

```typescript
function cacheKey(args: {
  scope: 'report' | 'kpi' | 'meta';
  name: string;                                   // 'leads-recebidos', 'backlog'
  accountId: number;
  filtersHash: string;                            // sha1(JSON.stringify(filters))
}): string {
  return `ni:${args.scope}:${args.name}:a${args.accountId}:${args.filtersHash}`;
}
```
Prefixo `ni:` evita colisão com outros usos do Redis. `filtersHash` permite cache distinto por combinação de filtros sem chave gigante.

### 8.3 TTLs
Lidos de `AppSetting` em runtime:
- Painéis ao vivo: `polling.live_seconds` (default 30).
- Painéis históricos: `polling.historical_seconds` (default 300).

Implementação em `src/lib/cache/pull-through.ts`:

```typescript
export async function withCache<T>(args: {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
}): Promise<{ data: T; cached: boolean; cachedAt?: Date }> {
  const redis = getRedis();
  const raw = await redis.get(args.key);
  if (raw) {
    const parsed = JSON.parse(raw) as { d: T; t: string };
    return { data: parsed.d, cached: true, cachedAt: new Date(parsed.t) };
  }
  const data = await args.fetcher();
  await redis.set(args.key, JSON.stringify({ d: data, t: new Date().toISOString() }), 'EX', args.ttlSeconds);
  return { data, cached: false };
}
```
Server action devolve `{ data, cached, cachedAt }` para o frontend mostrar "Atualizado X segundos atrás" e indicador discreto.

### 8.4 Botão "Atualizar agora"
Disponível em todas as telas de relatório, controlado por `polling.refresh_button_enabled` (super admin pode desligar via `/configuracoes`).

Ao clicar:
1. Frontend chama `POST /api/chatwoot/refresh` com `{ scope, name, filters }`.
2. Server action revalida invalidando a chave e re-executando o `fetcher`.
3. Retorna `{ data, cachedAt: now }`.
4. Tela atualiza imediatamente.

Rate-limit: max 6 cliques/minuto por usuário (Redis sliding window).

### 8.5 Jobs BullMQ de pré-aquecimento
Filas: `prewarmLive` (concurrency 2) e `prewarmHistorical` (concurrency 1).

```typescript
// worker/jobs/prewarm-live-cache.ts
export async function runPrewarmLive() {
  const targets = [
    { scope: 'kpi',    name: 'home-summary',     fn: homeSummary,    accountId: 9, filters: defaultFilters },
    { scope: 'kpi',    name: 'backlog',          fn: backlog,        accountId: 9, filters: defaultFilters },
    { scope: 'kpi',    name: 'orfas',            fn: orfas,          accountId: 9, filters: defaultFilters },
    { scope: 'report', name: 'status-distrib',   fn: statusDistrib,  accountId: 9, filters: defaultFilters },
  ];
  for (const t of targets) { /* roda fn → grava cache com TTL = liveSeconds + 5s margem */ }
}
```
Schedulers:
- `prewarmLive` repeat a cada `polling.live_seconds` (lido de AppSetting; refresh do scheduler quando setting muda).
- `prewarmHistorical` repeat a cada `polling.historical_seconds`.

Quando super admin altera `polling.*` em `/configuracoes`, server action emite `realtime` event (`settings:updated`) que o worker escuta para reconfigurar os schedulers.

---

## 9. Settings dinâmicas

### 9.1 Tabela `AppSetting`
Pares chave-valor (JSON) categorizados.

### 9.2 Painel `/configuracoes` (super admin only)
Renderizado com formulários por categoria:
- **Atualização (polling)**
  - Tempo ao vivo (segundos): input numérico, validação 5–300, default 30.
  - Tempo histórico (segundos): input numérico, validação 30–3600, default 300.
  - Botão "Atualizar agora": toggle on/off, default on.
- **Realtime**
  - SSE: toggle on/off (master switch).
- **Visibilidade**
  - Mostrar inbox Matrix IA somente para Super Admin: toggle on/off, default on.
- **Módulos opcionais**
  - CSAT visível: toggle (default on).
  - SLA visível: toggle (default on).

### 9.3 Hook client `useAppSettings()`
Server-side: `getSetting<T>(key)` com cache Redis TTL 60s.
Client-side: hook recebe valores via Server Component (props) e revalida a cada mudança via SSE event `settings:updated`.

---

## 10. Realtime (SSE)

### 10.1 Endpoint `/api/events`
Conexão SSE autenticada (cookie session). Emite eventos para:
- `report:invalidated` (ao mudar settings ou após pré-aquecimento)
- `settings:updated`
- `notification:new` (futuro)

Implementação igual ao Roteador: Redis subscribe ao canal `nexus-insights:realtime`, repassa via `text/event-stream`.

### 10.2 Hook client `useRealtimeReport(scope, name)`
Faz fetch inicial (Server Action), abre EventSource, ao receber `report:invalidated` com mesma `key` faz refetch suave.

---

## 11. Auth e tela de login

### 11.1 NextAuth v5 (idêntico ao Roteador, ajustes mínimos)
- Provider Credentials (email + senha).
- JWT stateless, `maxAge: 7 * 24 * 60 * 60` (7 dias).
- `authorizeCredentials`:
  1. Rate-limit Redis (`login:rate:${email}:${ip}`, 5 tentativas em 15min).
  2. Busca user por email com `select { id, email, password, platformRole, isOwner, isActive, avatarUrl, theme, name }`.
  3. Verifica `isActive = true`.
  4. `bcrypt.compare(password, user.password)`.
  5. Loga audit `login_succeeded` ou `login_failed`.
- Callback `jwt`:
  - No login inicial: popula token com user data.
  - A cada request: re-busca user no DB (mesma proteção do Roteador). Se `isActive=false`, invalida sessão.
- Callback `session`: serializa para `session.user`.

### 11.2 Tela `/login`
Cópia exata do Roteador. Diferenças:
- Subtítulo: "Relatórios e insights dos atendimentos" (substitui "Roteador de Webhooks").
- Footer (`<footer>` global da página): `Nexus AI © 2026. Todos os direitos reservados`.
- Rótulo do título principal: "Nexus AI" (mantém).
- Logo: `public/logo-nexus-ai.png` (mesma imagem do Roteador).

### 11.3 Telas de auth secundárias
- `/forgot-password`: replica fluxo (insere email → email com link → token guardado em `PasswordResetToken`).
- `/reset-password?token=...`: form de nova senha.
- `/verify-email?token=...`: confirma mudança de email (consumido em `EmailChangeToken`).

### 11.4 Middleware (`src/middleware.ts`)
Rotas públicas: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/api/auth/*`.
Demais protegidas: redirect para `/login?callbackUrl=...`.

---

## 12. RBAC consolidado

### 12.1 Hierarquia
```
super_admin > admin > manager > viewer
```
Seguir constantes em `src/lib/constants/roles.ts`:
```typescript
export const PLATFORM_ROLE_HIERARCHY = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
} as const;
```

### 12.2 Owner
- Único user com `isOwner = true`.
- Único super admin que **não** pode ser excluído nem ter o role/isActive/email/senha alterado por outro user (mesmo super admin).
- Owner pode editar a si mesmo (alterar nome, senha, avatar, tema).

### 12.3 Tabela de regras (em `permissions.ts`)
```typescript
export function canCreateRole(creator: AuthUser, role: PlatformRole): boolean {
  // viewer não cria; senão, só pode criar role de hierarquia ≤ a sua
  if (creator.platformRole === 'viewer') return false;
  return PLATFORM_ROLE_HIERARCHY[role] <= PLATFORM_ROLE_HIERARCHY[creator.platformRole];
}

export function canEditUser(actor: AuthUser, target: User): {
  allowed: boolean;
  reason?: string;
} {
  if (target.isOwner && actor.id !== target.id) {
    return { allowed: false, reason: 'Owner imutável' };
  }
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] > PLATFORM_ROLE_HIERARCHY[actor.platformRole]) {
    return { allowed: false, reason: 'Hierarquia' };
  }
  if (actor.platformRole === 'viewer') return { allowed: false, reason: 'Viewer não edita' };
  return { allowed: true };
}

export function canDeleteUser(actor: AuthUser, target: User): {
  allowed: boolean;
  reason?: string;
} {
  if (target.isOwner) return { allowed: false, reason: 'Owner indeletável' };
  if (actor.id === target.id) return { allowed: false, reason: 'Não pode excluir a si mesmo' };
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] >= PLATFORM_ROLE_HIERARCHY[actor.platformRole]) {
    return { allowed: false, reason: 'Hierarquia' };
  }
  return { allowed: true };
}
```

### 12.4 Subset rules (multi-account e multi-team)

```typescript
// Ao criar/editar um user inferior, accounts liberados ⊆ accounts do criador.
export function canGrantAccounts(creator: AuthUser, requestedAccountIds: number[]): boolean {
  if (creator.platformRole === 'super_admin') return true; // todas
  const allowed = creator.accountIds; // populado em getCurrentUser via UserAccountAccess
  return requestedAccountIds.every(id => allowed.includes(id));
}

// Idem para teams (só relevante quando criando manager/viewer).
export function canGrantTeams(creator: AuthUser, requestedTeamIds: number[]): boolean {
  if (creator.platformRole === 'super_admin' || creator.platformRole === 'admin') return true;
  const allowed = creator.teamIds;
  return requestedTeamIds.every(id => allowed.includes(id));
}
```

### 12.5 Tenant scoping (`src/lib/tenant.ts`)
```typescript
export function getAccessibleAccountIds(user: AuthUser): number[] {
  if (user.platformRole === 'super_admin') return [9, 2]; // todas (cacheado de Chatwoot)
  return user.accountIds;
}
export function getAccessibleTeamIds(user: AuthUser, accountId: number): number[] | 'all' {
  if (user.platformRole === 'super_admin' || user.platformRole === 'admin') return 'all';
  return user.teamIds.filter(t => /* team pertence ao accountId, derivado do cache */);
}
```
`'all'` significa "sem filtro de team na query". Demais, usa `team_id = ANY($X)` no WHERE.

### 12.6 UI da gestão de usuários
Tela `/usuarios` replicada da imagem do Roteador (Nome, Email, **Nível**, Status, **Contas**, Criado em, Ações). Detalhes:

- **Coluna "Nível":** dropdown custom como na imagem (4 níveis com ícone + descrição). Disabled se a target é o owner ou se hierarquia barra.
- **Coluna "Contas":** badge com quantidade (ex.: "1 conta", "2 contas"); hover/click abre popover listando os nomes.
- **Botão "+ Novo Usuário":** abre dialog com:
  - Nome, Email, Senha temporária (auto-gerar opção).
  - Multi-select de Nível (filtrado por `canCreateRole`).
  - Multi-select de Contas (limitado pelo `canGrantAccounts`).
  - Multi-select de Departamentos (visível apenas se nível = manager ou viewer; limitado por `canGrantTeams`).
- **Editar:** mesmo dialog. Bloqueia campos conforme `canEditUser`.
- **Excluir:** confirmation dialog. Bloqueia conforme `canDeleteUser`.
- **Visualizador:** vê a lista? Não — `/usuarios` requer `canCreateRole` ≥ true (apenas admin+). Viewer redireciona para `/dashboard`.

### 12.7 Validação no servidor
Toda Server Action de `users.ts` valida com helpers `canCreateRole`, `canEditUser`, `canDeleteUser`, `canGrantAccounts`, `canGrantTeams`. Falha = retorna `{ success: false, error: '...' }`. Audit log em todos os casos (sucesso e falha).

---

## 13. Multi-account scoping

### 13.1 Seletor de conta
Apenas para super admin. Posicionado na sidebar (acima dos menus). Padrão visual: `CustomSelect` igual ao select de role.

### 13.2 Persistência
Estado armazenado em cookie `nexus_active_account` (HttpOnly, 30 dias). Server Components leem do cookie e aplicam o filtro `accountId` em todas as queries.

### 13.3 Default
- Super admin sem cookie: default = `9` (Matrix Fitness Group).
- Demais users: a última conta usada (cookie) ou a primeira do `accountAccess`.

### 13.4 Audit
Toda mudança gera `audit { action: 'account_switched', details: { from, to } }`.

---

## 14. Estrutura de navegação (sidebar)

Menu visível depende do role e dos accesses do user.

```
🏠 Dashboard                     (todos)
📊 Relatórios                    (todos)
   ├─ Conversas
   ├─ Leads recebidos
   ├─ Volumetria
   ├─ Tempos de resposta
   ├─ Ranking de atendentes
   ├─ Por departamento
   ├─ Por estado (UF)
   ├─ Status das conversas
   ├─ CSAT (placeholder)
   ├─ SLA (placeholder)
   └─ 🤖 Matrix IA               (super_admin only)
👥 Usuários                      (admin+)
⚙️ Configurações                 (super_admin only)
👤 Perfil                        (todos — sempre o próprio)
```

Sidebar implementada em `src/components/layout/sidebar.tsx`. Selector de account (super admin) ocupa header da sidebar. Footer da sidebar: avatar + nome + role + tema toggle + logout.

---

## 15. Mapa de relatórios

Cada relatório tem:
- **Nome amigável** (PT-BR)
- **Header** com ícone roxo (igual padrão Roteador) + título + subtítulo + filtros + botão "Atualizar agora"
- **KPIs** no topo (cards numéricos)
- **Visualizações** (gráficos Recharts)
- **Tabela** com paginação (quando aplicável)
- **Botão "Abrir no Chatwoot"** em linhas de conversa
- **Cache scope** (`live` ou `historical`)

### 15.1 Conversas (relatório principal)
Listagem de conversas com filtros e paginação. Colunas: `display_id`, contato (nome + telefone), CPF/CNPJ extraído, agente atribuído, departamento, prioridade, última mensagem (snippet + timestamp), status (badge), label list, link "Abrir no Chatwoot".

Filtros: estado, departamento, atendente, status, prioridade, label, período (criação ou last_activity).

Cache: histórico (5min) por padrão; live (30s) se filtro de período for "Hoje".

Query base: `conversas-list.ts` com paginação cursor-based (`last_activity_at, id`), max 50/página.

### 15.2 Leads recebidos
Quantos leads (conversas) chegaram, agrupado por dia/semana/mês.

KPIs: total no período, média diária, comparação com período anterior (% variação).

Gráfico: linha temporal (Recharts).

Filtros: estado, departamento, atendente, período, granularidade (dia/semana/mês).

Cache: histórico.

### 15.3 Volumetria
Análise de volume com 2 visões:
- **Por dia da semana** (gráfico de barras: dom→sáb).
- **Heatmap hora × dia da semana** (24×7).

Útil pra identificar picos e dias/horas sem cobertura humana.

Cache: histórico.

### 15.4 Tempos de resposta
Métricas baseadas em `reporting_events`:
- Tempo até primeira resposta (média, p50, p95).
- Tempo de resposta entre mensagens (média, p50, p95).
- Tempo de resolução (média, p50, p95).
- Mesmo cálculo separado para horário comercial vs fora (usando `value_in_business_hours`).

Comparativo dia útil vs fim de semana (resposta direta à pergunta do usuário).

Filtros: estado, departamento, atendente, período. Toggle "excluir Matrix IA" (default on; super admin pode desligar).

Cache: histórico.

### 15.5 Ranking de atendentes
Top atendentes por:
- Conversas atendidas
- Conversas resolvidas
- Tempo médio de primeira resposta
- Tempo médio de resolução

Gráficos: barras horizontais. Tabela com paginação.

Filtros: estado, departamento, período.

Cache: histórico.

### 15.6 Por departamento
Mesmas métricas do ranking, mas agregadas por team. Cards lado a lado para os 4 departamentos.

Filtros: estado, período, status.

Cache: histórico.

### 15.7 Por estado (UF)
Mapa de calor visual (Brasil) ou lista das 23 inboxes-estado:
- Volume total
- Resolved/Open/Pending
- Tempo médio de primeira resposta
- Top atendente

Filtros: departamento, período, status.

Cache: histórico.

### 15.8 Status das conversas
Distribuição (open/pending/resolved/snoozed) — pizza ou rosca.

Backlog (open + pending) com idade (gráfico de barras: <1h, 1-24h, 1-7d, 7-30d, >30d).

Lista de conversas órfãs (sem assignee).

Filtros: estado, departamento, período.

Cache: live (este é dos painéis ao vivo).

### 15.9 CSAT (placeholder com dados quando existirem)
- Score médio
- Distribuição de notas
- Feedback recente

Quando vazio: empty state explicando "Ative o CSAT no Chatwoot pra começar a popular este relatório".

Cache: histórico.

### 15.10 SLA (placeholder)
- Conversas com SLA aplicado
- Cumprimento por policy
- Eventos SLA (warnings, missed)

Quando vazio: idem CSAT.

Cache: histórico.

### 15.11 Matrix IA (super admin only)
Métricas específicas:
- Conversas atendidas pela IA (volume)
- Conversas em que cliente respondeu mas IA não respondeu de volta (cliente último → outgoing pendente)
- Tempo médio de resposta da IA
- Conversas transferidas para humano (proxy: conversa do inbox 31 que foi reatribuída ou que o último sender_type é Contact há > X tempo)

Cache: live.

### 15.12 Dashboard (home)
Cards-resumo:
- Conversas recebidas hoje (vs ontem)
- Backlog atual
- Conversas órfãs
- Tempo médio primeira resposta (24h)
- Top 5 atendentes (24h)
- Distribuição por estado (top 5 + outros)

Mini-gráfico de leads nas últimas 24h (linha).

Cache: live.

---

## 16. Filtros canônicos

Componente `FiltersBar` em `src/components/reports/filters-bar.tsx`. Aceita props para indicar quais filtros são relevantes pro relatório.

Filtros:
- **Período** (`PeriodSelector`): hoje, ontem, últimos 7 dias, últimos 30 dias, mês atual, mês anterior, custom (date range picker).
- **Inbox/Estado** (`InboxMultiSelect`): lista carregada do Chatwoot (cached), mostra apenas inboxes do `accountId` ativo. Inbox 31 oculto exceto super admin.
- **Departamento** (`TeamMultiSelect`): teams do `accountId`. Para gerente/viewer, lista filtrada por `getAccessibleTeamIds`.
- **Atendente** (`AgentMultiSelect`): users do `accountId` (filtrado por scope de teams visíveis).
- **Status** (`StatusMultiSelect`): open/pending/resolved/snoozed.
- **Prioridade** (apenas no relatório de Conversas).
- **Label** (apenas no relatório de Conversas).

Estado dos filtros sincronizado com URL query params (deep-linking).

---

## 17. Botão "Abrir no Chatwoot"

Componente `OpenInChatwoot` aceita `accountId` e `displayId`. Renderiza como botão pequeno (ícone `ExternalLink` + texto "Abrir no Chatwoot"), abre `target="_blank"` na URL gerada.

Disponível em:
- Toda linha de conversa (relatório de Conversas, lista de órfãs, ranking).
- Linhas de leads recebidos.
- Snippets em outros relatórios quando houver conversa associada.

Comportamento independente de role (todos podem clicar, inclusive viewer).

Audit log em cada clique: `audit.action = 'opened_chatwoot_link'` (registra `accountId`, `conversationDisplayId`).

---

## 18. CSAT, SLA, Tags

### 18.1 CSAT
Quando `csat_survey_responses` tiver dados:
- Score médio (1-5).
- Distribuição em pizza.
- Lista de feedbacks recentes.

Hoje vazio → empty state: "Ative o CSAT no Chatwoot...".

### 18.2 SLA
Quando `sla_policies`/`applied_slas`/`sla_events` tiver dados:
- Cumprimento por policy.
- Eventos warnings/missed.

Hoje vazio → empty state.

### 18.3 Tags
Relatório de Conversas mostra labels como chips na coluna `cached_label_list`. Filtro por label disponível.
Não vira KPI principal.

---

## 19. Audit log

Toda ação relevante grava `AuditLog`:
- Login (sucesso/falha) com IP e user-agent.
- Mudança de role/access em outros users.
- Criação/edição/exclusão de user.
- Atualização de AppSetting.
- Reset de senha.
- Mudança de account (super admin).
- Clique em "Abrir no Chatwoot".

Painel `/usuarios` tem tab "Auditoria" (super admin) com filtros e paginação.

Retention: 90 dias (job `audit-cleanup` no worker; configurável via AppSetting `audit.retention_days`).

---

## 20. Tema, branding e textos

### 20.1 Tema
- ThemeProvider custom (cookie SSR-aware, mesmo do Roteador).
- Default: dark.
- Toggle no rodapé da sidebar (cycle dark→light→system).

### 20.2 Branding consistente com Roteador
- Logo "N" gradient roxo (mesma imagem PNG).
- Cor primária: roxo Nexus AI (`#7c3aed dark` / `#6d28d9 light` — ler do design tokens do Roteador).
- Tipografia: mesma do Roteador (sans-serif do `globals.css`).
- Header de página: ícone 10×10 em box `bg-violet-600/10`, título h1, breadcrumbs, ações (filtros/refresh).

### 20.3 Textos canônicos
- **Login subtítulo:** "Relatórios e insights dos atendimentos"
- **Footer global:** "Nexus AI © 2026. Todos os direitos reservados"
- **Página `/usuarios` header:** "Usuários — Gerencie os usuários da plataforma"
- **Página `/configuracoes` header:** "Configurações — Ajustes globais da plataforma"
- **Página `/perfil` header:** "Perfil — Suas informações pessoais"
- **Página `/dashboard` header:** "Dashboard — Visão geral dos atendimentos"

---

## 21. Variáveis de ambiente

```
# Banco do Nexus Insights (nosso)
DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus_insights?schema=public

# Banco do Chatwoot (read-only)
CHATWOOT_DATABASE_URL=postgresql://chatwoot_leitura:CW_leitura1212@82.112.245.232:5432/chatwoot
CHATWOOT_BASE_URL=https://chatwoot.znsolucoes.com.br

# Redis
REDIS_URL=redis://redis:6379

# Auth
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://insights.nexusai360.com
ENCRYPTION_KEY=<openssl rand -hex 32>

# Owner (seed)
ADMIN_EMAIL=nexusai360@gmail.com
ADMIN_PASSWORD=nexus.AI@360
ADMIN_NAME=João Zanini

# Email
RESEND_API_KEY=re_bTeB9s6p_AkJxXDcmhZAQzGLjfk8gVmcc
RESEND_FROM=Nexus Insights <noreply@nexusai360.com>

# Deploy
NODE_ENV=production
GHCR_TOKEN=<github_pat>
PORTAINER_URL=https://painel.nexusai360.com
PORTAINER_TOKEN=<portainer_api_token>
PORTAINER_ENDPOINT_ID=1
```

`.env.example` espelha esses sem valores reais.

---

## 22. Estratégia de testes

Idêntica ao Roteador.

### 22.1 Unit (Jest + jest-mock-extended)
- Server actions (`src/lib/actions/*` e `src/lib/actions/reports/*`).
- Permissions (`canCreateRole`, `canEditUser`, etc.) — high-priority.
- Tenant helpers (`getAccessibleAccountIds`, `getAccessibleTeamIds`).
- Filter builder (gerar SQL parametrizado correto).
- Format helpers (CPF, tempo, etc.).

Mock de `@/lib/prisma`, `@/lib/auth`, `@/lib/audit`, `next/cache`, `pg`.

Cobertura mínima: 80% nas pastas críticas (`actions`, `permissions`, `tenant`, `filters`).

### 22.2 Integration
- Pool do Chatwoot com banco de testes local (Docker, Postgres) seedado com fixtures equivalentes.
- Cache pull-through com Redis local.

### 22.3 E2E (futuro, não MVP)
Playwright para fluxo de login + dashboard + relatório.

### 22.4 Smoke pré-deploy
Script `scripts/smoke.sh` que:
- Roda `npm run build`.
- Roda `npx prisma generate`.
- Roda subset de testes críticos.
- Verifica que o seed roda em DB temporário.

---

## 23. CI/CD

`.github/workflows/deploy.yml`:
1. Trigger: push em `main`.
2. Job `test`: `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`.
3. Job `build`: build Next standalone, gera Docker image, pusha para GHCR.
4. Job `deploy`: chamada à API do Portainer pra atualizar a stack.

Tags: `latest` em main; semver opcional em tags `vX.Y.Z`.

---

## 24. Segurança

- **Senhas:** bcryptjs com 10 rounds.
- **Sessões:** JWT stateless (NextAuth), httpOnly secure cookies.
- **Rate limit:** login (5 tentativas/15min), API refresh (6/min/user).
- **Headers:** Content Security Policy, HSTS, X-Frame-Options DENY.
- **SQL injection:** queries parametrizadas (`$1`, `$2`).
- **XSS:** Next.js escapa por padrão; nenhum `dangerouslySetInnerHTML`.
- **CSRF:** NextAuth mitigado via origin check.
- **Audit:** todas ações sensíveis logadas com IP e UA.
- **Read-only DB do Chatwoot:** garantido por usuário sem GRANT de INSERT/UPDATE/DELETE.
- **CPF/CNPJ:** extraído e exibido apenas pra users com role ≥ admin (LGPD: minimizar exposição). Viewer vê telefone mascarado (`+55 (11) ****-1234`)? — discutir.
- **Logs:** sem dados sensíveis (senha, CPF) em logs de aplicação.

---

## 25. Limitações conhecidas e roadmap

### 25.1 Limitações
- **Read-only no Chatwoot:** não há replicação CDC; latência de ≤30s nos painéis ao vivo.
- **CSAT/SLA vazios:** funcionalidade exposta, mas só populada quando o cliente ativar no Chatwoot.
- **CPF/CNPJ free-text:** extração via regex; campos não-padronizados podem escapar.
- **Multi-account drift:** se Chatwoot remover conta, nosso DB pode ter `UserAccountAccess` órfão. Mitigação: job diário + warnings.

### 25.2 Roadmap pós-MVP
- Migração para Opção B (CDC) se latência <1s for necessária.
- Notificações push no app.
- Export CSV de relatórios.
- E2E Playwright.
- Visualização geográfica (mapa do Brasil colorido).

---

## 26. Plano de fases (entregas)

**Fase 0 — Fundação (1 semana)**
- Cópia integral do Roteador, remoção de webhooks/Meta, ajuste de branding.
- Schema Prisma + migrations + seed do owner.
- Auth (login + reset + verify).
- Sidebar + tema + layout shell + tela `/dashboard` placeholder.
- Pool pg + 1 query smoke (`SELECT 1` no Chatwoot).
- Deploy do esqueleto vazio em `insights.nexusai360.com`.

**Fase 1 — RBAC + Settings (3-5 dias)**
- Tela `/usuarios` completa (criar/editar/excluir com regras).
- Tela `/configuracoes` (polling settings).
- Audit log + tab.
- Multi-account selector na sidebar.

**Fase 2 — Relatórios v1 (1-2 semanas)**
- Conversas (relatório principal).
- Leads recebidos.
- Volumetria.
- Tempos de resposta.
- Status das conversas (com órfãs).
- Dashboard (home com KPIs).

**Fase 3 — Relatórios v2 (1 semana)**
- Ranking de atendentes.
- Por departamento.
- Por estado.

**Fase 4 — Especiais (1 semana)**
- Matrix IA (super admin).
- CSAT (placeholder).
- SLA (placeholder).

**Fase 5 — Polimento (3-5 dias)**
- Testes (cobertura 80% nas áreas críticas).
- Performance review (queries do Chatwoot, cache hit rate).
- Documentação (README, CLAUDE.md, runbooks).
- Deploy final + smoke checklist.

---

## 27. Apêndice — pontos abertos para refinamento (revisar em v2)

- [ ] Mascaramento de telefone/CPF para viewer? (LGPD-friendly mas perde utilidade)
- [ ] Decisão sobre command palette ⌘K (incluir no MVP ou pós-MVP?)
- [ ] Notification bell — manter no MVP (SSE eventos importantes) ou apenas placeholder?
- [ ] Granularidade de exclusão do inbox 31: pode ser por relatório ou global?
- [ ] Query de "IA não respondeu" — heurística precisa de validação com dados reais.
- [ ] Backup do nosso DB (Postgres 16 dentro do container) — schedule, retenção, location.
- [ ] Health check endpoint `/api/health` (db + redis + chatwoot ping).

---

**Fim da v1.** Próximo passo: pente-fino #1 → versão v2 com correções, ambiguidades resolvidas e detalhes acrescentados.
