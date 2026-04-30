# Nexus Insights — Design Spec (v3 — final)

**Status:** v3 final (após pente-finos #1 e #2). Documento canônico do design.
**Data:** 2026-04-29
**Autor:** Claude (Anthropic) sob direção de João Zanini
**Documentos relacionados:**
- `docs/discovery/2026-04-29-chatwoot-schema-discovery.md` — levantamento real do banco do Chatwoot.
- `docs/discovery/2026-04-29-decisoes-consolidadas.md` — decisões prévias do usuário.
- `docs/superpowers/specs/2026-04-29-nexus-insights-design-v1.md` — v1 (rascunho inicial).
- `docs/superpowers/specs/2026-04-29-nexus-insights-design-v2.md` — v2 (refinos do pente-fino #1).
- `CLAUDE.md` — regras supremas do projeto.

---

## 1. Contexto e objetivo

A Matrix Fitness Group é uma distribuidora nacional de equipamentos de academia. Sua operação de atendimento usa **Chatwoot** (instância em `chatwoot.znsolucoes.com.br`), com 23 inboxes representando os estados brasileiros + 1 inbox de IA (`00-Matrix IA`) + ZZ-Outros, totalizando ~8 mil conversas e 260 mil mensagens em 13 meses.

A diretoria precisa de uma **plataforma web própria de relatórios e insights** sobre essa operação, com filtros cruzados (estado × departamento × atendente × período × status), botão "Abrir no Chatwoot" para deep-linking, RBAC hierárquico em 4 níveis (super admin → admin → gerente → visualizador), e atualização automática em pseudo-tempo-real (polling com cache híbrido).

A plataforma é **apenas leitura** — não executa ações sobre o Chatwoot. O acesso ao banco do Chatwoot é via usuário dedicado **read-only** (`chatwoot_leitura`).

### Identidade
- Nome: **Nexus Insights**.
- Domínio: **`insights.nexusai360.com`**.
- Tagline: "Relatórios e insights dos atendimentos".
- Footer: "Nexus AI © 2026. Todos os direitos reservados".
- Branding: cópia integral do **Roteador Webhook Meta**.

### Escopo
- **MVP (10 entregáveis):** plataforma de relatórios (12 telas), gestão de usuários com RBAC, autenticação completa (login + reset + verify), painel `/configuracoes` dinâmico, multi-account (super admin), deep-link Chatwoot, command palette ⌘K, audit log, deploy via Portainer/Traefik com SSL, CI/CD GitHub Actions.
- **Fora de escopo:** ações no Chatwoot, integração com CRM externo, e-commerce, notificações push, multi-idioma.

---

## 2. Glossário

| Termo | Significado |
|------|-------------|
| **Account** (Chatwoot) | Tenant nativo do Chatwoot. Foco: `id=9` Matrix; super admin também acessa `id=2` Invest. |
| **Inbox** (Chatwoot) | Canal de atendimento. No Matrix: 1 por estado brasileiro + IA + ZZ-Outros. |
| **Team** (Chatwoot) | Departamento interno: 💰 Financeiro, 🛠️ Assistência Técnica, 🛍️ Comercial, 💎 Qualidade. |
| **User do Chatwoot** | Atendente do Chatwoot. **≠** usuário do Nexus Insights. |
| **Conversation** | Conversa entre contato e atendente. Display público: `display_id`. |
| **`reporting_events`** | Eventos pré-agregados do Chatwoot (`first_response`, `reply_time`, `conversation_resolved`). |
| **Owner** (Nexus Insights) | Super admin principal seedado no banco (`isOwner = true`). Imutável e indeletável. |
| **RBAC** | Role-Based Access Control — 4 níveis. |
| **Polling** | Re-consulta periódica do Chatwoot pelo nosso backend. |
| **`display_id`** | ID público da conversa no Chatwoot (usado em URLs). |
| **Inbox 31** | `00-Matrix IA` — canal automatizado. Visível **apenas para super admin** quando o flag global permitir. |

---

## 3. Visão geral da arquitetura

```
┌────────────────────────────────────────────────────────────────────┐
│                     NEXUS INSIGHTS (Next.js 16)                    │
│                                                                    │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────────┐   │
│  │  app/(auth)  │   │ app/(protected)│   │  app/api/*          │   │
│  │  login/      │   │ dashboard/     │   │   /events  (SSE)    │   │
│  │  forgot/     │   │ relatorios/    │   │   /health           │   │
│  │  reset/      │   │ usuarios/      │   │   /chatwoot/refresh │   │
│  │  verify-email│   │ configuracoes/ │   │   /settings         │   │
│  │              │   │ perfil/        │   │   /user/theme       │   │
│  └──────────────┘   └────────────────┘   │   /auth/[...next]   │   │
│                                          └─────────────────────┘   │
│                                                                    │
│  ┌─────────────────────── src/lib ──────────────────────────────┐  │
│  │ actions/  schemas/  validations/  constants/  permissions    │  │
│  │ chatwoot/ reports/  cache/        settings/   tenant         │  │
│  │ prisma    redis     queue         realtime    audit          │  │
│  │ encryption rate-limit theme       auth-helpers utils         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                │                                  │
                │ Prisma (read+write)              │ pg (read-only)
                ▼                                  ▼
       ┌────────────────┐                 ┌─────────────────────┐
       │  Postgres 16   │                 │  Postgres 14.20     │
       │  (nosso, db)   │                 │  Chatwoot remoto    │
       │  nexus_insights│                 │  82.112.245.232     │
       └────────────────┘                 └─────────────────────┘
                ▲
                │
       ┌────────────────┐                 BullMQ
       │   Redis 7      │ ◀────────── pub/sub eventos
       │ cache+rate+pub │                  ▲
       └────────────────┘                  │
                ▲                          │
                │                          │
                ▼                  ┌─────────────────┐
       ┌────────────────┐          │     Worker      │
       │  Browser SSE   │ ◀──────  │   ─ prewarm     │
       │   (React 19)   │          │   ─ sync-meta   │
       └────────────────┘          │   ─ db-backup   │
                                   │   ─ audit-write │
                                   │   ─ cleanup     │
                                   └─────────────────┘
```

### 3.1 Containers (4, idêntico ao Roteador)
| Service | Imagem | Porta | Volume | Função |
|---------|--------|-------|--------|--------|
| `app` | `ghcr.io/jvzanini/nexus-insights:latest` | 3000 | — | Next.js standalone + entrypoint que roda `prisma migrate deploy` antes de subir. |
| `worker` | (mesma imagem) | — | `nexus_insights_backups:/var/backups/nexus_insights` | BullMQ jobs. |
| `db` | `postgres:16-alpine` | 5432 (internal) | `nexus_insights_postgres:/var/lib/postgresql/data` | Banco próprio. |
| `redis` | `redis:7-alpine` | 6379 (internal) | `nexus_insights_redis:/data` | Cache + pub/sub. |

### 3.2 Rede e SSL
- Container `app` exposto via **Traefik** com labels:
  - `traefik.enable=true`
  - `traefik.http.routers.nexus-insights.rule=Host(\`insights.nexusai360.com\`)`
  - `traefik.http.routers.nexus-insights.entrypoints=websecure`
  - `traefik.http.routers.nexus-insights.tls.certresolver=letsencrypt`
  - `traefik.http.services.nexus-insights.loadbalancer.server.port=3000`
- Demais containers em rede interna `internal` (sem exposição).
- Stack publicada no Portainer (URL `painel.nexusai360.com`, endpoint id=1).

### 3.3 Conexão com o Chatwoot
- TCP direto na porta 5432 do host `82.112.245.232`.
- Pool dedicado `getChatwootPool()` em `src/lib/chatwoot/pool.ts`: `min: 2`, `max: 8`, `idleTimeoutMillis: 30000`, `statement_timeout: 30000`, `application_name: 'nexus-insights'`.
- Falha de conexão é tratada em `withChatwootResilience` (§7.4).

### 3.4 Migrations Prisma automáticas
Entrypoint do container `app` (script `docker/entrypoint.sh`):
```bash
#!/bin/sh
set -e
echo "[entrypoint] applying migrations…"
npx prisma migrate deploy
echo "[entrypoint] running seed (idempotent)…"
node ./dist/prisma/seed.js
echo "[entrypoint] starting Next.js…"
exec node server.js
```
Idempotente. Falha de migration = container não sobe; healthcheck do Traefik impede tráfego.

### 3.5 Health check (`/api/health`)
Endpoint público (sem auth). Checagens granulares com timeout próprio:

| Check | Operação | Timeout |
|-------|----------|---------|
| `database` | `SELECT 1` via Prisma | 1.0s |
| `redis` | `PING` | 0.5s |
| `chatwoot` | `SELECT 1` via pool | 2.0s |

Response:
```json
{
  "status": "ok|degraded|down",
  "checks": {
    "database":  { "ok": true, "ms": 12 },
    "redis":     { "ok": true, "ms": 3 },
    "chatwoot":  { "ok": true, "ms": 89 }
  },
  "version": "v0.1.0",
  "commit": "abc1234",
  "uptime_s": 12345
}
```
- `ok`: tudo verde.
- `degraded`: Chatwoot ou Redis falhou, mas DB próprio ok.
- `down`: DB próprio falhou.

Traefik healthcheck consulta `/api/health` a cada 30s; se 3 falhas seguidas, retira do load balancer.

---

## 4. Stack tecnológica

(idêntico ao Roteador Webhook Meta)

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript 5 strict |
| Styling | Tailwind CSS 4 + base-ui (shadcn-style, prop `render`) |
| Auth | NextAuth.js 5 (Credentials + JWT stateless + bcryptjs) |
| ORM próprio | Prisma 7 + `@prisma/adapter-pg` |
| Acesso Chatwoot | `pg` 8 + queries SQL parametrizadas + Zod parsers |
| Cache & pub/sub | Redis 7 + ioredis |
| Filas | BullMQ 5 |
| Realtime | SSE em `/api/events` |
| Validação | Zod 4 |
| Email | Resend + React Email |
| Charts | Recharts 3 |
| Ícones | Lucide React (proibido emoji em UI) |
| Animações | Framer Motion 12 (`as const`) |
| Toasts | Sonner customizado |
| Tema | ThemeProvider custom (cookie SSR) |
| Tests | Jest 30 + jest-mock-extended |
| Encryption | Node crypto AES-256 |
| Container | Docker + Traefik labels |
| Registry | `ghcr.io/jvzanini/nexus-insights` |
| CI/CD | GitHub Actions → GHCR → Portainer redeploy |

---

## 5. Estrutura de pastas

```
nexus-insights/
├── src/
│   ├── auth.ts                                # NextAuth setup
│   ├── auth.config.ts                         # Callbacks, maxAge
│   ├── middleware.ts                          # Proteção rotas + mustChangePassword guard
│   ├── instrumentation.ts                     # (opcional) Sentry, etc.
│   ├── app/
│   │   ├── (auth)/                            # rotas públicas
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   └── verify-email/page.tsx
│   │   ├── (protected)/                       # rotas autenticadas
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── relatorios/
│   │   │   │   ├── page.tsx                   # catálogo
│   │   │   │   ├── conversas/page.tsx
│   │   │   │   ├── leads-recebidos/page.tsx
│   │   │   │   ├── volumetria/page.tsx
│   │   │   │   ├── tempos-resposta/page.tsx
│   │   │   │   ├── ranking-atendentes/page.tsx
│   │   │   │   ├── por-departamento/page.tsx
│   │   │   │   ├── por-estado/page.tsx
│   │   │   │   ├── status-conversas/page.tsx
│   │   │   │   ├── csat/page.tsx
│   │   │   │   ├── sla/page.tsx
│   │   │   │   └── matrix-ia/page.tsx         # super admin only
│   │   │   ├── usuarios/page.tsx
│   │   │   ├── configuracoes/page.tsx         # super admin only
│   │   │   └── perfil/
│   │   │       ├── page.tsx
│   │   │       └── trocar-senha/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── events/route.ts                # SSE
│   │   │   ├── health/route.ts
│   │   │   ├── user/theme/route.ts
│   │   │   ├── settings/route.ts
│   │   │   └── chatwoot/refresh/route.ts
│   │   ├── error.tsx                          # error boundary global
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── command-palette.tsx
│   │   │   ├── breadcrumbs.tsx
│   │   │   └── account-switcher.tsx           # super admin
│   │   ├── login/
│   │   │   ├── login-branding.tsx
│   │   │   ├── login-content.tsx
│   │   │   └── login-form.tsx
│   │   ├── reports/
│   │   │   ├── filters-bar.tsx
│   │   │   ├── period-selector.tsx
│   │   │   ├── inbox-multi-select.tsx
│   │   │   ├── team-multi-select.tsx
│   │   │   ├── agent-multi-select.tsx
│   │   │   ├── status-multi-select.tsx
│   │   │   ├── label-multi-select.tsx
│   │   │   ├── refresh-button.tsx
│   │   │   ├── stale-banner.tsx               # banner amarelo "Chatwoot indisponível"
│   │   │   ├── kpi-card.tsx
│   │   │   ├── chart-line.tsx
│   │   │   ├── chart-bar.tsx
│   │   │   ├── chart-pie.tsx
│   │   │   ├── chart-heatmap.tsx
│   │   │   ├── data-table.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── skeleton-report.tsx
│   │   │   └── open-in-chatwoot.tsx
│   │   ├── users/
│   │   │   ├── users-table.tsx
│   │   │   ├── user-form-dialog.tsx
│   │   │   ├── role-select.tsx
│   │   │   ├── account-multi-select.tsx
│   │   │   ├── department-multi-select.tsx
│   │   │   ├── delete-user-dialog.tsx
│   │   │   ├── deactivate-user-dialog.tsx
│   │   │   └── resend-password-dialog.tsx
│   │   ├── settings/
│   │   │   └── polling-settings-form.tsx
│   │   ├── providers/
│   │   │   ├── session-provider.tsx
│   │   │   └── theme-provider.tsx
│   │   └── ui/                                # 100% copiado do Roteador
│   ├── lib/
│   │   ├── actions/
│   │   │   ├── users.ts
│   │   │   ├── settings.ts
│   │   │   ├── reports/
│   │   │   │   └── (1 arquivo por relatório)
│   │   │   ├── auth.ts
│   │   │   ├── password-reset.ts
│   │   │   ├── profile.ts
│   │   │   └── audit.ts
│   │   ├── chatwoot/
│   │   │   ├── pool.ts
│   │   │   ├── resilience.ts                  # withChatwootResilience
│   │   │   ├── queries/
│   │   │   ├── schemas.ts
│   │   │   ├── filters.ts
│   │   │   └── deep-link.ts
│   │   ├── reports/
│   │   │   ├── kpi-helpers.ts
│   │   │   ├── period.ts
│   │   │   └── max-period.ts                  # validação max 365 dias
│   │   ├── cache/
│   │   │   ├── keys.ts
│   │   │   ├── pull-through.ts
│   │   │   └── invalidate.ts
│   │   ├── settings/
│   │   │   ├── get.ts
│   │   │   └── update.ts
│   │   ├── tenant.ts
│   │   ├── permissions.ts
│   │   ├── auth-helpers.ts
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── queue.ts
│   │   ├── realtime.ts
│   │   ├── audit.ts
│   │   ├── encryption.ts
│   │   ├── theme.ts
│   │   ├── rate-limit/
│   │   │   ├── login.ts
│   │   │   └── refresh.ts
│   │   ├── validations/
│   │   │   ├── user.ts
│   │   │   ├── settings.ts
│   │   │   └── filters.ts
│   │   ├── schemas/
│   │   │   └── reports/
│   │   ├── constants/
│   │   │   ├── roles.ts
│   │   │   ├── settings-keys.ts
│   │   │   ├── periods.ts
│   │   │   ├── status-labels.ts
│   │   │   └── nav.ts
│   │   ├── logger.ts                          # logs estruturados
│   │   └── utils/
│   │       ├── cn.ts
│   │       ├── format-cpf.ts
│   │       ├── format-phone.ts
│   │       ├── format-time.ts
│   │       ├── format-date.ts                 # Intl.DateTimeFormat('pt-BR')
│   │       └── slugify.ts
│   ├── worker/
│   │   ├── index.ts
│   │   ├── jobs/
│   │   │   ├── prewarm-live-cache.ts
│   │   │   ├── prewarm-historical-cache.ts
│   │   │   ├── sync-chatwoot-meta.ts
│   │   │   ├── db-backup.ts
│   │   │   ├── audit-write.ts
│   │   │   └── audit-cleanup.ts
│   │   └── shared/
│   │       ├── prisma.ts
│   │       ├── redis.ts
│   │       └── chatwoot-pool.ts
│   ├── __tests__/
│   ├── types/
│   └── generated/
│       └── prisma/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
│   └── logo-nexus-ai.png
├── docker/
│   ├── Dockerfile
│   └── entrypoint.sh
├── docker-compose.yml                         # genérico (vai pro git)
├── docker-compose.production.yml              # produção (NÃO vai pro git)
├── docs/
│   ├── discovery/
│   ├── superpowers/
│   │   ├── specs/
│   │   └── plans/
│   └── runbooks/
│       ├── deploy.md
│       ├── backup-restore.md
│       └── troubleshooting.md
├── design-system/
│   └── nexus-insights/
│       └── MASTER.md
├── scripts/
│   ├── clean-build.js
│   └── smoke.sh
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml
├── tsconfig.json
├── jest.config.ts
├── eslint.config.mjs
├── package.json
├── package-lock.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
└── AGENTS.md
```

---

## 6. Modelo de dados próprio (Prisma)

### 6.1 Schema completo

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PlatformRole { super_admin admin manager viewer }
enum Theme        { dark light system }
enum AuditAction {
  login_succeeded
  login_failed
  password_reset_requested
  password_reset_completed
  user_created
  user_updated
  user_deleted
  user_role_changed
  user_access_granted
  user_access_revoked
  user_activated
  user_deactivated
  profile_updated
  profile_password_changed
  email_change_requested
  email_change_completed
  account_switched
  setting_updated
  opened_chatwoot_link
  session_revoked
}

model User {
  id                  String    @id @default(uuid()) @db.Uuid
  email               String    @unique
  password            String
  name                String
  platformRole        PlatformRole
  isOwner             Boolean   @default(false)
  isActive            Boolean   @default(true)
  mustChangePassword  Boolean   @default(true)
  passwordChangedAt   DateTime?
  avatarUrl           String?
  theme               Theme     @default(system)
  emailVerifiedAt     DateTime?
  lastLoginAt         DateTime?
  lastLoginIp         String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  createdById         String?   @db.Uuid
  createdBy           User?     @relation("UserCreator", fields: [createdById], references: [id])
  createdUsers        User[]    @relation("UserCreator")
  accountAccess       UserAccountAccess[]
  teamAccess          UserTeamAccess[]
  audits              AuditLog[]
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens   EmailChangeToken[]

  @@index([platformRole, isActive])
  @@index([email])
}

model UserAccountAccess {
  id                  String   @id @default(uuid()) @db.Uuid
  userId              String   @db.Uuid
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatwootAccountId   Int
  chatwootAccountName String
  grantedAt           DateTime @default(now())
  grantedById         String?  @db.Uuid

  @@unique([userId, chatwootAccountId])
  @@index([chatwootAccountId])
}

model UserTeamAccess {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatwootAccountId Int
  chatwootTeamId    Int
  chatwootTeamName  String
  grantedAt         DateTime @default(now())

  @@unique([userId, chatwootAccountId, chatwootTeamId])
  @@index([userId, chatwootAccountId])
}

model AppSetting {
  key         String   @id
  value       Json
  description String?
  category    String
  updatedAt   DateTime @updatedAt
  updatedById String?  @db.Uuid
}

model AuditLog {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String?     @db.Uuid
  user        User?       @relation(fields: [userId], references: [id])
  action      AuditAction
  targetType  String?
  targetId    String?
  ipAddress   String?
  userAgent   String?
  details     Json?
  createdAt   DateTime    @default(now())

  @@index([userId, createdAt])
  @@index([action, createdAt])
}

model PasswordResetToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, expiresAt])
}

