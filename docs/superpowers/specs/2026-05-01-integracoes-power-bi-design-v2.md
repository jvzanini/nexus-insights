# Spec — Menu Integrações + Power BI (v0.17.0) — v2

**Versão:** v2 (após pente-fino #1 — 41 achados aplicados).
**Autor:** claude-integracoes-powerbi
**Data:** 2026-05-01
**Target release:** v0.17.0 (depois de v0.16.0 do agente paralelo).

> **Pente-fino #1 — sumário de mudanças vs v1**
> A1 PL/pgSQL `$1`/`$2` não funciona em DO blocks → reescrever sem PL/pgSQL · A2 dependência de pré-agregação populada · A3 declarar trade-off de poluição de schema · A4 CREATE ROLE fora da BEGIN · A5 dim sync com UPSERT · A6 detalhar exposure de rede · A7 remover `expired` enum · A8/A9 relations Prisma · S1 connection limit 5 (não 2) · S2 TLS cert via Let's Encrypt · S3 transformação slug · S4 enum `error` em status · S5 rate limit em rotação · S6 timeout no provisioning · S7 charset senha sem ambíguos · S8 reuso de `ENCRYPTION_KEY` · U1 wizard com progress bar · U2 colunas pré-marcadas selectivamente · U3 empty state em RLS · U4 corrigir copy de "única vez" · U5 modo edit do wizard · U6 ASCII/Lucide em vez de SVGs · U7 cancelar card em /configuracoes (sidebar suficiente) · U8 sidebar sem children · U9 erros inline no wizard · P1 remover GRANT redundante · P2 SELECT explícito de colunas · P3 DROP VIEW por prefixo · P4 GRANT USAGE idempotente · P5 ordem DROP VIEW antes DROP USER · P6 concurrency=1 · P7 swap de tabela em vez de TRUNCATE · T1/T2/T3 testes adicionais · R1/R2/R3 riscos novos · C1/C2 coordenação · N1 naming "Nexus Chat" UI · N3 sidebar simplificada · O1–O7 vars env, migrations, rollback, versioning views, etc.

---

## 1. Contexto e motivação

João precisa permitir que clientes (e ele mesmo, como super_admin) plugem **Power BI** ao banco de dados do **Nexus Chat** (Chatwoot internamente — manter rebrand "Nexus Chat" em toda copy de UI). Hoje a plataforma serve relatórios prontos via UI; há demanda por **modelagem livre** em ferramentas externas.

Power BI é a primeira integração porque:
- É a ferramenta de BI mais usada no mercado brasileiro (Microsoft).
- Cliente Matrix Fitness Group já tem licença Power BI.
- Conecta nativamente a PostgreSQL via driver Npgsql.

A arquitetura é **plataforma-agnostica**: o menu "Integrações" (plural) é um catálogo extensível. Power BI é a única implementada na v0.17.0; Looker Studio, Tableau, Excel, Webhooks ficam como **placeholders "em breve"** no hub.

**João é leigo em Power BI.** UI autoexplicativa: super_admin clica "Novo perfil", escolhe o que liberar, recebe credencial + tutorial passo-a-passo. Zero SQL/DDL/M exigido dele.

**Naming na UI** (N1): em qualquer texto visível ao usuário, falar "Nexus Chat" e "Nexus Insights". Não expor "Chatwoot" na UI da v0.17.0 (mantemos `chatwoot_*` como nome técnico interno e nas tabelas reais — esse rebrand cosmético acontece só na camada de copy).

**Visibilidade:** menu **super_admin only**, sem três níveis (decisão final do João — corrigiu pedido inicial). Hard-coded `superAdminOnly: true` no item de navegação. NÃO usar pattern `ReportVisibility`.

---

## 2. Objetivos

### 2.1 Funcionais

- **F1.** Novo item de menu "Integrações" (Plug, super_admin only).
- **F2.** Hub `/integracoes` com cards (Power BI ativo + 4 placeholders "em breve").
- **F3.** Sub-página `/integracoes/power-bi` com lista de **perfis**.
- **F4.** Wizard de criação em 4 passos: identificação → tabelas → colunas → filtros (RLS opcional). Modo `edit` carrega valores existentes (U5).
- **F5.** Provisioning automático de **usuário PostgreSQL dedicado** + GRANTs/REVOKEs específicos via DDL ao salvar.
- **F6.** Tela "Como conectar" com 3 abas: **Power BI Desktop**, **Power BI Service / Gateway**, **Snippet M**.
- **F7.** Edição de whitelist (re-provisiona sem trocar senha), regenerar senha, desativar (REVOKE ALL + NOLOGIN), reativar, deletar (DROP USER + soft-delete).
- **F8.** Audit log completo (per-profile timeline + entries em `audit_logs` global).
- **F9.** ~~Card "Integrações" em `/configuracoes`~~ — **removido na v0.17.0** (U7) pra não conflitar com o agente paralelo. Sidebar é navegação suficiente.

### 2.2 Não-funcionais

- **NF1.** Senha encriptada at-rest (AES-256-GCM, mesma `ENCRYPTION_KEY` do projeto — S8). Renderização requer clique + audit + rate limit.
- **NF2.** Provisioning idempotente.
- **NF3.** Schema do app NUNCA exposto. Power BI vê apenas schema `powerbi`.
- **NF4.** Tabelas sensíveis bloqueadas por **allowlist no código** (`BLOCKED_TABLES`), não por confiança em "o admin não vai marcar".
- **NF5.** Cada perfil com `CONNECTION LIMIT 5` (S1 — Power BI Desktop abre múltiplas conexões em Import; 2 dava deadlock).
- **NF6.** Toda action protegida por `requireSuperAdmin` + `safeAction` + `logAudit`.
- **NF7.** `statement_timeout = 30s` em todas as queries DDL do provisioner (S6).
- **NF8.** Rate limits Redis: `password_revealed` 5×/perfil/dia, `password_rotated` 10×/perfil/dia (S5).

---

## 3. Não-objetivos (YAGNI v0.17.0)

- ✗ Outras integrações (placeholders "em breve").
- ✗ Permissão de não-super_admin.
- ✗ Refresh agendado pelo Power BI Service (apenas docs).
- ✗ OData/REST API gateway próprio.
- ✗ Métricas de uso por perfil.
- ✗ Auto-discovery de IP do Power BI Service.
- ✗ Datasets pré-built `.pbit`.
- ✗ Anti-fraude / detecção de leak (rotação manual).
- ✗ Card em `/configuracoes` (U7).
- ✗ SVG ilustrativos no tutorial (U6 — usar texto numerado + Lucide).

---

## 4. Decisões arquiteturais-chave

### 4.1 Banco a expor: **interno (Nexus Insights), nunca o Chatwoot principal**

Mesmo justificativa da v1. **Pré-requisito (A2):** o pipeline de pré-agregação (BullMQ) precisa estar rodando. Documentar no runbook: `/configuracoes/jobs` → "Backfill 90 dias" antes do primeiro perfil ser útil. Adicionar empty state na UI: quando `chatwoot_facts_daily_by_account` estiver vazia para todas as accounts, exibir banner "Aguardando primeira pré-agregação — acesse `/configuracoes/jobs`".

Trade-off: latência ~5 min vs simplicidade + segurança.

### 4.2 Schema isolada `powerbi` + views

Mesma estratégia. **Trade-off declarado (A3):** com 50 perfis × 10 views = ~500 views. Nomenclatura `pbi_<id>_v_<view>` permite filtragem em `\dv powerbi.pbi_<id>_*` para housekeeping. Migration final inclui comentário SQL `COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table)'`.

### 4.3 Catálogo de tabelas/colunas expostas (v0.17.0)

**Fatos** (5):
- `chatwoot_facts_daily_by_account`
- `chatwoot_facts_daily_by_inbox`
- `chatwoot_facts_daily_by_agent`
- `chatwoot_facts_daily_by_team`
- `chatwoot_facts_hourly_by_account`

**Dimensões** (5 — todas a criar):
- `dim_accounts`
- `dim_inboxes`
- `dim_agents`
- `dim_teams`
- `dim_dates`

**Catálogo declarativo (O6).** Em `src/lib/integrations/power-bi/catalog.ts`:

```ts
export const POWER_BI_CATALOG = {
  facts: {
    chatwoot_facts_daily_by_account: {
      label: "Diário por conta",
      description: "Volumes diários (recebidas, resolvidas, abertas, etc.) agrupados por conta.",
      pkColumns: ["account_id", "bucket_date"],
      essentialColumns: ["received", "resolved", "open_at_eod"],  // pré-marcadas no wizard (U2)
      allColumns: ["account_id", "bucket_date", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
    },
    // ...
  },
  dims: {
    dim_accounts: {
      label: "Contas",
      description: "Lista de contas Nexus Chat (snapshot atualizado a cada 30 min).",
      pkColumns: ["account_id"],
      essentialColumns: ["account_id", "name"],
      allColumns: ["account_id", "name", "status"],
    },
    // ...
  },
} as const;

export const BLOCKED_TABLES_REGEX = /^(users|accounts|audit_logs|llm_.*|nex_.*|password_reset_tokens|email_change_tokens|app_settings|integration_.*|user_account_access|user_team_access|email_change_tokens|sessions|verification_tokens)$/;
```

`BLOCKED_TABLES_REGEX` testado em runtime no provisioner mesmo após whitelist UI (defesa em profundidade).

### 4.4 Multi-perfil + RLS

Cada perfil = um usuário Postgres `pbi_<slug>_<6char>` + senha aleatória + GRANTs específicos.

- **Whitelist tabelas:** subset do catálogo.
- **Whitelist colunas:** subset por tabela; default = `essentialColumns`, super_admin pode acrescentar de `allColumns` (U2).
- **RLS por filtro fixo:** `WHERE account_id IN (...)` ou `WHERE team_id IN (...)` injetado na view derivada do perfil. Empty state se snapshot ainda não rodou (U3).

PostgreSQL **Row-Level Security nativo NÃO é usado** (raciocínio inalterado).

### 4.5 Conexão Power BI: 3 caminhos

#### Caminho 1: Power BI Desktop (mais simples)

1. Open Power BI Desktop.
2. Get Data → PostgreSQL database.
3. Server: `db.insights.nexusai360.com` Port: `5432`.
4. Database: `nexus_insights`.
5. Auth: Database. User: `pbi_<slug>_<6>`. Password: copiada da plataforma.
6. Encrypt connection (TLS): habilitado.
7. Selecionar tabelas no Navigator → Load.

#### Caminho 2: Power BI Service / Gateway

Mesma redação da v1, com **recomendação default = Gateway** (mais seguro). Acesso direto exige IP allowlist (Hostinger/iptables) + cert TLS válido.

#### Caminho 3: Snippet M

Mesmo padrão da v1, agora gerado por view derivada com nome final do perfil.

### 4.6 Exposição de rede (operacional, runbook)

A v0.17.0 entrega **app + DB provisioning**. O João precisa, **antes** de o primeiro perfil ser usado:

1. **DNS:** A record `db.insights.nexusai360.com` → IP do servidor Hostinger (ou subdomain CNAME para o app).
2. **Postgres listen:** `postgresql.conf` `listen_addresses = '*'`.
3. **pg_hba.conf:** `hostssl all all 0.0.0.0/0 scram-sha-256` (TLS obrigatório).
4. **TLS cert:** Let's Encrypt para `db.insights.nexusai360.com` (S2). Renew via certbot job mensal — adicionar runbook. Carregar em `ssl_cert_file` e `ssl_key_file` do Postgres.
5. **Firewall:** liberação de IP por allowlist (recomendado) ou geo-block (mínimo).
6. **CONNECTION LIMIT global:** subir `max_connections` do Postgres se hoje estiver no limite (verificar com `SHOW max_connections`).

Estas etapas vão num runbook **`docs/runbooks/integracoes-power-bi.md`** que entrego junto da release. UI tem alerta no hub: "⚠️ Antes de criar perfis, leia o runbook de setup de rede".

---

## 5. Schema de dados (Prisma)

```prisma
enum IntegrationKind {
  power_bi
  // looker_studio, tableau, excel, webhook — adicionar conforme implementar
}

enum IntegrationProfileStatus {
  active
  disabled
  error      // S4 — provisioning falhou
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
  allowedTables       Json                         @map("allowed_tables")
  allowedColumns      Json                         @map("allowed_columns")
  accountIdFilter     Json?                        @map("account_id_filter")
  teamIdFilter        Json?                        @map("team_id_filter")
  // Provisioning
  lastProvisionedAt   DateTime?                    @map("last_provisioned_at")
  lastProvisionError  String?                      @map("last_provision_error") @db.Text
  // Lifecycle
  createdAt           DateTime                     @default(now()) @map("created_at")
  updatedAt           DateTime                     @updatedAt @map("updated_at")
  createdById         String?                      @db.Uuid @map("created_by_id")
  createdBy           User?                        @relation("IntegrationProfileCreator", fields: [createdById], references: [id])
  disabledAt          DateTime?                    @map("disabled_at")
  deletedAt           DateTime?                    @map("deleted_at")  // soft-delete

  auditEvents IntegrationAuditLog[]

  @@index([kind, status])
  @@index([deletedAt])
  @@map("integration_profiles")
}

model IntegrationAuditLog {
  id        String                  @id @default(uuid()) @db.Uuid
  profileId String                  @db.Uuid @map("profile_id")
  profile   IntegrationProfile      @relation(fields: [profileId], references: [id], onDelete: Cascade)
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

(A8/A9): adicionadas relations `createdBy`/`user` com nomes únicos.

Adicionar à enum global `AuditAction` (no schema do User):
```
integration_profile_created
integration_profile_updated
integration_profile_deleted
integration_password_revealed
integration_password_rotated
integration_provisioning_failed
```

Migration nomeada `20260501_add_integrations_power_bi` (C2).

---

## 6. Provisioning (DDL dinâmico)

### 6.1 Setup inicial (migration única)

```sql
CREATE SCHEMA IF NOT EXISTS powerbi;

-- Tabelas-snapshot de dimensões (UPSERT, não TRUNCATE — P7)
CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
  account_id INT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ... idem pra dim_inboxes (PK composto: account_id+inbox_id), dim_agents, dim_teams

-- Views públicas (passthrough com colunas EXPLÍCITAS — P2)
CREATE OR REPLACE VIEW powerbi.dim_accounts AS
  SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;

CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
  SELECT account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
  FROM public.chatwoot_facts_daily_by_account;
-- ... idem pras demais facts (sempre listando colunas)

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

COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
```

(P1) — não há mais `GRANT USAGE ON SCHEMA powerbi TO postgres` redundante.

### 6.2 Por perfil (sem PL/pgSQL — A1, A4)

A app emite **3 transações sequenciais** do client Node:

**Tx 1 — User Postgres (fora de transação DDL)**:
```sql
-- Em conexão admin:
SELECT 1 FROM pg_roles WHERE rolname = $1;  -- check
-- Se não existe:
CREATE USER pbi_diretoria_a3f8c2 WITH PASSWORD 'gen-pwd' CONNECTION LIMIT 5;
-- Se existe:
ALTER USER pbi_diretoria_a3f8c2 WITH PASSWORD 'gen-pwd' CONNECTION LIMIT 5 LOGIN;
```

`CREATE USER` rodada **fora** de BEGIN/COMMIT (A4), mas idempotência verificada antes.

**Tx 2 — Drop views antigas (transactional DDL)**:
```sql
BEGIN;
-- Descobre views existentes do perfil:
SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname LIKE 'pbi_<id>_v_%';  -- (P3)
-- Para cada uma:
DROP VIEW IF EXISTS powerbi.pbi_<id>_v_<viewname> CASCADE;
COMMIT;
```

**Tx 3 — Cria views derivadas + GRANTs (transactional DDL)**:
```sql
BEGIN;

-- Para cada tabela liberada:
CREATE VIEW powerbi.pbi_<id>_v_chatwoot_facts_daily_by_account AS
  SELECT account_id, bucket_date, received, resolved
  FROM powerbi.chatwoot_facts_daily_by_account
  WHERE account_id IN (1, 2);  -- só se RLS ativado

GRANT USAGE ON SCHEMA powerbi TO pbi_diretoria_a3f8c2;  -- idempotente (P4)
GRANT SELECT ON powerbi.pbi_<id>_v_chatwoot_facts_daily_by_account TO pbi_diretoria_a3f8c2;
-- ... idem por view

COMMIT;
```

**Em qualquer falha:** o status do perfil vai pra `error`, `lastProvisionError` recebe a mensagem do erro, e a UI mostra "Repetir provisionamento" (S6). Antes de retentar, o provisioner re-roda Tx 2 (cleanup) + Tx 3.

**Validação contra `BLOCKED_TABLES_REGEX`** acontece **antes** de qualquer SQL ser emitido (defesa em profundidade vs UI).

**Quoting:** todos os identifiers (username, view names) passam por `pg-format` (lib `node-pg-format` ou função própria). Nada de string concatenation.

### 6.3 Desativar / deletar (P5)

**Desativar:**
```sql
BEGIN;
REVOKE ALL ON SCHEMA powerbi FROM <user>;
ALTER USER <user> WITH NOLOGIN;
COMMIT;
```
Mantém user e views (rápido reativar).

**Reativar:**
```sql
BEGIN;
ALTER USER <user> WITH LOGIN CONNECTION LIMIT 5;
GRANT USAGE ON SCHEMA powerbi TO <user>;
GRANT SELECT ON ALL TABLES IN SCHEMA powerbi TO <user>;  -- só nas views que ele já possuía (na verdade, só as derivadas dele — usar pg_views LIKE)
COMMIT;
```

**Deletar (soft-delete + cleanup hard no Postgres) — ordem correta P5:**
```sql
-- 1) DROP VIEWS primeiro (DROP USER falha se há objetos owned)
SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname LIKE 'pbi_<id>_v_%';
DROP VIEW IF EXISTS powerbi.pbi_<id>_v_<each> CASCADE;

