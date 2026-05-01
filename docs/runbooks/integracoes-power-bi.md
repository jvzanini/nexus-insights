# Runbook — Integrações Power BI (v0.18.0)

> Operacional do menu **Integrações > Power BI**: pré-requisitos infra,
> sequência de deploy, smoke staging pós-deploy, rollback, troubleshooting.

## 1. Pré-requisitos infra (checklist)

Antes do **primeiro perfil** ser usado em produção, conferir:

### 1.1 DNS
- [ ] A record `db.insights.nexusai360.com` apontando pro IP do servidor Hostinger.
  ```
  db.insights.nexusai360.com → <ip-do-servidor>
  ```

### 1.2 Postgres listen + auth
No `postgresql.conf` (container `db`):
- [ ] `listen_addresses = '*'` (default geralmente é `localhost`).
- [ ] `ssl = on`.
- [ ] `ssl_cert_file = '/etc/letsencrypt/live/db.insights.nexusai360.com/fullchain.pem'`.
- [ ] `ssl_key_file = '/etc/letsencrypt/live/db.insights.nexusai360.com/privkey.pem'`.

No `pg_hba.conf`:
- [ ] `hostssl all all 0.0.0.0/0 scram-sha-256` (TLS obrigatório).

### 1.3 TLS via Let's Encrypt + certbot
```bash
# Primeira emissão:
certbot certonly --standalone -d db.insights.nexusai360.com

# Permissões pro user postgres ler os certs:
chown postgres:postgres /etc/letsencrypt/live/db.insights.nexusai360.com/*.pem
chmod 600 /etc/letsencrypt/live/db.insights.nexusai360.com/privkey.pem

# Renew automático mensal (cron):
0 3 1 * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload postgresql"
```

Após editar postgresql.conf:
```bash
docker exec -it nexus-insights-db pg_ctl reload
# OU
docker restart nexus-insights-db
```

### 1.4 Firewall — IP allowlist
Hostinger panel → Firewall → adicionar regras:
- [ ] Inbound TCP 5432 — só dos IPs que vão conectar (Power BI Desktop dos clientes ou range do Power BI Service Brazil South).
- [ ] OU usar gateway (sem abrir 5432 público).

### 1.5 max_connections
```sql
SHOW max_connections;
-- Se < (atual_uso + 50_perfis_x_5_conn) = 250+, aumentar:
ALTER SYSTEM SET max_connections = 500;
SELECT pg_reload_conf();
```

### 1.6 App role com CREATEROLE
A app precisa criar/dropar usuários Postgres dinâmicos:
```sql
SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user;
-- Se 'f', conceder:
ALTER USER nexus_app WITH CREATEROLE;
```

### 1.7 Pré-agregação ativa
- [ ] `/configuracoes/jobs` (super_admin) mostra last refresh recente em todas dimensões.
- [ ] Se vazio: clicar "Backfill 90 dias".

### 1.8 Variáveis de ambiente (Portainer stack)
- [ ] `INTEGRATION_DB_HOST_PUBLIC=db.insights.nexusai360.com`
- [ ] `INTEGRATION_DB_PORT_PUBLIC=5432`
- [ ] `INTEGRATION_DB_NAME_PUBLIC=nexus_insights`
- [ ] `INTEGRATION_PROFILE_SOFT_CAP=50` (opcional; default 50)

### 1.9 Worker BullMQ
- [ ] Worker container está em UP (Portainer).
- [ ] Logs mostram `[worker] Schedules registered: ... integrations-refresh-dim every 30min, integrations-reconcile every 6h`.

---

## 2. Sequência de deploy v0.18.0

> CI/CD: push em `main` dispara build → GHCR → Portainer auto-redeploy.
> Mas migrations Prisma rodam **manual** — não em runtime.

### 2.1 Sequência segura