model EmailChangeToken {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  newEmail    String
  tokenHash   String    @unique
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())
}
```

### 6.2 Seed (`prisma/seed.ts`)

Idempotente:
1. **Owner:**
   - Email = `ADMIN_EMAIL`, name = `ADMIN_NAME`, role = `super_admin`, `isOwner = true`, `isActive = true`, `mustChangePassword = false`, `passwordChangedAt = now()`, `emailVerifiedAt = now()`.
   - Senha = bcrypt(`ADMIN_PASSWORD`).
   - Se já existir owner: atualiza nome/avatar/tema (não toca password nem email).
2. **AppSettings defaults:**
   ```
   polling.live_seconds = 30
   polling.historical_seconds = 300
   polling.refresh_button_enabled = true
   realtime.sse_enabled = true
   feature_flags.matrix_ia_visible_to_super_admin_only = true
   feature_flags.exclude_matrix_ia_globally = true
   feature_flags.csat_enabled = true
   feature_flags.sla_enabled = true
   audit.retention_days = 90
   reports.max_period_days = 365
   chatwoot.deeplink_base = https://chatwoot.znsolucoes.com.br
   ```
3. **UserAccountAccess do owner:** popular cache com nomes vindos do Chatwoot:
   - `chatwootAccountId=9, name="Matrix Fitness Group"`
   - `chatwootAccountId=2, name="Invest Soluções"`
   - Se Chatwoot indisponível no momento do seed, usar nomes hardcoded (constants) como fallback.

### 6.3 Política de revogação em cascata

**Cenário 1 — Revogação de account:** super admin remove a account X de um user A.
- Server action remove `UserAccountAccess(A, X)`.
- Em sequência (mesma transação): remove `UserAccountAccess(B, X)` para todos os B onde `B.createdById = A.id`. Recursivo (descendentes de B incluídos).
- Idem para `UserTeamAccess` em teams pertencentes a X.
- Audit log: `user_access_revoked` com `details.reason = 'cascade_from_user'`, `details.ancestorUserId = A.id` para cada cascata.

**Cenário 2 — Rebaixamento de role:** super admin muda admin → manager. Manager não pode ter accounts/teams que excedam o que outro manager teria. Cenário **bloqueado** se o user tem 0 teams selecionados (manager precisa de ≥1 team). Servidor força criação do `UserTeamAccess` antes da troca.

**Cenário 3 — Exclusão:** `User.delete()` com `onDelete: Cascade` em accesses. `createdById` em descendentes vira NULL. Sessões (NextAuth JWT) invalidadas na próxima request via callback `jwt`.

**Cenário 4 — Desativação:** `isActive = false`. Sessões invalidadas. `mustChangePassword` permanece. Reativação possível por user de hierarquia maior.

---

## 7. Camada de acesso ao Chatwoot

### 7.1 Pool dedicado (`src/lib/chatwoot/pool.ts`)
Singleton, lazy:
```typescript
import { Pool } from 'pg';
let pool: Pool | null = null;
export function getChatwootPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 2, max: 8,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: 'nexus-insights',
  });
  pool.on('error', err => logger.error('chatwoot-pool error', err));
  return pool;
}
```

### 7.2 Queries (`src/lib/chatwoot/queries/*.ts`)
Cada arquivo: 1 função, 1 input tipado, output validado por Zod.

Exemplo (`leads-recebidos.ts`):
```typescript
import { z } from 'zod';
import { getChatwootPool } from '../pool';
import { buildBaseFilter } from '../filters';
import type { ReportFilters } from '@/lib/schemas/filters';
import { withChatwootResilience } from '../resilience';
import { withCache } from '@/lib/cache/pull-through';
import { cacheKey } from '@/lib/cache/keys';

const RowSchema = z.object({ bucket: z.string(), total: z.number().int().nonnegative() });
export type LeadsRecebidosRow = z.infer<typeof RowSchema>;

export async function leadsRecebidos(args: {
  accountId: number;
  filters: ReportFilters;
  granularity: 'day' | 'week' | 'month';
  ttlSeconds: number;
  cacheScope: 'live' | 'historical';
}) {
  const key = cacheKey({ scope: 'report', name: `leads-recebidos-${args.granularity}`, accountId: args.accountId, filtersHash: hashFilters(args.filters) });
  return withCache({
    key, ttlSeconds: args.ttlSeconds,
    fetcher: () => withChatwootResilience(async () => {
      const pool = getChatwootPool();
      const { whereSql, params } = buildBaseFilter(args.filters, args.accountId);
      const trunc = ({ day:'day', week:'week', month:'month' } as const)[args.granularity];
      const sql = `
        SELECT to_char(date_trunc('${trunc}', c.created_at), 'YYYY-MM-DD') AS bucket,
               COUNT(*)::int AS total
        FROM conversations c
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY 1
      `;
      const { rows } = await pool.query(sql, params);
      return z.array(RowSchema).parse(rows);
    }, { fallbackKey: key }),
  });
}
```

### 7.3 Filter builder (`src/lib/chatwoot/filters.ts`)

```typescript
export function buildBaseFilter(filters: ReportFilters, accountId: number): { whereSql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 0;
  parts.push(`c.account_id = $${++p}`); params.push(accountId);

  // Excluir Matrix IA por default (controlado pela flag global + override do super admin)
  if (filters.excludeMatrixIA !== false) {
    parts.push(`c.inbox_id <> 31`);
  }

  if (filters.inboxIds?.length) { parts.push(`c.inbox_id = ANY($${++p})`); params.push(filters.inboxIds); }
  if (filters.teamIds?.length)  { parts.push(`c.team_id = ANY($${++p})`); params.push(filters.teamIds); }
  if (filters.assigneeIds?.length) { parts.push(`c.assignee_id = ANY($${++p})`); params.push(filters.assigneeIds); }
  if (filters.statuses?.length) { parts.push(`c.status = ANY($${++p})`); params.push(filters.statuses); }
  if (filters.priorities?.length) { parts.push(`c.priority = ANY($${++p})`); params.push(filters.priorities); }

  if (filters.period?.start) { parts.push(`c.created_at >= $${++p}`); params.push(filters.period.start); }
  if (filters.period?.end) { parts.push(`c.created_at < $${++p}`); params.push(filters.period.end); }

  if (filters.labelIds?.length) {
    // JOIN com taggings em vez de LIKE em cached_label_list (evita full-scan)
    parts.push(`EXISTS (
      SELECT 1 FROM taggings t
      WHERE t.taggable_id = c.id AND t.taggable_type = 'Conversation'
      AND t.tag_id = ANY($${++p})
    )`);
    params.push(filters.labelIds);
  }
  return { whereSql: parts.join(' AND '), params };
}
```

### 7.4 `withChatwootResilience` (`src/lib/chatwoot/resilience.ts`)
```typescript
export async function withChatwootResilience<T>(fn: () => Promise<T>, opts: { fallbackKey?: string } = {}): Promise<{ data: T; stale: boolean; error?: string }> {
  try {
    return { data: await fn(), stale: false };
  } catch (err) {
    logger.error('chatwoot query failed', err);
    if (opts.fallbackKey) {
      const stale = await getRedis().get(opts.fallbackKey);
      if (stale) {
        const parsed = JSON.parse(stale);
        return { data: parsed.d, stale: true, error: 'chatwoot_unavailable' };
      }
    }
    throw err;
  }
}
```
UI: banner amarelo quando `stale=true`.

### 7.5 Validação de período máximo
Helper `assertPeriodInRange(period, maxDays)` — lê `reports.max_period_days` do AppSetting (default 365). Server action retorna `{ success: false, error: 'Período excede o máximo permitido (365 dias).' }` se exceder.

### 7.6 Deep-link (`src/lib/chatwoot/deep-link.ts`)
```typescript
export function chatwootConversationUrl(accountId: number, displayId: number) {
  const base = (await getSetting<string>('chatwoot.deeplink_base')) ?? 'https://chatwoot.znsolucoes.com.br';
  return `${base}/app/accounts/${accountId}/conversations/${displayId}`;
}
```

---

## 8. Cache e polling

### 8.1 Estratégia híbrida
- **Pull-through (lazy):** request chega → Redis miss → query → grava → devolve.
- **Pré-aquecimento (proativo):** worker BullMQ roda jobs em intervalos para 4-6 KPIs/relatórios "ao vivo" (home, backlog, status, órfãs).

### 8.2 Padrão de chave (`src/lib/cache/keys.ts`)
```typescript
function cacheKey(args: { scope: 'report'|'kpi'|'meta'; name: string; accountId: number; filtersHash: string }) {
  return `ni:${args.scope}:${args.name}:a${args.accountId}:${args.filtersHash}`;
}
function hashFilters(f: ReportFilters): string { return crypto.createHash('sha1').update(JSON.stringify(f)).digest('hex').slice(0, 16); }
```

### 8.3 TTLs (`src/lib/cache/pull-through.ts`)
```typescript
export async function withCache<T>(args: { key: string; ttlSeconds: number; fetcher: () => Promise<{ data: T; stale: boolean; error?: string }> }) {
  const redis = getRedis();
  const raw = await redis.get(args.key);
  if (raw) {
    const parsed = JSON.parse(raw) as { d: T; t: string };
    return { data: parsed.d, cached: true, cachedAt: new Date(parsed.t), stale: false };
  }
  const result = await args.fetcher();
  if (!result.stale) {
    await redis.set(args.key, JSON.stringify({ d: result.data, t: new Date().toISOString() }), 'EX', args.ttlSeconds);
  }
  return { data: result.data, cached: false, stale: result.stale, error: result.error };
}
```

### 8.4 Botão "Atualizar agora" (`POST /api/chatwoot/refresh`)
- Recebe `{ scope, name, filtersHash }`.
- Verifica rate-limit Redis (6/min/user).
- Calcula `cacheKey`, `DELETE` no Redis.
- Re-executa fetcher.
- Devolve `{ data, cachedAt: now, cached: false }`.

### 8.5 Pré-aquecimento (worker)
Filas `prewarmLive` e `prewarmHistorical` com schedulers reconfiguráveis em runtime via SSE event `settings:updated`.

```typescript
// worker/jobs/prewarm-live-cache.ts
const TARGETS = [
  { scope: 'kpi', name: 'home-summary', fn: homeSummary },
  { scope: 'kpi', name: 'backlog', fn: backlog },
  { scope: 'kpi', name: 'orfas', fn: orfas },
  { scope: 'report', name: 'status-distrib', fn: statusDistrib },
];
export async function runPrewarmLive() {
  const liveSeconds = await getSetting<number>('polling.live_seconds') ?? 30;
  for (const t of TARGETS) {
    await t.fn({ accountId: 9, filters: defaultFilters(), ttlSeconds: liveSeconds + 5, cacheScope: 'live' });
  }
}
```

### 8.6 Sync diário de metadados
Job `sync-chatwoot-meta` (cron `0 3 * * *`):
1. Atualiza nomes em `UserAccountAccess.chatwootAccountName` e `UserTeamAccess.chatwootTeamName`.
2. Cacheia `inboxes`, `teams`, `users` do Chatwoot por account (TTL 24h).
3. Loga warning se algum ID em uso pelo Insights deixou de existir.

### 8.7 Backup do nosso DB
Job `db-backup` (cron `0 4 * * *`):
- Spawn `pg_dump` (PASSWORD via env).
- Output em volume `nexus_insights_backups` como `YYYY-MM-DD.sql.gz`.
- Retenção 7 dias (limpa antes de novo dump).

---

## 9. Settings dinâmicas

### 9.1 Tabela `AppSetting` — JSON values, key como PK.

### 9.2 Painel `/configuracoes` (super admin only)
**Categorias:**

#### Atualização (polling)
- Tempo ao vivo (segundos): input numérico, validação 5–300, default 30.
- Tempo histórico (segundos): input numérico, validação 30–3600, default 300.
- Botão "Atualizar agora": toggle on/off (default on).

#### Realtime
- SSE: master switch (default on).

#### Visibilidade
- Excluir Matrix IA globalmente: toggle (default on).
- Mostrar inbox Matrix IA somente para Super Admin: toggle (default on).

#### Módulos
- CSAT visível: toggle (default on).
- SLA visível: toggle (default on).

#### Auditoria
- Retention (dias): numérico, 30–365, default 90.

#### Relatórios
- Max período por query (dias): numérico, 30–730, default 365.

### 9.3 Helpers (`src/lib/settings/`)
- `getSetting<T>(key)`: cache Redis 60s.
- `updateSetting(key, value, userId)`: validação Zod + Prisma upsert + invalida cache + emite SSE `settings:updated`.

---

## 10. Realtime (SSE)

### 10.1 Endpoint `/api/events`
- Conexão autenticada via cookie session (lê NextAuth token).
- Subscribe Redis canal `nexus-insights:realtime` (ioredis).
- Eventos:
  - `settings:updated` (worker re-lê settings e reconfigura schedulers).
  - `report:invalidated` (frontend refetch suave).
  - Conexão expira após 1h (heartbeat a cada 30s); cliente reconecta.

### 10.2 Hook client `useRealtimeReport(scope, name)`
- Server Component faz fetch inicial.
- Cliente abre `EventSource('/api/events')`.
- On `report:invalidated` com mesma key → refetch.

---

## 11. Auth e tela de login

### 11.1 NextAuth v5
- Provider: Credentials (email + password).
- JWT stateless, `maxAge: 7 * 24 * 60 * 60`.
- `authorizeCredentials`:
  1. Rate-limit Redis: chave `login:rate:${email}:${ip}`, 5 tentativas/15min. Excede → 429.
  2. Busca user com `select { id, email, password, platformRole, isOwner, isActive, mustChangePassword, name, avatarUrl, theme }`.
  3. `if (!user.isActive)` → falha.
  4. `bcrypt.compare(password, user.password)`.
  5. Audit log (`login_succeeded` ou `login_failed`).
  6. Retorna `AuthUser`.
- Callback `jwt`:
  - Login inicial: popula token.
  - A cada request: re-busca user, sync de `isActive`, role, theme, mustChangePassword. Se `isActive=false` → `return null` (invalida sessão).
- Callback `session`: serializa para `session.user`.

### 11.2 Tela `/login`
**Cópia exata** do Roteador Webhook Meta. Diferenças textuais:
- Subtítulo (em `login-branding.tsx`): "Relatórios e insights dos atendimentos".
- Footer global: "Nexus AI © 2026. Todos os direitos reservados".

Estrutura mantida:
- Container fundo escuro com gradient sutil.
- Logo "N" em gradient roxo, `rounded-[22%]`, glow violet.
- Título "Nexus AI" (h1 bold).
- Subtítulo (texto muted).
- Form: campos email + senha (com olho de toggle), link "Esqueci minha senha", botão "Entrar" gradient roxo.
- Footer fixo em baixo da página.

### 11.3 Telas auxiliares
- `/forgot-password`: form com email; ao submit envia para `password-reset.requestPasswordReset()` que cria `PasswordResetToken` (TTL 30min, hash bcrypt) e dispara email Resend.
- `/reset-password?token=...`: form com nova senha + confirmação; valida token, atualiza password, marca `usedAt`, audit, redireciona para `/login` com flash success.
- `/verify-email?token=...`: consome `EmailChangeToken`, atualiza `User.email`, marca `consumedAt`, audit, redireciona.

### 11.4 `mustChangePassword` flow
- Após login bem-sucedido, callback `jwt` lê `mustChangePassword`.
- Middleware: se `mustChangePassword=true` e rota não é `/perfil/trocar-senha`, redireciona para essa rota.
- Tela `/perfil/trocar-senha`: form (senha atual, nova, confirmação). Server action valida senha atual, salva nova com bcrypt, set `mustChangePassword=false`, `passwordChangedAt=now()`. Audit `profile_password_changed`. Redireciona `/dashboard`.
- Owner nunca tem `mustChangePassword=true`.

### 11.5 Logout
- Botão no rodapé da sidebar.
- Server Action chama `signOut({ redirectTo: '/login' })` do NextAuth.
- Audit `session_revoked`.

### 11.6 Middleware
- Rotas públicas: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/api/auth/*`, `/api/health`.
- Rotas autenticadas (demais): redirecionam para `/login?callbackUrl=` se não autenticado.
- Rota especial `/perfil/trocar-senha`: bloqueia outras rotas se `mustChangePassword=true`.
- Assets estáticos (`/_next/*`, imagens) ignorados.

---

## 12. RBAC consolidado

### 12.1 Hierarquia
```typescript
export const PLATFORM_ROLE_HIERARCHY = {
  super_admin: 4, admin: 3, manager: 2, viewer: 1,
} as const;
```

### 12.2 Owner
- `isOwner = true` (único user com flag).
- Imutável e indeletável (regras §12.4).
- Único super admin que não pode ser editado por outros (mesmo super admins).
- Owner pode editar apenas a si mesmo (nome, senha, tema, avatar). Email do owner **não pode** mudar (regra de produto: identidade fixa).

### 12.3 Helpers de permissão (`src/lib/permissions.ts`)

```typescript
export function canCreateRole(creator: AuthUser, role: PlatformRole): boolean {
  if (creator.platformRole === 'viewer') return false;
  return PLATFORM_ROLE_HIERARCHY[role] <= PLATFORM_ROLE_HIERARCHY[creator.platformRole];
}

export function canEditUser(actor: AuthUser, target: User): { allowed: boolean; reason?: string } {
  if (target.isOwner && actor.id !== target.id) return { allowed: false, reason: 'Owner imutável' };
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] > PLATFORM_ROLE_HIERARCHY[actor.platformRole]) return { allowed: false, reason: 'Hierarquia' };
  if (actor.platformRole === 'viewer') return { allowed: false, reason: 'Viewer não edita' };
  return { allowed: true };
}

export function canDeleteUser(actor: AuthUser, target: User): { allowed; reason? } {
  if (target.isOwner) return { allowed: false, reason: 'Owner indeletável' };
  if (actor.id === target.id) return { allowed: false, reason: 'Não pode excluir a si mesmo' };
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] >= PLATFORM_ROLE_HIERARCHY[actor.platformRole]) return { allowed: false, reason: 'Hierarquia' };
  if (actor.platformRole === 'viewer') return { allowed: false, reason: 'Viewer não exclui' };
  return { allowed: true };
}

export function canDeactivateUser(actor: AuthUser, target: User): { allowed; reason? } {
  if (target.isOwner) return { allowed: false, reason: 'Owner sempre ativo' };
  if (actor.id === target.id) return { allowed: false, reason: 'Não pode desativar a si mesmo' };
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] >= PLATFORM_ROLE_HIERARCHY[actor.platformRole]) return { allowed: false, reason: 'Hierarquia' };
  if (actor.platformRole === 'viewer') return { allowed: false, reason: 'Viewer não desativa' };
  return { allowed: true };
}

export function canGrantAccounts(creator: AuthUser, requestedAccountIds: number[]): boolean {
  if (creator.platformRole === 'super_admin') return true;
  return requestedAccountIds.every(id => creator.accountIds.includes(id));
}

export function canGrantTeams(creator: AuthUser, requestedTeamIds: number[]): boolean {
  if (creator.platformRole === 'super_admin' || creator.platformRole === 'admin') return true;
  return requestedTeamIds.every(id => creator.teamIds.includes(id));
}

export function canSeeMatrixIA(user: AuthUser, settings: AppSettings): boolean {
  if (settings.feature_flags.matrix_ia_visible_to_super_admin_only) {
    return user.platformRole === 'super_admin';
  }
  return true;
}
```

### 12.4 Tenant scoping (`src/lib/tenant.ts`)
```typescript
export function getAccessibleAccountIds(user: AuthUser): number[] {
  if (user.platformRole === 'super_admin') return cachedKnownAccounts(); // [9, 2]
  return user.accountIds;
}
export function getAccessibleTeamIds(user: AuthUser, accountId: number): number[] | 'all' {
  if (user.platformRole === 'super_admin' || user.platformRole === 'admin') return 'all';
  return user.teamIds.filter(t => /* belongs to accountId */);
}
```

### 12.5 UI gestão de usuários (`/usuarios`)
Cópia adaptada da imagem do Roteador. Colunas:
- **Nome** (texto + avatar com iniciais)
- **Email** (texto)
- **Nível** (custom dropdown com 4 níveis e ícones — mesmo padrão da imagem do usuário)
- **Status** (badge "Ativo/Inativo" + toggle disabled conforme `canDeactivateUser`)
- **Contas** (badge "N contas" com popover lista)
- **Criado em** (data formatada)
- **Ações** (3 ícones: Editar, Excluir, Reenviar senha)

**Header:** ícone `Users` em box `bg-violet-600/10`, título "Usuários", subtítulo "Gerencie os usuários da plataforma", botão `+ Novo Usuário`.

**Filtros:** busca (nome/email), filtro por nível, filtro por status.

**Dialog Novo Usuário:**
- Nome (input)
- Email (input)
- Senha (auto-gerada, botão "Regerar", botão "Mostrar/Ocultar", botão "Copiar")
- Nível (custom-select, opções filtradas por `canCreateRole`)
- Multi-select Contas (visível se nível ≠ super_admin; opções filtradas por `canGrantAccounts`)
- Multi-select Departamentos (visível se nível ∈ {manager, viewer}; opções filtradas por `canGrantTeams`)
- Switch "Enviar email de boas-vindas" (default true)
- Botão "Criar usuário"

**Server action `createUser`:**
1. Valida Zod.
2. Valida `canCreateRole`, `canGrantAccounts`, `canGrantTeams`.
3. Cria User com `mustChangePassword=true`.
4. Cria `UserAccountAccess` e `UserTeamAccess`.
5. Envia email Resend (se enviado).
6. Audit log.
7. Retorna `{ success, data: user }`.

**Tab "Auditoria"** (super admin only):
- Lista paginada com filtros (action, user, data).
- Cursor-based pagination (50/página).

---

## 13. Multi-account (super admin)

- Cookie `nexus_active_account` (HttpOnly, Secure, SameSite=Strict, 30 dias).
- Componente `AccountSwitcher` na sidebar (visível só para super admin).
- Server Components leem cookie + valida que user tem acesso. Se inválido → fallback para primeira account acessível.
- Audit log em cada troca.

---

## 14. Estrutura de navegação (sidebar)

```
🏠 Dashboard                     (todos)
📊 Relatórios                    (todos)
   ├─ Conversas
   ├─ Leads recebidos
   ├─ Volumetria
   ├─ Tempos de resposta
   ├─ Ranking de atendentes
   ├─ Por departamento
   ├─ Por estado
   ├─ Status das conversas
   ├─ CSAT (placeholder)
   ├─ SLA (placeholder)
   └─ 🤖 Matrix IA               (super admin only, se feature flag)
