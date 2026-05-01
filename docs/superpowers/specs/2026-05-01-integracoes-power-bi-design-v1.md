# Spec — Menu Integrações + Power BI (v0.17.0)

**Versão:** v1 (rascunho inicial — pente-fino #1 a seguir).
**Autor:** claude-integracoes-powerbi
**Data:** 2026-05-01
**Target release:** v0.17.0 (depois de v0.16.0 do agente paralelo).

---

## 1. Contexto e motivação

João precisa permitir que clientes (e ele mesmo, como super_admin) plugem **Power BI** ao banco de dados do Nexus Chat (Chatwoot) para construir dashboards próprios fora da plataforma Nexus Insights. Hoje a plataforma serve relatórios prontos via UI — mas há demanda por **modelagem livre** em ferramentas externas.

Power BI é a primeira integração porque:
- É a ferramenta de BI mais usada no mercado brasileiro (Microsoft).
- O cliente Matrix Fitness Group já tem licença Power BI.
- Conecta nativamente a PostgreSQL via driver Npgsql (sem necessidade de gateway intermediário em todos os cenários).

A arquitetura precisa ser **plataforma-agnostica**: o menu chama-se "Integrações" (plural) e o catálogo de integrações é extensível. Power BI é a única implementada na v0.17.0; Looker Studio, Tableau, Excel, Webhooks ficam como **placeholders "em breve"** no hub.

**João é leigo em Power BI.** A UI precisa ser autoexplicativa: o super_admin clica "Novo perfil", escolhe o que liberar, e recebe a credencial + tutorial passo-a-passo de como conectar. Zero conhecimento de SQL, DDL ou Power Query M é exigido dele.

**Visibilidade:** menu **super_admin only**, sem três níveis (decisão final do João nesta conversa — corrigiu pedido inicial). NÃO usar o pattern `ReportVisibility` (`all | super_admin_only | none`) — hard-coded `superAdminOnly: true` no item de navegação.

---

## 2. Objetivos

### 2.1 Funcionais

- **F1.** Novo item de menu lateral "Integrações" (Plug icon, super_admin only).
- **F2.** Hub `/integracoes` com cards das integrações disponíveis (Power BI ativo + 4–5 placeholders "em breve").
- **F3.** Sub-página `/integracoes/power-bi` com lista de **perfis** (cada perfil = uma conexão isolada).
- **F4.** Wizard de criação de perfil em 4 passos: identificação → tabelas → colunas → filtros (RLS opcional).
- **F5.** Provisioning automático de **usuário PostgreSQL dedicado** + GRANTs/REVOKEs específicos a cada perfil ao salvar.
- **F6.** Tela "Como conectar" com 3 abas: **Power BI Desktop** (passo a passo), **Power BI Service / Gateway** (instruções operacionais), **Snippet M** (código pronto pra copiar).
- **F7.** Edição de perfil: alterar whitelist (re-provisiona GRANTs sem trocar senha), regenerar senha, desativar (REVOKE ALL), reativar, deletar (DROP USER + soft-delete record).
- **F8.** Audit log completo: quem criou/editou/deletou/revelou-senha/rotacionou.
- **F9.** Card "Integrações" em `/configuracoes` com status resumido + link.

### 2.2 Não-funcionais

- **NF1.** Senha sempre encriptada at-rest (AES-256-GCM existente). Nunca renderizada inline; só com clique explícito + audit.
- **NF2.** Provisioning idempotente — clicar "Salvar" 2× não causa drift.
- **NF3.** Nenhuma alteração no schema do app é exposta — Power BI só vê schema `powerbi` + views.
- **NF4.** Tabelas sensíveis (`users`, `audit_logs`, `llm_*`, `nex_*`, `password_reset_tokens`, `email_change_tokens`, `app_settings`) **proibidas por allowlist no código** (não dependem de o super_admin "lembrar" de não marcar — elas nem aparecem no wizard).
- **NF5.** Cada perfil Power BI usa connection limit `2` no Postgres (Import refresh + DirectQuery query simultâneos no máximo).
- **NF6.** Toda action protegida por `requireSuperAdmin` + `safeAction` + `logAudit`.

---

## 3. Não-objetivos (YAGNI v0.17.0)

- ✗ Outras integrações além de Power BI (placeholders "em breve").
- ✗ Permissão por usuário não-super_admin (companyRole etc).
- ✗ Refresh agendado pelo Power BI Service (gateway etc) — apenas documentação.
- ✗ OData/REST API gateway próprio (avaliação futura).
- ✗ Métricas de uso do perfil (consultas executadas etc) — pode entrar em release futura.
- ✗ Auto-discovery de IP do Power BI Service para allowlist (instrução manual).
- ✗ DataSets pré-built para Power BI Service (PBIT) — apenas snippet M na v0.17.0.
- ✗ Anti-fraude (detecção de leak de credencial) — apenas rotação manual.

---

## 4. Decisões arquiteturais-chave

### 4.1 Banco a expor: **interno (Nexus Insights), nunca o Chatwoot principal**

**Por quê.** O banco principal Chatwoot tem ~50M rows, é mutável (gravações constantes), contém dados pessoais (mensagens, e-mails, telefones de contatos). Expor diretamente seria um risco de:
- Perda de performance no Chatwoot (queries Power BI competindo com workers).
- Vazamento de dados pessoais privados de cliente final do Matrix.
- Acoplamento forte: qualquer mudança de schema no Chatwoot quebra dashboards do cliente.

**Solução.** Power BI consulta o banco interno (Nexus Insights) onde já existem as `chatwoot_facts_*` pré-agregadas + adicionamos **views de dimensão** que sincronizam (snapshot) as listas de accounts/inboxes/agents/teams do Chatwoot.

Trade-off aceito: Power BI vê dados com latência de até 5 min (ciclo do worker BullMQ), não real-time. Aceitável: ferramentas de BI tipicamente refresham 1×/dia ou no máximo de hora em hora.

### 4.2 Schema isolada `powerbi` + views

Toda exposição vive em uma schema PostgreSQL chamada `powerbi`. Esta schema **só** contém views; nunca tabelas. Razões:

- Clean separation: `pg_dump --schema=powerbi` produz só o que é "público".
- GRANTs simples: `GRANT USAGE ON SCHEMA powerbi` + `GRANT SELECT ON view_X` por perfil.
- Mudança de schema do app não quebra Power BI: a view abstrai.
- Whitelist de colunas vira `CREATE VIEW v AS SELECT col1, col2 FROM ...` — a coluna proibida nem existe na visão do perfil.

### 4.3 Catálogo de tabelas/colunas expostas (v0.17.0)

**Fatos (já existem no banco):**
- `chatwoot_facts_daily_by_account`
- `chatwoot_facts_daily_by_inbox`
- `chatwoot_facts_daily_by_agent`
- `chatwoot_facts_daily_by_team`
- `chatwoot_facts_hourly_by_account`

**Dimensões (a criar como views):**
- `dim_accounts` (id, name, status — snapshot diário)
- `dim_inboxes` (account_id, inbox_id, name, channel_type)
- `dim_agents` (account_id, agent_id, name, email)
- `dim_teams` (account_id, team_id, name)
- `dim_dates` (calendar table, ranges 2024-01-01 a +5y)

**Permanentemente bloqueadas (allowlist no código, nunca aparecem no wizard):**
- `users`, `accounts`, `audit_logs` (do app), `llm_*`, `nex_*`
- `password_reset_tokens`, `email_change_tokens`, `app_settings`
- Todas as tabelas no schema `public` que não estão na whitelist explícita acima.

### 4.4 Multi-perfil + RLS

Cada perfil = um usuário Postgres `pbi_<slug>_<6char>` + senha aleatória + GRANTs específicos.

**Whitelist de tabelas** = quais views da seção 4.3 ele pode SELECT.
**Whitelist de colunas** = subset de colunas de cada view (gera `CREATE VIEW pbi_profile_<id>_v_<view> AS SELECT col_a, col_b FROM powerbi.<view>` e dá GRANT só nessa view derivada).
**RLS por filtro fixo** = quando o super_admin marca "filtrar por account_id ∈ {1, 2}", a view derivada vira `SELECT ... FROM powerbi.<view> WHERE account_id IN (1, 2)`.

PostgreSQL **Row-Level Security** nativo (`CREATE POLICY`) **não é usado** porque exigiria um único usuário compartilhado com `current_user`/`current_setting` — perdemos a isolação por perfil. A solução de "view derivada por perfil" é mais simples e mais segura.

### 4.5 Conexão Power BI: 3 caminhos documentados

#### Caminho 1: Power BI Desktop (mais simples)

1. Abrir Power BI Desktop.
2. **Get Data** → **PostgreSQL database**.
3. Server: `db.insights.nexusai360.com:5432` (host externo dedicado a integração).
4. Database: `nexus_insights`.
5. Authentication: **Database** → User: `pbi_<slug>_<6>`, Password: copiada da plataforma.
6. **Encrypt connection** (TLS): habilitado.
7. Selecionar tabelas no Navigator → Load.

#### Caminho 2: Power BI Service / Gateway

Quando o cliente quer publicar relatórios na nuvem do Power BI (compartilhar com outros usuários), pode optar entre:

- **Acesso direto pela internet**: a porta 5432 precisa estar exposta com IP allowlist. Documentar IPs do Power BI Service Brazil South + adicionar firewall via Hostinger.
- **On-premises Data Gateway**: instalar o agente Microsoft em uma VM/PC do cliente; o agente conecta ao Postgres na rede e expõe pro Power BI Service. Sem necessidade de abrir portas externas.

A UI mostra ambos com prós/contras; recomendação default é **gateway** (mais seguro).

#### Caminho 3: Snippet M (Power Query)

```m
let
    Source = PostgreSQL.Database(
        "db.insights.nexusai360.com:5432",
        "nexus_insights",
        [Query="SELECT * FROM powerbi.pbi_<id>_v_chatwoot_facts_daily_by_account"]
    )
in
    Source
```

A UI gera o snippet pronto pra cada view liberada (incluindo o nome da view derivada do perfil).

### 4.6 Exposição de rede (operacional, fora do código)

Hoje o Postgres do banco interno só responde dentro da rede Docker (`rede_nexusAI`). Para Power BI Desktop conectar:

- Adicionar serviço `db-external` (mesmo Postgres com porta exposta via Traefik TCP/SNI ou um sidecar SSH tunnel).
- Hostname `db.insights.nexusai360.com` apontando pro mesmo IP do app.
- Firewall: IP allowlist via iptables/Hostinger.
- TLS: certificado do Postgres validado (Let's Encrypt + `postgresql.conf` `ssl=on`).

**Decisão:** documentar essas etapas em `docs/runbooks/integracoes-power-bi.md` (operacional manual). A v0.17.0 entrega tudo do lado **app + DB provisioning**; o setup de rede é responsabilidade do João seguindo o runbook (ele fica avisado: "Pra conectar Power BI Desktop direto, precisa abrir 5432 — siga o runbook"). Alternativa: gateway (sem abertura de porta).

---

## 5. Schema de dados (Prisma)

Novas models em `prisma/schema.prisma`:

```prisma
enum IntegrationKind {
  power_bi
  // looker_studio (em breve)
  // tableau (em breve)
  // excel (em breve)
  // webhook (em breve)
}

enum IntegrationProfileStatus {
  active
  disabled
  expired
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
  allowedTables       Json                         @map("allowed_tables")           // string[]
  allowedColumns      Json                         @map("allowed_columns")          // Record<table, string[]>
  accountIdFilter     Json?                        @map("account_id_filter")        // number[] | null
  teamIdFilter        Json?                        @map("team_id_filter")           // number[] | null
  // Provisioning
  lastProvisionedAt   DateTime?                    @map("last_provisioned_at")
  lastProvisionError  String?                      @map("last_provision_error") @db.Text
  // Auditoria/lifecycle
  createdAt           DateTime                     @default(now()) @map("created_at")
  updatedAt           DateTime                     @updatedAt @map("updated_at")
  createdById         String?                      @db.Uuid @map("created_by_id")
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
  details   Json?
  ipAddress String?                 @map("ip_address")
  createdAt DateTime                @default(now()) @map("created_at")

  @@index([profileId, createdAt(sort: Desc)])
  @@map("integration_audit_logs")
}
```

Adicionar à enum global `AuditAction`:
```
integration_profile_created
integration_profile_updated
integration_profile_deleted
integration_password_revealed
integration_password_rotated
```
(também escreve em `audit_logs` global pra manter trilha unificada de super_admin actions; o `IntegrationAuditLog` é a trilha **específica do perfil**, exibida na sub-página).

---

## 6. Provisioning (DDL dinâmico)

Toda criação/edição/desativação de perfil orquestra um conjunto de comandos SQL no banco interno via `pgPool` (com role admin que pode `CREATE USER` e `GRANT`).

### 6.1 Setup inicial (migration única, aplicada uma vez)

```sql
-- Schema isolada
CREATE SCHEMA IF NOT EXISTS powerbi;
GRANT USAGE ON SCHEMA powerbi TO postgres;

-- Views de dimensão (sincronizadas via worker BullMQ a cada 30 min)
CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
  account_id INT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ... idem para dim_inboxes, dim_agents, dim_teams

CREATE OR REPLACE VIEW powerbi.dim_accounts AS
  SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;

-- ... idem para outras dimensões

CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
  SELECT * FROM public.chatwoot_facts_daily_by_account;
-- (passthrough; mas lá no perfil cada user vai SELECT só nas views derivadas)

-- ... idem pras demais facts

-- dim_dates calendar
CREATE OR REPLACE VIEW powerbi.dim_dates AS
  SELECT
    d::DATE AS bucket_date,
    EXTRACT(YEAR FROM d) AS year,
    EXTRACT(MONTH FROM d) AS month,
    EXTRACT(DAY FROM d) AS day,
    EXTRACT(DOW FROM d) AS day_of_week,
    EXTRACT(WEEK FROM d) AS iso_week,
    TO_CHAR(d, 'TMMonth') AS month_name_pt
  FROM generate_series('2024-01-01'::DATE, '2030-12-31'::DATE, '1 day') AS d;
```

### 6.2 Por perfil (transação atômica)

Quando o super_admin clica "Salvar perfil" ou "Atualizar whitelist":

```sql
BEGIN;

-- Cria/atualiza usuário Postgres
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) THEN
    EXECUTE format('CREATE USER %I WITH PASSWORD %L CONNECTION LIMIT 2', $1, $2);
  ELSE
    EXECUTE format('ALTER USER %I WITH PASSWORD %L', $1, $2);
  END IF;
END $$;

-- Limpa GRANTs antigos
REVOKE ALL ON SCHEMA powerbi FROM <user>;
DROP VIEW IF EXISTS powerbi.pbi_<id>_v_<view> CASCADE;  -- repete por view antiga

-- Cria views derivadas com whitelist de colunas + filtros
CREATE VIEW powerbi.pbi_<id>_v_chatwoot_facts_daily_by_account AS
  SELECT account_id, bucket_date, received, resolved, ...
  FROM powerbi.chatwoot_facts_daily_by_account
  WHERE account_id IN (1, 2);  -- se RLS ativado

GRANT USAGE ON SCHEMA powerbi TO <user>;
GRANT SELECT ON powerbi.pbi_<id>_v_chatwoot_facts_daily_by_account TO <user>;
-- ... idem por view

COMMIT;
```

### 6.3 Desativar / deletar

- **Desativar**: `REVOKE ALL ON SCHEMA powerbi FROM <user>; ALTER USER <user> WITH NOLOGIN;`. Mantém o user e as views; reativação reverte.
- **Deletar (soft)**: `deletedAt` set + `DROP USER <user>; DROP VIEW pbi_<id>_*`. O record fica no Postgres (não deletado fisicamente) pra preservar histórico de audit.

### 6.4 Worker de sincronização de dimensões

Novo job BullMQ `integrations.refresh-dim-snapshots` (cron `*/30 * * * *`):

```sql
-- TRUNCATE + INSERT do Chatwoot principal pra cada dim
TRUNCATE powerbi.dim_accounts_snapshot;
INSERT INTO powerbi.dim_accounts_snapshot
  SELECT id, name, status FROM <chatwoot>.accounts;
```

Acessa o Chatwoot via `chatwootQuery` (read-only). Falha em dim individual não bloqueia outras (try/catch por dim).

---

## 7. Frontend

### 7.1 Estrutura de rotas

```
/integracoes                          (hub; super_admin only)
/integracoes/power-bi                 (lista de perfis)
/integracoes/power-bi/novo            (modal/dialog de criação — wizard 4 passos)
/integracoes/power-bi/[id]            (detalhe + editar whitelist)
/integracoes/power-bi/[id]/conectar   (3 abas Desktop/Service/Snippet)
```

### 7.2 Hub `/integracoes`

```
+-------------------------------------------------------+
| 🔌 Integrações                                        |
| Conecte o Nexus Insights a ferramentas externas       |
+-------------------------------------------------------+

  Disponíveis:
  ┌───────────────────┐   ┌────────────────────┐   ┌────────────────────┐
  │ 📊 Power BI       │   │ 📈 Looker Studio   │   │ 📉 Tableau         │
  │ Microsoft         │   │ Google             │   │ Salesforce         │
  │ 2 perfis ativos   │   │ Em breve           │   │ Em breve           │
  │ [Configurar →]    │   │                    │   │                    │
  └───────────────────┘   └────────────────────┘   └────────────────────┘
  ┌───────────────────┐   ┌────────────────────┐
  │ 📋 Excel / CSV    │   │ 🔗 Webhooks        │
  │ Microsoft         │   │ HTTP genérico      │
  │ Em breve          │   │ Em breve           │
  └───────────────────┘   └────────────────────┘
```

Card ativo (`Power BI`): badge violet, count de perfis, link `/integracoes/power-bi`. Cards "em breve" cinza, opacity-60, sem link.

### 7.3 `/integracoes/power-bi`

Lista de perfis em tabela:

| Nome perfil | Status | Tabelas | Filtros | Criado | Ações |
| --- | --- | --- | --- | --- | --- |
| Diretoria Matrix | 🟢 Ativo | 5 | account_id ∈ {1,2} | 2026-05-01 | Editar / Conectar / Rotacionar / Desativar |

Botão "+ Novo perfil" no canto superior direito → abre Dialog wizard.

### 7.4 Wizard "Novo perfil" (Dialog 4 passos)

**Passo 1 — Identificação**
- Nome (max 60 chars, único)
- Descrição (opcional, max 280)
- Slug auto-gerado a partir do nome (`pbi_<slug>_<6char>`)

**Passo 2 — Tabelas**
- Lista de checkboxes agrupadas:
  - **Fatos diários:** facts_daily_by_account, _by_inbox, _by_agent, _by_team
  - **Fatos por hora:** facts_hourly_by_account
  - **Dimensões:** dim_accounts, dim_inboxes, dim_agents, dim_teams, dim_dates
- Cada item com tooltip explicando o conteúdo + count de linhas estimado.
- Botão "Selecionar tudo" / "Selecionar fatos diários".

**Passo 3 — Colunas**
- Para cada tabela marcada no passo 2, lista de checkboxes com colunas.
- Default: todas marcadas. Super_admin desmarca o que não quer expor.
- Tooltip por coluna explicando.

**Passo 4 — Filtros (RLS)**
- Toggle "Filtrar por contas" → multi-select de accounts.
- Toggle "Filtrar por times" → multi-select de teams.
- Default: ambos desligados (acesso a todas as accounts).

**Submit**:
- Loading spinner com texto "Criando perfil + provisionando banco...".
- Em sucesso, abre Dialog de credencial:
  ```
  Perfil criado!
  Host: db.insights.nexusai360.com
  Porta: 5432
  Banco: nexus_insights
  Usuário: pbi_diretoria_a3f8c2
  Senha: [Mostrar senha] (audit log)

  ⚠️ Esta é a única vez que a senha aparece em texto claro
  fora da rotação manual. Salve em local seguro.

  [Copiar tudo] [Ver tutorial]
  ```

### 7.5 `/integracoes/power-bi/[id]` (detalhe)

- Card 1: Resumo (status, criado por, criado em, último provisionamento, último erro).
- Card 2: Whitelist atual (tabelas + colunas + filtros) — botão "Editar whitelist" reabre wizard.
- Card 3: Credenciais (user / last4 / botão "Mostrar senha completa" + audit / botão "Rotacionar senha").
- Card 4: Auditoria (timeline dos `IntegrationAuditLog` desse perfil).
- Botões topo: "Conectar" (link → `/[id]/conectar`), "Desativar" (toggle), "Deletar" (confirmação).

### 7.6 `/integracoes/power-bi/[id]/conectar` (3 abas)

**Aba 1: Power BI Desktop** — passo a passo numerado com screenshots/SVG ilustrativos. Snippet de host/banco/user em `<pre>` com Copy. Senha esconde por padrão; botão "Mostrar" + audit.

**Aba 2: Power BI Service / Gateway** — recomendação Gateway por padrão; instruções de download + setup; alternativa "acesso direto" com aviso de IP allowlist + nota "fale com o admin Hostinger pra abrir porta 5432".

**Aba 3: Snippet M** — código pronto Power Query M para cada view liberada, em accordion (uma view por bloco). Cada bloco tem botão Copy.

### 7.7 Card em `/configuracoes`

```
🔌 Integrações
Power BI: 2 perfis ativos (1 desativado, 0 erros)
Looker Studio: em breve
[Gerenciar →]
```

(o card é apenas link, não toca em nada do que o agente paralelo está mexendo no `configuracoes/page.tsx` — vai entrar como import de `<IntegrationsSummaryCard />`.)

### 7.8 Sidebar

Adicionar item entre "Agente Nex" e "Usuários":

```ts
{
  label: "Integrações",
  href: "/integracoes",
  icon: Plug,
  superAdminOnly: true,
  section: "admin",
  children: [
    { label: "Power BI", href: "/integracoes/power-bi", icon: BarChart3, superAdminOnly: true },
    // demais virão "em breve" (não no sidebar; só no hub)
  ],
}
```

---

## 8. Componentes (boundary)

```
src/components/integracoes/
  integrations-hub-card.tsx         (Server: card por integração)
  integrations-summary-card.tsx     (Server: resumo p/ /configuracoes)
  power-bi/
    profile-list.tsx                (Server: tabela de perfis)
    profile-row-actions.tsx         (Client: dropdown editar/rotacionar/etc)
    profile-wizard-dialog.tsx       (Client: 4 passos)
    profile-detail-cards.tsx        (Server: cards de resumo/whitelist/audit)
    credentials-reveal-dialog.tsx   (Client: mostra senha 1× + audit)
    rotate-password-dialog.tsx      (Client: confirma + audit)
    delete-profile-dialog.tsx       (Client: confirma + soft-delete)
    connect-tabs.tsx                (Client: 3 abas)
    table-picker.tsx                (Client: passo 2 wizard)
    column-picker.tsx               (Client: passo 3 wizard)
    rls-filter-builder.tsx          (Client: passo 4 wizard)
    snippet-block.tsx               (Client: <pre> + Copy)
```

`src/lib/actions/integrations.ts` (Server Actions)
`src/lib/actions/integrations-power-bi.ts` (Server Actions específicas Power BI)
`src/lib/integrations/registry.ts` (catálogo)
`src/lib/integrations/power-bi/`
  `provisioner.ts` (DDL dinâmico — todas as funções que tocam em CREATE USER/GRANT)
  `catalog.ts` (tabelas/colunas expostas)
  `password-generator.ts`
  `m-snippet-generator.ts`
  `dim-sync.ts` (job BullMQ)
`src/worker/jobs/integrations/refresh-dim-snapshots.ts`

---

## 9. Segurança

### 9.1 Defesa em camadas

1. **Schema isolada**: Power BI nunca enxerga `public.*`.
2. **Allowlist no código**: tabelas sensíveis hardcoded como `BLOCKED_TABLES` no `catalog.ts`.
3. **Views derivadas por perfil**: cada user só vê suas próprias views (com colunas filtradas).
4. **GRANTs explícitos**: USAGE no schema + SELECT em views específicas (nada mais).
5. **CONNECTION LIMIT 2**: previne abuse acidental.
6. **TLS obrigatório**: `postgresql.conf` `ssl=on`; clientes com `sslmode=require`.
7. **IP allowlist**: opcional na infra (Hostinger/iptables) — recomendado para acesso direto via internet.
8. **Auditoria**: 100% das mudanças logadas em `audit_logs` global + `integration_audit_logs` específico.
9. **Encryption at-rest**: senha nunca em plain text no Postgres do app — AES-256-GCM via `src/lib/encryption.ts`.
10. **Rate limit**: `password_revealed` action limitada a 5×/perfil/dia (Redis).

### 9.2 Validações Server Action

- Nome do perfil: regex `^[a-z0-9-_ ]{3,60}$` (i + slug derivado).
- Slug: regex `^[a-z][a-z0-9_]{2,30}$` (Postgres user name compliant).
- Tabelas: subset estrita do catálogo.
- Colunas: subset estrita das colunas reais da tabela (validação contra `information_schema.columns`).
- Account/team filters: number[] não-vazio se toggle ativo.

### 9.3 Erros de provisioning

- Falhas DDL retornam erro user-friendly mas **não revertem o estado do perfil parcialmente** — política: a Server Action grava `lastProvisionError` e marca status=`error` (novo enum). UI mostra "Repetir provisionamento" + log do erro.
- Em desenvolvimento, falha ao criar usuário Postgres → toast vermelho "Não foi possível criar o usuário Postgres. Verifique se o app tem GRANT de superuser."

---

## 10. Testes

### 10.1 Unitários (Jest)

- `src/lib/integrations/power-bi/provisioner.test.ts`
  - `buildCreateUserSql`/`buildGrantsSql` produz SQL esperado (golden snapshots).
  - `validateAllowlist` rejeita tabelas em `BLOCKED_TABLES`.
  - `revokeAllSql` produz REVOKE + DROP VIEW corretamente.

- `src/lib/integrations/power-bi/m-snippet-generator.test.ts`
  - Snippet inclui host/banco/view.

- `src/lib/integrations/power-bi/password-generator.test.ts`
  - 32 chars base64 url-safe.
  - Sem duplicatas em 1000 chamadas.

- `src/lib/actions/integrations-power-bi.test.ts`
  - Guard `requireSuperAdmin` em todas as actions.
  - `safeAction` wrapper aplicado.
  - Audit logs corretos.
  - Happy path e error paths.

- `src/components/integracoes/power-bi/*.test.tsx` (RTL + jsdom)
  - Wizard 4 passos com validação por passo.
  - Reveal dialog mostra senha apenas após confirmação.
  - Connect tabs mostram 3 abas com snippets corretos.

### 10.2 Integração

Smoke test manual em ambiente de staging (depois do deploy):
- Criar perfil "teste-001" liberando 1 view.
- Conectar Power BI Desktop com credencial.
- Confirmar que carrega dados.
- Tentar SELECT em `users` (Postgres app) — deve falhar.
- Tentar SELECT em `chatwoot_facts_daily_by_inbox` (não liberada) — deve falhar.
- Rotacionar senha → conexão antiga deve cair.
- Desativar perfil → conexão deve cair.
- Deletar perfil → user no Postgres deve ser dropado.

---

## 11. Plano de release

- **v0.17.0-rc1**: schema + provisioning + actions + telas básicas (sem polish).
- **v0.17.0**: completo + smoke staging + push prod.

Versão pulada acima de v0.16.0 (do agente paralelo). Migration Prisma com nome `20260501_add_integrations_power_bi`.

---

## 12. Riscos e mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| App não tem GRANT de superuser pra criar users | Bloqueia provisioning | Documentar em runbook: criar role `nexus_admin` com `CREATEROLE` no Postgres antes do deploy |
| Conexão direta da internet 5432 expõe DB | Surface attack | IP allowlist + TLS obrigatório + senha forte; alternativa Gateway documentada |
| Power BI cliente vaza credencial | Acesso não autorizado | Rotação manual + audit `password_revealed` + recomendação de senha-única-por-relatório |
| Schema Chatwoot muda → views quebram | Dashboard cliente quebra | Views são abstração; mudança é apenas em snapshot/dim_*; refazer view é ato administrativo |
| 50+ perfis criados → connection pool esgota | Lock no DB | Connection limit 2/perfil; alarme em CI Grafana `pg_stat_activity` |
| Migration Prisma conflita com v0.16.0 | Build CI quebrado | Aguardar v0.16.0 LIVE antes de migrar; rebase + revisar migrations |

---

## 13. Decisões abertas (justificadas inline)

Nenhuma — todas as decisões foram tomadas com autorização do João pra eu seguir minhas recomendações. Decisões críticas:

1. ✅ Banco a expor: **interno (Nexus Insights)**, não Chatwoot principal. (4.1)
2. ✅ Estratégia: **schema isolada `powerbi` + views derivadas**, não RLS nativo. (4.2/4.4)
3. ✅ Multi-perfil: **sim**, cada perfil = user Postgres dedicado. (4.4)
4. ✅ RLS: **opcional**, via WHERE em view derivada — não policies nativas. (4.4)
5. ✅ Conexão: **3 caminhos documentados** (Desktop / Service-Gateway / Snippet M). (4.5)
6. ✅ Visibilidade: **super_admin only** hardcoded, sem 3 níveis. (1)
7. ✅ Migration Prisma vs runtime ensure: **migration**, padrão do projeto. (5)
8. ✅ Worker dim sync: cron 30 min via BullMQ existente. (6.4)
9. ✅ TLS: **obrigatório** em produção. (9.1)
10. ✅ Decomposição: **single-spec, multi-fase no plan** (não vai virar 2 features separadas). (geral)

---

## 14. Próximos passos

- Aprovação implícita (João autorizou autonomia).
- Pente-fino #1 → v2.
- Pente-fino #2 → v3.
- `superpowers:writing-plans` → plan v1→v2→v3.
- Aguardar v0.16.0 do agente paralelo.
- `superpowers:subagent-driven-development` com TDD por task + `ui-ux-pro-max:ui-ux-pro-max` em CADA task de UI.
- Verification + push.
- Notificar João pra testar.
