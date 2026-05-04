# Runbook — Multi-tenant Realtime (Fase 1)

Operação básica das `nexus_chat_connections` e `company_chat_bindings` introduzidas pela Fase 1 do épico Multi-tenant Realtime. Procedimentos voltados a **super_admin**.

> Spec: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md`.
> Plan: `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase1.md`.

---

## 1. Cadastrar nova conexão (`nexus_chat_connection`)

1. Acessar `/configuracoes/conexoes` (super_admin only — outros papéis veem redirect para `/dashboard`).
2. Botão **"Nova conexão"** abre Dialog.
3. Preencher: nome, host, porta (default 5432), banco, usuário, senha (cifrada AES-256-GCM), SSL mode (default `prefer`).
4. Salvar — a conexão é criada com `status='active'`. `passwordEnc` nunca aparece na UI; após salvar a senha não é mais visível.
5. Clique no ícone **TestTube** (Testar) na linha → executa `SELECT 1` com timeout 10 s. Resultado:
   - Verde "Conectado em X ms" → atualiza `lastTestAt`.
   - Vermelho com mensagem de erro → atualiza `lastTestAt` e `lastTestError`.

A operação é auditada em `audit_logs.action='nexus_chat_connection_created'` (e `_tested` quando rodar Test).

## 2. Cadastrar nova empresa (`company_chat_binding`)

1. Em `/configuracoes/conexoes`, clicar no ícone **Database** ("Ver bindings") da connection desejada.
2. Sheet lateral abre listando bindings dessa connection.
3. Botão **"Nova empresa"** abre Dialog.
4. Preencher: `chatwoot_account_id` (integer, account_id dentro daquela instalação), `display_name` (nome amigável), `enabled` (default true).
5. Salvar.

**Constraint operacional crítico:** o `chatwoot_account_id` deve ser único entre **todas** as connections enabled. Se já existe outra empresa com aquele `account_id` em outra connection, a Server Action rejeita com mensagem explícita. Isso previne `AmbiguousBindingError` no resolver.

## 3. Smoke test manual pós-deploy

```bash
# 1. /api/health responde 200 com connections[]
curl -s https://nexus-insights.example.com/api/health | jq .connections

# 2. Login super_admin → /configuracoes/conexoes → conexão "Padrão (legado)" listada.
# 3. Click Test na connection → Toast verde "Conectado em X ms".
# 4. Open binding sheet → 1+ binding (Matrix etc).
# 5. Open /relatorios/visao-geral → dados carregam normalmente (mesma UX, agora via pool dinâmico).
```

## 4. Como rodar o seed manualmente

O seed (criação da connection seed + bindings + backfill em 6 tabelas) roda automaticamente no boot do worker (`src/worker/index.ts`). É idempotente.

Se precisar rodar manualmente (ex.: após restore de backup):

```bash
# Dentro do container do worker, ou em ambiente com DATABASE_URL + CHATWOOT_DATABASE_URL + ENCRYPTION_KEY setados:
node -e "
const { runConnectionsSeedIfNeeded } = require('./dist/lib/nexus-chat/seed');
runConnectionsSeedIfNeeded().then(r => console.log(JSON.stringify(r, null, 2)));
"
```

A flag de idempotência é `app_settings.connections_seeded_at`. Se quiser forçar re-seed (raro), apague a entrada e o registro da connection "Padrão (legado)" — atenção, isso cria órfãos em `chatwoot_facts_*.connection_id`.

Lock advisory usado: **8472938**. Apenas 1 processo entra por vez.

## 5. Invalidar pool de uma conexão

Cenário: você editou manualmente uma `nexus_chat_connection` via SQL (não via Server Action) e o pool em memória do app/worker está stale.

```bash
redis-cli -u "$REDIS_URL" PUBLISH 'nexus-insights:realtime' \
  '{"type":"connection:updated","connectionId":"<UUID-AQUI>"}'
```

App e worker subscritos ao canal vão chamar `invalidateNexusChatPool(<UUID>)` localmente. Próximo uso recria o pool com config fresca.

## 6. Ler audit logs

```sql
SELECT created_at, user_id, action, target_id, details
FROM audit_logs
WHERE action LIKE 'nexus_chat_connection%' OR action LIKE 'company_chat_binding%'
ORDER BY created_at DESC
LIMIT 50;
```

Ações disponíveis (ordem cronológica):
- `nexus_chat_connection_created` / `_updated` / `_deleted` / `_tested`
- `company_chat_binding_created` / `_updated` / `_deleted`

`details` JSON jamais contém password (texto ou cifrado).

## 7. pg_dump pré-rollback (Lote 9)

Antes de aplicar a migration de `connection_id NOT NULL` + nova PK em `chatwoot_facts_*`:

```bash
# Snapshot lógico das 6 tabelas pré-NOT-NULL.
pg_dump --table=chatwoot_facts_daily_by_account \
        --table=chatwoot_facts_daily_by_inbox \
        --table=chatwoot_facts_daily_by_agent \
        --table=chatwoot_facts_daily_by_team \
        --table=chatwoot_facts_hourly_by_account \
        --table=chatwoot_facts_meta \
        "$DATABASE_URL" > backup-pre-fase1.sql