👥 Usuários                      (admin+)
⚙️ Configurações                 (super admin only)
👤 Perfil                        (todos)
```

Sidebar com:
- Logo "N" Nexus AI no topo + título "Nexus Insights".
- Account switcher (super admin) abaixo do logo.
- Menus visíveis filtrados por role.
- Footer: avatar + nome + role + theme toggle (cycle dark/light/system) + logout.

Helper `getNavItems(user, settings)` em `src/lib/constants/nav.ts`.

---

## 15. Mapa de relatórios

(idêntico à v1; resumo abaixo)

| # | Tela | Cache | Visível para |
|---|------|-------|-------------|
| 15.1 | Conversas | live se "hoje", senão histórico | todos |
| 15.2 | Leads recebidos | histórico | todos |
| 15.3 | Volumetria | histórico | todos |
| 15.4 | Tempos de resposta | histórico | todos |
| 15.5 | Ranking de atendentes | histórico | todos |
| 15.6 | Por departamento | histórico | todos |
| 15.7 | Por estado (UF) | histórico | todos |
| 15.8 | Status das conversas | live | todos |
| 15.9 | CSAT | histórico | todos (placeholder se vazio) |
| 15.10 | SLA | histórico | todos (placeholder se vazio) |
| 15.11 | Matrix IA | live | super admin only |
| 15.12 | Dashboard (home) | live | todos |

Cada relatório:
- Header roxo com ícone + título + subtítulo + filtros + RefreshButton.
- Skeleton durante fetch.
- StaleBanner se Chatwoot offline e cache antigo.
- KPIs no topo, gráficos, tabelas com paginação.

---

## 16. Filtros canônicos

Componente `FiltersBar` parametrizável. Filtros:
- Período (`PeriodSelector`): hoje, ontem, 7d, 30d, mês atual, mês anterior, custom (date range picker). Validação max 365 dias.
- Inbox/Estado (`InboxMultiSelect`): cache 24h.
- Departamento (`TeamMultiSelect`): cache 24h.
- Atendente (`AgentMultiSelect`): cache 24h.
- Status (`StatusMultiSelect`): hardcoded.
- Prioridade (apenas Conversas): hardcoded.
- Label (apenas Conversas): cache 24h.

Estado dos filtros sincronizado com URL query params.

---

## 17. Botão "Abrir no Chatwoot"

Componente `OpenInChatwoot` (props: `accountId`, `displayId`):
- Renderiza ícone `ExternalLink` + texto pequeno "Abrir".
- `<a target="_blank" rel="noopener noreferrer">` com URL gerada.
- Audit log (fire-and-forget) `opened_chatwoot_link` com `accountId` e `displayId`.

Disponível em: Conversas, lista de Órfãs, Ranking, Leads recebidos, qualquer tabela com conversa.

---

## 18. CSAT, SLA, Tags

### 18.1 CSAT
Renderiza tela mesmo com 0 dados:
- Empty state com texto: "Ative o CSAT no Chatwoot para começar a popular este relatório. As respostas aparecerão aqui automaticamente."
- Quando popular: score médio, distribuição em pizza, lista de feedbacks.

### 18.2 SLA
Idem CSAT.

### 18.3 Tags
- No relatório de Conversas, coluna `Labels` mostra chips coloridos.
- Filtro de label disponível (multi-select).
- Não vira KPI principal.

---

## 19. Audit log

### 19.1 Ações (lista canônica em `AuditAction` enum)
Ver §6.1.

### 19.2 Fire-and-forget
`logAudit` enfileira em fila BullMQ `audit-write` (concurrency 5), worker persiste em DB. Falha de enqueue → fallback direto Prisma com try/catch.

### 19.3 Cleanup
Job `audit-cleanup` (cron `0 5 * * *`): DELETE `AuditLog` com `createdAt < NOW() - INTERVAL '${retention} days'`.

---

## 20. Tema, branding e textos

### 20.1 Tema
ThemeProvider custom (cookie SSR). Default: dark. Toggle no rodapé sidebar. `mounted` guard evita flicker.

### 20.2 Branding
- Logo `public/logo-nexus-ai.png` (mesma do Roteador).
- Cor primária: roxo Nexus (`#7c3aed dark`/`#6d28d9 light`).
- Tipografia: idêntica ao Roteador.
- Header padrão de página: ícone `10x10` em box `bg-violet-600/10`, h1, subtítulo, ações.