1. **PR aprovado e merged em `main`** (ou push direto se autorizado).
2. **CI build** roda (gh run list — aguardar verde).
3. **Aguardar imagem em GHCR**: `ghcr.io/jvzanini/nexus-insights:main`.
4. **Aplicar migration manualmente em prod** (antes do redeploy puxar imagem nova):
   ```bash
   ssh root@<servidor>
   docker exec -it $(docker ps -qf name=nexus-insights_app) npx prisma migrate deploy
   ```
   Esperado: `Migration 20260501_add_integrations_power_bi applied`.
5. **Confirmar status**:
   ```bash
   docker exec -it $(docker ps -qf name=nexus-insights_app) npx prisma migrate status
   ```
   Esperado: `Database schema is up to date`.
6. **Portainer** → stack `nexus-insights` → Update (puxa imagem nova). App reinicia.
7. **Worker** stack idem (puxa nova imagem).
8. `curl https://insights.nexusai360.com/api/health` → `version=0.18.0`.
9. Smoke staging (seção 3).

---

## 3. Smoke staging pós-deploy

| # | Ação | Expected outcome |
|---|------|------------------|
| 1 | Login como super_admin → sidebar mostra "Integrações" | Item visível com ícone Plug |
| 2 | Clicar "Integrações" | Hub `/integracoes` abre com 5 cards (Power BI ativo + 4 "Em breve") |
| 3 | Clicar Power BI → "+ Novo perfil" | Wizard 4 passos abre |
| 4 | Preencher passo 1: nome "smoke-001" | Slug deriva pra `smoke_001` |
| 5 | Passo 2: marcar `chatwoot_facts_daily_by_account` | Continuar habilitado |
| 6 | Passo 3: deixar default | Continuar habilitado |
| 7 | Passo 4: pular filtros | "Criar perfil" habilitado |
| 8 | Submit | Spinner → CredentialsRevealDialog abre com host/port/db/user/senha (mascarada) |
| 9 | Clicar "Mostrar senha completa" | Senha plain aparece + audit log no perfil registra "password_revealed" |
| 10 | Conectar Power BI Desktop com credencial | Navigator mostra `pbi_<8hex>_v_chatwoot_facts_daily_by_account`, Load OK |
| 11 | `psql` com user `pbi_smoke_001_<6>` → `SELECT * FROM users` | ERROR: relation does not exist |
| 12 | `psql` `SELECT * FROM powerbi.chatwoot_facts_daily_by_inbox` | ERROR: permission denied |
| 13 | UI: "Rotacionar senha" | Confirma → senha nova mostrada → tentar Power BI antiga falha |
| 14 | UI: "Desativar" | Status chip vira "Desativado", reconectar falha (NOLOGIN) |
| 15 | UI: "Reativar" | Volta a funcionar |
| 16 | UI: "Editar whitelist" → adicionar coluna | Wizard pré-preenche → salvar → Power BI refresh mostra coluna nova |
| 17 | UI: "Deletar" → digitar nome → confirmar | Redirect lista, perfil desaparece, `\du` em psql admin não mostra mais o user |

---

## 4. Rollback

Se v0.18.0 quebrar produção:

### 4.1 Imediato — voltar pra v0.17.0
1. **Portainer** → stack `nexus-insights` → Service `app` → Update → image tag específica `v0.17.0` (substitui `:main`).
2. Worker idem.
3. Aguardar restart.

### 4.2 Reverter migration
```bash
docker exec -it $(docker ps -qf name=nexus-insights_app) npx prisma migrate resolve --rolled-back 20260501_add_integrations_power_bi
```

### 4.3 SQL cleanup (executar no psql admin)
```sql
DROP SCHEMA powerbi CASCADE;
DROP TABLE IF EXISTS integration_audit_logs;
DROP TABLE IF EXISTS integration_profiles;
DROP TYPE IF EXISTS "IntegrationKind";
DROP TYPE IF EXISTS "IntegrationProfileStatus";
DROP TYPE IF EXISTS "IntegrationAuditEvent";
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM (
  'login_succeeded','login_failed','password_reset_requested','password_reset_completed',
  'user_created','user_updated','user_deleted','user_role_changed',
  'user_access_granted','user_access_revoked','user_activated','user_deactivated',
  'profile_updated','profile_password_changed','email_change_requested','email_change_completed',
  'account_switched','setting_updated','opened_chatwoot_link','session_revoked',
  'credential_created','credential_updated','credential_deleted','credential_tested'
);
ALTER TABLE audit_logs ALTER COLUMN action TYPE "AuditAction" USING action::text::"AuditAction";
DROP TYPE "AuditAction_old";
```