-- 2) DROP USER
DROP USER IF EXISTS <user>;

-- 3) Soft-delete na app DB
UPDATE integration_profiles SET deleted_at = now() WHERE id = $1;
```

Audit row criado **antes** do drop pra preservar trilha.

### 6.4 Worker `integrations.refresh-dim-snapshots` (P7)

Cron `*/30 * * * *`, BullMQ `concurrency: 1` (P6, evita disputa pelo `chatwoot_leitura` pool).

UPSERT em vez de TRUNCATE (P7 — sem janela de tabela vazia):

```sql
-- Pra cada dim:
INSERT INTO powerbi.dim_accounts_snapshot (account_id, name, status, refreshed_at)
SELECT id, name, status, now()
FROM <chatwoot>.accounts
ON CONFLICT (account_id)
DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, refreshed_at=EXCLUDED.refreshed_at;

-- Soft-cleanup: remove rows não atualizados há 2 ciclos (~1h)
DELETE FROM powerbi.dim_accounts_snapshot
WHERE refreshed_at < now() - INTERVAL '1 hour';
```

Cada dim em try/catch separado: falha em uma não bloqueia outras. Erro por dim logado em job.data.errors.

---

## 7. Frontend

### 7.1 Estrutura de rotas

```
/integracoes                            (hub)
/integracoes/power-bi                   (lista + botão Novo)
/integracoes/power-bi/[id]              (detalhe — também serve como edição via Dialog reaberto)
/integracoes/power-bi/[id]/conectar     (3 abas)
```

(Removida `/novo` — wizard abre como Dialog overlay, não rota dedicada.)

### 7.2 Hub `/integracoes`

5 cards: Power BI (ativo, badge violet, count perfis), Looker Studio, Tableau, Excel/CSV, Webhooks (todos "em breve" cinza, opacity-60). Banner topo: "⚠️ Antes do primeiro perfil, configure o acesso externo ao banco — ver runbook" se nenhum perfil existe.

### 7.3 `/integracoes/power-bi`

Tabela com colunas: Nome, Status (chip colorido), # Tabelas, Filtros (resumido), Criado em, Ações (dropdown). Filtros: status `Todos | Ativos | Desativados | Erro`. Botão "+ Novo perfil" canto superior direito.

Empty state quando 0 perfis: ilustração simples + texto "Crie seu primeiro perfil pra liberar acesso Power BI" + CTA.

### 7.4 Wizard "Novo perfil" / "Editar perfil" (Dialog) — U1, U5, U2, U3, U9

**Layout:** Dialog largo (`max-w-3xl`), altura controlada (`max-h-[90vh] overflow-y-auto`). Topo: barra de progresso 4 segmentos (Identificação · Tabelas · Colunas · Filtros). Footer: "Voltar" / "Continuar"; último passo "Criar perfil" / "Salvar alterações" (modo edit).

**Modo `edit` (U5):** mesma componente; carrega valores via prop `initial`; submit chama `updateProfileAction(id, ...)`.

**Passo 1 — Identificação**
- Nome (max 60, regex `^[A-Za-z0-9 _\-]{3,60}$`).
- Descrição (max 280, opcional).
- Slug **derivado mas mostrado em readonly**: lower-case, `[^a-z0-9]` → `_`, sequências `_+` → `_` (S3). Random suffix 6 chars hex.
- Erro inline (não toast) se nome duplicado (U9, O7).

**Passo 2 — Tabelas**
- Checkboxes agrupadas (Fatos diários / Fatos por hora / Dimensões).
- Tooltip por item com descrição do catálogo.
- Botões "Selecionar tudo" / "Selecionar fatos diários" / "Limpar".
- Validação: ≥ 1 tabela.

**Passo 3 — Colunas (U2)**
- Para cada tabela do passo 2, accordion com checkboxes.
- Default: `essentialColumns` pré-marcadas, demais desmarcadas.
- Tooltip por coluna.
- Validação: cada tabela com ≥ 1 coluna; colunas PK (`pkColumns`) sempre forçadas.

**Passo 4 — Filtros (U3)**
- Toggle "Filtrar por contas" → MultiSelect de `dim_accounts_snapshot`. Empty state se snapshot vazio: "Aguarde o próximo ciclo (≤30 min) ou rode `/configuracoes/jobs`".
- Toggle "Filtrar por times" → MultiSelect de `dim_teams_snapshot`.
- Default ambos off (acesso a todas).

**Submit (modo create):**
- Spinner: "Provisionando banco e gerando credencial…".
- Dialog de credencial (U4 — copy corrigido):
  ```
  Perfil criado com sucesso ✅

  Host:    db.insights.nexusai360.com
  Porta:   5432
  Banco:   nexus_insights
  Usuário: pbi_diretoria_a3f8c2
  Senha:   [Mostrar senha] (registra audit ao revelar)

  Salve essa senha agora. Você poderá revelá-la depois,
  mas isso fica registrado no audit log do perfil.

  Conexão TLS obrigatória.

  [Copiar tudo]  [Ver tutorial de conexão]
  ```

### 7.5 `/integracoes/power-bi/[id]` (detalhe)

- Card 1 (Resumo): status chip + criado por + criado em + last provisioned + erro (se status=error).
- Card 2 (Whitelist atual): tabelas/colunas/filtros — botão "Editar whitelist" abre wizard mode=edit.
- Card 3 (Credenciais): host/porta/banco/user + last4 senha + botão "Mostrar senha" (rate-limited, audit) + botão "Rotacionar senha" (confirm modal + audit).
- Card 4 (Auditoria): timeline `IntegrationAuditLog` (event chip + user + timestamp + details JSON).
- Botões topo: "Conectar" (link) / "Desativar"|"Reativar" (toggle) / "Deletar" (confirm modal).

### 7.6 `/integracoes/power-bi/[id]/conectar` (3 abas)

**Aba 1 (Power BI Desktop)** — passos numerados (1–7) com Lucide icon ao lado de cada (U6: `Download`, `Database`, `Server`, `KeyRound`, `Lock`, `CheckCircle`, etc). `<pre>` com server/port/database/user; senha hidden + botão "Mostrar".

**Aba 2 (Power BI Service / Gateway)** — recomendação default Gateway. Passos: Download `On-premises Data Gateway` da Microsoft → Instalar em VM/PC interno → Login com conta Power BI → Adicionar fonte de dados PostgreSQL com host interno. Box separado "Acesso direto via internet (alternativa)" com aviso "fale com admin pra abrir 5432 com IP allowlist" + perigo de conexão pública.

**Aba 3 (Snippet M)** — accordion: 1 bloco por view. Botão Copy por bloco. Header com "Cole no Power Query Editor → Avançado".

### 7.7 ~~Card em `/configuracoes`~~

**REMOVIDO da v0.17.0** (U7) — sidebar é navegação suficiente. Adicionar como follow-up se demanda surgir.

### 7.8 Sidebar (N3, U8)

Adicionar item entre "Agente Nex" e "Usuários", **sem children**:

```ts
{
  label: "Integrações",
  href: "/integracoes",
  icon: Plug,
  superAdminOnly: true,
  section: "admin",
}
```

Sub-páginas via breadcrumb dentro das telas, não na sidebar.

---

## 8. Componentes (boundary)

```
src/components/integracoes/
  integrations-hub-card.tsx            (Server)
  power-bi/
    profile-list.tsx                   (Server)
    profile-list-empty.tsx             (Server)
    profile-row-actions.tsx            (Client)
    profile-wizard-dialog.tsx          (Client — modos create/edit)
    wizard-step-identity.tsx           (Client)
    wizard-step-tables.tsx             (Client)
    wizard-step-columns.tsx            (Client)
    wizard-step-filters.tsx            (Client)
    wizard-progress-bar.tsx            (Client)
    profile-summary-card.tsx           (Server)
    profile-whitelist-card.tsx         (Server)
    profile-credentials-card.tsx       (Server)
    profile-audit-timeline.tsx         (Server)
    credentials-reveal-dialog.tsx      (Client — rate-limited)
    rotate-password-dialog.tsx         (Client)
    delete-profile-dialog.tsx          (Client)
    connect-tabs.tsx                   (Client)
    connect-desktop-tab.tsx            (Client)
    connect-service-tab.tsx            (Client)
    connect-snippet-tab.tsx            (Client)
    snippet-block.tsx                  (Client)