### 20.3 Textos
- Login subtítulo: "Relatórios e insights dos atendimentos"
- Footer: "Nexus AI © 2026. Todos os direitos reservados"
- /usuarios: "Usuários — Gerencie os usuários da plataforma"
- /configuracoes: "Configurações — Ajustes globais da plataforma"
- /perfil: "Perfil — Suas informações pessoais"
- /dashboard: "Dashboard — Visão geral dos atendimentos"
- /relatorios/conversas: "Conversas — Lista detalhada com filtros"
- /relatorios/leads-recebidos: "Leads recebidos — Volumes por período"
- /relatorios/volumetria: "Volumetria — Análise por dia e hora"
- /relatorios/tempos-resposta: "Tempos de resposta — Métricas de atendimento"
- /relatorios/ranking-atendentes: "Ranking de atendentes — Performance individual"
- /relatorios/por-departamento: "Por departamento — Métricas por equipe"
- /relatorios/por-estado: "Por estado — Distribuição geográfica"
- /relatorios/status-conversas: "Status das conversas — Distribuição e backlog"
- /relatorios/csat: "CSAT — Satisfação dos clientes"
- /relatorios/sla: "SLA — Cumprimento de acordos"
- /relatorios/matrix-ia: "Matrix IA — Métricas do canal automatizado"

