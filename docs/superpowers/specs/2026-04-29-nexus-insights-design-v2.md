# Nexus Insights — Design Spec (v2)

**Status:** v2 (após pente-fino #1; ainda passa por pente-fino #2 antes da v3 final)
**Data:** 2026-04-29
**Autor:** Claude (Anthropic) sob direção de João Zanini

## Histórico de revisões
- **v1 (2026-04-29):** rascunho inicial completo, 27 seções.
- **v2 (este):** decisões do apêndice resolvidas, lacunas preenchidas, política de revogação em cascata documentada, fluxo de criação de user com `mustChangePassword`, comportamento gracioso quando Chatwoot offline, separação stack genérica vs stack produção, padronização do exclude IA toggle global.

## Documentos relacionados
- `docs/discovery/2026-04-29-chatwoot-schema-discovery.md`
- `docs/discovery/2026-04-29-decisoes-consolidadas.md`
- `docs/superpowers/specs/2026-04-29-nexus-insights-design-v1.md` (histórico)
- `CLAUDE.md`

---

## 1. Contexto e objetivo

Idêntico à v1. Resumo: plataforma web de relatórios sobre operação Chatwoot da Matrix Fitness Group (distribuidora de equipamentos de academia, atendimento por estado), apenas leitura, RBAC hierárquico, polling com cache. Nome: **Nexus Insights**. Domínio: **`insights.nexusai360.com`**. Branding e padrões visuais: cópia integral do **Roteador Webhook Meta**.

---

## 2. Glossário

(idêntico à v1)

---

## 3. Visão geral da arquitetura

(diagrama da v1 mantido)

### 3.1 Containers (4 serviços, idêntico ao Roteador)
- `app` — Next.js standalone, porta 3000, exposto via Traefik.
- `worker` — BullMQ workers (pré-aquecimento, jobs diários, audit cleanup, db backup).
- `db` — Postgres 16-alpine (banco do Nexus Insights, volume `nexus_insights_postgres`).
- `redis` — Redis 7-alpine (cache + pub/sub, volume `nexus_insights_redis`).

### 3.2 Domínio e SSL
- Container `app` exposto via Traefik com host `insights.nexusai360.com`.
- SSL Let's Encrypt automático via Traefik.
- Demais containers em rede interna `internal`.
- Stack publicada no Portainer da Nexus AI.

### 3.3 Conexão com o Chatwoot
- TCP direto na porta 5432 do host `82.112.245.232`.
- Pool dedicado em `src/lib/chatwoot/pool.ts`: `min: 2`, `max: 8`, `statement_timeout: 30s`, `application_name: 'nexus-insights'`.

### 3.4 Health check (`/api/health`)
Endpoint público (sem auth), retorna 200 com payload:
```json
{
  "status": "ok|degraded|down",
  "checks": {
    "database":  { "ok": true, "ms": 12 },
    "redis":     { "ok": true, "ms": 3 },
    "chatwoot":  { "ok": true, "ms": 89 }
  },
  "version": "vX.Y.Z",
  "uptime_s": 12345
}
```
Status global: `ok` se todos verdes; `degraded` se Chatwoot ou Redis cair (mas DB próprio ok); `down` se DB próprio cair. Usado pelo Traefik healthcheck e pelo monitoramento.

---

## 4. Stack tecnológica

(tabela idêntica à v1; lista deps idêntica ao Roteador)

---

## 5. Estrutura de pastas

(árvore idêntica à v1; decisões reforçadas:)
- `src/components/layout/notification-bell.tsx` **excluído do MVP** (futuro). Stub/empty se referenciado.
- `src/components/layout/command-palette.tsx` **incluído no MVP** com escopos: `conversas` (busca por display_id, nome do contato, telefone), `atendentes` (busca por nome/email no Chatwoot), `relatórios` (rotas internas).

---

## 6. Modelo de dados próprio (Prisma)

### 6.1 Adições à v1

```prisma
model User {
  // ... (campos da v1)
  mustChangePassword  Boolean   @default(true)        // user recém-criado é forçado a trocar
  passwordChangedAt   DateTime?
  // ... resto igual
}
```

Demais models (`UserAccountAccess`, `UserTeamAccess`, `AppSetting`, `AuditLog`, `PasswordResetToken`, `EmailChangeToken`) **idênticos à v1**.

### 6.2 Seed (`prisma/seed.ts`) — atualização
- `mustChangePassword = false` para o owner (a senha do owner vem do env e ele já a "definiu").
- `passwordChangedAt = now()` para o owner.

### 6.3 Política de revogação em cascata (NOVO)
**Quando um user (A) tem seu acesso a uma account (X) revogado** (super admin removeu X de A):
1. Server action remove `UserAccountAccess` de A para X.
2. Em sequência (mesma transação Prisma), remove `UserAccountAccess` para X de **todos os users que A criou** (cascata recursiva, percorrendo `createdUsers`).
3. Idem para `UserTeamAccess`: remove qualquer `UserTeamAccess` para teams pertencentes à account X dos users descendentes.
4. Audit log para cada revogação (com `action: 'user_access_revoked'` e `details: { reason: 'cascade_from_user', ancestorUserId }`).

**Quando um user (A) tem seu role rebaixado** (ex.: admin → manager):
- Se as accounts atuais de A excedem o que o role-alvo permite, a operação é **bloqueada** com mensagem "Reduza primeiro os accesses".
- Mesma regra para teams.

**Quando um user (A) é desativado** (`isActive = false`):
- Sessão de A é invalidada na próxima request (já está coberto pelo `jwt` callback do NextAuth).
- Os users que A criou **não são desativados** automaticamente — só perdem o vínculo de criador (que é apenas informativo).

**Quando um user (A) é deletado**:
- `onDelete: Cascade` em `UserAccountAccess` e `UserTeamAccess` cuida de remover registros próprios.
- `createdById` em `User` não é cascade — children mantêm `createdById = NULL` (foreign key opcional).
- Sessões revogadas.

---

## 7. Camada de acesso ao Chatwoot

### 7.1 Pool, queries e schemas — idêntico à v1

### 7.2 Filter builder — atualização
**Default `excludeMatrixIA` agora é universal:** `inbox_id <> 31` é aplicado **automaticamente em TODAS as queries** que tocam conversas/messages/reporting_events, **inclusive para super admin**. O super admin pode habilitar via toggle global em `/configuracoes` (`feature_flags.exclude_matrix_ia_globally` — default `true`). Quando desativado, queries não incluem o `<> 31` e relatórios passam a contar a IA.

A tela `/relatorios/matrix-ia` é o único caso onde a query **força** `inbox_id = 31` (ignora o flag).

### 7.3 Comportamento gracioso quando Chatwoot offline (NOVO)
Toda chamada à pool do Chatwoot é envolta por `withChatwootResilience`:

```typescript
async function withChatwootResilience<T>(fn: () => Promise<T>, opts: {
  fallbackKey?: string;     // chave Redis pra cache antigo (stale)
}): Promise<{ data: T; stale: boolean; error?: string }> {
  try {
    const data = await fn();
    return { data, stale: false };
  } catch (err) {
    if (opts.fallbackKey) {
      const stale = await getRedis().get(opts.fallbackKey);
      if (stale) {
        const parsed = JSON.parse(stale);
        return { data: parsed.d, stale: true, error: 'chatwoot_unavailable' };
      }
    }
    throw err; // sem cache antigo: bubble up para a UI mostrar erro
  }
}
```

**UI:** quando recebe `stale: true`, mostra banner amarelo no topo do relatório: "⚠️ Chatwoot indisponível no momento. Mostrando dados de [timestamp]." com botão "Tentar novamente".

---

## 8. Cache e polling

### 8.1 Pull-through e pré-aquecimento — idêntico à v1

### 8.2 Padrão de chave — idêntico

### 8.3 Botão "Atualizar agora" — idêntico

### 8.4 Sync diário de metadados (NOVO)
Job `sync-chatwoot-meta` no worker (cron `0 3 * * *` — 3h da manhã):
1. SELECT `accounts.id, name` do Chatwoot → atualiza `UserAccountAccess.chatwootAccountName` para todas as rows.
2. SELECT `teams.id, account_id, name` → atualiza `UserTeamAccess.chatwootTeamName`.
3. Cacheia `inboxes` e `users` do Chatwoot em chaves Redis com TTL 24h:
   - `ni:meta:inboxes:a${accountId}` → array de `{ id, name }`
   - `ni:meta:teams:a${accountId}` → array de `{ id, name }`
   - `ni:meta:users:a${accountId}` → array de `{ id, name, email }`
4. Loga warning se `chatwootAccountId/TeamId` em uso por algum `UserAccountAccess/TeamAccess` deixou de existir no Chatwoot.

### 8.5 Backup automático do nosso DB (NOVO)
Job `db-backup` no worker (cron `0 4 * * *` — 4h da manhã):
1. Spawn `pg_dump` no container `db` via socket interno.
2. Output salvo em `/var/backups/nexus_insights/YYYY-MM-DD.sql.gz` (volume Docker dedicado `nexus_insights_backups`).
3. Retenção: 7 arquivos (older que 7 dias são removidos no início do job).
4. Audit log da operação.

---

## 9. Settings dinâmicas

### 9.1 Tabela `AppSetting` — idêntica

### 9.2 Painel `/configuracoes` (super admin only) — atualização
Campos adicionados:
- **Visibilidade**
  - `feature_flags.exclude_matrix_ia_globally` (toggle, default true) — controla a aplicação universal do `inbox_id <> 31`.
  - `feature_flags.matrix_ia_visible_to_super_admin_only` (toggle, default true) — controla se inbox 31 aparece nos seletores e na sidebar.
- **Auditoria**
  - `audit.retention_days` (numérico, default 90, min 30, max 365).

### 9.3 `getSetting<T>(key)` — TTL Redis 60s; invalidado ao salvar via `/configuracoes`. Worker reconfigura schedulers via SSE event.

---

## 10. Realtime (SSE) — idêntico à v1

---

## 11. Auth e tela de login

### 11.1 NextAuth v5 — idêntico

### 11.2 Telas — idêntico

### 11.3 Forçar troca de senha no primeiro login (NOVO)
- Após login, callback `jwt` verifica `user.mustChangePassword`.
- Se `true`, response inclui `redirectTo: '/perfil/trocar-senha'` (rota dedicada que só permite acessar enquanto `mustChangePassword`).
- Após troca: server action atualiza `mustChangePassword = false`, `passwordChangedAt = now()`, `password = bcrypt(novaSenha)`. Audit log.
- Middleware bloqueia acesso a outras rotas enquanto `mustChangePassword=true` (redireciona para `/perfil/trocar-senha`).
- Owner nunca tem `mustChangePassword=true`.

### 11.4 Fluxo de criação de user (NOVO)
1. Admin/Super Admin/Gerente clica "+ Novo Usuário".
2. Dialog com formulário (nome, email, senha gerada automaticamente — botão "Regerar" pra trocar).
3. Validação no servidor: regras de hierarquia, accounts e teams (subset rules).
4. Cria `User` com `mustChangePassword=true` e `password=bcrypt(senha gerada)`.
5. Envia email pelo Resend com link `https://insights.nexusai360.com/login` + senha temporária + instrução pra trocar.
6. Mostra toast: "Usuário criado. Senha temporária: `xxxx` (já enviada por e-mail). Copiar."
7. Audit log (`user_created`).

---

## 12. RBAC consolidado

### 12.1 Hierarquia, owner — idêntico à v1

### 12.2 Tabela de regras — adições

```typescript
export function canDeactivateUser(actor: AuthUser, target: User): { allowed; reason? } {
  if (target.isOwner) return { allowed: false, reason: 'Owner sempre ativo' };
  if (actor.id === target.id) return { allowed: false, reason: 'Não pode desativar a si mesmo' };
  if (PLATFORM_ROLE_HIERARCHY[target.platformRole] >= PLATFORM_ROLE_HIERARCHY[actor.platformRole]) {
    return { allowed: false, reason: 'Hierarquia' };
  }
  return { allowed: true };
}
// Reativação: same regras + actor não pode ser viewer.
```

### 12.3 Subset rules — atualização
**Regra para edição:** se admin (A) edita um user (B) que A criou e tenta diminuir as accounts de B, **OK**. Se tenta adicionar accounts a B que A não tem, **bloqueado**. Se A perde acesso a uma account, cascata revoga essa account de B (ver §6.3).

### 12.4 Tenant scoping (`src/lib/tenant.ts`) — idêntico à v1

### 12.5 UI gestão de usuários — atualização
- Coluna **Status** com toggle "Ativo/Inativo" (botão `Switch`). Disabled se `canDeactivateUser` retornar false.
- Coluna **Ações** com 3 ícones:
  - 📝 Editar (disabled conforme `canEditUser`).
  - 🗑️ Excluir (disabled conforme `canDeleteUser`).
  - 🔄 Reenviar senha temporária (gera nova senha + email; disabled para owner por outro user).
- Filtros no header: por nível, por status, por busca (nome/email).
- Tab "Auditoria" no rodapé (super admin only) com filtros e paginação.

---

## 13. Multi-account scoping — idêntico à v1

---

## 14. Estrutura de navegação (sidebar) — idêntico à v1

---

## 15. Mapa de relatórios — idêntico à v1, com nota:
Toggle "Excluir Matrix IA" na barra de filtros é mostrado **apenas para super admin** quando o flag global `exclude_matrix_ia_globally = true`. Para outros users, o exclude é silencioso (sem toggle).

---

## 16. Filtros canônicos — idêntico à v1

---

## 17. Botão "Abrir no Chatwoot" — idêntico à v1

---

## 18. CSAT, SLA, Tags — idêntico à v1

---

## 19. Audit log

### 19.1 Ações registradas (lista atualizada)
- login_succeeded / login_failed
- password_reset_requested / password_reset_completed
- user_created / user_updated / user_deleted
- user_role_changed / user_access_granted / user_access_revoked
- user_activated / user_deactivated
- profile_updated / profile_password_changed / email_change_requested
- account_switched
- setting_updated
- opened_chatwoot_link
- session_revoked

### 19.2 Fire-and-forget (NOVO)
`logAudit` não bloqueia: enfileira em uma fila BullMQ leve (`audit-write`, concurrency 5) que persiste no DB. Falha não interrompe o fluxo principal.

```typescript
export async function logAudit(input: AuditInput) {
  try {
    await getQueue('audit-write').add('log', input, { removeOnComplete: 1000, removeOnFail: 100 });
  } catch (err) {
    console.error('[audit] failed to enqueue', err);
    // best-effort: tenta direto no Prisma
    await prisma.auditLog.create({ data: input }).catch(() => {});
  }
}
```

### 19.3 Cleanup
Job `audit-cleanup` (cron `0 5 * * *`):
- DELETE de `AuditLog` com `createdAt < NOW() - INTERVAL '${audit.retention_days} days'`.

---

## 20. Tema, branding e textos — idêntico à v1

---

## 21. Variáveis de ambiente

### 21.1 Arquivos
- **`.env.example`** — vai pro git (sem valores reais).
- **`.env.production`** — NÃO vai pro git (`.gitignore`); fica local + Portainer.
- **`.env.local`** — para desenvolvimento local; NÃO vai pro git.

### 21.2 Variáveis (todas)
```
# Banco do Nexus Insights (nosso) - container db
DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus_insights?schema=public
DB_PASSWORD=<gerar via openssl rand -base64 24>

# Banco do Chatwoot (read-only)
CHATWOOT_DATABASE_URL=postgresql://chatwoot_leitura:CW_leitura1212@82.112.245.232:5432/chatwoot
CHATWOOT_BASE_URL=https://chatwoot.znsolucoes.com.br

# Redis
REDIS_URL=redis://redis:6379

# Auth (gerar valores únicos para produção)
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://insights.nexusai360.com
ENCRYPTION_KEY=<openssl rand -hex 32>

# Owner (seed)
ADMIN_EMAIL=nexusai360@gmail.com
ADMIN_PASSWORD=nexus.AI@360
ADMIN_NAME=João Zanini

# Email (Resend)
RESEND_API_KEY=re_bTeB9s6p_AkJxXDcmhZAQzGLjfk8gVmcc
RESEND_FROM=Nexus Insights <noreply@nexusai360.com>

# Deploy
NODE_ENV=production
GHCR_TOKEN=<github_pat>                # apenas em local; CI usa secret
GHCR_USER=jvzanini
PORTAINER_URL=https://painel.nexusai360.com
PORTAINER_TOKEN=<portainer_api_token>
PORTAINER_ENDPOINT_ID=1

# App
APP_VERSION=auto-injected at build (git sha)
```

### 21.3 `.gitignore` (linhas relevantes)
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
- **`docker-compose.yml`** (genérico, vai pro git): usa imagens públicas, sem secrets, sem Traefik labels customizadas (apenas para dev local opcional).
- **`docker-compose.production.yml`** (NÃO vai pro git): imagem `ghcr.io/jvzanini/nexus-insights:latest`, Traefik labels com host `insights.nexusai360.com`, lê `.env.production`.
- Portainer recebe esse `docker-compose.production.yml` como definição de stack.

---

## 22. Estratégia de testes — idêntica à v1

Adições:
- Teste de `withChatwootResilience` com Chatwoot simulado offline.
- Teste de cascade revoke (`UserAccountAccess` cascade).
- Teste de `mustChangePassword` flow.

---

## 23. CI/CD

### 23.1 `.github/workflows/deploy.yml`
1. Trigger: push em `main`.
2. Job `quality`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test -- --coverage`.
3. Job `build` (depende de `quality`): build Docker image, tag `latest` + `sha-<sha>`, push para GHCR.
4. Job `deploy` (depende de `build`): chamada `POST` à API do Portainer:
   - `POST /api/stacks/{id}/git/redeploy` ou `PUT /api/stacks/{id}` com novo compose, dependendo da abordagem.
   - Spera healthcheck verde antes de marcar sucesso.
5. Notification (opcional): post no Slack/Discord (não no MVP).

### 23.2 Secrets do repositório
- `GHCR_TOKEN`
- `PORTAINER_TOKEN`
- `PORTAINER_URL`
- `PORTAINER_ENDPOINT_ID`
- `PORTAINER_STACK_ID` (criada uma vez manualmente; depois reutilizada)

---

## 24. Segurança — idêntica à v1, com nota:
- Senhas temporárias geradas com 16 caracteres alfanuméricos + símbolos (entropia ≥ 96 bits).
- Tokens de reset/email-change: nanoid(32) hashed com bcrypt antes de salvar (`tokenHash`); o token cru só viaja por email uma vez.
- `rate-limit` no `/api/chatwoot/refresh`: 6 cliques/min/user (já mencionado v1).

---

## 25. Limitações conhecidas e roadmap — idêntico à v1

---

## 26. Plano de fases (entregas)

(idêntico à v1, ordem mantida; ver Plan.md para detalhes)

---

## 27. Apêndice A — pontos abertos da v1, agora resolvidos

| Item | Decisão v2 |
|------|-----------|
| Mascarar telefone/CPF para viewer | **Não.** Uso interno; viewer vê dados completos. |
| Command palette ⌘K no MVP | **Sim.** Buscar conversas, atendentes, relatórios. |
| Notification bell no MVP | **Não.** Pós-MVP. |
| Granularidade exclude IA | **Global** via toggle em `/configuracoes`. |
| Heurística "IA não respondeu" | **Validar com dados reais durante implementação**: conversa do inbox 31 onde última mensagem é incoming (Contact) e `last_activity_at` > 5min atrás (parametrizável). |
| Backup do nosso DB | **`pg_dump` diário 4h** (worker), retenção 7 dias, volume `nexus_insights_backups`. |
| `/api/health` | **Incluído** com checks de db/redis/chatwoot. |

---

## 28. Apêndice B — mudanças do que foi acrescentado vs v1

1. **§6.3** — política de revogação em cascata.
2. **§7.3** — comportamento gracioso quando Chatwoot offline.
3. **§8.4** — sync diário de metadados.
4. **§8.5** — backup automático do DB.
5. **§9.2** — toggle global `exclude_matrix_ia_globally`.
6. **§11.3** — fluxo `mustChangePassword` no primeiro login.
7. **§11.4** — fluxo de criação de user com email + senha temporária.
8. **§12.2** — `canDeactivateUser` adicionado.
9. **§12.5** — coluna Status com toggle, ação Reenviar senha.
10. **§19.2** — audit fire-and-forget via fila.
11. **§21.4** — separação stack genérica vs produção.
12. **§23.1** — workflow CI/CD detalhado com Portainer redeploy.

---

**Fim da v2.** Próximo passo: pente-fino #2 (mais profundo) → v3 final.
