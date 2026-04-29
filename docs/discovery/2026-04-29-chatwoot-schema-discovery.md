# Levantamento do banco do Chatwoot — Matrix Fitness Group

**Data:** 2026-04-29
**Acesso:** read-only via usuário `chatwoot_leitura`
**Servidor:** `82.112.245.232:5432` · DB `chatwoot` · PostgreSQL 14.20

---

## 1. Estrutura organizacional encontrada

### Accounts (multi-tenant nativo do Chatwoot)
| ID | Nome | Criado em |
|----|------|-----------|
| 2 | Invest Soluções | 2025-01-31 |
| **9** | **Matrix Fitness Group** | **2025-02-11** ← foco do projeto |

### Inboxes do Matrix Fitness Group (23, todas `Channel::Api`)
A operação está **organizada por estado brasileiro**, não por unidade física. Cada inbox = 1 estado.

| ID | Nome | Conversas | Open | Resolved | Pending | Snoozed |
|----|------|-----------|------|----------|---------|---------|
| 43 | MG-Minas Gerais | 1.511 | 73 | 1.087 | 351 | 0 |
| 53 | ZZ-Outros Estados | 1.105 | 49 | 728 | 328 | 0 |
| 31 | 00-Matrix IA | 913 | 913 | 0 | 0 | 0 |
| 38 | BA-Bahia | 867 | 46 | 699 | 122 | 0 |
| 54 | SP-São Paulo | 515 | 81 | 334 | 100 | 0 |
| 25 | DF-Distrito Federal | 459 | 59 | 359 | 41 | 0 |
| 39 | CE-Ceará | 425 | 57 | 289 | 79 | 0 |
| 40 | GO-Goiás | 403 | 68 | 255 | 80 | 0 |
| 44 | PA-Pará | 315 | 12 | 239 | 64 | 0 |
| 41 | MA-Maranhão | 248 | 5 | 201 | 42 | 0 |
| ... | (outros 13 estados) | ... | ... | ... | ... | ... |

**Observações:**
- `00-Matrix IA` tem 913 conversas, **todas `open`** — provavelmente é o inbox onde o bot/IA responde primeiro e nunca é "resolvido" formalmente.
- `ZZ-Outros Estados` é fallback pra contatos sem estado mapeado.
- Cobertura geográfica: 22 estados + DF + Outros + IA.

### Teams (4)
| ID | Nome | Auto-assign |
|----|------|-------------|
| 22 | 💰 financeiro | não |
| 23 | 🛠️ assistência técnica | não |
| 26 | 🛍️ comercial | não |
| 31 | 💎 qualidade | não |

### Usuários do Matrix
- 67 atendentes (`role=0` agent)
- 1 administrator (`role=1`)
- 6 estavam online no momento do levantamento

**Top 10 atendentes por volume:**
| ID | Nome | Conversas atendidas |
|----|------|---------------------|
| 94 | Hevelyn Damacena | 2.878 |
| 20 | Alessandra Rocha | 854 |
| 96 | Arthur Mandrani | 745 |
| 31 | Gabriely Marques | 526 |
| 90 | Kalissa Monteiro | 354 |
| 48 | Eduardo Russo | 332 |
| 36 | Neto Rezende | 240 |
| 51 | Jhuan Matheus | 115 |
| 41 | Paulo Vadi | 85 |
| 81 | Helder Heim | 78 |

(Hevelyn concentra 35% do volume — ponto de atenção operacional.)

### Inbox membership
- 617 vínculos `inbox_members` no Matrix (≈24 por inbox em média).

### Labels (12)
`concluído`, `aberto`, `template_conversa`, `template_pesquisa`, `v4`, `encerrou`, `falhou`, `template_entrega`, `emp` (lead empreendimento), `hg` (lead academia residencial), `acd` (lead academia comercial).

### Custom attributes
**Em CONTACT (`attribute_model = 0`):**
- `wpp_id` (texto)
- `message_api` (URL)
- `status_atendimento` (lista)
- `status_venda` (lista) ← **importante: pode permitir relatório de funil**
- `nome_id` (texto)

**Em CONVERSATION (`attribute_model = 1`):**
- `estado_brasil` (lista) — usado pra rotear por UF
- `chat_interno` (URL)
- `numero_pedido` (texto)

---

## 2. Volumetria geral (account_id = 9)

| Métrica | Valor |
|---------|-------|
| Conversas total | 8.061 |
| Open | 1.466 |
| Pending | 1.436 |
| Resolved | 5.117 |
| Snoozed | 26 |
| Mensagens | 261.628 |
| Contatos | 8.475 |
| Reporting events | 54.356 (`reply_time` 39.838 · `first_response` 8.417 · `conversation_resolved` 6.039) |
| CSAT responses | **0** (não está em uso) |
| SLA policies | **0** (não está em uso) |
| Range de dados | 2025-03-21 → 2026-04-29 (≈13 meses) |

