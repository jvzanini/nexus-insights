# Spec — Menu Integrações + Power BI (v0.17.0) — v3 (final)

**Versão:** v3 — após pente-fino #2 (mais profundo).
**Autor:** claude-integracoes-powerbi
**Data:** 2026-05-01
**Target release:** v0.17.0 (depois da v0.16.0 do agente paralelo).

> **Pente-fino #2 — sumário de mudanças vs v2**
> D1 catch `42710` em CREATE USER (sem TOCTOU race) · D2 password generator com loop explícito · D3 dim sync em transação · D4 fluxo Chatwoot→interno explicitado · D5 sequência exata migration↔redeploy · D6 teste de Tx 3 falha mid-tx · D7 RLS aplica também em dim_accounts/team · D8 transição error→active explícita · D9 UI senha mostra `••••••••` + last4 · D10 BullMQ Redis compartilhado documentado · E1–E10 edge cases (PG name limit, ALTER NOLOGIN + pg_terminate_backend antes de DROP USER, char especial em snippet M, RLS toggle disabled em dims sem account_id, timing de migration em redeploy, BLOCKED_TABLES vs catálogo conflict test, audit preservation em soft-delete, P2002 friendly error, TZ confirmação, Windows TLS workaround) · I1–I5 requisitos implícitos (concurrent edit, soft cap, progress feedback, retention, dangling createdBy) · J1–J4 decisões justificadas · Y1–Y4 dependências (pg-format, ui components check, certbot, monitoramento como follow-up) · X1–X9 cleanup (tests, acessibilidade, redirect after create, dim sync trigger from UI, env var injection, deploy checklist).

---

## 1. Contexto e motivação

João precisa permitir que clientes (e ele mesmo, como super_admin) plugem **Power BI** ao banco de dados do **Nexus Chat** (Chatwoot internamente — manter rebrand "Nexus Chat" em toda copy de UI). Hoje a plataforma serve relatórios prontos via UI; há demanda por **modelagem livre** em ferramentas externas.

Power BI é a primeira integração porque:
- É a ferramenta de BI mais usada no mercado brasileiro (Microsoft).
- Cliente Matrix Fitness Group já tem licença Power BI.
- Conecta nativamente a PostgreSQL via driver Npgsql.

A arquitetura é **plataforma-agnóstica**: o menu "Integrações" (plural) é um catálogo extensível. Power BI é a única implementada na v0.17.0; Looker Studio, Tableau, Excel, Webhooks ficam como **placeholders "em breve"** no hub.

**João é leigo em Power BI.** UI autoexplicativa: super_admin clica "Novo perfil", escolhe o que liberar, recebe credencial + tutorial passo-a-passo. Zero SQL/DDL/M exigido dele.

**Naming na UI** (N1): em qualquer texto visível ao usuário, usar "Nexus Chat" e "Nexus Insights". Não expor "Chatwoot" na UI da v0.17.0.

**Visibilidade:** menu **super_admin only**, hardcoded — sem três níveis. NÃO usar `ReportVisibility`.

---

## 2. Objetivos

### 2.1 Funcionais

- **F1.** Item de menu "Integrações" (Plug, super_admin only).
- **F2.** Hub `/integracoes` com cards (Power BI ativo + 4 placeholders).
- **F3.** Sub-página `/integracoes/power-bi` com lista de **perfis**.
- **F4.** Wizard 4 passos (identificação → tabelas → colunas → filtros). Modo `edit` carrega valores existentes.
- **F5.** Provisioning automático de **usuário PostgreSQL dedicado** + GRANTs/REVOKEs específicos via DDL.
- **F6.** Tela "Como conectar" com 3 abas: **Power BI Desktop**, **Power BI Service / Gateway**, **Snippet M**.
- **F7.** Edição de whitelist (re-provisiona sem trocar senha), regenerar senha, desativar, reativar, deletar.
- **F8.** Audit log completo (timeline per-profile + entries em `audit_logs` global).
- **F9.** ~~Card em `/configuracoes`~~ — removido na v0.17.0 (sidebar suficiente, evita conflito com agente paralelo).

### 2.2 Não-funcionais

- **NF1.** Senha encriptada at-rest (AES-256-GCM com `ENCRYPTION_KEY` reusada).
- **NF2.** Provisioning idempotente.
- **NF3.** Schema do app NUNCA exposto. Power BI vê apenas `powerbi.*`.
- **NF4.** Tabelas sensíveis bloqueadas por `BLOCKED_TABLES_REGEX`.
- **NF5.** Cada perfil com `CONNECTION LIMIT 5`.
- **NF6.** `requireSuperAdmin` + `safeAction` + `logAudit` em toda action.
- **NF7.** `statement_timeout = 30s` em DDL do provisioner.
- **NF8.** Rate limits Redis: `password_revealed` 5×/perfil/dia · `password_rotated` 10×/perfil/dia.
- **NF9.** Optimistic concurrency em edição de perfil (I1) — payload inclui `updatedAt` esperado; mismatch → erro inline "modificado por outro usuário".
- **NF10.** Soft cap 50 perfis ativos por instalação (I2). Configurável via env var `INTEGRATION_PROFILE_SOFT_CAP`. UI bloqueia criação se atingido com mensagem amigável.

