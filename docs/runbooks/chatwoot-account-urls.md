# Runbook — URLs Públicas Chatwoot (v0.16.0)

**Última atualização:** 2026-05-01 (v0.16.0)
**Tela:** `/configuracoes` (card "URLs Públicas Chatwoot")
**Quem acessa:** super_admin only.

---

## 1. O que é

Card novo em `/configuracoes` que permite mapear cada `account_id` Chatwoot (descobertas via DISTINCT em `chatwoot_facts_daily_by_account`) para uma **URL pública** (ex.: `https://chat.matrix360.com.br`).

A URL é usada pelo Agente Nex para gerar **deep-links** quando o usuário pede "abrir conversa X" no chat.

---

## 2. Onde o Agente Nex usa

O `composeSystemPrompt` (em modo NÃO manual) injeta seção `## URLs públicas das contas` no system prompt apenas se houver ≥ 1 ChatwootAccountUrl configurada:

```
## URLs públicas das contas

- Conta 1 (Matriz): https://chat.matrix360.com.br
- Conta 2 (Filial Curitiba): https://chat-cwb.matrix360.com.br
```

E define formato de deep-link na IDENTITY_BASE:

```
{publicUrl}/app/accounts/{accountId}/conversations/{conversationId}
```

Exemplo: pedir "Abre a conversa 4827 da matriz" → agente responde com link `https://chat.matrix360.com.br/app/accounts/1/conversations/4827`.

**Em modo prompt manual**: a seção NÃO é injetada (override desabilita identidade + URLs).

---

## 3. Como configurar (passo a passo)

1. **Login como super_admin** em `https://insights.nexusai360.com`.
2. Ir em `/configuracoes`.
3. Localizar card "URLs Públicas Chatwoot" (geralmente abaixo de "Visibilidade dos relatórios").
4. Lista mostra todas as accounts conhecidas (DISTINCT `account_id` de `chatwoot_facts_daily_by_account`).
5. Para cada conta:
   - Input "URL pública" (ex.: `https://chat.matrix360.com.br` — **sem barra final**).
   - Input opcional "Label" (ex.: `Matriz`, `Filial Curitiba`).
   - Botão **Salvar** explícito por linha.
6. Clicar Salvar:
   - URL preenchida → UPSERT (insert ou update).
   - URL vazia → DELETE da row (limpa mapping).
7. Audit log registra `setting_updated` com `previous`/`next`.

---

## 4. Validação de URL

- Aceita HTTPS (recomendado) e HTTP (dev).
- Sem barra final (a UI normaliza).
- Hostname válido (sem espaços, caracteres ilegais).
- **Sem path** (apenas scheme://host[:port]).

Exemplo válido: `https://chat.matrix360.com.br`
Exemplo inválido: `https://chat.matrix360.com.br/app/accounts/1` (path)

---

## 5. Schema (migration v0.16.0)

```sql
CREATE TABLE chatwoot_account_urls (
  account_id        BIGINT PRIMARY KEY,
  public_url        TEXT NOT NULL,
  label             TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id     UUID REFERENCES "User"(id) ON DELETE SET NULL
);
```

Sem soft delete — URL vazia significa "não configurada" e a row é DELETED.

---

## 6. Override desativado por design

Importante: **ativar Modo prompt manual** em `/agente-nex/prompt` desativa também o injeção das URLs públicas no system prompt.

Em modo manual o super_admin é responsável por incluir manualmente o que precisar do prompt.

---

## 7. Migration deploy em produção

A migration `20260501_v0_16_kb_url_chatwoot_urls_audit` é **aditiva** (nunca dropa nada). Deploy manual:

### 7.1 Conectar ao Postgres prod

```bash
# Pelo painel Portainer, container "db" → console:
psql -U "${POSTGRES_USER}" "${POSTGRES_DB}"

# OU via DATABASE_URL local:
psql "${DATABASE_URL}"
```

### 7.2 Aplicar migration

```bash
psql "${DATABASE_URL}" < prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/migration.sql
```

### 7.3 Smoke pós-migration

```sql
-- nex_kb_documents ganhou kind + source_url
\d nex_kb_documents
-- Esperado: colunas kind (TEXT, default 'PDF'), source_url (TEXT, nullable)

-- nex_settings ganhou seeded_defaults_at
\d nex_settings
-- Esperado: coluna seeded_defaults_at (TIMESTAMPTZ, nullable)

-- chatwoot_account_urls existe
\d chatwoot_account_urls
-- Esperado: tabela com account_id PK + public_url + label + updated_at + updated_by_id

-- Backfill condicional dos 5 guardrails default rodou
SELECT id, jsonb_array_length(guardrails) AS qtd_guardrails, seeded_defaults_at
FROM nex_settings;
-- Esperado: qtd_guardrails ≥ 5 OU seeded_defaults_at NULL (caso super_admin já tinha customizado).
```

### 7.4 Rollback

Migration aditiva — para rollback fazer manualmente:

```sql
DROP TABLE IF EXISTS chatwoot_account_urls;
ALTER TABLE nex_kb_documents DROP COLUMN IF EXISTS kind, DROP COLUMN IF EXISTS source_url;
ALTER TABLE nex_settings DROP COLUMN IF EXISTS seeded_defaults_at;
```

Atenção: dropar `kind`/`source_url` perde KB do tipo URL (volta apenas PDF/TXT).

---

## 8. Audit

Toda mutação loga:

```sql
SELECT created_at, actor_email, payload->'previous' AS prev, payload->'next' AS next
FROM audit_log
WHERE event = 'setting_updated'
  AND payload->>'subject' = 'chatwoot_account_url'
ORDER BY created_at DESC LIMIT 50;
```

---

## 9. Troubleshooting

| Sintoma | Possível causa | Ação |
|---------|---------------|------|
| Conta não aparece na lista | Sem facts em `chatwoot_facts_daily_by_account` | Aguardar pré-agregação rodar (cron 5min); ver runbook `pre-agregacao.md` |
| Deep-link Agente Nex não funciona | URL não configurada / configurada errada | Configurar URL nesta tela; salvar; testar de novo no /agente-nex/prompt playground |
| Agente diz "URL não configurada" | Override (modo manual) ativo | Desativar modo manual em `/agente-nex/prompt` |
| URL salva mas Agente Nex ignora | Cache de prompt no servidor | Hard refresh; aguardar próxima requisição (não há cache server-side de prompt) |
| Salvar retorna erro 403 | Não é super_admin | Pedir pra super_admin configurar |

---

## 10. Referências

- Spec: `docs/superpowers/specs/2026-05-01-suite-agente-nex-refinement-v3.md` (Section F)
- Plan: `docs/superpowers/plans/2026-05-01-suite-agente-nex-refinement-v3.md` (T6f)
- Migration: `prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/`
- Schema Prisma: `model ChatwootAccountUrl` em `prisma/schema.prisma`
- Action: `src/lib/actions/chatwoot-account-urls.ts`
- Componente: `src/components/configuracoes/chatwoot-account-urls-card.tsx`
- Runbook Prompt: `docs/runbooks/agente-nex-prompt-v0.16.md`
- Runbook Pré-agregação: `docs/runbooks/pre-agregacao.md`
