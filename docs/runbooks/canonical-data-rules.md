# Runbook: Regras Canônicas de Dados (v0.42)

> Fonte única da verdade para semântica de métricas, filtros de período e CTEs de mensagens.
> Qualquer nova query deve consumir os helpers de `src/lib/reports/canonical.ts`.

---

## 1. Filtro de período padrão

**`periodColumn = "active"` (padrão):**
```sql
c.last_activity_at >= $start AND c.last_activity_at < $end
```
Significa: "conversa com movimentação no período". Usado por todas as métricas exceto Recebidas.

**`periodColumn = "created"` (somente para Recebidas):**
```sql
c.created_at >= $start AND c.created_at < $end
```
Significa: "conversa criada no período". Usado **exclusivamente** pelo KPI Recebidas e pelo relatório de leads recebidos.

**Regra de ouro:** `COALESCE(last_activity_at, created_at)` é **proibido** no WHERE — invalida índice Postgres. `last_activity_at` é NOT NULL no schema atual do Chatwoot.

---

## 2. Definições de status

| Métrica | Filtro SQL | Coluna de período |
|---------|-----------|-------------------|
| Recebidas | *(sem filtro de status)* | `c.created_at` |
| Abertas | `c.status = 0` | `c.last_activity_at` |
| Pendentes | `c.status = 2` | `c.last_activity_at` |
| Resolvidas | `c.status = 1` | `c.last_activity_at` |
| Sem resposta | `c.status = 0` + última msg classificável = incoming | `c.last_activity_at` |
| Aberta há | `c.status = 0` + última msg classificável = outgoing | *(live, sem corte de período)* |

Constantes em `src/lib/reports/canonical.ts`:
```typescript
STATUS_OPEN = 0, STATUS_RESOLVED = 1, STATUS_PENDING = 2, STATUS_SNOOZED = 3
```

---

## 3. CTEs canônicas de classificação de mensagens

### `buildLastClassificationMsgCte()`
Última mensagem que classifica a conversa entre "sem resposta" e "aberta há":
- **incoming pública** (`message_type=0 AND private=FALSE`) → cliente falou
- **outgoing qualquer** (`message_type=1`) → agente movimentou

Exclui: system (`type=2`), template (`type=3`), incoming privada.

### `buildLastIncomingPublicMsgCte()`
Para `waiting_seconds = NOW() - lcm.msg_created_at`. Somente incoming público.

### `buildLastOutgoingAnyMsgCte()`
Para `open_seconds = NOW() - loam.msg_created_at`. Somente outgoing (qualquer privacidade).

**Regra:** nunca usar subqueries ad-hoc para classificar última mensagem. Sempre usar uma das 3 CTEs acima.

---

## 4. Semana canônica

**Regra suprema:** semana começa na **segunda-feira** e termina no **domingo**.

- `weekStartsOn = 1` hardcoded em `getCanonicalPeriod` em `src/lib/datetime-core.ts`.
- `end` é **EXCLUSIVE** (próximo 00:00 BRT). SQL: `column >= start AND column < end`.
- Settings de DB (`dashboard.week_starts_on`, `week_mode`) são deprecados desde v0.42 e ignorados.

---

## 5. Matrix IA

Inbox ID 31. Helpers em `canonical.ts`:

```typescript
chatwootMatrixIaClause(excludeMatrixIA: boolean)  // AND c.inbox_id <> 31
chatwootMatrixIaOnlyClause()                       // AND c.inbox_id = 31
```

Relatório dedicado (`src/lib/chatwoot/queries/matrix-ia.ts`) força `inbox_id = 31` em todas as queries.

---

## 6. Pré-agregação e alinhamento

Os 4 jobs de pré-agregação (`refresh-by-account/inbox/team/agent`) já usam:
- `received`: `c.created_at` ∈ dia
- `resolved`: `c.last_activity_at` ∈ dia AND `status=1`

Alinhado com as definições canônicas acima desde v0.42.

---

## 7. Cache keys

Toda query que foi migrada para v0.42 tem cache key com sufixo `-canonical-v0.42`.
Ao alterar a semântica de uma query existente, incremente o sufixo (ex: `-canonical-v0.43`).

---

## 8. Checklist para novas queries

- [ ] Usar `buildBaseFilter({ ..., periodColumn: "active" | "created" })` de `filters.ts`
- [ ] Usar `chatwootMatrixIaClause(excludeMatrixIA)` para exclusão/inclusão da Matrix IA
- [ ] Usar uma das 3 CTEs canônicas quando precisar classificar última mensagem
- [ ] Cache key com sufixo `-canonical-v0.42`
- [ ] Adicionar comentário `@canonical` no JSDoc do arquivo
- [ ] Escrever teste que verifica a semântica da query (SQL contém as cláusulas certas)