### 4.4 Confirmar
```bash
curl https://insights.nexusai360.com/api/health
```
Esperado: `version=0.17.x`.

---

## 5. Troubleshooting comum

### 5.1 "TLS errors" no Power BI Desktop (Windows)
- Workaround: `Get Data > PostgreSQL > Advanced` → desabilitar "Encrypt connection" (apenas para teste).
- Solução real: validar cert TLS Let's Encrypt + chain CA do Windows.

### 5.2 "ALTER USER permission denied" ao criar perfil
- Causa: app role sem `CREATEROLE`.
- Fix: `ALTER USER nexus_app WITH CREATEROLE;` no Postgres admin.

### 5.3 "Slug duplicado" ao criar perfil
- Causa: dois perfis com mesmo nome derivam slug igual (random suffix raramente colide, mas pode).
- Fix: escolher outro nome.

### 5.4 Snapshot vazio (multi-select de filtros vazio no wizard passo 4)
- Causa: worker `integrations.refresh-dim-snapshots` ainda não rodou.
- Fix: clicar "Atualizar agora" no wizard (chama `triggerDimSyncAction`) OU aguardar próximo ciclo (≤30 min).

### 5.5 "Provisioning failed: timeout" no perfil
- Causa: locks no Postgres (outras conexões travando).
- Diag: `SELECT * FROM pg_locks WHERE NOT granted;` no admin.
- Fix: matar conexão travada (`SELECT pg_terminate_backend(pid) WHERE pid = X;`) → "Repetir provisionamento" no detail.

### 5.6 Power BI Service não conecta ao Gateway
- Conferir: gateway está em UP (status no painel Power BI Service).
- Verificar firewall interno do cliente (gateway precisa acesso saída pro Power BI Service Microsoft + acesso interno ao Postgres).
- Alternativa: acesso direto via internet com IP allowlist + TLS.

---

## 6. Métricas e monitoramento

(v0.18.0 não inclui dashboards de métricas — follow-up v0.19+.)

Comandos manuais úteis:

```sql
-- Conexões ativas por perfil:
SELECT usename, count(*) FROM pg_stat_activity
 WHERE usename LIKE 'pbi_%' GROUP BY usename;

-- Views derivadas existentes:
SELECT viewname FROM pg_views
 WHERE schemaname='powerbi' AND viewname LIKE 'pbi_%' ORDER BY viewname;

-- Snapshots last refresh:
SELECT 'accounts', MAX(refreshed_at) FROM powerbi.dim_accounts_snapshot
UNION ALL SELECT 'inboxes', MAX(refreshed_at) FROM powerbi.dim_inboxes_snapshot
UNION ALL SELECT 'agents', MAX(refreshed_at) FROM powerbi.dim_agents_snapshot
UNION ALL SELECT 'teams', MAX(refreshed_at) FROM powerbi.dim_teams_snapshot;

-- Audit recente (super_admin actions em integrações):
SELECT created_at, action, target_id, details
 FROM audit_logs
 WHERE action LIKE 'integration_%'
 ORDER BY created_at DESC LIMIT 20;
```

---

## 7. Decisões arquiteturais (referência)

Spec completa: `docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md`.
Plan executado: `docs/superpowers/plans/2026-05-01-integracoes-power-bi.md`.

Pontos-chave:
- Banco exposto: **interno (Nexus Insights)**, não Chatwoot.
- Schema isolada `powerbi` + views derivadas por perfil (não RLS nativo).
- 1 user Postgres + senha encriptada AES-256-GCM por perfil.
- 3 caminhos de conexão: Desktop / Service-Gateway / Snippet M.
- Soft cap 50 perfis ativos (configurável via env).
- Audit log per-profile + global (`audit_logs`).
