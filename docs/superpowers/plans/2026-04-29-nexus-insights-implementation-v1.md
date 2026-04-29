# Nexus Insights — Implementation Plan (v1)

> **Status:** v1 (rascunho — passa por dois pente-finos antes de v3 final)

**Goal:** Construir, testar e colocar em produção a plataforma Nexus Insights conforme spec v3.

**Architecture:** Cópia integral do Roteador Webhook Meta. Adaptar branding, modelo de dados (remover webhooks, adicionar UserAccountAccess/UserTeamAccess/AppSetting), construir camada read-only de acesso ao Chatwoot via `pg` puro, cache híbrido pull-through + worker prewarm BullMQ, 12 telas de relatórios com filtros canônicos, deploy via Portainer/Traefik com SSL.

**Tech Stack:** Next.js 16 + TS 5 strict + Tailwind 4 + Prisma 7 + PostgreSQL + Redis 7 + BullMQ 5 + NextAuth 5 + Recharts 3 + Resend + Jest 30 + Docker + GitHub Actions + GHCR + Portainer.

---

## FASE 0 — Fundação: cópia, branding, schema, deploy esqueleto

**Objetivo:** projeto rodando em `insights.nexusai360.com` com tela de login funcional, owner seedado, healthcheck verde — ainda sem relatórios.

### Task F0.1 — Copiar estrutura do Roteador Webhook Meta

**Files:**
- Source: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta/`
- Target: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/`

- [ ] **Step 1:** Copiar tudo do Roteador para o target via `rsync` (excluindo `.git`, `node_modules`, `.next`, `.env*`, `src/generated`).

```bash
rsync -av --progress \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='.env' --exclude='.env.local' --exclude='.env.production' \
  --exclude='src/generated' --exclude='dist' --exclude='build' \
  --exclude='coverage' --exclude='.DS_Store' \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta/" \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/"
```

- [ ] **Step 2:** Verificar que o `CLAUDE.md` e `docs/discovery/` que JÁ existem no target não foram sobrescritos.

- [ ] **Step 3:** Listar o que veio para confirmar.

```bash
ls -la "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/"
```

### Task F0.2 — Limpar entidades específicas de webhooks/Meta

- [ ] **Step 1:** Remover componentes/pastas de webhook/Meta:
  - `src/app/(protected)/companies/`
  - `src/components/dashboard/` (será refeito)
  - `src/components/event-checklist/`
  - `src/components/routes/`
  - `src/components/reports/` (será refeito do zero)
  - `src/lib/actions/company.ts`, `credential.ts`, `dashboard.ts`, `logs.ts`, `webhook-routes.ts`, `meta-subscription.ts`, `meta-embedded-signup.ts`, `resend-actions.ts`
  - `src/lib/webhook/`, `src/lib/rate-limit/` (refazer parcialmente)
  - `src/worker/delivery.ts`, `dlq-cleanup.ts`, `orphan-recovery.ts`, `jobs/meta-drift-check.ts`
  - `vendor-packages/` (do roteador, não usaremos)
  - `prisma/migrations/*` (vamos refazer migrations do zero)