```

```
src/lib/actions/
  integrations.ts                       (Server Actions cross-integration)
  integrations-power-bi.ts              (Server Actions Power BI)

src/lib/integrations/
  registry.ts                           (catálogo de kinds)
  power-bi/
    catalog.ts                          (POWER_BI_CATALOG + BLOCKED_TABLES_REGEX)
    provisioner.ts                      (DDL dinâmico — orquestra Tx 1/2/3)
    sql-builders.ts                     (buildCreateUserSql, buildDropViewsSql, buildCreateViewSql, buildGrantsSql, buildRevokeSql)
    password-generator.ts
    m-snippet-generator.ts
    dim-sync.ts                         (lógica do worker)

src/worker/jobs/integrations/
  refresh-dim-snapshots.ts              (handler BullMQ)
```

---

## 9. Segurança

### 9.1 Defesa em camadas (10 camadas)

1. **Schema isolada** (Power BI nunca vê `public.*`).
2. **Allowlist no código** — `BLOCKED_TABLES_REGEX` validado em runtime.
3. **Views derivadas por perfil** — colunas filtradas, RLS aplicada.
4. **GRANTs explícitos** — USAGE + SELECT específicos.
5. **CONNECTION LIMIT 5** (S1).
6. **TLS obrigatório** — `hostssl` no `pg_hba.conf` + cert Let's Encrypt (S2).
7. **IP allowlist** opcional na infra.
8. **Auditoria 100%** — `audit_logs` global + `integration_audit_logs`.
9. **Encryption at-rest** — AES-256-GCM com `ENCRYPTION_KEY` (S8 — reusada).
10. **Rate limit** Redis: `password_revealed` 5×/perfil/dia · `password_rotated` 10×/perfil/dia (S5).

### 9.2 Validações Server Action

- Nome: `^[A-Za-z0-9 _\-]{3,60}$` (S3).
- Slug derivado: lower-case, `[^a-z0-9]` → `_`, `_+` → `_`, max 30 chars + random 6 hex.
- Tabelas: subset estrito do catálogo + bloqueio `BLOCKED_TABLES_REGEX`.
- Colunas: subset estrito de `allColumns` da tabela; PK forçadas.
- Account/team filters: number[] não-vazio se toggle on; valida que cada ID existe em snapshot.

### 9.3 Charset de senha (S7)

32 chars, charset `A-Za-z0-9` + `!@#$%` (sem ambíguos `~_-=`). Implementação: `crypto.randomBytes(48).toString('base64url').replace(/[~_-]/g, '!@#$%'[i % 5])` ou simplesmente loop com charset explícito.

