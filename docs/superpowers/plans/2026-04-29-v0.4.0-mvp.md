# Nexus Insights — Implementation Plan (v3 — final)

> **Para agentes executores:** este plan é executado via **`superpowers:subagent-driven-development`** — um subagent fresh por task, revisão entre tasks. Em cada task que envolve UI/layout/componente, **invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar** (regra suprema, ver §0). Steps usam checkbox `- [ ]` para tracking.

**Goal:** Construir, testar e colocar em produção a plataforma Nexus Insights, conforme spec v3 (`docs/superpowers/specs/2026-04-29-nexus-insights-design-v3.md`).

**Architecture:** Cópia integral do Roteador Webhook Meta. Adaptação de branding, modelo Prisma novo, camada read-only de Chatwoot via `pg`, cache híbrido pull-through + worker prewarm BullMQ, 12 relatórios com filtros canônicos, deploy Portainer/Traefik com SSL.

**Tech Stack:** Next.js 16 + TS 5 strict + Tailwind 4 + Prisma 7 + PostgreSQL + Redis 7 + BullMQ 5 + NextAuth 5 + Recharts 3 + Resend + Jest 30 + Docker + GitHub Actions + GHCR + Portainer + Traefik.

---

## §0 — Regras supremas de execução (lê antes de qualquer task)

1. **Antes de QUALQUER task de UI/layout/componente/CSS/animação/paleta/ícone:** invocar `Skill` com `ui-ux-pro-max:ui-ux-pro-max` e seguir as orientações que ela oferecer. Sem exceção.
2. **Cada task** termina com: testes verdes (quando aplicável), commit atômico com mensagem descritiva, mensagem de status do que foi feito.
3. **TDD** quando há lógica testável (utils, helpers, server actions, queries). UI não exige TDD — exige `ui-ux-pro-max`.
4. **Commits frequentes** — 1 commit por task no mínimo.
5. **Nunca** subir `.env`, `.env.production`, `docker-compose.production.yml` para o git. Validar antes de cada push.
6. **Nunca** logar passwords, CPF cru ou tokens.
7. **Pool do Chatwoot é singleton** no app e singleton separado no worker.
8. **Cache key** sempre via helper `cacheKey` — nunca hardcoded.
9. **Auditoria** é fire-and-forget — chamar `logAudit()` que enfileira; não aguardar.
10. **Documentação canônica:** spec v3 e este plan v3.

---

## FASE 0 — Fundação (cópia, branding, schema, deploy esqueleto)

**Objetivo:** projeto rodando em `insights.nexusai360.com` com tela de login funcional, owner seedado, healthcheck verde — ainda sem relatórios.

### Task F0.1 — Copiar estrutura do Roteador (preservando docs locais)

**Files:**
- Source: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta/`
- Target: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/`

- [ ] **Step 1 — Cópia preservando docs:**
```bash
rsync -av --progress \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='.env' --exclude='.env.local' --exclude='.env.production' \
  --exclude='src/generated' --exclude='dist' --exclude='build' \
  --exclude='coverage' --exclude='.DS_Store' \
  --exclude='docs/discovery' --exclude='docs/superpowers' --exclude='CLAUDE.md' \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta/" \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/"
```
- [ ] **Step 2:** Verificar que `docs/discovery/`, `docs/superpowers/specs/`, `docs/superpowers/plans/`, `CLAUDE.md` raiz **não foram tocados**.
```bash
ls -la "/.../Relatórios de Atendimento - Nexus Chat/docs/discovery/"
ls -la "/.../Relatórios de Atendimento - Nexus Chat/docs/superpowers/"
```

### Task F0.2 — Limpar entidades de webhook/Meta (sem mexer em UI base)