- [ ] **Step 2:** `git init` no target (vai virar repo independente).

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
git init -b main
```

- [ ] **Step 3:** Renomear `package.json:name`, `description`, e `metadata` em `src/app/layout.tsx` para Nexus Insights.

- [ ] **Step 4:** Confirmar a árvore final corresponde à §5 da spec. Commit inicial.

```bash
git add -A
git commit -m "chore: initial copy from Roteador Webhook Meta with cleanup"
```

### Task F0.3 — Reescrever `package.json` mínimo

**File:** `package.json`

- [ ] **Step 1:** Atualizar nome, version, scripts:
```json
{
  "name": "nexus-insights",
  "version": "0.1.0",
  "private": true,
  "description": "Plataforma de relatórios e insights da operação Chatwoot da Matrix Fitness Group",
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "build:clean": "node scripts/clean-build.js && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "prisma db seed",
    "worker": "node ./dist/worker/index.js"
  },
  "prisma": {
    "seed": "ts-node --project tsconfig.seed.json prisma/seed.ts"
  }
}
```
Manter dependencies idênticas ao Roteador (revisar e remover apenas `@nexusai360/*` packages que vinham via vendor-packages — não usaremos).

### Task F0.4 — Reescrever `prisma/schema.prisma` conforme spec §6.1

**File:** `prisma/schema.prisma`

- [ ] **Step 1:** Substituir conteúdo pelo schema da spec §6.1 (User, UserAccountAccess, UserTeamAccess, AppSetting, AuditLog, PasswordResetToken, EmailChangeToken).

- [ ] **Step 2:** Rodar `npx prisma migrate dev --name initial` para gerar primeira migration.

- [ ] **Step 3:** Verificar `src/generated/prisma/` populado.

- [ ] **Step 4:** Commit.

```bash
git add prisma/ src/generated/
git commit -m "feat(db): initial schema (User, AccountAccess, TeamAccess, AppSetting, AuditLog, tokens)"
```

### Task F0.5 — Reescrever `prisma/seed.ts`

**File:** `prisma/seed.ts`

- [ ] **Step 1:** Implementar seed conforme spec §6.2:
  - Criar/atualizar owner com env vars.
  - Popular AppSettings defaults.
  - Criar UserAccountAccess do owner para account 9 e 2.

- [ ] **Step 2:** Smoke test localmente: `npx prisma db push && npx prisma db seed`. Verificar.

- [ ] **Step 3:** Commit.

### Task F0.6 — Adaptar `src/auth.ts`, `auth.config.ts`, `middleware.ts`, `auth-helpers.ts`

**Files:**
- `src/auth.ts`
- `src/auth.config.ts`
- `src/middleware.ts`
- `src/lib/auth-helpers.ts`

- [ ] **Step 1:** No `auth-helpers.ts`, ajustar `authorizeCredentials` e `getCurrentUser` para o novo schema:
  - `select` inclui `mustChangePassword`, `isOwner`, accountAccess (mapeado para `accountIds: number[]`), teamAccess (`teamIds: number[]`).
- [ ] **Step 2:** No `auth.config.ts`, callback `jwt` adicionar `mustChangePassword` no token.
- [ ] **Step 3:** No `middleware.ts`, manter rotas públicas + adicionar guard de `mustChangePassword`.

```typescript
// middleware.ts (excerpt)
import NextAuth from 'next-auth';
import authConfig from './auth.config';
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/verify-email', '/api/auth', '/api/health'];

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isPublic = PUBLIC_PATHS.some(p => nextUrl.pathname.startsWith(p));
  if (isPublic) return;
  if (!session) return Response.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(nextUrl.pathname)}`, nextUrl));
  if (session.user?.mustChangePassword && !nextUrl.pathname.startsWith('/perfil/trocar-senha')) {
    return Response.redirect(new URL('/perfil/trocar-senha', nextUrl));
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.*\\.png).*)'] };
```

- [ ] **Step 4:** Commit.

### Task F0.7 — Tela `/login` com novos textos

**Files:**
- `src/components/login/login-branding.tsx`
- `src/components/login/login-content.tsx`
- `src/components/login/login-form.tsx`
- `src/app/(auth)/login/page.tsx`

- [ ] **Step 1:** No `login-branding.tsx`, trocar subtítulo "Roteador de Webhooks" por "Relatórios e insights dos atendimentos".
- [ ] **Step 2:** Trocar título `<h1>Nexus AI</h1>` (mantém).
- [ ] **Step 3:** Verificar que footer global usa "Nexus AI © 2026. Todos os direitos reservados".
- [ ] **Step 4:** Smoke local: `npm run dev`, abrir `localhost:3000/login`, verificar visual.
- [ ] **Step 5:** Commit.

### Task F0.8 — Sidebar e navegação adaptadas

**Files:**
- `src/components/layout/sidebar.tsx`
- `src/lib/constants/nav.ts`

- [ ] **Step 1:** Reescrever `nav.ts`:
```typescript
import { Home, BarChart3, Users, Settings, User, MessageSquare, Calendar, Clock, Trophy, Building2, Map, ListChecks, Smile, Shield, Bot } from 'lucide-react';
import type { PlatformRole } from '@/generated/prisma';

export type NavItem = { label: string; href: string; icon: any; visibleTo?: PlatformRole[]; superAdminOnly?: boolean; featureFlag?: string };

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  {
    label: 'Relatórios', href: '/relatorios', icon: BarChart3,
    children: [
      { label: 'Conversas', href: '/relatorios/conversas', icon: MessageSquare },
      { label: 'Leads recebidos', href: '/relatorios/leads-recebidos', icon: Calendar },
      { label: 'Volumetria', href: '/relatorios/volumetria', icon: BarChart3 },
      { label: 'Tempos de resposta', href: '/relatorios/tempos-resposta', icon: Clock },
      { label: 'Ranking de atendentes', href: '/relatorios/ranking-atendentes', icon: Trophy },
      { label: 'Por departamento', href: '/relatorios/por-departamento', icon: Building2 },
      { label: 'Por estado', href: '/relatorios/por-estado', icon: Map },
      { label: 'Status das conversas', href: '/relatorios/status-conversas', icon: ListChecks },
      { label: 'CSAT', href: '/relatorios/csat', icon: Smile, featureFlag: 'feature_flags.csat_enabled' },
      { label: 'SLA', href: '/relatorios/sla', icon: Shield, featureFlag: 'feature_flags.sla_enabled' },
      { label: 'Matrix IA', href: '/relatorios/matrix-ia', icon: Bot, superAdminOnly: true, featureFlag: 'feature_flags.matrix_ia_visible_to_super_admin_only' },
    ],
  },
  { label: 'Usuários', href: '/usuarios', icon: Users, visibleTo: ['super_admin', 'admin', 'manager'] },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, superAdminOnly: true },
  { label: 'Perfil', href: '/perfil', icon: User },
];
```

- [ ] **Step 2:** Adaptar `sidebar.tsx` para:
  - Logo "N" + título "Nexus Insights" no topo.
  - Account switcher (placeholder no MVP da fase 1).
  - Menus filtrados por role + feature flags.
  - Footer: avatar + nome + role + theme toggle + logout.

- [ ] **Step 3:** Commit.

### Task F0.9 — `/api/health` endpoint

**File:** `src/app/api/health/route.ts`

- [ ] **Step 1:** Implementar conforme spec §3.5 (checks granulares com timeout próprio).

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRedis } from '@/lib/redis';
import { getChatwootPool } from '@/lib/chatwoot/pool';

async function timed<T>(fn: () => Promise<T>, timeoutMs: number) {
  const start = Date.now();
  const res = await Promise.race([
    fn().then(v => ({ ok: true as const, value: v })),
    new Promise<{ ok: false }>(r => setTimeout(() => r({ ok: false }), timeoutMs)),
  ]);
  return { ...res, ms: Date.now() - start };
}

export async function GET() {
  const [database, redis, chatwoot] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`, 1000),
    timed(() => getRedis().ping(), 500),
    timed(async () => { const r = await getChatwootPool().query('SELECT 1'); return r.rowCount; }, 2000),
  ]);
  const status = !database.ok ? 'down' : (redis.ok && chatwoot.ok ? 'ok' : 'degraded');
  const httpStatus = status === 'down' ? 503 : 200;
  return NextResponse.json({
    status,
    checks: { database: { ok: database.ok, ms: database.ms }, redis: { ok: redis.ok, ms: redis.ms }, chatwoot: { ok: chatwoot.ok, ms: chatwoot.ms } },
    version: process.env.APP_VERSION ?? 'dev',
    uptime_s: Math.floor(process.uptime()),
  }, { status: httpStatus });
}
```

- [ ] **Step 2:** Commit.

### Task F0.10 — `.env.example`, `.gitignore`, `docker-compose.yml`, `Dockerfile`

**Files:**
- `.env.example`
- `.gitignore`
- `docker-compose.yml` (genérico)
- `docker-compose.production.yml` (NÃO no git)
- `docker/Dockerfile`
- `docker/entrypoint.sh`

- [ ] **Step 1:** Reescrever `.env.example` conforme spec §21.2.
- [ ] **Step 2:** Reescrever `.gitignore` conforme spec §21.3.
- [ ] **Step 3:** Adaptar `docker-compose.yml` (sem labels Traefik, para dev local).
- [ ] **Step 4:** Criar `docker-compose.production.yml` com Traefik labels (já marcado em `.gitignore`).
- [ ] **Step 5:** Adaptar `Dockerfile` (idêntico ao Roteador, com `entrypoint.sh`).
- [ ] **Step 6:** Criar `docker/entrypoint.sh` conforme §3.4.
- [ ] **Step 7:** Commit.

### Task F0.11 — Setup GitHub repo

- [ ] **Step 1:** Criar repo `nexus-insights` no GitHub via `gh`:
```bash
gh repo create jvzanini/nexus-insights --private --source=. --remote=origin
```
- [ ] **Step 2:** Configurar secrets do repo:
```bash
gh secret set GHCR_TOKEN < <(echo "<token>")
gh secret set PORTAINER_URL --body "https://painel.nexusai360.com"
gh secret set PORTAINER_TOKEN --body "<token>"
gh secret set PORTAINER_STACK_ID --body "<stack_id>"  # criada manualmente na primeira vez
```
- [ ] **Step 3:** Push inicial:
```bash
git push -u origin main
```

### Task F0.12 — `.github/workflows/deploy.yml`

**File:** `.github/workflows/deploy.yml`

- [ ] **Step 1:** Implementar conforme spec §23.1.
- [ ] **Step 2:** Commit + push. Validar que rodou (`gh workflow view`).

### Task F0.13 — Smoke local antes de subir

- [ ] **Step 1:** `npm install`.
- [ ] **Step 2:** Criar `.env.local` com `DATABASE_URL` apontando para Postgres local (Docker).
- [ ] **Step 3:** `docker compose up -d db redis` (apenas db e redis, app rodaremos com `npm run dev`).
- [ ] **Step 4:** `npm run prisma:migrate` e `npm run prisma:seed`.
- [ ] **Step 5:** `npm run dev`. Abrir `localhost:3000`. Login com `nexusai360@gmail.com` / `nexus.AI@360`. Verificar redirect para `/dashboard` (placeholder).
- [ ] **Step 6:** Verificar `localhost:3000/api/health` retorna 200 com `database: ok`, `redis: ok`, `chatwoot: ok` (se Chatwoot online).
- [ ] **Step 7:** Commit pequenos ajustes se necessário.

---

## FASE 1 — Auth, RBAC e Settings

### Task F1.1 — `src/lib/permissions.ts` completo + testes

**Files:**
- `src/lib/permissions.ts`
- `src/__tests__/lib/permissions.test.ts`

- [ ] **Step 1:** Escrever testes (TDD) conforme spec §12.3.
```typescript
import { canCreateRole, canEditUser, canDeleteUser, canDeactivateUser, canGrantAccounts, canGrantTeams } from '@/lib/permissions';

describe('canCreateRole', () => {
  it('viewer não pode criar nada', () => {
    const viewer = mockUser({ platformRole: 'viewer' });
    expect(canCreateRole(viewer, 'viewer')).toBe(false);
  });
  it('manager pode criar manager e viewer', () => {
    const manager = mockUser({ platformRole: 'manager' });
    expect(canCreateRole(manager, 'manager')).toBe(true);
    expect(canCreateRole(manager, 'viewer')).toBe(true);
    expect(canCreateRole(manager, 'admin')).toBe(false);
  });
  // ... cobrir todos os casos
});

describe('canDeleteUser', () => {
  it('owner é indeletável', () => {
    const superAdmin = mockUser({ platformRole: 'super_admin' });
    const owner = mockUser({ isOwner: true });
    expect(canDeleteUser(superAdmin, owner).allowed).toBe(false);
  });
  // ...
});
// ... seguir cobrindo canEditUser, canDeactivateUser, canGrantAccounts, canGrantTeams
```
- [ ] **Step 2:** `npm test -- permissions` → falhar.
- [ ] **Step 3:** Implementar `permissions.ts` conforme spec §12.3.
- [ ] **Step 4:** Rodar testes → passar.
- [ ] **Step 5:** Commit `feat(rbac): permissions helpers`.

### Task F1.2 — `src/lib/tenant.ts` completo + testes

**Files:**
- `src/lib/tenant.ts`
- `src/__tests__/lib/tenant.test.ts`

- [ ] **Step 1:** Testes (TDD) para `getAccessibleAccountIds` e `getAccessibleTeamIds`.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Passar testes.
- [ ] **Step 4:** Commit.

### Task F1.3 — Server actions de usuários (`src/lib/actions/users.ts`)

**Files:**
- `src/lib/actions/users.ts`
- `src/lib/validations/user.ts`
- `src/lib/actions/__tests__/users.test.ts`

Server actions:
- `listUsers(filters)`
- `createUser(input)`
- `updateUser(id, input)`
- `deleteUser(id)`
- `setUserActive(id, isActive)`
- `regeneratePassword(id)` (envia email com nova senha + force `mustChangePassword`)
- `getCurrentUserAccessSummary()` (retorna accounts e teams visíveis para popular multi-selects)

- [ ] **Step 1:** Validation schemas em `validations/user.ts` (Zod).
- [ ] **Step 2:** Testes para cada server action (mock prisma + auth).
- [ ] **Step 3:** Implementar com regras §6.3 (cascade revoke), §11.4 (email + senha temporária via Resend).
- [ ] **Step 4:** Passar testes.
- [ ] **Step 5:** Commit.

### Task F1.4 — Tela `/usuarios` (UI)

**Files:**
- `src/app/(protected)/usuarios/page.tsx`
- `src/components/users/users-table.tsx`
- `src/components/users/user-form-dialog.tsx`
- `src/components/users/role-select.tsx`
- `src/components/users/account-multi-select.tsx`
- `src/components/users/department-multi-select.tsx`
- `src/components/users/delete-user-dialog.tsx`
- `src/components/users/deactivate-user-dialog.tsx`
- `src/components/users/resend-password-dialog.tsx`

- [ ] **Step 1:** `users-table.tsx` com colunas e filtros conforme spec §12.5. Cópia visual da imagem do Roteador.
- [ ] **Step 2:** `user-form-dialog.tsx` com conditional rendering de multi-selects.
- [ ] **Step 3:** Demais dialogs.
- [ ] **Step 4:** `page.tsx` (Server Component) que carrega lista inicial e passa pra client.
- [ ] **Step 5:** Smoke local: criar admin, gerente, viewer; tentar regras barradas.
- [ ] **Step 6:** Commit.

### Task F1.5 — Tab "Auditoria" em `/usuarios`

- [ ] **Step 1:** Server action `listAudits(filters, cursor)`.
- [ ] **Step 2:** Componente `audits-table.tsx` com paginação cursor.
- [ ] **Step 3:** Tab visível só para super admin.
- [ ] **Step 4:** Commit.

### Task F1.6 — `src/lib/settings/get.ts` + `update.ts` + cache

**Files:**
- `src/lib/settings/get.ts`
- `src/lib/settings/update.ts`
- `src/lib/constants/settings-keys.ts`
- `src/__tests__/lib/settings.test.ts`

- [ ] **Step 1:** `settings-keys.ts` exportando todas as chaves canônicas + tipos.
- [ ] **Step 2:** Testes para `getSetting` (cache hit/miss) e `updateSetting` (validação Zod, audit log, invalidação cache, SSE event).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Commit.

### Task F1.7 — Tela `/configuracoes`

**Files:**
- `src/app/(protected)/configuracoes/page.tsx`
- `src/components/settings/polling-settings-form.tsx`
- `src/components/settings/visibility-settings-form.tsx`
- `src/components/settings/audit-settings-form.tsx`

- [ ] **Step 1:** Page Server Component carrega settings atuais.
- [ ] **Step 2:** Forms client com validação Zod, salvando via server action `updateSetting`.
- [ ] **Step 3:** Toast de sucesso/erro com Sonner.
- [ ] **Step 4:** Smoke: alterar `polling.live_seconds` e ver tomar efeito após 30s.
- [ ] **Step 5:** Commit.

### Task F1.8 — Account switcher (super admin)

**Files:**
- `src/components/layout/account-switcher.tsx`
- `src/lib/actions/account-switch.ts`

- [ ] **Step 1:** Componente CustomSelect com lista de accounts acessíveis.
- [ ] **Step 2:** Server action que persiste cookie `nexus_active_account` e audita.
- [ ] **Step 3:** Atualizar sidebar para mostrar componente apenas se `super_admin`.
- [ ] **Step 4:** Server Components leem cookie via `cookies()` do Next.
- [ ] **Step 5:** Commit.

### Task F1.9 — `/perfil` e `/perfil/trocar-senha`

**Files:**
- `src/app/(protected)/perfil/page.tsx`
- `src/app/(protected)/perfil/trocar-senha/page.tsx`
- `src/lib/actions/profile.ts`

- [ ] **Step 1:** Server actions: `updateProfile(input)`, `changePassword(input)`, `requestEmailChange(input)`.
- [ ] **Step 2:** Telas com forms.
- [ ] **Step 3:** Owner: botão "Alterar e-mail" desabilitado.
- [ ] **Step 4:** Commit.

### Task F1.10 — Forgot/Reset password flow completo

**Files:**
- `src/lib/actions/password-reset.ts`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- emails templates (`src/emails/`)

- [ ] **Step 1:** Server actions `requestPasswordReset(email)` e `resetPassword(token, newPassword)`.
- [ ] **Step 2:** Templates Resend.
- [ ] **Step 3:** Telas conectadas.
- [ ] **Step 4:** Smoke local com Resend test mode.
- [ ] **Step 5:** Commit.

### Task F1.11 — Verify email flow

**Files:**
- `src/app/(auth)/verify-email/page.tsx`
- `src/lib/actions/verify-email.ts`

- [ ] **Step 1:** Server action `verifyEmailChange(token)`.
- [ ] **Step 2:** Tela.
- [ ] **Step 3:** Commit.

### Task F1.12 — Logout

- [ ] **Step 1:** Server action `logoutAction()` com audit + signOut.
- [ ] **Step 2:** Botão na sidebar conectado.
- [ ] **Step 3:** Commit.

---

## FASE 2 — Acesso ao Chatwoot e cache

### Task F2.1 — `src/lib/chatwoot/pool.ts` + `resilience.ts`

- [ ] **Step 1:** Pool conforme spec §7.1.
- [ ] **Step 2:** `withChatwootResilience` conforme §7.4.
- [ ] **Step 3:** Smoke: rodar `SELECT 1` via pool.
- [ ] **Step 4:** Commit.

### Task F2.2 — `src/lib/chatwoot/filters.ts` + testes

- [ ] **Step 1:** Testes TDD: cada combinação de filtros gera SQL+params correto.
- [ ] **Step 2:** Implementar filter builder conforme §7.3 (incluir JOIN com taggings para labels).
- [ ] **Step 3:** Commit.

### Task F2.3 — `src/lib/chatwoot/deep-link.ts`

- [ ] **Step 1:** Função simples lendo settings.
- [ ] **Step 2:** Commit.

### Task F2.4 — `src/lib/cache/keys.ts` + `pull-through.ts` + `invalidate.ts`

- [ ] **Step 1:** Testes TDD.
- [ ] **Step 2:** Implementar com fingerprint sha1 dos filters.
- [ ] **Step 3:** Commit.

### Task F2.5 — Worker BullMQ — pré-aquecimento

**Files:**
- `src/worker/index.ts`
- `src/worker/jobs/prewarm-live-cache.ts`
- `src/worker/jobs/prewarm-historical-cache.ts`
- `src/worker/jobs/sync-chatwoot-meta.ts`
- `src/worker/jobs/db-backup.ts`
- `src/worker/jobs/audit-write.ts`
- `src/worker/jobs/audit-cleanup.ts`

- [ ] **Step 1:** `index.ts` registra workers conforme spec §8.5/§8.6/§8.7/§19.2/§19.3.
- [ ] **Step 2:** Cada job implementado.
- [ ] **Step 3:** Schedulers sincronizam com SSE event `settings:updated`.
- [ ] **Step 4:** Smoke: subir worker localmente, ver logs estruturados.
- [ ] **Step 5:** Commit.

### Task F2.6 — `/api/chatwoot/refresh`

- [ ] **Step 1:** Endpoint POST aceitando `{ scope, name, filtersHash }` com rate-limit Redis.
- [ ] **Step 2:** Re-executa fetcher e devolve dados frescos.
- [ ] **Step 3:** Commit.

### Task F2.7 — `/api/events` (SSE)

- [ ] **Step 1:** Endpoint que assina `nexus-insights:realtime` no Redis e empurra eventos como SSE.
- [ ] **Step 2:** Heartbeat 30s.
- [ ] **Step 3:** Commit.

---

## FASE 3 — Relatórios v1 (6 telas)

Para cada relatório, repetir o padrão:
1. Query SQL em `src/lib/chatwoot/queries/<name>.ts` com Zod schema.
2. Server action em `src/lib/actions/reports/<name>.ts`.
3. Tela em `src/app/(protected)/relatorios/<name>/page.tsx` + `<name>-content.tsx` (client).
4. Componentes específicos (gráficos, tabelas) reutilizando `src/components/reports/*`.
5. Testes unitários de query (com fixture) + server action.
6. Commit.

### Task F3.1 — Componentes base de relatórios

**Files:**
- `src/components/reports/filters-bar.tsx`
- `src/components/reports/period-selector.tsx`
- `src/components/reports/inbox-multi-select.tsx`
- `src/components/reports/team-multi-select.tsx`
- `src/components/reports/agent-multi-select.tsx`
- `src/components/reports/status-multi-select.tsx`
- `src/components/reports/label-multi-select.tsx`
- `src/components/reports/refresh-button.tsx`
- `src/components/reports/stale-banner.tsx`
- `src/components/reports/kpi-card.tsx`
- `src/components/reports/chart-line.tsx`
- `src/components/reports/chart-bar.tsx`
- `src/components/reports/chart-pie.tsx`
- `src/components/reports/chart-heatmap.tsx`
- `src/components/reports/data-table.tsx`
- `src/components/reports/pagination.tsx`
- `src/components/reports/empty-state.tsx`
- `src/components/reports/skeleton-report.tsx`
- `src/components/reports/open-in-chatwoot.tsx`

- [ ] **Step 1:** Construir cada componente com props bem-definidas, base-ui primitives, mesma identidade visual.
- [ ] **Step 2:** Smoke visual em Storybook simples (página `/dev/reports-preview`).
- [ ] **Step 3:** Commit.

### Task F3.2 — Dashboard (home)

- [ ] **Step 1:** Query `home-summary.ts` (KPIs agregados: leads hoje, backlog, órfãs, tempo p50, top 5 atendentes 24h).
- [ ] **Step 2:** Server action.
- [ ] **Step 3:** Tela com KPIs + mini-gráfico de linhas (24h).
- [ ] **Step 4:** Commit.

### Task F3.3 — Relatório Conversas

- [ ] **Step 1:** Query `conversas-list.ts` com paginação cursor (`last_activity_at, id`), JOIN com contacts, com inbox, com users (para nome do agente), com `taggings`.
- [ ] **Step 2:** Server action.
- [ ] **Step 3:** Tela com tabela paginada.
- [ ] **Step 4:** Botão "Abrir no Chatwoot" em cada linha.
- [ ] **Step 5:** Commit.

### Task F3.4 — Relatório Leads recebidos

- [ ] **Step 1:** Query `leads-recebidos.ts` (já implementada parcialmente).
- [ ] **Step 2:** Server action + tela com chart-line + KPIs (total, média/dia, comparação período anterior).
- [ ] **Step 3:** Commit.

### Task F3.5 — Relatório Volumetria

- [ ] **Step 1:** Queries `volumetria-por-dia.ts` (DOW), `volumetria-por-hora-dia.ts` (heatmap).
- [ ] **Step 2:** Server action + tela com chart-bar (dia da semana) + chart-heatmap.
- [ ] **Step 3:** Commit.

### Task F3.6 — Relatório Tempos de resposta

- [ ] **Step 1:** Queries:
  - `tempos-primeira-resposta.ts` (avg, p50, p95 de `first_response`)
  - `tempo-resolucao.ts` (avg, p50, p95 de `conversation_resolved`)
  - Versões com `value_in_business_hours` para comparativo.
- [ ] **Step 2:** Server action + tela com KPIs + comparativo dia útil vs fim de semana.
- [ ] **Step 3:** Toggle "excluir Matrix IA" (apenas super admin).
- [ ] **Step 4:** Commit.

### Task F3.7 — Relatório Status das conversas

- [ ] **Step 1:** Queries `status-distribution.ts` (open/pending/resolved/snoozed) e `conversas-orfas.ts` (sem assignee, com idade categorizada).
- [ ] **Step 2:** Server action + tela com chart-pie + chart-bar (idade) + tabela de órfãs.
- [ ] **Step 3:** Commit.

---

## FASE 4 — Relatórios v2 (3 telas)

### Task F4.1 — Ranking de atendentes

- [ ] **Step 1:** Query `ranking-atendentes.ts` (top N por volume, resolved, p50 first response).
- [ ] **Step 2:** Server action + tela com chart-bar horizontal + tabela.
- [ ] **Step 3:** Commit.

### Task F4.2 — Por departamento

- [ ] **Step 1:** Query `leads-por-team.ts` com agregações por team.
- [ ] **Step 2:** Server action + tela com 4 cards lado a lado.
- [ ] **Step 3:** Commit.

### Task F4.3 — Por estado

- [ ] **Step 1:** Query `leads-por-inbox.ts` agrupando por inbox (estado).
- [ ] **Step 2:** Server action + tela com tabela ordenada (mapa do Brasil é roadmap).
- [ ] **Step 3:** Commit.

---

## FASE 5 — Relatórios especiais

### Task F5.1 — Matrix IA

- [ ] **Step 1:** Queries `ia-metrics.ts` e `ia-sem-resposta.ts` conforme spec §15.11 e §31.1 (validar threshold).
- [ ] **Step 2:** Tela visível só para super admin (force `inbox_id = 31`).
- [ ] **Step 3:** Commit.

### Task F5.2 — CSAT placeholder

- [ ] **Step 1:** Query `csat-summary.ts`.
- [ ] **Step 2:** Tela com empty state se 0.
- [ ] **Step 3:** Commit.

### Task F5.3 — SLA placeholder

- [ ] **Step 1:** Query `sla-summary.ts`.
- [ ] **Step 2:** Tela com empty state se 0.
- [ ] **Step 3:** Commit.

---

## FASE 6 — Testes (cobertura crítica)

### Task F6.1 — Configurar Jest com cobertura

- [ ] **Step 1:** `jest.config.ts` aponta `collectCoverageFrom` para áreas críticas.
- [ ] **Step 2:** Threshold mínimo 80% nas pastas críticas.
- [ ] **Step 3:** Commit.

### Task F6.2 — Testes restantes

Iterar nas pastas e garantir cobertura:
- `src/lib/permissions.ts` ✓ (já feito em F1.1)
- `src/lib/tenant.ts` ✓
- `src/lib/chatwoot/filters.ts` ✓
- `src/lib/cache/*` ✓
- `src/lib/actions/users.ts` ✓
- `src/lib/actions/settings.ts`
- `src/lib/actions/reports/*` (smoke por relatório)
- `src/lib/utils/format-cpf.ts`, `format-phone.ts`, `format-time.ts`

- [ ] **Step 1:** Para cada arquivo crítico, garantir teste.
- [ ] **Step 2:** `npm test -- --coverage`. Verificar 80%+.
- [ ] **Step 3:** Commit final dos testes.

---

## FASE 7 — Docker, CI/CD e GitHub

### Task F7.1 — Validar Dockerfile e build local

- [ ] **Step 1:** `docker build -f docker/Dockerfile -t nexus-insights:local .`.
- [ ] **Step 2:** Verificar imagem rodável: `docker run -p 3000:3000 ...`.
- [ ] **Step 3:** Commit ajustes.

### Task F7.2 — Workflow GitHub Actions

- [ ] **Step 1:** Validar workflow rodando em branch de teste.
- [ ] **Step 2:** Verificar push GHCR ok.
- [ ] **Step 3:** Commit + merge.

---

## FASE 8 — Deploy em produção

### Task F8.1 — Criar `docker-compose.production.yml` real

- [ ] **Step 1:** Compor com imagem GHCR + Traefik labels para `insights.nexusai360.com` + envs reais.
- [ ] **Step 2:** Manter localmente; subir para Portainer manualmente na primeira vez.

### Task F8.2 — Criar stack no Portainer

- [ ] **Step 1:** Via API:
```bash
curl -X POST "$PORTAINER_URL/api/stacks?type=2&method=string&endpointId=1" \
  -H "X-API-Key: $PORTAINER_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "Name": "nexus-insights",
  "StackFileContent": "<conteúdo do compose>",
  "Env": [
    {"name": "DB_PASSWORD", "value": "..."},
    ...
  ]
}
EOF
```
- [ ] **Step 2:** Capturar `STACK_ID` e configurar `PORTAINER_STACK_ID` no GitHub Secrets.

### Task F8.3 — Validar SSL e healthcheck

- [ ] **Step 1:** Aguardar Traefik provisionar Let's Encrypt.
- [ ] **Step 2:** `curl -I https://insights.nexusai360.com` → 200/302.
- [ ] **Step 3:** `curl https://insights.nexusai360.com/api/health` → status `ok`.

### Task F8.4 — Smoke em produção

- [ ] **Step 1:** Acessar pelo navegador.
- [ ] **Step 2:** Login owner.
- [ ] **Step 3:** Criar 1 admin de teste, 1 manager, 1 viewer.
- [ ] **Step 4:** Abrir 3 relatórios diferentes, validar dados.
- [ ] **Step 5:** Clicar "Abrir no Chatwoot" em uma conversa, verificar deep-link funciona.
- [ ] **Step 6:** Mudar `polling.live_seconds` em `/configuracoes` e ver efeito.

---

## FASE 9 — Validação e entrega

### Task F9.1 — README.md completo

- [ ] **Step 1:** Visão geral, stack, quickstart local, deploy, links úteis. Sem credenciais.
- [ ] **Step 2:** Commit + push.

### Task F9.2 — CHANGELOG.md inicial

- [ ] **Step 1:** v0.1.0 com features principais.

### Task F9.3 — Runbooks

- [ ] **Step 1:** `docs/runbooks/deploy.md`.
- [ ] **Step 2:** `docs/runbooks/backup-restore.md`.
- [ ] **Step 3:** `docs/runbooks/troubleshooting.md`.

### Task F9.4 — Atualizar memória do projeto

- [ ] **Step 1:** Memórias relevantes (Portainer URL, Stack ID, cadência polling padrão, etc.) salvas em `.claude/memory/`.

### Task F9.5 — Avisar usuário

- [ ] **Step 1:** Mensagem final descrevendo: URL, credenciais owner (genéricas, não no chat), o que validar.

---

**Fim do plan v1.** Próximo: pente-fino #1 → v2 → pente-fino #2 → v3 final.