### Mensagens
| Tipo | Quantidade |
|------|-----------|
| Incoming (contato) | 71.757 |
| Outgoing (agente/bot) | 121.501 |
| Activity (sistema) | 68.292 |
| Template | 0 |
| Notas internas | 28.722 |

### Backlog atual
- **919 conversas em open/pending sem assignee** — fila órfã significativa
- 1.984 conversas em open/pending com assignee
- Tempo médio aguardando: alto, com outliers de meses

---

## 3. Métricas-chave já calculáveis

### Tempo até primeira resposta (`reporting_events.name = 'first_response'`)
- Média: 1,36h
- p50: ~7s (puxado pelo bot Matrix IA respondendo na hora)
- p95: ~18,7 min
- Máx: 936h (outlier)

### Tempo de resolução (`reporting_events.name = 'conversation_resolved'`)
- p50: ~259h (≈10,8 dias)
- p95: ~3.696h (≈154 dias)

→ Resolução tem cauda muito longa; provavelmente conversas ficam abertas sem critério rígido.

### Volume por dia da semana (últimos 90 dias)
| Dia | Conversas |
|-----|-----------|
| Dom | 283 |
| Seg | 403 |
| Ter | 357 |
| Qua | 389 |
| Qui | 320 |
| Sex | 377 |
| Sáb | 268 |

→ Fim de semana = ~551 conversas/2 dias ≈ 275/dia (75% de um dia útil).

---

## 4. Schema das tabelas-chave

### `conversations`
```
id, account_id, inbox_id, status (0=open,1=resolved,2=pending,3=snoozed),
assignee_id, contact_id, contact_inbox_id, display_id, uuid, identifier,
created_at, updated_at, last_activity_at, first_reply_created_at,
contact_last_seen_at, agent_last_seen_at, assignee_last_seen_at,
team_id, campaign_id, snoozed_until, waiting_since, priority,
sla_policy_id, additional_attributes (jsonb), custom_attributes (jsonb),
cached_label_list (text)
```
Colunas-ouro pros relatórios:
- `created_at` → entrada do lead
- `first_reply_created_at` → primeiro contato do agente
- `waiting_since` → tempo sem resposta atual
- `last_activity_at` → última atividade
- `cached_label_list` → labels já desnormalizadas
- `custom_attributes->>'estado_brasil'` → UF (também via `inbox_id`)

### `messages`
```
id, content, account_id, inbox_id, conversation_id,
message_type (0=incoming,1=outgoing,2=activity,3=template),
created_at, private, status, sender_type ('User'|'Contact'|null),
sender_id, content_attributes (json), additional_attributes (jsonb),
sentiment (jsonb)
```

### `reporting_events`
```
id, name, value (segundos), value_in_business_hours,
account_id, inbox_id, user_id, conversation_id,
event_start_time, event_end_time, created_at
```
Eventos no Matrix: `reply_time`, `first_response`, `conversation_resolved`.
**`value_in_business_hours`** permite calcular SLA por horário comercial — útil pro relatório de "tempo de resposta no fim de semana vs em horário comercial".

---

## 5. O que NÃO temos no banco (limitações)

- **CSAT:** zero respostas. Tabela existe (`csat_survey_responses`), mas vazia. Sem material pra relatório de satisfação real.
- **SLA:** zero policies cadastradas. Tabelas `sla_policies`, `applied_slas`, `sla_events` vazias. Não dá pra mostrar SLA cumprido/violado.
- **Working hours:** tabela `working_hours` existe; nenhuma das 25 inboxes tem `working_hours_enabled = true`. Sem horário comercial declarado, mas `value_in_business_hours` ainda pode existir nos events.
- **Matrículas/vendas:** o atributo `status_venda` em CONTACT existe e pode ser explorado, mas o usuário pediu pra não focar nisso por imprecisão.

---

## 6. Implicações pro design

1. **Multi-tenancy do dashboard:** o banco é multi-account. Sempre filtrar por `account_id = 9` (Matrix). No futuro pode escalar pra outros accounts (Invest = 2) com filtro por usuário.
2. **"Unidade" = "estado" (UF) via inbox:** o conceito de "filtro por unidade" naturalmente vira "filtro por estado".
3. **Bot Matrix IA distorce métricas:** todas conversas no inbox 31 (`00-Matrix IA`) ficam abertas e o bot puxa o tempo médio de primeira resposta pra ~7s. Relatórios precisam de **opção de excluir o inbox da IA** ou separar "resposta do bot" vs "resposta humana" (provavelmente filtrando `reporting_events.user_id IS NOT NULL` ou olhando o `sender_id`/`sender_type` da primeira mensagem outgoing).
4. **Backlog crítico:** 919 conversas órfãs. Painel inicial deve destacar isso.
5. **Labels desnormalizadas em `cached_label_list`:** facilita relatório de "leads por origem" (label `v4`) e tipo (`emp`/`hg`/`acd`).
6. **CSAT/SLA sem dados:** construir as telas mas com placeholder "ative no Chatwoot pra ver dados aqui" — não inventar.