---

## 21. Variáveis de ambiente

### 21.1 Arquivos
- `.env.example` (sem secrets) — vai para o git.
- `.env.production` (com secrets reais) — NUNCA no git; armazenado local + Portainer.
- `.env.local` (dev) — NUNCA no git.

### 21.2 Variáveis canônicas (`.env.example`)
```
# Banco do Nexus Insights (nosso)
DATABASE_URL=postgresql://nexus:CHANGE_ME@db:5432/nexus_insights?schema=public
DB_PASSWORD=CHANGE_ME

# Banco do Chatwoot (read-only)
CHATWOOT_DATABASE_URL=postgresql://chatwoot_leitura:CHANGE_ME@HOST:5432/chatwoot
CHATWOOT_BASE_URL=https://chatwoot.SEU-DOMINIO.com.br

# Redis
REDIS_URL=redis://redis:6379

# Auth
NEXTAUTH_SECRET=CHANGE_ME_openssl_rand_base64_32
NEXTAUTH_URL=https://insights.SEU-DOMINIO.com
ENCRYPTION_KEY=CHANGE_ME_openssl_rand_hex_32

# Owner (seed)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME
ADMIN_NAME=Admin

# Email
RESEND_API_KEY=CHANGE_ME
RESEND_FROM=Nexus Insights <noreply@example.com>

# Deploy (apenas para CI ou local)
NODE_ENV=production
APP_VERSION=v0.0.0
```