# Validar tamanho razoável (não-vazio).
ls -lh backup-pre-fase1.sql
```

**Validar pré-condição:** `WHERE connection_id IS NULL` deve ser zero antes de aplicar `NOT NULL`:

```sql
SELECT 'daily_by_account' AS tabela, COUNT(*) FROM chatwoot_facts_daily_by_account WHERE connection_id IS NULL
UNION ALL SELECT 'daily_by_inbox', COUNT(*) FROM chatwoot_facts_daily_by_inbox WHERE connection_id IS NULL
UNION ALL SELECT 'daily_by_agent', COUNT(*) FROM chatwoot_facts_daily_by_agent WHERE connection_id IS NULL
UNION ALL SELECT 'daily_by_team', COUNT(*) FROM chatwoot_facts_daily_by_team WHERE connection_id IS NULL
UNION ALL SELECT 'hourly_by_account', COUNT(*) FROM chatwoot_facts_hourly_by_account WHERE connection_id IS NULL
UNION ALL SELECT 'facts_meta', COUNT(*) FROM chatwoot_facts_meta WHERE connection_id IS NULL;
```

Se algum > 0, NÃO aplicar a migration de constraint — investigar antes (worker travado? seed não rodou?).

## 8. Sair do freeze operacional (cadastrar 2ª connection real)

Por default, `app_settings.allow_secondary_connection = false` (não definido). A criação de connection 2+ pelo super_admin é permitida na UI **mas** o onboarding real (cliente em produção) só deve ser feito após Fase 2 LIVE em produção por 7 dias seguidos sem regressões.

Para liberar quando for hora:

```sql
INSERT INTO app_settings (key, value, category, updated_at)
VALUES ('allow_secondary_connection', '{"at": "2026-05-XX", "by": "joao"}'::jsonb, 'system', NOW())
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = NOW();
```

## 9. Troubleshooting

### `ConnectionUnavailableError`

Lançado por `getNexusChatPool` quando a connection foi soft-deletada ou está com `status != 'active'`.

- Causa típica: super_admin pausou a connection ou apagou.
- Resolução: ir em `/configuracoes/conexoes`, ativar (atualizar status para 'active' via update direto se a UI ainda não permitir).

### `NoActiveBindingError`

Lançado por `getActiveConnectionId` quando não há `company_chat_binding` enabled para o `chatwoot_account_id` ativo do user.

- Causa típica: super_admin apagou o binding sem antes ajustar `user_account_access`.
- Resolução: criar binding novo OU revogar acesso do user à account (via `/usuarios`).

### `AmbiguousBindingError`

Lançado quando o mesmo `chatwoot_account_id` aparece em 2+ connections enabled — corrupção de invariante.

- Causa: edição manual via SQL contornando a Server Action que valida unicidade.
- Resolução: manualmente desabilitar a binding incorreta:
  ```sql
  UPDATE company_chat_bindings
  SET enabled = false, deleted_at = NOW()
  WHERE id = '<UUID-DA-BINDING-ERRADA>';
  ```
  Depois publicar `connection:updated` para invalidar pools.

### Pool exhaustion no banco do Chatwoot

`getChatwootPool` (legado) e `getNexusChatPool` por connection rodam com `min: 0, max: 2`. Se 100 connections estão ativas → 200 conexões abertas no host do app (não no Chatwoot — cada pool é separado para cada banco).

Se o **banco do Chatwoot** atingir CONNECTION LIMIT 5 (limite atual do user `chatwoot_leitura`), reduza `max` para 1 em `src/lib/nexus-chat/pool.ts` ou peça ao DBA para aumentar o limite no banco do Chatwoot.

## 10. Referências

- Spec Fase 1: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md`
- Spec Fase 2 (webhook): `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md`
- Spec Fase 3 (UI completa): `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md`
- Plan Fase 1: `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase1.md`
- Encriptação: `src/lib/encryption.ts` (chave em env `ENCRYPTION_KEY`, 64 hex chars).
- Pool dinâmico: `src/lib/nexus-chat/pool.ts`.
- Resolver: `src/lib/reports/active-connection.ts`.
- Server Actions: `src/lib/actions/nexus-chat/{connections,bindings}.ts`.
- UI: `src/app/(protected)/configuracoes/conexoes/page.tsx` + `src/components/settings/nexus-chat/*`.