---

## 3. Não-objetivos (YAGNI v0.17.0)

- ✗ Outras integrações além de Power BI.
- ✗ Permissão de não-super_admin.
- ✗ Refresh agendado pelo Power BI Service.
- ✗ OData/REST API gateway próprio.
- ✗ Métricas de uso por perfil.
- ✗ Auto-discovery de IP do Power BI Service.
- ✗ Datasets pré-built `.pbit`.
- ✗ Anti-fraude / detecção de leak.
- ✗ Card em `/configuracoes`.
- ✗ SVG ilustrativos no tutorial (texto + Lucide).
- ✗ Política automática de retention de audit log (I4 — follow-up).
- ✗ Monitoramento `pg_stat_activity` automático (Y4 — follow-up; Grafana não está configurado).

---

## 4. Decisões arquiteturais-chave

### 4.1 Banco a expor: **interno (Nexus Insights)**, nunca o Chatwoot

Justificativa inalterada (banco principal é mutável + dados pessoais). **Pré-requisito:** pré-agregação rodando. UI mostra empty state se `chatwoot_facts_daily_by_account` está vazia para todas as accounts.

Trade-off: latência ~5 min, aceitável.

### 4.2 Schema isolada `powerbi` + views

Trade-off declarado: 50 perfis × ~10 views = ~500 views; `pbi_<id>_v_<view>` permite filtragem e housekeeping. `COMMENT ON SCHEMA` documenta o padrão.

### 4.3 Catálogo declarativo (`src/lib/integrations/power-bi/catalog.ts`)

```ts
export const POWER_BI_CATALOG = {
  facts: {
    chatwoot_facts_daily_by_account: {
      label: "Diário por conta",
      description: "Volumes diários por conta (recebidas, resolvidas, abertas).",
      pkColumns: ["account_id", "bucket_date"],  // sempre forçadas
      essentialColumns: ["received", "resolved", "open_at_eod"],  // pré-marcadas no wizard
      allColumns: [
        "account_id", "bucket_date",
        "received", "resolved", "open_at_eod", "pending_at_eod",
        "messages_in", "messages_out", "unique_contacts",
        "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds",
      ],
      hasAccountId: true,    // RLS por account aplicável
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_inbox: { /* ... hasAccountId: true */ },
    chatwoot_facts_daily_by_agent: { /* ... hasAccountId: true */ },
    chatwoot_facts_daily_by_team:  { /* ... hasAccountId: true, hasTeamId: true */ },
    chatwoot_facts_hourly_by_account: { /* ... hasAccountId: true */ },
  },
  dims: {
    dim_accounts: { /* ..., hasAccountId: true */ },     // D7 — RLS aplica
    dim_inboxes:  { /* ..., hasAccountId: true */ },     // D7
    dim_agents:   { /* ..., hasAccountId: true */ },     // D7
    dim_teams:    { /* ..., hasAccountId: true, hasTeamId: true */ },  // D7
    dim_dates:    { /* ..., hasAccountId: false, hasTeamId: false */ }, // calendar — sem RLS
  },
} as const;

export const BLOCKED_TABLES_REGEX = /^(users|accounts|audit_logs|llm_.*|nex_.*|password_reset_tokens|email_change_tokens|app_settings|integration_.*|user_account_access|user_team_access|sessions|verification_tokens)$/;
```

`BLOCKED_TABLES_REGEX` validado em runtime no provisioner (defesa em profundidade vs UI). Teste estático (`X1`/`E6`): nenhum nome em `POWER_BI_CATALOG.facts/dims` casa o regex.

### 4.4 Multi-perfil + RLS

- Whitelist tabelas: subset do catálogo.
- Whitelist colunas: subset por tabela; default = `essentialColumns`; PK forçada.
- RLS via WHERE em view derivada. Aplicável **a TODA tabela liberada que tem `hasAccountId`/`hasTeamId`** (D7) — não só facts. `dim_dates` nunca filtrada (não tem coluna).

### 4.5 Conexão Power BI: 3 caminhos (mesma redação da v2)

### 4.6 Exposição de rede (runbook)

Pré-deploy operacional (responsabilidade do João, runbook):

1. **DNS:** A record `db.insights.nexusai360.com` → IP do servidor Hostinger.
2. **Postgres `listen_addresses = '*'`**.
3. **`pg_hba.conf`:** `hostssl all all 0.0.0.0/0 scram-sha-256`.
4. **TLS cert:** Let's Encrypt + certbot renew job mensal. Carregar em `ssl_cert_file`/`ssl_key_file`.
5. **Firewall:** allowlist por IP (Hostinger panel).
6. **`max_connections`:** verificar (`SHOW max_connections`); subir se necessário.
7. **App role:** confirmar `rolcreaterole=true` no user atual (X2/R1).