### 21.3 `.gitignore` essencial
```
.env
.env.local
.env.production
.env.production.local
.env.development.local
.env.test.local
node_modules/
.next/
build/
out/
dist/
src/generated/
coverage/
.DS_Store
docker-compose.production.yml
*.tsbuildinfo
```

### 21.4 Stack genérica vs produção
- `docker-compose.yml` (genérico, vai pro git): apenas para dev local opcional, sem Traefik.
- `docker-compose.production.yml` (NÃO vai pro git): imagem GHCR + Traefik labels + lê `.env.production`.

---

## 22. Estratégia de testes

### 22.1 Unit (Jest + jest-mock-extended)
Cobertura mínima 80% nas pastas:
- `src/lib/permissions/`
- `src/lib/tenant.ts`
- `src/lib/chatwoot/filters.ts`
- `src/lib/cache/pull-through.ts`
- `src/lib/cache/keys.ts`
- `src/lib/actions/users.ts`
- `src/lib/actions/settings.ts`
- `src/lib/utils/format-cpf.ts`, `format-phone.ts`, `format-time.ts`

### 22.2 Integration
- Pool Chatwoot com Postgres local (Docker) seedado com fixtures.
- Cache pull-through com Redis local.
- Cascata de revogação com Prisma in-memory (sqlite test).