### 9.4 Erros de provisioning (S6)

- `statement_timeout = 30000` no client admin que faz DDL.
- Falha → status `error`, `lastProvisionError` populado, audit `provisioning_failed`, UI mostra retry button.
- Senha em texto claro **nunca** logada (mesmo em audit details — só `last4`).

### 9.5 Rotação de senha

- Modal "Tem certeza? A senha atual será invalidada imediatamente. Power BI Desktop pedirá nova senha na próxima refresh."
- Action gera nova senha → ALTER USER → encrypt + update DB → audit → mostra senha 1× (mesma UX do create).

---

## 10. Testes

### 10.1 Unitários (Jest)

- `src/lib/integrations/power-bi/sql-builders.test.ts`
  - `buildCreateUserSql(slug, password)` produz SQL com `quote_ident` + `quote_literal` corretos.
  - `buildDropViewsSqlForProfile(id)` retorna lista de DROP por prefixo.
  - `buildCreateViewSql(profile, table, columns, filters)` produz SQL com WHERE quando filters!=null.
  - `buildGrantsSql(user, viewNames)` produz GRANT USAGE + SELECT por view.
  - `buildRevokeSql(user)` produz REVOKE ALL.

- `src/lib/integrations/power-bi/catalog.test.ts`
  - `BLOCKED_TABLES_REGEX` casa todas as tabelas sensíveis enumeradas.
  - `validateAllowlist(tables)` rejeita tabelas em BLOCKED.
  - Catálogo: cada `essentialColumns ⊂ allColumns`.