UI tem alerta no hub se nenhum perfil existir: "⚠️ Antes de criar perfis, leia `docs/runbooks/integracoes-power-bi.md`".

---

## 5. Schema de dados (Prisma)

```prisma
enum IntegrationKind { power_bi }

enum IntegrationProfileStatus {
  active
  disabled
  error      // sai pra `active` ao re-provisionar com sucesso (D8)
}

enum IntegrationAuditEvent {
  profile_created
  profile_updated
  profile_disabled
  profile_reactivated
  profile_deleted
  password_revealed
  password_rotated
  whitelist_changed
  provisioning_failed
}

model IntegrationProfile {
  id                  String                       @id @default(uuid()) @db.Uuid
  kind                IntegrationKind
  name                String
  description         String?                      @db.Text
  status              IntegrationProfileStatus     @default(active)
  pgUsername          String                       @unique @map("pg_username")
  encryptedPgPassword String                       @map("encrypted_pg_password")
  passwordLast4       String                       @map("password_last4")
  // Whitelist
  allowedTables       Json                         @map("allowed_tables")    // string[]
  allowedColumns      Json                         @map("allowed_columns")   // Record<table, string[]>
  accountIdFilter     Json?                        @map("account_id_filter") // number[] | null
  teamIdFilter        Json?                        @map("team_id_filter")    // number[] | null
  // Provisioning
  lastProvisionedAt   DateTime?                    @map("last_provisioned_at")
  lastProvisionError  String?                      @map("last_provision_error") @db.Text
  // Lifecycle
  createdAt           DateTime                     @default(now()) @map("created_at")
  updatedAt           DateTime                     @updatedAt @map("updated_at")
  createdById         String?                      @db.Uuid @map("created_by_id")
  createdBy           User?                        @relation("IntegrationProfileCreator", fields: [createdById], references: [id])
  disabledAt          DateTime?                    @map("disabled_at")
  deletedAt           DateTime?                    @map("deleted_at") // soft-delete; hard-delete proibido (E7)

  auditEvents IntegrationAuditLog[]

  @@index([kind, status])
  @@index([deletedAt])
  @@map("integration_profiles")
}

model IntegrationAuditLog {
  id        String                  @id @default(uuid()) @db.Uuid
  profileId String                  @db.Uuid @map("profile_id")
  profile   IntegrationProfile      @relation(fields: [profileId], references: [id], onDelete: NoAction)  // E7 — preserva audit em soft-delete
  event     IntegrationAuditEvent
  userId    String?                 @db.Uuid @map("user_id")
  user      User?                   @relation("IntegrationAuditUser", fields: [userId], references: [id])
  details   Json?
  ipAddress String?                 @map("ip_address")
  createdAt DateTime                @default(now()) @map("created_at")

  @@index([profileId, createdAt(sort: Desc)])
  @@map("integration_audit_logs")
}
```

Adicionar à `AuditAction`:
```
integration_profile_created
integration_profile_updated
integration_profile_deleted
integration_password_revealed
integration_password_rotated
integration_provisioning_failed
```

Migration: `20260501<timestamp>_add_integrations_power_bi.sql`. Sufixo único evita colisão de nome com agente paralelo.

---

## 6. Provisioning (DDL dinâmico)

### 6.1 Setup inicial (migration única)

```sql
CREATE SCHEMA IF NOT EXISTS powerbi;

-- Snapshots
CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
  account_id INT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS powerbi.dim_inboxes_snapshot (
  account_id INT NOT NULL,
  inbox_id INT NOT NULL,
  name TEXT NOT NULL,
  channel_type TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, inbox_id)
);
-- ... idem dim_agents (PK account_id+agent_id), dim_teams (PK account_id+team_id)

-- Views públicas (passthrough — colunas EXPLÍCITAS, nunca *)
CREATE OR REPLACE VIEW powerbi.dim_accounts AS
  SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
  SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot;
-- ... idem outras dims

CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
  SELECT account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
  FROM public.chatwoot_facts_daily_by_account;
-- ... idem demais facts

-- dim_dates calendar
CREATE OR REPLACE VIEW powerbi.dim_dates AS
  SELECT
    d::DATE AS bucket_date,
    EXTRACT(YEAR FROM d)::INT AS year,
    EXTRACT(MONTH FROM d)::INT AS month,
    EXTRACT(DAY FROM d)::INT AS day,
    EXTRACT(DOW FROM d)::INT AS day_of_week,
    EXTRACT(WEEK FROM d)::INT AS iso_week,
    TO_CHAR(d, 'TMMonth') AS month_name_pt
  FROM generate_series('2024-01-01'::DATE, '2030-12-31'::DATE, '1 day') AS d;

COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_account IS 'v1 (2026-05-01)';
COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
```