**Manter intactos:**
- `src/components/ui/*`
- `src/components/providers/{session-provider,theme-provider}.tsx`
- `src/components/layout/{sidebar,breadcrumbs,command-palette}.tsx` (adaptar depois)
- `src/components/login/*` (textos serão ajustados)
- `src/lib/{prisma,redis,queue,realtime,audit,encryption,theme,utils}.ts` (e `src/lib/utils/`)
- `src/auth.ts`, `auth.config.ts`, `middleware.ts`, `auth-helpers.ts`
- Arquivos raiz de config (`next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `tsconfig.json`, `jest.config.ts`, `eslint.config.mjs`)

**Remover:**
- `src/app/(protected)/companies/`
- `src/components/dashboard/`
- `src/components/event-checklist/`
- `src/components/routes/`
- `src/components/reports/` (será refeito do zero)
- `src/lib/actions/{company,credential,dashboard,logs,users,webhook-routes,meta-subscription,meta-embedded-signup,resend}.ts` (preservar `password-reset.ts`, `profile.ts` para reuso)
- `src/lib/{webhook,reports}/`
- `src/lib/tenant.ts` (será reescrito)
- `src/lib/constants/{events,roles,nav}.ts` (`roles` e `nav` serão reescritos; `events` removido)
- `src/lib/validations/company.ts` (e quaisquer relacionados a webhook)
- `src/worker/{delivery,dlq-cleanup,orphan-recovery}.ts`, `src/worker/jobs/meta-drift-check.ts`
- `vendor-packages/`
- `prisma/migrations/*`
- `prisma/seed.ts` (será reescrito)

- [ ] **Step 1:** Listar e remover arquivos via `rm -rf`.
- [ ] **Step 2:** `git init -b main` na raiz do target.
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
git init -b main
git add -A
git commit -m "chore: initial copy from Roteador Webhook Meta with cleanup"
```

### Task F0.3 — Reescrever `package.json`

**File:** `package.json`

- [ ] **Step 1:** Substituir `name`, `description`, e ajustar `scripts`:
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
- [ ] **Step 2:** Remover dependências `@nexusai360/*` (vinham do `vendor-packages/` do Roteador, não usaremos).
- [ ] **Step 3:** `npm install` para regenerar `package-lock.json`.
- [ ] **Step 4:** Commit `chore: package.json for nexus-insights`.

### Task F0.4 — Reescrever `prisma/schema.prisma` conforme spec §6.1

**File:** `prisma/schema.prisma`

- [ ] **Step 1:** Substituir conteúdo pelo schema da spec §6.1 completo.
- [ ] **Step 2:** Confirmar `.gitignore` ignora `src/generated/`.
- [ ] **Step 3:** Iniciar Postgres local via `docker compose up -d db`.
- [ ] **Step 4:** Configurar `.env.local` com `DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_insights?schema=public`.
- [ ] **Step 5:** `npx prisma migrate dev --name initial`.
- [ ] **Step 6:** Verificar `src/generated/prisma/` populado.
- [ ] **Step 7:** Commit `feat(db): initial Prisma schema (User, AccountAccess, TeamAccess, AppSetting, AuditLog, tokens)`.

### Task F0.5 — Reescrever `prisma/seed.ts` (idempotente)

**File:** `prisma/seed.ts`

- [ ] **Step 1:** Implementar conforme spec §6.2:
```typescript
import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const APP_SETTINGS_DEFAULTS: Array<{ key: string; value: any; category: string; description?: string }> = [
  { key: 'polling.live_seconds', value: 30, category: 'polling', description: 'Intervalo de atualização dos painéis ao vivo (segundos).' },
  { key: 'polling.historical_seconds', value: 300, category: 'polling' },
  { key: 'polling.refresh_button_enabled', value: true, category: 'polling' },
  { key: 'realtime.sse_enabled', value: true, category: 'realtime' },
  { key: 'feature_flags.matrix_ia_visible_to_super_admin_only', value: true, category: 'visibility' },
  { key: 'feature_flags.exclude_matrix_ia_globally', value: true, category: 'visibility' },
  { key: 'feature_flags.csat_enabled', value: true, category: 'modules' },
  { key: 'feature_flags.sla_enabled', value: true, category: 'modules' },
  { key: 'audit.retention_days', value: 90, category: 'audit' },
  { key: 'reports.max_period_days', value: 365, category: 'reports' },
  { key: 'chatwoot.deeplink_base', value: 'https://chatwoot.znsolucoes.com.br', category: 'chatwoot' },
];

async function main() {
  const email = process.env.ADMIN_EMAIL!;
  const password = process.env.ADMIN_PASSWORD!;
  const name = process.env.ADMIN_NAME ?? 'João Zanini';
  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { email },
    update: { name, isActive: true, isOwner: true, platformRole: 'super_admin', mustChangePassword: false },
    create: {
      email, password: passwordHash, name,
      platformRole: 'super_admin', isOwner: true, isActive: true,
      mustChangePassword: false, passwordChangedAt: new Date(),
      emailVerifiedAt: new Date(), theme: 'dark',
    },
  });

  for (const accountId of [9, 2]) {
    const accountName = accountId === 9 ? 'Matrix Fitness Group' : 'Invest Soluções';
    await prisma.userAccountAccess.upsert({
      where: { userId_chatwootAccountId: { userId: owner.id, chatwootAccountId: accountId } },
      update: { chatwootAccountName: accountName },
      create: { userId: owner.id, chatwootAccountId: accountId, chatwootAccountName: accountName, grantedById: owner.id },
    });
  }

  for (const setting of APP_SETTINGS_DEFAULTS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log(`[seed] owner=${owner.email}, accounts=2, settings=${APP_SETTINGS_DEFAULTS.length}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2:** Criar `tsconfig.seed.json` (cópia do Roteador).
- [ ] **Step 3:** Setar env vars locais e rodar `npm run prisma:seed`.
- [ ] **Step 4:** Verificar via `psql` local: `SELECT * FROM "User";` retorna o owner.
- [ ] **Step 5:** Commit `feat(db): seed owner + AppSettings defaults`.

### Task F0.6 — Adaptar `src/auth.ts`, `auth.config.ts`, `auth-helpers.ts`, `middleware.ts`

**Files:**
- `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`
- `src/lib/auth-helpers.ts`

- [ ] **Step 1:** Em `auth-helpers.ts`, atualizar `authorizeCredentials` e `getCurrentUser` para o novo schema:
```typescript
// authorizeCredentials: select agora usa { id, email, password, platformRole, isOwner, isActive, mustChangePassword, name, avatarUrl, theme }
// getCurrentUser: usa Promise.all para acessar accountAccess e teamAccess
const [accountAccess, teamAccess] = await Promise.all([
  prisma.userAccountAccess.findMany({ where: { userId: user.id }, select: { chatwootAccountId: true, chatwootAccountName: true } }),
  prisma.userTeamAccess.findMany({ where: { userId: user.id }, select: { chatwootAccountId: true, chatwootTeamId: true, chatwootTeamName: true } }),
]);
const accountIds = [...new Set(accountAccess.map(a => a.chatwootAccountId))];
const teamIds = [...new Set(teamAccess.map(t => t.chatwootTeamId))];
return { ...user, accountIds, teamIds, accounts: accountAccess, teams: teamAccess };
```

- [ ] **Step 2:** Em `auth.config.ts`, callback `jwt` adicionar `mustChangePassword`, `isOwner`, `accountIds`, `teamIds` ao token. Re-fetch a cada request.

- [ ] **Step 3:** Em `middleware.ts`:
```typescript
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
```

- [ ] **Step 4:** Commit `feat(auth): adapt NextAuth helpers to new schema`.

### Task F0.7 — Tela `/login` com novos textos (UI)

**Files:**
- `src/components/login/login-branding.tsx`
- `src/app/(auth)/login/page.tsx`
- componente de footer (verificar onde está no Roteador; provavelmente em `(auth)/layout.tsx`)

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** com pedido: "preserve a identidade visual da tela de login do projeto Roteador Webhook Meta; troque apenas o subtítulo de 'Roteador de Webhooks' para 'Relatórios e insights dos atendimentos' e o footer para 'Nexus AI © 2026. Todos os direitos reservados'. Logo e título permanecem 'Nexus AI'."
- [ ] **Step 1:** Aplicar mudanças textuais em `login-branding.tsx` (subtítulo).
- [ ] **Step 2:** Aplicar footer correto.
- [ ] **Step 3:** `npm run dev`, verificar `localhost:3000/login`.
- [ ] **Step 4:** Commit `feat(login): branding nexus-insights`.

### Task F0.8 — Sidebar e nav (UI)

**Files:**
- `src/lib/constants/nav.ts` (reescrito do zero)
- `src/components/layout/sidebar.tsx` (adaptado)
- `src/lib/constants/roles.ts`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** com pedido: "adaptar sidebar do Roteador para Nexus Insights mantendo identidade visual; trocar logo+título por 'Nexus Insights'; menus: Dashboard, Relatórios (com submenus), Usuários, Configurações, Perfil; mostrar account-switcher para super admin; submenu colapsível; ícones Lucide consistentes com o Roteador."
- [ ] **Step 1:** Reescrever `nav.ts` conforme spec §14:
```typescript
import type { LucideIcon } from 'lucide-react';
import { Home, BarChart3, Users, Settings, User, MessageSquare, Calendar, Clock, Trophy, Building2, Map, ListChecks, Smile, Shield, Bot } from 'lucide-react';
import type { PlatformRole } from '@/generated/prisma';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  visibleTo?: PlatformRole[];
  superAdminOnly?: boolean;
  featureFlag?: string;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Relatórios', href: '/relatorios', icon: BarChart3, children: [
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
    { label: 'Matrix IA', href: '/relatorios/matrix-ia', icon: Bot, superAdminOnly: true },
  ]},
  { label: 'Usuários', href: '/usuarios', icon: Users, visibleTo: ['super_admin','admin','manager'] },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, superAdminOnly: true },
  { label: 'Perfil', href: '/perfil', icon: User },
];

export function filterNav(items: NavItem[], user: { platformRole: PlatformRole; isOwner?: boolean }, settings: Record<string, any>): NavItem[] {
  return items
    .filter(i => {
      if (i.superAdminOnly && user.platformRole !== 'super_admin') return false;
      if (i.visibleTo && !i.visibleTo.includes(user.platformRole)) return false;
      if (i.featureFlag && !settings[i.featureFlag]) return false;
      return true;
    })
    .map(i => ({ ...i, children: i.children ? filterNav(i.children, user, settings) : undefined }));
}
```

- [ ] **Step 2:** Adaptar `sidebar.tsx` para usar `NAV_ITEMS` filtrado, com submenu colapsível, account-switcher (placeholder vazio até F1.8), logout, theme toggle.

- [ ] **Step 3:** `roles.ts` reescrito (PLATFORM_ROLE_HIERARCHY + estilos badges + label PT-BR).

- [ ] **Step 4:** Commit `feat(layout): sidebar e nav nexus-insights`.

### Task F0.9 — `/api/health`

**File:** `src/app/api/health/route.ts`

- [ ] **Step 1:** Implementar conforme spec §3.5 (com timeouts granulares).
- [ ] **Step 2:** Smoke local: `curl localhost:3000/api/health` → 200.
- [ ] **Step 3:** Commit `feat(api): /api/health endpoint`.

### Task F0.10 — `.env.example`, `.gitignore`, `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`

**Files:**
- `.env.example`
- `.gitignore`
- `docker-compose.yml` (genérico, dev local opcional)
- `docker/Dockerfile`
- `docker/entrypoint.sh`

- [ ] **Step 1:** Reescrever `.env.example` conforme spec §21.2.
- [ ] **Step 2:** Reescrever `.gitignore` conforme spec §21.3.
- [ ] **Step 3:** Adaptar `docker-compose.yml` (dev local, sem Traefik labels).
- [ ] **Step 4:** Adaptar `Dockerfile` (Next standalone + entrypoint).
- [ ] **Step 5:** Criar `docker/entrypoint.sh` conforme spec §3.4.
```bash
#!/bin/sh
set -e
echo "[entrypoint] applying migrations…"
npx prisma migrate deploy
echo "[entrypoint] seeding (idempotent)…"
node ./prisma/seed.compiled.js || npx prisma db seed
echo "[entrypoint] starting Next.js…"
exec node server.js
```
- [ ] **Step 6:** `chmod +x docker/entrypoint.sh`.
- [ ] **Step 7:** Commit `chore: docker compose, dockerfile, entrypoint`.

### Task F0.11 — Setup repo GitHub

- [ ] **Step 1:** Verificar `gh auth status`. Se não estiver autenticado: pedir ao usuário (uso `!gh auth login`). Se autenticado, prosseguir.
- [ ] **Step 2:** Criar repo:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
gh repo create jvzanini/nexus-insights --private --source=. --remote=origin --description "Plataforma de relatórios e insights da operação Chatwoot da Matrix Fitness Group"
```
- [ ] **Step 3:** Configurar secrets:
```bash
gh secret set GHCR_TOKEN --body "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"
gh secret set PORTAINER_URL --body "https://painel.nexusai360.com"
gh secret set PORTAINER_TOKEN --body "ptr_cFt9XBUyCgeA/A9uIMraFDLRqtAaLHCStgRiDxJrCQA="
gh secret set PORTAINER_ENDPOINT_ID --body "1"
# PORTAINER_STACK_ID será setado depois de criar a stack (F8.2)
```
- [ ] **Step 4:** Push inicial:
```bash
git push -u origin main
```

### Task F0.12 — `.github/workflows/deploy.yml`

**File:** `.github/workflows/deploy.yml`

- [ ] **Step 1:** Implementar conforme spec §23.1.
- [ ] **Step 2:** Commit + push. Aguardar primeira execução; deve falhar no job `deploy` (PORTAINER_STACK_ID ainda não configurado) — esperado.

### Task F0.13 — Smoke local end-to-end

- [ ] **Step 1:** `npm install` ok.
- [ ] **Step 2:** `docker compose up -d db redis`.
- [ ] **Step 3:** `.env.local` com vars locais.
- [ ] **Step 4:** `npm run prisma:migrate && npm run prisma:seed`.
- [ ] **Step 5:** `npm run dev`. Acessar `localhost:3000`. Login com `nexusai360@gmail.com / nexus.AI@360`. Redireciona pra `/dashboard` (ainda placeholder).
- [ ] **Step 6:** `localhost:3000/api/health` → 200 com 3 checks ok.
- [ ] **Step 7:** Commit ajustes finais.

---

## FASE 1 — Auth, RBAC, Settings

### Task F1.1 — `src/lib/permissions.ts` + testes

**Files:** `src/lib/permissions.ts`, `src/__tests__/lib/permissions.test.ts`, `src/__tests__/utils/fixtures.ts`

- [ ] **Step 1:** Criar `fixtures.ts` (mockUser, mockOwner, mockSuperAdmin, mockAdmin, mockManager, mockViewer).
- [ ] **Step 2:** Escrever testes (TDD) cobrindo todas as branches dos helpers `canCreateRole`, `canEditUser`, `canDeleteUser`, `canDeactivateUser`, `canGrantAccounts`, `canGrantTeams`, `canSeeMatrixIA`.
- [ ] **Step 3:** Implementar helpers conforme spec §12.3.
- [ ] **Step 4:** `npm test -- permissions` → verde.
- [ ] **Step 5:** Commit `feat(rbac): permissions helpers + tests`.

### Task F1.2 — `src/lib/tenant.ts` + testes

**Files:** `src/lib/tenant.ts`, `src/__tests__/lib/tenant.test.ts`

- [ ] **Step 1:** TDD para `getAccessibleAccountIds`, `getAccessibleTeamIds`, `assertAccountAccess`.
- [ ] **Step 2:** Implementar conforme spec §12.4.
- [ ] **Step 3:** Commit `feat(rbac): tenant helpers + tests`.

### Task F1.3 — Server actions `src/lib/actions/users.ts` + testes

**Files:** `src/lib/actions/users.ts`, `src/lib/validations/user.ts`, `src/lib/actions/__tests__/users.test.ts`

Server actions:
- `listUsers(filter)` — paginação cursor.
- `createUser(input)` — gera senha temporária, valida regras, envia email.
- `updateUser(id, input)` — valida regras, cascata de revogação.
- `deleteUser(id)` — valida regras + cascade.
- `setUserActive(id, active)` — valida regras.
- `regeneratePassword(id)` — gera nova senha temp + email + `mustChangePassword=true`.
- `getCurrentUserAccessSummary()` — retorna accounts e teams visíveis para popular multi-selects no dialog.
- `revokeAccountAccess(userId, accountId)` — usado quando admin perde access (cascade automático).
- `listAudits(filter, cursor)` — para tab Auditoria.

- [ ] **Step 1:** Validation schemas Zod (`createUserSchema`, `updateUserSchema`, `subsetRulesValidation`).
- [ ] **Step 2:** Testes (mock Prisma + auth + Resend).
- [ ] **Step 3:** Implementação.
- [ ] **Step 4:** Commit `feat(users): server actions completos`.

### Task F1.4 — Tela `/usuarios` (UI completa)

**Files:**
- `src/app/(protected)/usuarios/page.tsx`
- `src/app/(protected)/usuarios/loading.tsx`
- `src/app/(protected)/usuarios/error.tsx`
- `src/components/users/users-table.tsx`
- `src/components/users/user-form-dialog.tsx`
- `src/components/users/role-select.tsx`
- `src/components/users/account-multi-select.tsx`
- `src/components/users/department-multi-select.tsx`
- `src/components/users/delete-user-dialog.tsx`
- `src/components/users/deactivate-user-dialog.tsx`
- `src/components/users/resend-password-dialog.tsx`
- `src/components/users/audits-table.tsx`
- `src/components/users/users-filters.tsx`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** com pedido: "Replicar tela `/usuarios` exatamente como na imagem screenshot do Roteador Webhook Meta (header roxo com ícone, título 'Usuários' e subtítulo 'Gerencie os usuários da plataforma'; tabela com colunas Nome, Email, Nível [dropdown custom com 4 níveis e ícones], Status [badge Ativo/Inativo + toggle], Contas [badge clicável], Criado em [data formatada pt-BR], Ações [Editar/Excluir/Reenviar senha]; botão '+ Novo Usuário' canto direito; identidade dark roxa). Tudo idêntico — peso de fonte, raios, sombras, transições, ícones Lucide, paleta. Adaptar apenas a coluna 'Empresas' do Roteador para 'Contas' aqui. Detalhar estados loading/error/empty."
- [ ] **Step 1:** Construir cada componente seguindo orientações da skill.
- [ ] **Step 2:** Smoke local: criar admin, gerente, viewer; tentar regras barradas.
- [ ] **Step 3:** Commit `feat(users): tela /usuarios completa`.

### Task F1.5 — Tab "Auditoria" em `/usuarios`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("tab adicional na mesma página /usuarios, mostrando timeline de auditoria com filtros por ação/data/usuário, paginação cursor, igual identidade do Roteador").
- [ ] **Step 1:** Construir tab + tabela (super admin only).
- [ ] **Step 2:** Commit `feat(audit): tab auditoria em /usuarios`.

### Task F1.6 — `src/lib/settings/get.ts` + `update.ts` + testes

- [ ] **Step 1:** TDD.
- [ ] **Step 2:** Implementar conforme spec §9.3.
- [ ] **Step 3:** Commit `feat(settings): get/update + cache + tests`.

### Task F1.7 — Tela `/configuracoes` (UI)

**Files:**
- `src/app/(protected)/configuracoes/page.tsx`
- `src/components/settings/polling-settings-form.tsx`
- `src/components/settings/visibility-settings-form.tsx`
- `src/components/settings/audit-settings-form.tsx`
- `src/components/settings/reports-settings-form.tsx`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("tela de configurações com seções Atualização (polling), Realtime, Visibilidade, Módulos, Auditoria, Relatórios — cada seção é um card com formulário; identidade dark roxa do Roteador; toasts Sonner ao salvar; super admin only").
- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Smoke: alterar polling.live_seconds e ver tomar efeito após 30s.
- [ ] **Step 3:** Commit `feat(settings): tela /configuracoes`.

### Task F1.8 — Account switcher (super admin)

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("custom-select compacto na sidebar topo, abaixo do logo, mostrando conta ativa; visível apenas para super admin").
- [ ] **Step 1:** Implementar componente + server action que persiste cookie + audit.
- [ ] **Step 2:** Commit `feat(layout): account switcher`.

### Task F1.9 — `/perfil` e `/perfil/trocar-senha`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("tela de perfil com seções Informações pessoais (nome, email, tema), Segurança (trocar senha)").
- [ ] **Step 1:** Implementar tela + server actions.
- [ ] **Step 2:** Commit.

### Task F1.10 — Forgot/Reset password flow

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("forgot password e reset password seguindo identidade da tela de login").
- [ ] **Step 1:** Implementar páginas + server actions + email Resend.
- [ ] **Step 2:** Commit.

### Task F1.11 — Verify email flow

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("verify email seguindo identidade da tela de login; mostra apenas mensagem de sucesso/falha + botão para login").
- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Commit.

### Task F1.12 — Logout

- [ ] **Step 1:** Server action `logoutAction()` com audit.
- [ ] **Step 2:** Conectar botão na sidebar.
- [ ] **Step 3:** Commit.

---

## FASE 2 — Acesso Chatwoot e cache

### Task F2.1 — Pool Chatwoot + resilience

- [ ] **Step 1:** `src/lib/chatwoot/pool.ts`, `resilience.ts`.
- [ ] **Step 2:** Smoke (`SELECT 1` + simular timeout).
- [ ] **Step 3:** Commit.

### Task F2.2 — Filter builder + testes

- [ ] **Step 1:** TDD para `buildBaseFilter` cobrindo todas combinações.
- [ ] **Step 2:** Implementar conforme spec §7.3.
- [ ] **Step 3:** Commit.

### Task F2.3 — Deep-link + testes

- [ ] **Step 1:** TDD.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Commit.

### Task F2.4 — Cache helpers (`keys.ts`, `pull-through.ts`, `invalidate.ts`)

- [ ] **Step 1:** TDD.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Commit.

### Task F2.5 — Worker BullMQ

- [ ] **Step 1:** `worker/index.ts` + jobs (`prewarm-live`, `prewarm-historical`, `sync-chatwoot-meta`, `db-backup`, `audit-write`, `audit-cleanup`).
- [ ] **Step 2:** Pool Chatwoot dedicado em `worker/shared/`.
- [ ] **Step 3:** Schedulers reconfiguráveis via SSE event `settings:updated`.
- [ ] **Step 4:** Smoke local: subir worker, ver logs estruturados.
- [ ] **Step 5:** Commit.

### Task F2.6 — `/api/chatwoot/refresh`

- [ ] **Step 1:** Endpoint POST com rate-limit + invalida cache + re-executa.
- [ ] **Step 2:** Commit.

### Task F2.7 — `/api/events` (SSE)

- [ ] **Step 1:** Endpoint subscribing Redis canal.
- [ ] **Step 2:** Hook `useRealtimeReport` no client.
- [ ] **Step 3:** Commit.

---

## FASE 3 — Relatórios v1

Para cada relatório, padrão:
1. **`ui-ux-pro-max:ui-ux-pro-max`** invocada antes da UI.
2. Query SQL + Zod schema.
3. Server action.
4. Tela + componentes.
5. Loading/error states.
6. Testes da query e action.
7. Commit.

### Task F3.1 — Componentes base de relatórios (UI massivo)

**Files:** todos os arquivos `src/components/reports/*` listados na spec §5.

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** ("construir biblioteca de componentes de relatório: FiltersBar, PeriodSelector, multi-selects (inbox/team/agent/status/label), RefreshButton, StaleBanner, KpiCard, ChartLine/Bar/Pie/Heatmap (Recharts), DataTable com paginação, Pagination, EmptyState, SkeletonReport, OpenInChatwoot. Identidade visual idêntica ao Roteador (header roxo, badges, espaçamentos).").
- [ ] **Step 1:** Construir cada componente.
- [ ] **Step 2:** Smoke visual em página dev `/dev/reports-preview` (excluir de produção).
- [ ] **Step 3:** Commit.

### Task F3.2 — Dashboard (home)

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query `home-summary.ts`. Server action. Tela com KPIs + mini-chart.
- [ ] **Step 2:** Commit.

### Task F3.3 — Relatório Conversas (relatório principal)

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query `conversas-list.ts` (cursor pagination, JOIN contacts/inboxes/users/taggings).
- [ ] **Step 2:** Server action + tela com tabela + filtros + Open in Chatwoot.
- [ ] **Step 3:** Commit.

### Task F3.4 — Relatório Leads recebidos

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + server action + tela com chart-line + KPIs.
- [ ] **Step 2:** Commit.

### Task F3.5 — Relatório Volumetria

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Queries DOW + heatmap. Server action. Tela com chart-bar e chart-heatmap.
- [ ] **Step 2:** Commit.

### Task F3.6 — Relatório Tempos de resposta

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Queries `tempos-primeira-resposta`, `tempo-resolucao`, comparativo business hours.
- [ ] **Step 2:** Server action + tela com KPIs + comparativo dia útil/fim de semana + toggle excluir IA.
- [ ] **Step 3:** Commit.

### Task F3.7 — Relatório Status das conversas

- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Queries `status-distribution`, `conversas-orfas`, idade-buckets.
- [ ] **Step 2:** Server action + tela.
- [ ] **Step 3:** Commit.

---

## FASE 4 — Relatórios v2

### Task F4.1 — Ranking de atendentes
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + server action + tela com chart-bar horizontal.
- [ ] **Step 2:** Commit.

### Task F4.2 — Por departamento
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + tela com 4 cards.
- [ ] **Step 2:** Commit.

### Task F4.3 — Por estado
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + tela com tabela ordenada (mapa pós-MVP).
- [ ] **Step 2:** Commit.

---

## FASE 5 — Especiais

### Task F5.1 — Matrix IA (super admin)
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Queries `ia-metrics`, `ia-sem-resposta` (validar threshold com dados reais).
- [ ] **Step 2:** Tela super admin only.
- [ ] **Step 3:** Commit.

### Task F5.2 — CSAT placeholder
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + tela com empty state se 0.
- [ ] **Step 2:** Commit.

### Task F5.3 — SLA placeholder
- [ ] **Step 0:** UX skill.
- [ ] **Step 1:** Query + tela com empty state se 0.
- [ ] **Step 2:** Commit.

---

## FASE 6 — Testes (cobertura)

### Task F6.1 — Configurar Jest com threshold

- [ ] **Step 1:** Em `jest.config.ts` configurar `coverageThreshold`:
```typescript
coverageThreshold: {
  './src/lib/permissions.ts': { branches: 80, statements: 90 },
  './src/lib/tenant.ts': { branches: 80, statements: 90 },
  './src/lib/chatwoot/filters.ts': { branches: 80, statements: 90 },
  './src/lib/cache/': { branches: 80, statements: 80 },
  './src/lib/actions/users.ts': { branches: 70, statements: 80 },
  './src/lib/actions/settings.ts': { branches: 70, statements: 80 },
  './src/lib/utils/': { branches: 70, statements: 80 },
}
```
- [ ] **Step 2:** Commit.

### Task F6.2 — Cobertura final

- [ ] **Step 1:** Rodar `npm run test:coverage`. Garantir threshold passa.
- [ ] **Step 2:** Adicionar testes onde faltar.
- [ ] **Step 3:** Commit.

---

## FASE 7 — Docker + CI/CD

### Task F7.1 — Validar build Docker local

```bash
docker build -f docker/Dockerfile -t nexus-insights:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  -e CHATWOOT_DATABASE_URL=... \
  ... \
  nexus-insights:local
```

- [ ] **Step 1:** Verificar imagem sobe e responde no `/api/health`.
- [ ] **Step 2:** Commit ajustes.

### Task F7.2 — Validar workflow GitHub Actions

- [ ] **Step 1:** Push em main; aguardar CI rodar.
- [ ] **Step 2:** Verificar que jobs `quality` e `build` passam; `deploy` falha (PORTAINER_STACK_ID não setado ainda) — esperado.
- [ ] **Step 3:** Verificar imagem em `ghcr.io/jvzanini/nexus-insights:latest` publicada.

---

## FASE 8 — Deploy em produção

### Task F8.1 — Criar `docker-compose.production.yml`

**File:** `docker-compose.production.yml` (NÃO no git)

- [ ] **Step 1:** Criar com 4 serviços, Traefik labels, lê `.env.production`.

### Task F8.2 — Criar `.env.production` com secrets reais

**File:** `.env.production` (NÃO no git)

- [ ] **Step 1:** Gerar `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`.
- [ ] **Step 2:** Preencher demais variáveis com valores conhecidos (Chatwoot URL/credenciais, Resend, Portainer).

### Task F8.3 — Verificar DNS

```bash
dig insights.nexusai360.com +short
# deve retornar 82.112.245.232 ou IP Hostinger correspondente
```
- [ ] **Step 1:** Confirmar resolução; se não, alertar usuário pra apontar DNS.

### Task F8.4 — Criar stack no Portainer

- [ ] **Step 1:** Carregar envs:
```bash
source .env.production
```
- [ ] **Step 2:** POST para criar stack:
```bash
COMPOSE_CONTENT=$(jq -Rs . docker-compose.production.yml)
ENV_VARS=$(jq -n \
  --arg dbpw "$DB_PASSWORD" \
  --arg secret "$NEXTAUTH_SECRET" \
  --arg key "$ENCRYPTION_KEY" \
  --arg adminemail "$ADMIN_EMAIL" \
  --arg adminpass "$ADMIN_PASSWORD" \
  --arg adminname "$ADMIN_NAME" \
  --arg cwurl "$CHATWOOT_DATABASE_URL" \
  --arg cwbase "$CHATWOOT_BASE_URL" \
  --arg resend "$RESEND_API_KEY" \
  --arg resendfrom "$RESEND_FROM" \
  --arg authurl "$NEXTAUTH_URL" \
  '[
    {name:"DB_PASSWORD", value:$dbpw},
    {name:"NEXTAUTH_SECRET", value:$secret},
    {name:"ENCRYPTION_KEY", value:$key},
    {name:"ADMIN_EMAIL", value:$adminemail},
    {name:"ADMIN_PASSWORD", value:$adminpass},
    {name:"ADMIN_NAME", value:$adminname},
    {name:"CHATWOOT_DATABASE_URL", value:$cwurl},
    {name:"CHATWOOT_BASE_URL", value:$cwbase},
    {name:"RESEND_API_KEY", value:$resend},
    {name:"RESEND_FROM", value:$resendfrom},
    {name:"NEXTAUTH_URL", value:$authurl}
  ]')

curl -fsSL -X POST "$PORTAINER_URL/api/stacks?type=2&method=string&endpointId=$PORTAINER_ENDPOINT_ID" \
  -H "X-API-Key: $PORTAINER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"Name\":\"nexus-insights\",\"StackFileContent\":$COMPOSE_CONTENT,\"Env\":$ENV_VARS}"
```
- [ ] **Step 3:** Capturar `Id` retornado e setar `gh secret set PORTAINER_STACK_ID --body "<id>"`.
- [ ] **Step 4:** Commit (apenas o conteúdo que vai pro git; `.env.production` e `docker-compose.production.yml` ficam fora).

### Task F8.5 — Validar SSL e healthcheck em produção

- [ ] **Step 1:** Aguardar Traefik provisionar Let's Encrypt (até 2min).
- [ ] **Step 2:** `curl -I https://insights.nexusai360.com/api/health` → 200.
- [ ] **Step 3:** Verificar `status: ok` no JSON.

### Task F8.6 — Smoke em produção

- [ ] **Step 1:** Acessar `https://insights.nexusai360.com`.
- [ ] **Step 2:** Login owner.
- [ ] **Step 3:** Criar 1 admin teste, verificar email Resend recebido.
- [ ] **Step 4:** Abrir 3 relatórios diferentes, validar dados reais.
- [ ] **Step 5:** Clicar "Abrir no Chatwoot" — verificar abre nova aba na conversa correta.
- [ ] **Step 6:** Mudar `polling.live_seconds` em `/configuracoes` (alterar pra 60s) — verificar tomar efeito.
- [ ] **Step 7:** Voltar para 30s.

---

## FASE 9 — Validação e entrega

### Task F9.1 — README.md completo

**File:** `README.md`

- [ ] **Step 0:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** opcionalmente para diagrama (mermaid graph).
- [ ] **Step 1:** Estrutura: header com badges, descrição, stack, quickstart local, deploy, links úteis. Sem credenciais.
- [ ] **Step 2:** Commit + push.

### Task F9.2 — CHANGELOG.md inicial

- [ ] **Step 1:** v0.1.0 com features: auth, RBAC, multi-account, 12 relatórios, settings dinâmicos, Matrix IA.

### Task F9.3 — Runbooks

- [ ] **Step 1:** `docs/runbooks/deploy.md`.
- [ ] **Step 2:** `docs/runbooks/backup-restore.md`.
- [ ] **Step 3:** `docs/runbooks/troubleshooting.md`.

### Task F9.4 — Atualizar memória do projeto

- [ ] **Step 1:** Salvar memórias em `.claude/.../memory/`:
  - `project_state.md` — em produção desde 2026-04-29.
  - `production_url.md` — `https://insights.nexusai360.com`.
  - `portainer_stack.md` — endpoint id 1, stack id `<id>`.
  - `default_polling_cadence.md` — 30s ao vivo / 5min histórico.
  - `chatwoot_db_access.md` — host, db, user, leitura apenas.
  - `owner_credentials.md` — email Nexus + reset disponível.

### Task F9.5 — Validação final pré-commit

- [ ] **Step 1:** `git status` não mostra `.env*` real.
- [ ] **Step 2:** `git ls-files | grep -i 'env\|prod\|secret'` retorna apenas `.env.example`.
- [ ] **Step 3:** Push final.

### Task F9.6 — Avisar usuário

Mensagem final para o usuário descrevendo:
- URL: `https://insights.nexusai360.com`.
- Credenciais owner usam email Nexus padrão (sem citar senha no chat).
- O que validar (tour rápido).
- Onde reportar problemas (issues no GitHub repo).
- Próximos passos sugeridos.

---

## Self-review do plan

**1. Cobertura da spec v3:**

| Spec § | Plan task |
|--------|-----------|
| §1 Contexto | F0.* |
| §3.4 Migrations auto | F0.10 (entrypoint.sh) |
| §3.5 /api/health | F0.9 |
| §6.1 Schema | F0.4 |
| §6.2 Seed | F0.5 |
| §6.3 Cascade revoke | F1.3 |
| §7 Chatwoot | F2.1-F2.3 |
| §8 Cache | F2.4-F2.5 |
| §9 Settings | F1.6-F1.7 |
| §10 SSE | F2.7 |
| §11 Auth | F0.6, F0.7, F1.10-F1.12 |
| §12 RBAC | F1.1, F1.4 |
| §13 Multi-account | F1.8 |
| §14 Sidebar | F0.8 |
| §15 Relatórios | F3.*, F4.*, F5.* |
| §16 Filtros | F3.1 |
| §17 Open in Chatwoot | F3.1 + F3.3 |
| §18 CSAT/SLA/Tags | F5.2-F5.3 |
| §19 Audit | F1.3 (parte), F2.5 (worker) |
| §20 Branding | F0.7-F0.8 |
| §21 Env vars | F0.10, F8.2 |
| §22 Tests | F6.* (e em cada task lógica) |
| §23 CI/CD | F0.12, F7.2 |
| §24 Security | distribuído (auth, headers, rate-limit) |
| §25 Logs | F0.10+ (logger criado em F0.13) |
| §26 /perfil | F1.9 |
| §27 Command palette | (em F0.8 ou tarefa adicional na F1) |
| §28 Errors/loading/empty | F3.* (cada relatório) |
| §29 Fases | mapeadas |

→ **Cobertura completa.**

**2. Placeholder scan:** sem "TBD"/"TODO"/etc.

**3. Type consistency:** mantida (mesmo padrão NavItem, AppSetting, etc. em todas as tasks).

---

**Fim do plan v3 final.** Próximo: invocar `superpowers:subagent-driven-development` e iniciar a execução pela Fase 0.