- `src/lib/integrations/power-bi/password-generator.test.ts`
  - 32 chars, charset definido, sem ambíguos, sem duplicatas em 1000 chamadas.

- `src/lib/integrations/power-bi/m-snippet-generator.test.ts`
  - Snippet inclui host, banco, view name, escapa quotes.

- `src/lib/integrations/power-bi/provisioner.test.ts` (mocks `pgPool` e `chatwootQuery`)
  - happy path create profile (gera 3 transações).
  - update whitelist preserva senha (T2).
  - retry após erro: re-provisiona idempotente.
  - delete: ordem correta DROP VIEW → DROP USER.

- `src/lib/actions/integrations-power-bi.test.ts`
  - Guard `requireSuperAdmin` em TODAS as actions (parametrized test).
  - `safeAction` wrapper.
  - Audit logs corretos por action.
  - Validação reject tabela em BLOCKED (T1).
  - Edit mode preserva pgUsername (T2).
  - Rate limit `password_revealed` cap 5×/dia.

- `src/components/integracoes/power-bi/*.test.tsx`
  - Wizard 4 passos com validação progressiva.
  - Reveal dialog requer click + mostra audit toast.
  - Connect tabs renderizam 3 abas com snippets corretos.
  - Profile list empty state.
  - Wizard mode=edit pré-preenche valores.