### 6.2 Por perfil (3 transações)

**Tx 1 — User Postgres (CREATE/ALTER) — sem PL/pgSQL (D1):**

Cliente Node tenta `CREATE USER`; se erro `42710` (duplicate_object), faz `ALTER USER`:

```ts
async function ensurePgUser(client, username, password) {
  try {
    await client.query(format(
      'CREATE USER %I WITH PASSWORD %L CONNECTION LIMIT 5 LOGIN',
      username, password
    ));
  } catch (err) {
    if (err.code === '42710') {  // duplicate_object
      await client.query(format(
        'ALTER USER %I WITH PASSWORD %L CONNECTION LIMIT 5 LOGIN',
        username, password
      ));
    } else throw err;
  }
}
```

CREATE/ALTER fora de transação DDL (são cluster-level, transacional só desde 9.0 mas com caveats).

**Tx 2 — Drop views antigas:**

```sql
BEGIN;
-- Cliente Node descobre nomes:
SELECT viewname FROM pg_views
 WHERE schemaname='powerbi' AND viewname LIKE 'pbi_<id>_v_%';

-- Cliente Node monta o DROP:
DROP VIEW IF EXISTS powerbi.pbi_<id>_v_<each> CASCADE;
COMMIT;
```

**Tx 3 — Create views derivadas + GRANTs:**

```sql
BEGIN;
-- Para cada (table, columns, hasAccountId, hasTeamId, accountFilter, teamFilter):
CREATE VIEW powerbi.pbi_<id>_v_<table> AS
  SELECT <columns>
  FROM powerbi.<table>
  WHERE
    -- (D7) RLS aplicável conforme catálogo + filtros do perfil
    (NOT <hasAccountId> OR account_id IN (<accountFilter>))
    AND
    (NOT <hasTeamId> OR team_id IN (<teamFilter>));

GRANT USAGE ON SCHEMA powerbi TO <user>;
GRANT SELECT ON powerbi.pbi_<id>_v_<table> TO <user>;
COMMIT;
```

(Quando filtro inativo, predicate é `TRUE` — gerar SQL sem WHERE pra views sem RLS.)

**Em qualquer falha:** `status='error'`, `lastProvisionError` populado, audit `provisioning_failed`. UI mostra "Repetir provisionamento".

**Em retry com sucesso:** `status='active'`, `lastProvisionError=null`, audit `whitelist_changed` (D8).

**Quoting:** sempre via `pg-format` (npm `pg-format` — Y1) ou função própria estilo `quote_ident`/`quote_literal`. **Zero** string concatenation em DDL.

### 6.3 Desativar / reativar / deletar (E2)

**Desativar:**
```sql
BEGIN;
REVOKE ALL ON SCHEMA powerbi FROM <user>;
ALTER USER <user> WITH NOLOGIN;
COMMIT;
-- Power BI Desktop conexões em curso: kill após NOLOGIN
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = <user>;
```

**Reativar:**
```sql
BEGIN;
ALTER USER <user> WITH LOGIN CONNECTION LIMIT 5;
GRANT USAGE ON SCHEMA powerbi TO <user>;
-- Re-grant em views existentes:
SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname LIKE 'pbi_<id>_v_%';
GRANT SELECT ON powerbi.pbi_<id>_v_<each> TO <user>;
COMMIT;
```

**Deletar (soft + cleanup):**
```sql
-- 0) audit row criado ANTES (preserva trilha)
INSERT INTO integration_audit_logs (...) VALUES (..., 'profile_deleted', ...);

-- 1) Kill conexões ativas
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = <user>;

-- 2) DROP views (DROP USER falha com objects owned)
SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname LIKE 'pbi_<id>_v_%';
DROP VIEW IF EXISTS powerbi.pbi_<id>_v_<each> CASCADE;

-- 3) DROP USER
DROP USER IF EXISTS <user>;

-- 4) Soft-delete na app DB
UPDATE integration_profiles SET deleted_at = now(), status = 'disabled' WHERE id = $1;
```

**Hard delete proibido** (E7) — `IntegrationAuditLog.profile` fica preservado mesmo com `profile.deletedAt` set.

### 6.4 Worker `integrations.refresh-dim-snapshots` (D3, D4)

Cron `*/30 * * * *`, BullMQ `concurrency: 1`.

Fluxo (D4):
1. Para cada dim, `chatwootQuery` (read no Chatwoot) **sem transação** (read-only).
2. Resultados → `pgPool.query` (escrita no banco interno) **dentro de transação** (D3):

```sql
BEGIN;
INSERT INTO powerbi.dim_accounts_snapshot (account_id, name, status, refreshed_at)
VALUES <rows>
ON CONFLICT (account_id)
DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, refreshed_at=EXCLUDED.refreshed_at;

DELETE FROM powerbi.dim_accounts_snapshot
 WHERE refreshed_at < now() - INTERVAL '1 hour';
COMMIT;
```