### 22.3 E2E (futuro)
- Login + dashboard + criação user (Playwright).

### 22.4 Smoke pré-deploy (`scripts/smoke.sh`)
- `npm run build` ok.
- `npx prisma generate` ok.
- Subset de testes críticos.
- Seed em DB temporário.

---

## 23. CI/CD

### 23.1 `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage

  build:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: |
            ghcr.io/jvzanini/nexus-insights:latest
            ghcr.io/jvzanini/nexus-insights:sha-${{ github.sha }}
          build-args: |
            APP_VERSION=${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Portainer redeploy
        env:
          PORTAINER_URL: ${{ secrets.PORTAINER_URL }}
          PORTAINER_TOKEN: ${{ secrets.PORTAINER_TOKEN }}
          STACK_ID: ${{ secrets.PORTAINER_STACK_ID }}
        run: |
          curl -fsSL -X POST \
            -H "X-API-Key: $PORTAINER_TOKEN" \
            "$PORTAINER_URL/api/stacks/$STACK_ID/redeploy?endpointId=1" \
            -H 'Content-Type: application/json' \
            -d '{"PullImage":true}'
```

### 23.2 Secrets do repositório GitHub
- `GHCR_TOKEN`
- `PORTAINER_URL`
- `PORTAINER_TOKEN`
- `PORTAINER_STACK_ID` (criada uma vez manual + reutilizada)

---

## 24. Segurança

### 24.1 Senhas
- bcryptjs 10 rounds.
- Senhas temporárias: 16 chars alfanuméricos + símbolos (entropia ≥ 96 bits).

### 24.2 Sessões
- JWT stateless via NextAuth.
- httpOnly + Secure + SameSite=Lax (Strict no `nexus_active_account`).

### 24.3 Tokens
- nanoid(32), bcrypt(token) salvo (`tokenHash`); cru envia 1× por email.

### 24.4 Headers HTTP (`next.config.ts`)
```typescript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://chatwoot.znsolucoes.com.br;" },
      ],
    },
  ];
}
```

### 24.5 Rate limit
- Login: 5 tentativas/15min (Redis sliding).
- `/api/chatwoot/refresh`: 6/min/user.
- `/api/auth/forgot-password`: 3/hora/email.

### 24.6 SQL injection
Apenas queries parametrizadas (`$1`, `$2`). Filter builder gera params, jamais interpolação.

### 24.7 PII em logs
Nunca logar password, CPF cru, token. `logger` sanitiza fields conhecidos.

### 24.8 Read-only no Chatwoot
Garantido pelo `chatwoot_leitura` que só tem GRANT SELECT.

---

## 25. Logs estruturados

`src/lib/logger.ts`:
```typescript
export const logger = {
  info: (scope: string, msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', scope, msg, ...meta, ts: new Date().toISOString() })),
  warn: (scope: string, msg: string, meta?: object) => console.warn(JSON.stringify({ level: 'warn', scope, msg, ...meta, ts: new Date().toISOString() })),
  error: (scope: string, msg: string, meta?: object) => console.error(JSON.stringify({ level: 'error', scope, msg, ...meta, ts: new Date().toISOString() })),
};
```

Padrão de scope: `chatwoot-pool`, `reports.conversas`, `audit`, `auth`, `worker.prewarm-live`, etc.

---

## 26. Tela `/perfil`

### 26.1 Campos editáveis pelo próprio user
- Nome (input, salva via server action).
- Tema (radio dark/light/system, persiste via `/api/user/theme`).
- Senha (4 campos: atual, nova, confirmação, botão "Trocar").

### 26.2 Email
- Não editável diretamente.
- Botão "Alterar e-mail" → modal: novo email + senha atual.
- Server action cria `EmailChangeToken`, envia link para o novo email.
- Click no link → `/verify-email?token=...` → consome token → email atualiza → audit.
- Owner: botão **disabled** (email do owner é fixo).

### 26.3 Logout
Botão "Sair" no rodapé do `/perfil` (além do sidebar footer).

---

## 27. Command palette ⌘K

Componente `CommandPalette` em `src/components/layout/command-palette.tsx`. Atalho global ⌘K (ou Ctrl+K).

### 27.1 Tabs
1. **Conversas:** busca por display_id, nome contato, telefone (LIKE %query% no Chatwoot, max 20 results, debounce 300ms).
2. **Atendentes:** busca em users do Chatwoot (cache 24h), filtra LIKE %query%.
3. **Relatórios:** busca em rotas internas (constants `RELATORIO_ROUTES` com title + keywords).

### 27.2 Comportamento
- Click em resultado → navega/abre em nova aba (Conversas → URL Chatwoot).
- Mostra max 5 por tab.
- Empty state amigável se sem resultados.
- AbortController para cancelar fetches.

---

## 28. Mais detalhes operacionais

### 28.1 Erros e error boundaries
- `src/app/error.tsx`: error boundary global. Mostra "Algo deu errado." + botão "Tentar novamente" (call `reset()`).
- `src/app/not-found.tsx`: 404 amigável.

### 28.2 Loading states
- Server Components retornam `<SkeletonReport>` enquanto carrega.
- Client Components com `loading.tsx` quando rota suspendida.

### 28.3 Empty states
- Componente `<EmptyState icon title description />` reutilizável.
- Usado em todos os relatórios sem dados.

### 28.4 Pagination
- Cursor-based onde possível (`(last_activity_at, id)`).
- Offset-based como fallback simples (audit log).

### 28.5 Performance
- `messages` (260k+ rows): jamais full-table-scan; sempre filtrar por `account_id` + `inbox_id` (ou `conversation_id`).
- `reporting_events` priorizado para tempo (já agregada).
- Filtros que cruzam muitas dimensões → cache agressivo (TTL 5min).

### 28.6 Dependência do nexus-blueprint
**Decisão:** **NÃO** consumir `@nexusai360/*` packages no MVP. O Roteador Webhook Meta também não consome (é monolítico). Manter mesma decisão para consistência e simplicidade. Pode-se migrar para blueprint pós-MVP.

---

## 29. Plano de fases (resumo executivo)

| Fase | Entregáveis | Estimativa |
|------|-------------|------------|
| **0. Fundação** | Cópia integral do Roteador + remoção de webhooks/Meta + branding + Prisma schema + seed + auth shell + deploy esqueleto. | Inicial |
| **1. RBAC + Settings** | `/usuarios` completo + `/configuracoes` + multi-account + audit. | Curta |
| **2. Acesso Chatwoot** | Pool, queries, filter builder, cache, worker prewarm. | Média |
| **3. Relatórios v1** | Dashboard, Conversas, Leads, Volumetria, Tempos, Status. | Maior |
| **4. Relatórios v2** | Ranking, Por Departamento, Por Estado. | Média |
| **5. Especiais** | Matrix IA, CSAT, SLA. | Curta |
| **6. Testes** | Cobertura crítica 80%. | Média |
| **7. Docker + CI** | Dockerfile, compose, GitHub Actions, push GHCR. | Curta |
| **8. Deploy produção** | Stack Portainer, SSL Traefik, smoke. | Curta |
| **9. Validação + Docs** | README, CHANGELOG, runbooks, smoke em produção. | Curta |

Detalhe granular: ver `docs/superpowers/plans/2026-04-29-nexus-insights-implementation-v3.md`.

---

## 30. Limitações conhecidas e roadmap

### 30.1 Limitações
- Read-only no Chatwoot, sem CDC: latência ≤30s nos painéis ao vivo.
- CSAT/SLA vazios hoje (apresenta empty states).
- CPF/CNPJ free-text com regex; pode falhar em formatos atípicos.
- Backups locais (mesmo servidor); para produção mais robusta, seria bom backup remoto.
- Sem multi-idioma (PT-BR fixo).
- Sem visualização geográfica em mapa do Brasil (apenas tabela/gráfico).

### 30.2 Roadmap pós-MVP
- Migração para CDC (Opção B) se latência <1s for necessária.
- Notification bell.
- Export CSV de relatórios (com proteção formula-injection).
- E2E Playwright.
- Mapa do Brasil colorido por volume.
- Sentry para observabilidade.
- Backup remoto (S3, Cloudflare R2).
- Multi-idioma (i18n).

---

## 31. Apêndice — pontos de validação na implementação

Itens a validar com queries reais durante a implementação (não bloqueiam o design):

1. **Heurística "IA não respondeu":** rodar query no inbox 31 — `last sender_type = 'Contact'` + `now() - last_activity_at > 5min` + `status = 0`. Quantas? Ajustar threshold conforme realidade.
2. **Performance de `taggings` JOIN:** medir tempo de query com filtro de label vs sem. Se >2s, considerar índice (não temos permissão; cache mais longo).
3. **Custom attribute `estado_brasil` vs `inbox.name`:** confirmar que estão consistentes. Em caso de divergência, fonte oficial é `inbox.name` (parsed).
4. **CPF regex:** validar com 100 amostras do banco; ajustar regex se falhar > 5%.
5. **Heatmap hora×dia:** validar fuso horário (Chatwoot grava em UTC; converter para America/Sao_Paulo).

---

**Fim da v3 final.**

Próximo passo: criar `docs/superpowers/plans/2026-04-29-nexus-insights-implementation-v1.md`, fazer pente-fino para v2 e v3, e depois iniciar a execução fase por fase.