### 10.2 Smoke staging (T3)

Script em `docs/runbooks/integracoes-power-bi.md` "Validação pós-deploy":

| # | Ação | Expected outcome |
| - | --- | --- |
| 1 | Criar perfil "smoke-001" liberando 1 view (`facts_daily_by_account`) | Status=active, credencial gerada |
| 2 | Conectar Power BI Desktop com credencial | Navigator mostra `pbi_<id>_v_chatwoot_facts_daily_by_account`; Load OK |
| 3 | `psql` com user perfil; `SELECT * FROM users` | ERROR: relation does not exist |
| 4 | `psql` `SELECT * FROM powerbi.chatwoot_facts_daily_by_inbox` | ERROR: permission denied |
| 5 | Rotacionar senha; tentar refresh Power BI | Pede nova credencial |
| 6 | Desativar perfil; tentar reconectar | "no pg_hba.conf entry" ou "role NOLOGIN" |
| 7 | Reativar; reconectar | OK |
| 8 | Deletar perfil; `\du` em psql admin | user pbi_<...> ausente |
| 9 | Editar whitelist (adicionar coluna); refresh Power BI | Nova coluna aparece |

---

## 11. Plano de release & versionamento (O5)

- **Migration SQL nomeada** `20260501<timestamp>_add_integrations_power_bi.sql`.
- **Versionamento de views públicas** — incluir comentário no CREATE VIEW: `COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_account IS 'v1 (2026-05-01)';`. Mudança de schema → `v2` + script de migração das views derivadas dos perfis (job manual ou re-run provisioner).
- **v0.17.0-rc1** (interno): schema + provisioner + actions + telas básicas.
- **v0.17.0** (prod): pulido + smoke staging + push prod.