Try/catch por dim. Errors agregados no job result.

### 6.5 Reconciliação periódica (defesa contra drift)

Job adicional `integrations.reconcile` (cron `0 */6 * * *`):
- Lê todos os perfis com `status != 'disabled'` no DB app.
- Pra cada um, verifica em `pg_roles` se o user existe (e tem LOGIN) e em `pg_views` se as views derivadas existem.
- Drift detectado → `status='error'` + audit `provisioning_failed` + Slack notification (se configurado).

---

## 7. Frontend

### 7.1 Estrutura de rotas

```
/integracoes                          (hub)
/integracoes/power-bi                 (lista + Dialog wizard)
/integracoes/power-bi/[id]            (detalhe + reabre wizard em modo edit)
/integracoes/power-bi/[id]/conectar   (3 abas)
```

### 7.2 Hub `/integracoes`

5 cards (Power BI ativo + 4 placeholders). Banner topo se nenhum perfil + nenhuma pré-agregação rodando: "⚠️ Pré-requisitos: ler runbook + confirmar pré-agregação ativa".

### 7.3 `/integracoes/power-bi`

Tabela de perfis (Nome, Status, # Tabelas, Filtros, Criado em, Ações). Filtros de status. Botão "+ Novo perfil" (Dialog wizard). Soft cap: se 50 perfis ativos, botão desabilitado com tooltip "Limite atingido: edite/desative perfil existente".

Empty state: ilustração simples + CTA.

### 7.4 Wizard "Novo perfil" / "Editar perfil" (Dialog)

**Layout:** Dialog `max-w-3xl max-h-[90vh] overflow-y-auto`. Topo: progress bar 4 segmentos. Footer: Voltar / Continuar; último passo: "Criar perfil" / "Salvar alterações".

**Modo `edit`:** componente identica; carrega `initial`; submit chama `updateProfileAction(id, ...)` com `expectedUpdatedAt` (NF9 — optimistic concurrency).

**Passo 1 — Identificação**
- Nome (max 60, regex `^[A-Za-z0-9 _\-]{3,60}$`).
- Descrição (max 280).
- Slug **derivado readonly** (J1 — visível pra super_admin entender o naming): lower-case, `[^a-z0-9]` → `_`, `_+` → `_`, max 30 chars. Sufixo `_<6char hex>` adicionado automaticamente.
- Erro inline P2002 (E8): "Nome já existe — escolha outro".
- Erro inline (concurrent edit, NF9): "Perfil modificado por outro super_admin. Recarregue a página."

**Passo 2 — Tabelas**
- Checkboxes agrupadas (Fatos diários / por hora / Dimensões).
- Tooltips com descrição do catálogo.
- Botões "Selecionar tudo" / "Selecionar fatos diários" / "Limpar".
- Validação: ≥ 1 tabela.

**Passo 3 — Colunas**
- Accordion por tabela.
- Default: `essentialColumns` pré-marcadas; PK forçadas (não desmarcáveis).
- Validação: ≥ 1 coluna por tabela.

**Passo 4 — Filtros (RLS)**
- Toggle "Filtrar por contas" → MultiSelect `dim_accounts_snapshot` (X7 — botão "Atualizar lista" dispara `triggerDimSyncAction`).
- Toggle "Filtrar por times" → MultiSelect `dim_teams_snapshot`.
- **Toggles disabled** (E4) se nenhuma das tabelas selecionadas no passo 2 tem `hasAccountId`/`hasTeamId`. Tooltip explica.
- Empty state nos selects se snapshots vazios.

**Submit (modo create):**
- Spinner com texto evolutivo (I3): "Criando user Postgres…" → "Aplicando GRANTs…" → "Gerando snippets…". Implementação: status flag em response da action ou progress polling SSE.
- Sucesso → redirect `/integracoes/power-bi/[id]` com toast (X5) + Dialog credencial **abre na detail page**:
  ```
  Perfil criado com sucesso ✅

  Host:    db.insights.nexusai360.com
  Porta:   5432
  Banco:   nexus_insights
  Usuário: pbi_diretoria_a3f8c2
  Senha:   ••••••••3f8c2  [Mostrar senha completa] (registra audit)

  Salve essa senha agora. Você poderá revelá-la depois,
  mas isso fica registrado no audit log do perfil.

  Conexão TLS obrigatória.

  [Copiar tudo]  [Ver tutorial de conexão]
  ```

**Submit (modo edit):**
- Spinner: "Atualizando whitelist…".
- Sucesso → toast verde "Whitelist atualizada. Conexões Power BI ativas continuarão usando o esquema antigo até a próxima refresh — pode demorar alguns minutos pra refletir." (X6).

### 7.5 `/integracoes/power-bi/[id]` (detalhe)

- Card 1 (Resumo): status chip + criado por + criado em + last provisioned + erro (se status=error). Banner amarelo se `error`: "Provisionamento falhou. [Repetir]".
- Card 2 (Whitelist): tabelas/colunas/filtros + botão "Editar whitelist".
- Card 3 (Credenciais): host/porta/banco + user + last4 senha + botão "Mostrar senha completa" (rate-limited, audit) + botão "Rotacionar senha".
  - **UI senha** (D9): "Senha: `••••••••a3f8` `[👁 Mostrar]` `[↻ Rotacionar]`".
- Card 4 (Auditoria): timeline com event chip + user + timestamp + details JSON.
- Botões topo: "Conectar" / "Desativar"|"Reativar" / "Deletar".

### 7.6 `/integracoes/power-bi/[id]/conectar`

**Aba 1 (Power BI Desktop)** — passos numerados (1–7) com Lucide icon ao lado (`Download`, `Database`, `Server`, `KeyRound`, `Lock`, `CheckCircle`). `<pre>` com server/port/database/user. Senha hidden + botão "Mostrar".

**Footer da Aba 1:** nota Windows TLS workaround (E10): "Se aparecer erro de TLS, abra `Get Data > PostgreSQL > Advanced` e desabilite 'Encrypt connection' (apenas para teste — em produção use Gateway)".

**Aba 2 (Power BI Service / Gateway)** — recomendação default Gateway. Passos. Box separado "Acesso direto via internet" com aviso. Recomendação adicional: "Use Gateway sempre que possível — a credencial não fica salva no `.pbix` que pode ser compartilhado" (R3).

**Aba 3 (Snippet M)** — accordion: 1 bloco por view derivada do perfil. Botão Copy. Header: "Cole no Power Query Editor → Avançado". Snippet **NÃO inclui senha inline** (E3) — usa form Auth do PG.

### 7.7 Sidebar

Item entre "Agente Nex" e "Usuários", **sem children**:

```ts
{
  label: "Integrações",
  href: "/integracoes",
  icon: Plug,
  superAdminOnly: true,
  section: "admin",
}
```

### 7.8 Acessibilidade (X3)

- Todos os botões com `aria-label` descritivo.
- Tutorial passos numerados visíveis a screen readers (`<ol>` semântico).
- Foco visível (ring violet) em todos os interactive elements.
- Modal Dialog usa `aria-modal=true` (já default no base-ui).
- Cores: status chip também tem texto, não só cor (ex: "🟢 Ativo" = `<Check />` + "Ativo").

---

## 8. Componentes (boundary)

```
src/components/integracoes/
  integrations-hub-card.tsx
  power-bi/
    profile-list.tsx
    profile-list-empty.tsx
    profile-row-actions.tsx
    profile-wizard-dialog.tsx
    wizard-step-identity.tsx
    wizard-step-tables.tsx
    wizard-step-columns.tsx
    wizard-step-filters.tsx
    wizard-progress-bar.tsx
    profile-summary-card.tsx
    profile-whitelist-card.tsx
    profile-credentials-card.tsx
    profile-audit-timeline.tsx
    credentials-reveal-dialog.tsx
    rotate-password-dialog.tsx
    delete-profile-dialog.tsx
    connect-tabs.tsx
    connect-desktop-tab.tsx
    connect-service-tab.tsx
    connect-snippet-tab.tsx
    snippet-block.tsx
```

```
src/lib/actions/
  integrations.ts
  integrations-power-bi.ts

src/lib/integrations/
  registry.ts
  power-bi/
    catalog.ts
    provisioner.ts
    sql-builders.ts
    password-generator.ts
    m-snippet-generator.ts
    dim-sync.ts

src/worker/jobs/integrations/
  refresh-dim-snapshots.ts
  reconcile-integrations.ts
```

**Pré-requisitos UI (Y2):** verificar se `src/components/ui/tooltip.tsx`, `multi-select.tsx`, `accordion.tsx`, `progress.tsx` existem. Se não, criar seguindo pattern base-ui antes de cada task que precisar.

---

## 9. Segurança

### 9.1 Defesa em camadas (10 camadas) — mesma da v2

### 9.2 Validações Server Action — mesmas da v2

### 9.3 Charset de senha (D2 — implementação correta)

```ts
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
// Sem 0/O/I/l/1 (ambíguos visualmente)

export function generatePassword(): string {
  const bytes = randomBytes(64);
  let pwd = "";
  for (let i = 0; i < 32; i++) {
    pwd += CHARSET[bytes[i] % CHARSET.length];
  }
  return pwd;
}
```

Tem viés módulo desprezível (charset 60 chars, 256/60 ≈ 4.27 — viés ~6% no último valor). Aceitável pra senha dedicada.

### 9.4 Erros de provisioning — mesma da v2 + reconciliação (§6.5)

### 9.5 Decisões justificadas (J1–J4)

- **Slug readonly visível** (J1): super_admin precisa entender o naming pattern do user Postgres pra debug.
- **Cron 30 min para dim sync** (J2): contas/inboxes/agents mudam raramente; 30 min é o compromisso entre frescor e load no `chatwoot_leitura`.
- **Dialog vs rota dedicada** (J3): wizard como Dialog preserva contexto da lista por baixo + fechamento sem perder URL state.
- **Reuso `ENCRYPTION_KEY`** (J4): simplicidade > compartimentalização. Trade-off: comprometimento da chave compromete LLM keys + integration passwords. Aceito porque a chave já é high-value.

---

## 10. Testes

### 10.1 Unitários (Jest)

- `src/lib/integrations/power-bi/sql-builders.test.ts` — golden snapshots de cada builder + quoting + RLS predicate construction.
- `src/lib/integrations/power-bi/catalog.test.ts` — `BLOCKED_TABLES_REGEX` (cobertura de tabelas reais), `validateAllowlist`, `essentialColumns ⊂ allColumns` para cada entry, NÃO conflict catálogo↔BLOCKED (X1).
- `src/lib/integrations/power-bi/password-generator.test.ts` — 32 chars, charset, sem ambíguos, 1000 calls sem duplicate.
- `src/lib/integrations/power-bi/m-snippet-generator.test.ts` — host/banco/view; sem senha inline (E3); escapa quotes.
- `src/lib/integrations/power-bi/provisioner.test.ts` — happy path, retry idempotente, edit preserva pgUsername (T2), delete ordem correta (P5), Tx 3 falha mid-tx → status=error (D6).
- `src/lib/actions/integrations-power-bi.test.ts` — guard, safeAction, audit, validation, BLOCKED reject (T1), edit preserva pgUsername (T2), rate limit 5×/dia, optimistic concurrency rejects stale `expectedUpdatedAt` (NF9), P2002 friendly error (E8).
- `src/components/integracoes/power-bi/*.test.tsx` — wizard 4 steps + validação progressiva, BLOCKED não aparece em wizard step 2 (X1), reveal dialog rate-limit, connect tabs, mode=edit preenche valores, RLS toggles disabled quando incompatível (E4), snippet M sem senha inline.

### 10.2 Smoke staging (T3) — runbook

Tabela inalterada da v2 (9 etapas com expected outcomes claros).

---

## 11. Plano de release & versionamento

### 11.1 Migration & versionamento

- `20260501<timestamp>_add_integrations_power_bi.sql`.
- Versionamento de views: comentário `'v1 (2026-05-01)'`.
- Mudança futura → `v2` + script de migração que itera perfis e re-cria views derivadas.

### 11.2 Sequência exata de deploy (D5, E5)

> **Crítico:** o cliente Prisma é gerado durante o `next build` no CI. Sem isso, query typed em `prisma.integrationProfile` quebra. Migration manual pode rodar antes ou depois do build, MAS o redeploy do app só pode acontecer DEPOIS da migration.

Ordem segura:

1. **Push para `main`** (ou PR aprovado e merged).
2. **CI build** roda `prisma generate && next build`. Imagem nova fica em GHCR.
3. **Apenas com imagem pronta**: João roda manualmente
   ```bash
   docker exec -it <app-container-running-old-image> npx prisma migrate deploy
   ```
   Migration aplicada ao Postgres app.
4. **Portainer redeploy** (puxa imagem nova). App reinicia com client novo + schema novo.
5. **Worker redeploy** (junto). BullMQ jobs novos disponíveis.
6. **Smoke staging** (§10.2).

Documentar tudo em `docs/runbooks/integracoes-power-bi.md`.

### 11.3 Variáveis de ambiente novas (O1)

```env
INTEGRATION_DB_HOST_PUBLIC=db.insights.nexusai360.com
INTEGRATION_DB_PORT_PUBLIC=5432
INTEGRATION_DB_NAME_PUBLIC=nexus_insights
INTEGRATION_PROFILE_SOFT_CAP=50
```

UI lê via Server Component (X8) — NUNCA expor `process.env` ao client.

Sem nova chave de encryption (reusa `ENCRYPTION_KEY`).

### 11.4 Rollback

1. Portainer revert imagem para v0.16.x.
2. SQL pré-escrito:
   ```sql
   DROP SCHEMA powerbi CASCADE;
   DROP TABLE integration_audit_logs;
   DROP TABLE integration_profiles;
   ALTER TYPE audit_action DROP VALUE 'integration_profile_created';
   -- ... idem demais valores
   ```
3. `npx prisma migrate resolve --rolled-back 20260501<timestamp>`.
4. Confirmar `/api/health` retornado para v0.16.x.

### 11.5 Pré-requisitos de deploy (X9)

Checklist em `docs/runbooks/integracoes-power-bi.md`:

- [ ] App Postgres user tem `rolcreaterole=true` (ou criar role `nexus_admin` separada).
- [ ] DNS `db.insights.nexusai360.com` configurado.
- [ ] `pg_hba.conf` com `hostssl` para `0.0.0.0/0` ou allowlist.
- [ ] TLS cert Let's Encrypt instalado.
- [ ] `listen_addresses = '*'` no postgresql.conf.
- [ ] `max_connections` ≥ atual + (50 × 5) = +250 (soft cap × CONNECTION LIMIT).
- [ ] Pré-agregação ativa (`/configuracoes/jobs` mostra last refresh recente).
- [ ] Worker BullMQ rodando.
- [ ] Variables de env definidas no `.env` produção.

---

## 12. Riscos e mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| App não tem CREATEROLE | Bloqueia provisioning (X2) | Pre-deploy check via runbook; criar role `nexus_admin` se necessário |
| Conexão direta 5432 expõe DB | Surface attack | TLS + IP allowlist + senha forte; recomendação Gateway |
| Power BI cliente vaza credencial em .pbix | Acesso não autorizado | Rotação manual + audit; recomendação Gateway (cred não salva inline) |
| Schema Chatwoot muda → snapshot quebra | Dim_* desatualizada | Dim sync log + UI mostra "snapshot last refresh"; alarme se > 2h |
| 50+ perfis → connection pool esgota | Lock no DB | CONNECTION LIMIT 5 + soft cap 50 + reconcile job |
| TLS cert expira | Power BI cai | Certbot renew mensal + alarme 7 dias antes |
| Provisioner deixa state inconsistente | UI status divergente | Reconcile job (§6.5) detecta drift |
| Slug colide (race) | Erro Server Action | Unique constraint + P2002 friendly error |
| Migration roda durante traffic | Lock breve em DDL | Janela curta de manutenção (<1s pra CREATE TABLE); avisar usuários |
| Edição concorrente de perfil | Last write wins → confusão | NF9 optimistic concurrency com `expectedUpdatedAt` |

---

## 13. Decisões fechadas (autorizadas pelo João)

1. ✅ Banco interno (não Chatwoot principal).
2. ✅ Schema isolada `powerbi` + views derivadas (não RLS nativo).
3. ✅ Multi-perfil (1 user Postgres por perfil).
4. ✅ RLS via WHERE em view derivada (aplicada em facts E dims com account_id/team_id).
5. ✅ Conexão: 3 caminhos (Desktop / Gateway / Snippet M).
6. ✅ Visibilidade: super_admin only, hardcoded.
7. ✅ Migration Prisma (não runtime ensure).
8. ✅ Worker dim sync 30 min com UPSERT em transação.
9. ✅ TLS obrigatório.
10. ✅ Single-spec, multi-fase no plan.
11. ✅ Sidebar **sem children** (hub é navegação primary).
12. ✅ Sem card em `/configuracoes` na v0.17.0.
13. ✅ Reusa `ENCRYPTION_KEY`.
14. ✅ CONNECTION LIMIT 5.
15. ✅ Charset senha sem chars ambíguos (60 chars).
16. ✅ Tx separadas (CREATE USER fora; DDL transacional).
17. ✅ DROP VIEW por prefixo via `pg_views`.
18. ✅ DROP VIEW antes DROP USER + `pg_terminate_backend`.
19. ✅ UPSERT em dim sync.
20. ✅ BullMQ concurrency=1 no dim sync + reconcile.
21. ✅ Naming UI "Nexus Chat".
22. ✅ Optimistic concurrency em edit (NF9).
23. ✅ Soft cap 50 perfis (NF10).
24. ✅ Hard delete proibido (E7).
25. ✅ CREATE USER com catch `42710` (D1).

---

## 14. Coordenação multi-agente

- Outro agente: `claude-nex-suite-refinement` (v0.16.0).
- Conflito potencial: `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `prisma/schema.prisma`, `src/app/(protected)/configuracoes/page.tsx`.
- Mitigação:
  - Spec/plan em arquivos próprios (sem conflito agora).
  - Implementação aguarda v0.16.0 LIVE em prod.
  - Migration nomeada com sufixo único `_integrations_power_bi`.
  - Não toca em `configuracoes/page.tsx` (decisão).
  - Polling: `gh run list --limit 5` + `ls docs/agents/active/` a cada 5–10 min.
  - Quando v0.16.0 LIVE: `git pull --rebase`, bumpar pra 0.17.0, prosseguir.

---

## 15. Próximos passos

- Aprovação implícita do João (autonomia autorizada).
- `superpowers:writing-plans` → plan v1 → review #1 → v2 → review #2 → v3 final.
- Aguardar v0.16.0 LIVE.
- `superpowers:subagent-driven-development` com:
  - `superpowers:test-driven-development` por task.
  - `ui-ux-pro-max:ui-ux-pro-max` invocada **em CADA task de UI** (controlador E subagentes).
  - Pré-requisitos UI verificados antes de codar.
- `superpowers:verification-before-completion` antes de declarar feito.
- `superpowers:requesting-code-review` no auto-review.
- Push prod (sequência §11.2).
- `superpowers:finishing-a-development-branch`.
- Avisar João pra testar (smoke staging script §10.2).