Aguarda v0.16.0 do agente paralelo. Rebase em cima da v0.16.0 LIVE. Ordem: agente paralelo → push v0.16.0 → eu rebase → push v0.17.0.

### 11.1 Variáveis de ambiente novas (O1)

- `INTEGRATION_DB_HOST_PUBLIC` (ex: `db.insights.nexusai360.com`) — usado nos snippets renderizados na UI.
- `INTEGRATION_DB_PORT_PUBLIC` (default `5432`).
- `INTEGRATION_DB_NAME_PUBLIC` (default igual ao `DATABASE_URL` parseado).
- Sem nova chave de encryption — reusa `ENCRYPTION_KEY`.

Adicionar a `.env.example` + runbook.

### 11.2 Comando de migração (O2)

Manual em produção:
```bash
docker exec -it <app-container> npx prisma migrate deploy
```
Worker e app **devem ser reiniciados após** (Prisma client regenerado no build, mas seed/migration roda manual). Documentar no runbook.

### 11.3 Plano de rollback (O4)

Caso v0.17.0 quebre prod:
1. Redeploy último build verde via Portainer (rollback de imagem).
2. Reverter migration: `prisma migrate resolve --rolled-back 20260501<timestamp>` + script SQL `DROP SCHEMA powerbi CASCADE; DROP TABLE integration_profiles, integration_audit_logs; ALTER TYPE audit_action DROP VALUE 'integration_*'` (pré-escrito).
3. Confirmar `/api/health` v0.16.x retornado.

---

## 12. Riscos e mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| App não tem CREATEROLE | Bloqueia provisioning | Verificar antes do deploy: `SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user`. Se false, runbook mostra `ALTER USER <app> CREATEROLE;` (R1) |
| Conexão direta da internet 5432 expõe DB | Surface attack | TLS obrigatório + IP allowlist + senha forte; alternativa Gateway |
| Power BI cliente vaza credencial | Acesso não autorizado | Rotação manual + audit; recomendação senha-única-por-relatório; recomendação Gateway (.pbix sem credencial inline) (R3) |
| Schema Chatwoot muda → snapshot quebra | Dim_* desatualizada | Worker dim sync log de erro + UI mostra "snapshot last refresh" e alerta se > 2h atrás |
| 50+ perfis → connection pool esgota | Lock no DB | CONNECTION LIMIT 5 + monitor `pg_stat_activity` |
| Migration Prisma conflita com v0.16.0 | Build CI quebrado | Aguardar v0.16.0 LIVE; rebase manual |
| TLS cert do Postgres expira | Power BI cliente cai | Renew automático certbot + alarme 7 dias antes do vencimento + runbook (R2) |
| Provisioner deixa state inconsistente em falha parcial | UI mostra "active" mas user Postgres não existe | Após cada Tx, reconciliação: query `pg_roles`/`pg_views` e compara com DB app. Job `reconcile-integrations` cron diário |
| Slug colide (race) | Erro Server Action | Unique constraint `pgUsername`; UI mostra "Tente outro nome" |

---

## 13. Decisões fechadas (justificadas inline)

1. ✅ Banco a expor: **interno**, não Chatwoot principal.
2. ✅ Estratégia: **schema isolada `powerbi` + views derivadas** (não RLS nativo).
3. ✅ Multi-perfil: **sim** (1 user Postgres por perfil).
4. ✅ RLS via WHERE em view derivada.
5. ✅ Conexão: 3 caminhos (Desktop / Gateway / Snippet M).
6. ✅ Visibilidade: super_admin only, hardcoded.
7. ✅ Migration Prisma (não runtime ensure).
8. ✅ Worker dim sync 30 min com UPSERT.
9. ✅ TLS obrigatório.
10. ✅ Single-spec, multi-fase no plan.
11. ✅ Sidebar **sem children** (hub é navegação primary).
12. ✅ Sem card em `/configuracoes` na v0.17.0 (evita conflito agente paralelo).
13. ✅ Reusa `ENCRYPTION_KEY` (S8).
14. ✅ CONNECTION LIMIT 5 (S1).
15. ✅ Charset senha sem chars ambíguos (S7).
16. ✅ Tx separadas (CREATE USER fora; DDL transacional) (A4).
17. ✅ DROP VIEW por prefixo via `pg_views` (P3).
18. ✅ DROP VIEW antes DROP USER (P5).
19. ✅ UPSERT em dim sync (P7).
20. ✅ BullMQ concurrency=1 no dim sync (P6).
21. ✅ Naming UI "Nexus Chat" (não "Chatwoot") (N1).

---

## 14. Coordenação multi-agente (C1, C2)

- Outro agente: `claude-nex-suite-refinement` (v0.16.0).
- Conflito potencial: `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `prisma/schema.prisma`, `src/app/(protected)/configuracoes/page.tsx`.
- **Mitigação:**
  - Spec/plan em arquivos próprios (sem conflito).
  - Implementação aguarda v0.16.0 LIVE em produção.
  - Migration nomeada com sufixo `_integrations_power_bi` (única).
  - Não tocar em `configuracoes/page.tsx` (decisão U7).
  - Polling: `gh run list --limit 5` + `ls docs/agents/active/` a cada 5–10 min.
  - Quando v0.16.0 estiver LIVE: `git pull --rebase`, atualizar versão pra 0.17.0, prosseguir.

---

## 15. Próximos passos

- Pente-fino #2 → v3 final.
- `superpowers:writing-plans` → plan v1 → review #1 → v2 → review #2 → v3.
- Aguardar v0.16.0 LIVE.
- `superpowers:subagent-driven-development` com TDD por task + `ui-ux-pro-max:ui-ux-pro-max` em CADA task UI.
- `superpowers:verification-before-completion`.
- Push prod.
- Avisar João pra testar (smoke staging script §10.2).
