# Dashboard Polish v0.22.0 — Design Spec

> **Status:** v3 final (após v1 → review#1 → v2 → review#2 → v3 — metodologia §3 do CLAUDE.md).
> **Owner:** claude-dashboard-polish-v022
> **Target version:** v0.22.0
> **Data:** 2026-05-02

## Sumário executivo

Pacote de polish do `/dashboard` baseado em feedback rev visual + bugs reais de dados:

- **G1 — PeriodNavigator**: tag-style maior (mesmo padrão das checkboxes Recebidas/Abertas/Resolvidas/Pendentes), text-sm, padding generoso, mantendo violeta sutil.
- **G2 — Bug do gráfico semana/mês inconsistente com o gráfico do dia**: investigar e corrigir matching de buckets entre `fillBuckets` (client) e SQL `date_trunc … AT TIME ZONE`.
- **G3 — KPI cards do topo (4 quadradinhos)**: refactor pro padrão visual dos KPIs do `/agente-nex/consumo` — label UPPERCASE pequeno em cima, valor 3xl bold, subtitle "no período" muted, ícone top-right; preservar sparkline + hover "ver detalhes" + click → drill-down.
- **G4 — Drill-downs dos 4 KPIs**:
  - Renomear "Inbox" → "Estado" (apenas em UI; campo interno mantém `inboxName` por escopo).
  - "Distribuição por estado": `yAxisWidth` 120 → 160 e `height` proporcional ao número de itens; **todos os labels visíveis** (sem pular).
  - "Distribuição por hora": labels viram só "01:00", "02:00", … (não "01:00 – 01:59"; janela completa fica no tooltip).
  - Tabela: coluna "Inbox" → "Estado", **adicionar coluna "Departamento"** depois de Estado, **tag âmbar** na coluna "Quando" (mesmo padrão de "Esperando há"), título da seção com badge violeta destacado em "X no total" (não "X no total" pequenininho).
- **G5 — Drill-down "Conversas sem resposta" — bugfix de contagem**: alinhar `getNoResponseDrillDown` ao widget (`dashboardData.noResponse`) — passa a usar `last_activity_at` ∈ período + filtro `message_type IN (0,1)` no last_msg. Hoje 31 vs 11 por divergência de definição.
- **G6 — Drill-down "Conversas sem resposta" — substituir "Resumo / Snapshot atual"** por **donut "Faixa de espera"** com 4 buckets fixos (0–4h yellow, 4–24h amber, 1–3d orange, >3d red), mostrando contagem + fatia.
- **G7 — Drill-down "Conversas sem resposta" — tabela**:
  - Remover coluna "Última msg" (redundante com "Esperando há").
  - "Inbox" → "Estado" + adicionar "Departamento".
  - Tag âmbar na coluna "Esperando há" (já existe no card hero — replicar).
  - Título "Conversas sem resposta (N)" com badge destacado (não "(N)" entre parênteses cosmético).
- **G8 — Padronização do título total**: helper `<TotalBadge n={N} />` reutilizável em todos os títulos das seções de tabela do drill-down (Recebidas, Resolvidas, Abertas, Sem resposta), usando o mesmo design.

**Out of scope (decisão honesta):**
- Renomear `inboxName` → `stateName` em código (refactor gigante sem ganho real ao usuário).
- Mexer em `area-chart.tsx`, `bar-chart.tsx`, `donut-with-center.tsx` (claude-nex-suite-polish-v020 está editando — uso a API existente).
- Mexer em `dashboard/page.tsx` (claude-empresa-ativa-global está editando).

---

## Fluxo geral atual (referência rápida)

```
/dashboard (Server) — DashboardPage
  └── DashboardContent (Client)
        ├── DashboardFilters (Dia/Semana/Mês + Refresh) ← NÃO TOCAR
        ├── KpiClickableCard × 4 (G3) ← REFACTOR
        ├── ConversationsLineChart (G1, G2)
        │     └── PeriodNavigator (G1)
        ├── NoResponseCard (hero) ← NÃO TOCAR (já bom)
        ├── 4× DrillDownDialog (recebidas/resolvidas/abertas/taxa) ← NÃO TOCAR
        │     └── ReceivedDrillDownContent etc. (G4) ← REFACTOR
        └── DrillDownDialog "Conversas sem resposta" (G5, G6, G7)
              └── NoResponseDrillDownContent ← REFACTOR
```

Server-side:
- `dashboard-data.ts` — query do dashboard principal (KPIs + chart + noResponse widget). **Tocar só se G2 exigir.**
- `dashboard-drill-down.ts` — queries dos drill-downs. **Tocar:** G4 (adicionar `team_name` JOIN nas queries de Recebidas/Resolvidas/Status) + G5 (alinhar `getNoResponseDrillDown` ao widget).
- `dashboard.ts` (action) — não muda.
- `dashboard-drill-down.ts` (action) — pode precisar passar tz pro client, mas provável que não.

---

## G1 — PeriodNavigator tag-style

### Problema
Hoje o componente tem h-5, text-[11px], padding 0.5 — muito pequeno e apagado. João descreveu como "tá pequenininho, queria que ficasse maior, parecido com o tamanho das Checkboxes Recebidas/Abertas/Resolvidas/Pendentes".

### Solução
- Container: `inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/5 px-2 py-1.5 text-sm font-medium transition-all hover:border-violet-500/60 hover:bg-violet-500/10`.
- Botões prev/next: `h-7 w-7` (era `h-5 w-5`), chevrons `h-4 w-4` (era `h-3 w-3`), violet-300 → violet-100 no hover.
- Label: `px-2 text-sm font-medium tabular-nums text-violet-100 select-none whitespace-nowrap` (era text-[11px]).
- Disabled state do "next" mantém comportamento, mas com `opacity-30 cursor-not-allowed`.
- Toda a coluna ARIA preservada (`role=group`, `aria-label`, etc.).

### Impacto visual
Tag fica do tamanho das checkboxes do gráfico (px-3 py-1.5 text-sm). Chevrons clicáveis e perceptíveis. Cor violeta sutil — não compete com o título do card.

### Decisão
Mantém posicionamento atual no `CardHeader` (right-aligned, ao lado do título). Não muda layout do header; só o tamanho do componente interno.

---

## G2 — Bug do gráfico semana/mês inconsistente com dia

### Sintoma observado
- Modo "Dia" em 01/05/2026: mostra picos de 2-3 conversas em diversos horários (~8-12 totais visíveis no gráfico).
- Modo "Semana" cobrindo 27/04–03/05: 01/05 mostra valores próximos de 0.
- Modo "Mês" MAI/26: tooltip em 01/05 mostra "Recebidas: 1, Pendentes: 1" — totalmente inconsistente com o agregado horário do dia.

### Hipóteses (ordem de probabilidade)
1. **Bucket key mismatch entre SQL e fillBuckets**: SQL retorna `bucket = (date_trunc('day', c.created_at AT TIME ZONE tz) AT TIME ZONE tz)` — produz timestamp UTC representando 00:00 no `tz`. fillBuckets gera empty buckets via `fromZonedTime("YYYY-MM-DDT00:00:00", tz)` (mesmo timestamp UTC) e indexa em `realByKey` por `Intl.DateTimeFormat en-CA timeZone tz` da bucket date. **Em tese deveria casar.** Bug seria: chega no client um `bucket = "2026-05-01T03:00:00.000Z"` (00:00 BRT em maio) → `formatToParts en-CA timeZone "America/Sao_Paulo"` → "2026-05-01" ✓. Empty bucket gera `fromZonedTime("2026-05-01T00:00:00", "America/Sao_Paulo")` → "2026-05-01T03:00:00.000Z" ✓ → `formatToParts` da mesma data → "2026-05-01" ✓. **Logicamente casa.**
2. **Período diferente entre dia/semana/mês**: pode ser que `weekStartsOn`, `current.start`, `current.end` em modo "semana"/"mês" usem janela que **exclui dados** que aparecem no dia — ex.: tz boundary off-by-one. `getDashboardPeriod` usa `startOfMonth(refInTz)` + `endOfMonth(refInTz)` + `fromZonedTime` — em tese correto, mas vale validar com `console.log(current.start.toISOString(), current.end.toISOString())` em runtime.
3. **excludeMatrixIA flag inconsistente**: `shouldExcludeMatrixIA()` é executado a cada chamada — improvável mudar entre dia/semana, mas vale checar.
4. **Cache pull-through stale**: cache key v8 inclui `forcedGranularity` no hash → invalidação correta. Improvável, mas TTL=30s pode mascarar dado fresco se houve mudança recente.

### Estratégia
- **Diagnóstico em runtime**: adicionar log estruturado (server-side) em `dashboardData()` registrando `period.start.toISOString()`, `period.end.toISOString()`, `granularity`, `chart.length`, `chart[0]`, `chart[chart.length-1]`. Testar em dev local com mesma referenceDate em dia/semana/mês — comparar `chart` arrays.
- **Diagnóstico no client**: log temporário em `fillBuckets` mostrando key gerado vs key do data.
- **Correção**: depende do que o diagnóstico mostrar. Hipóteses prováveis e ações:
  - Se SQL retorna bucket UTC inesperado → ajustar `date_trunc` ou query.
  - Se fillBuckets matching falha → ajustar `Intl.DateTimeFormat` opções.
  - Se `getDashboardPeriod` produz range errado → corrigir `startOfMonth`/`endOfMonth`.

### Critério de aceitação
Em 02/05/2026 com data de produção, abrir dashboard em "Dia" referenceDate=01/05 → anotar totais (visualmente ou somando hover-tooltip por hora). Trocar pra "Semana" (27/04–03/05) → tooltip em 01/05 deve **bater exatamente** com a soma do "Dia". Trocar pra "Mês" (MAI/26) → tooltip em 01/05 idem.

### Risco / contingência
Se a investigação for inconclusiva sem acesso a banco real, criar PR de "diagnostic logging only" e deixar o bug fix como hotfix v0.22.1 após telemetria. **Não vou fingir que arrumei sem evidência.**

---

## G3 — KPI cards do topo (refactor)

### Estado atual (`KpiClickableCard`)
```
[ícone bg]                     [trend ↗ +12.3%]
                                       ver detalhes →

22                              ← 2xl
Conversas resolvidas            ← xs muted
~~~~ sparkline                  ← bottom
```

### Estado alvo (padrão `KpiCard` do consumo)
```
CONVERSAS RESOLVIDAS              [ícone bg]
                                       ver detalhes →

22                              ← 3xl bold
↗ +12.3%                        ← trend abaixo
no período                      ← subtitle muted
~~~~ sparkline                  ← bottom
```

### Mudanças no `KpiClickableCard`
1. Reorganizar layout: header com `<label uppercase>` à esquerda, ícone à direita (top-right) + hint "ver detalhes" abaixo do ícone (hover only).
2. Valor: `text-2xl` → `text-3xl` (igual KpiCard consumo) `font-bold tracking-tight`.
3. Trend: posição abaixo do valor (não top-right como hoje). Mantém ícone direcional + cor (emerald/red/muted).
4. Adicionar prop opcional `subtitle` ("no período") — quando ausente, prop antiga `sublabel` continua funcionando como fallback (compat retroativo).
5. Sparkline: mantém posição final do card, mantém opacity 0.9 → 1 no hover.
6. Click handler: idem hoje (chama `onClick`).
7. Tour `data-attrs` no parent `motion.div` preservados (data-tour="dashboard-kpis").
8. Aria-label: ajustar para `"${label}: ${value}. ${subtitle ?? ''} Clique para ver detalhes."` (mantém afinal de descrever o número).

### Compat
A interface pública mantém: `icon`, `iconColor`, `iconBg`, `label`, `value`, `trend`, `badge`, `miniChart`, `onClick`, `ariaLabel`, `className`. Adiciona: `subtitle?: string`. Remove: `sublabel?: string` é mantido por compat mas alias para subtitle quando ambos ausentes.

### Em `dashboard-content.tsx`
- 4 `<KpiClickableCard>` recebem `subtitle="no período"` (ou variação por contexto).
- Card "Abertas": hoje tem `sublabel="(no período)"`. Trocar pra `subtitle="no período"`.

### Acessibilidade
- Touch target preservado (mínimo 44px atendido pelo card inteiro h ≥ 7rem).
- Foco visível mantido (focus-visible ring violeta 30%).
- Reduced motion mantido.

---

## G4 — Drill-downs dos 4 KPIs

Aplica em todos os `*DrillDownContent` em `src/components/dashboard/drill-down-contents.tsx`:

### G4.1 — Renomear "Inbox" → "Estado" (UI only)
Headers, títulos de seção, labels:
- `<DrillDownSection title="Distribuição por inbox" …>` → `title="Distribuição por estado"`.
- `<DrillDownSection title="Top 10 inboxes que receberam mais conversas">` → `description="Top 10 estados com mais conversas recebidas"`.
- `<TableHead>Inbox</TableHead>` → `<TableHead>Estado</TableHead>`.

Não muda: `inboxName`, `byInbox`, `inbox_id`, `inboxes` (banco/contrato).

### G4.2 — "Distribuição por estado" — todos os labels visíveis
- Atual: `yAxisWidth={120}`. Curtos como "PB-Paraíba" cabem; longos como "ZZ-Outros Estados" são truncados ou omitidos pelo recharts (preserveStartEnd).
- Alvo: `yAxisWidth={160}`, `height={Math.max(280, byInboxData.length * 28 + 60)}` (28px por linha + padding) — escala com volume. Tipografia mantida (sem reduzir o tick fontSize).
- `tick` do YAxis recebe `interval={0}` para forçar todos os labels.

### G4.3 — "Distribuição por hora do dia" — labels só HH:00
- Atual: `name: "${hh}:00 – ${hh}:59"` (no nome do data point).
- Alvo:
  - `name: "${hh}:00"` (label visível no XAxis).
  - **Janela completa** (`HH:00 – HH:59`) vai para o tooltip via prop nova `tooltipLabelExtra` ou via custom data field — mas isso exigiria mexer em `area-chart.tsx` (não posso). **Plano B**: incluir só o XAxis label; o tooltip do recharts mostra o `name` (que é "HH:00"); a descrição da seção (`<DrillDownSection description="Cada coluna cobre HH:00 – HH:59">`) já comunica a janela. **Aceito perda de tooltip detalhado.**

### G4.4 — Tabelas: coluna "Estado" + nova "Departamento"
**Mudança no contrato `DrillDownConversationItem`:**
```ts
// Acrescentar:
teamName: string | null;
```

**Mudança nas queries SQL** (`getReceivedDrillDown`, `getResolvedDrillDown`, `getStatusDrillDown` em `dashboard-drill-down.ts`):
```sql
SELECT
  c.id, c.display_id,
  ct.name AS contact_name,
  i.name AS inbox_name,
  t.name AS team_name,        -- ← novo
  u.name AS assignee_name,
  c.status,
  c.last_activity_at
FROM conversations c
LEFT JOIN contacts ct ON ct.id = c.contact_id
LEFT JOIN inboxes i ON i.id = c.inbox_id
LEFT JOIN teams t ON t.id = c.team_id   -- ← novo
LEFT JOIN users u ON u.id = c.assignee_id
WHERE c.account_id = $1 …
```

**Mudança em `ConversationTable` (drill-down-contents.tsx):**
```
| Quando | Contato | Estado | Departamento | Atendente | Status | Ação |
```
- Coluna "Departamento" entre "Estado" e "Atendente". Width truncate `max-w-[140px]` igual estado.
- `item.teamName ?? "—"`.

### G4.5 — Tag âmbar na coluna "Quando"
- Atual: `<TableCell …>{formatRelativeShort(item.lastActivityAt)}</TableCell>` (texto puro muted).
- Alvo:
  ```tsx
  <TableCell>
    <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
      {formatRelativeShort(item.lastActivityAt)}
    </span>
  </TableCell>
  ```
- Aplicar nos 4 drill-downs (Recebidas, Resolvidas, Status, By-Team).

### G4.6 — Título da seção com badge destacado
Helper novo `<TotalBadge n={N} />`:
```tsx
function TotalBadge({ n }: { n: number }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-violet-300">
      {n.toLocaleString("pt-BR")}
    </span>
  );
}
```
Usar em:
- `<DrillDownSection title={<>Conversas recebidas <TotalBadge n={data.total} /></>}>` (em vez de `title={`Conversas recebidas — ${total} no total`}`).
- Idem nos outros 3 drill-downs (Resolvidas, Status, Sem resposta).
- O `description` antigo continua mostrando texto auxiliar (data, ordenação).

---

## G5 — Bugfix Conversas sem resposta — contagem inconsistente

### Causa raiz (lida no código)
**Widget `dashboardData.noResponse`** (`dashboard-data.ts:452-508`):
- `last_activity_at >= start AND < end`
- `last_msg WHERE message_type IN (0,1)` — ignora activity/template
- `JOIN last_msg ON message_type = 0` — só conversas onde a **última mensagem real** é do contato

**Drill-down `getNoResponseDrillDown`** (`dashboard-drill-down.ts:1118-1226`):
- `created_at >= start AND < end` — diferente!
- `last_msg` SEM filtro `message_type IN (0,1)` — diferente!
- `JOIN last_msg ON message_type = 0` — igual

**Resultado**: query do drill-down conta menos conversas (ou conversas diferentes) do que o widget. 31 vs 11 confirma.

### Fix
Em `getNoResponseDrillDown` (todas as 4 queries internas: sqlAgg, sqlList, sqlByInbox, sqlByAssignee):
```diff
WITH last_msg AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.created_at,
    m.message_type
  FROM messages m
+ WHERE m.message_type IN (0, 1)
  ORDER BY m.conversation_id, m.created_at DESC
)
…
WHERE c.account_id = $1
- AND c.created_at >= $2
- AND c.created_at < $3
+ AND c.last_activity_at >= $2
+ AND c.last_activity_at < $3
  AND c.status = 0
  …
```

Bumpa cache key:
- `dashboard-drill-no-response` → `dashboard-drill-no-response-v2`.

### Critério de aceitação
Widget `dashboard.noResponse.total` === drill-down `data.total` para mesma `(accountId, period)`.

---

## G6 — Substituir "Resumo / Snapshot atual" por "Faixa de espera"

### Atual (NoResponseDrillDownContent)
```
[Resumo]                          [Distribuição]
Snapshot atual                    Veja por inbox ou por atendente
                                  (toggle Inbox/Atendente)
11
aguardando resposta               (bar chart horizontal)
Mais antiga há 4 dias
```

### Alvo
```
[Faixa de espera]                 [Distribuição por estado]
Quanto tempo cada conversa        Veja por estado ou por atendente
está aguardando agora             (toggle Estado/Atendente)

(donut com 4 fatias)              (bar chart horizontal — vide G7.x)
"31" no centro
"aguardando resposta" abaixo
"Mais antiga há 4 dias" abaixo
```

### Buckets (calculados client-side a partir de `data.items[].waitingSeconds`)
| Faixa       | Threshold (segundos)        | Cor (CHART_COLORS) |
|-------------|------------------------------|--------------------|
| 0–4h        | `< 4 * 3600`                | yellow             |
| 4–24h       | `< 24 * 3600`               | amber              |
| 1–3 dias    | `< 3 * 86400`               | orange             |
| Mais de 3d  | `>= 3 * 86400`              | red                |

### Component novo `WaitingBucketsDonut`
```tsx
interface WaitingBucketsDonutProps {
  items: NoResponseDrillDownItem[];
  total: number;
  oldestSeconds: number;
}
```
- Calcula contagem por bucket.
- Filtra fatias com count=0 (não polui visual).
- Renderiza `<DonutWithCenter data centerLabel="aguardando" centerValue={total} height={280} emptyMessage="Nada na fila" />`.
- Logo abaixo (fora do donut, ainda dentro do card), bloco textual:
  - `aguardando resposta` (cinza muted, abaixo do número central já cobre)
  - `Mais antiga há {oldestLabel}` (amber-400, condicional)

### Comportamento quando total=0
- Donut em empty state nativo.
- Texto: `"Nenhuma conversa aguardando agora."` (verde calmo).

### Restrição de escopo
- O cálculo é **client-side a partir de `items` retornados** (limitados a 100 hoje em `LIMIT 100` no SQL). Se total > 100, a donut representa só as 100 primeiras (que já são as mais antigas — `ORDER BY waiting_seconds DESC`). Aceito porque (a) UX continua útil, (b) backend não tem agregação por bucket pronta e adicionar seria over-engineering pra essa release.
- Documentar inline com comment: "Donut representa as top-100 mais antigas; com volume > 100 ele subestima a fatia '0–4h'."

---

## G7 — Drill-down "Conversas sem resposta" — tabela

### Mudanças
- Remover coluna "Última msg" (redundante — `formatDistanceToNow(lastIncomingAt)` já vem em "Esperando há" via `formatDuration(waitingSeconds)`).
- "Inbox" → "Estado", adicionar "Departamento".
- Tag âmbar em "Esperando há" — já é amber-400 hoje, mas só texto. Empacotar em pill `<span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">`.
- Helper `<TotalBadge n={data.items.length} />` no título da seção (consistente com G4.6).

### Mudança no contrato `NoResponseDrillDownItem`
Adicionar `teamName: string | null`. SQL `sqlList` precisa de `LEFT JOIN teams t ON t.id = c.team_id` + `t.name AS team_name`.

### Distribuição
Toggle hoje "Inbox/Atendente" → "Estado/Atendente". `data.byInbox` continua nome interno; UI só renomeia.

---

## G8 — Padronização do título total

`<TotalBadge>` definido em G4.6, reutilizado em todas as seções de tabela:
- Recebidas drill-down
- Resolvidas drill-down
- Status drill-down (Aberto/Resolvido/Pendente/Adiado)
- Sem resposta drill-down (G7)
- ByTeam drill-down (`team-drill-down.tsx` se aplicável — verificar)

Por consistência, **localização do componente**: `src/components/dashboard/total-badge.tsx`. Export named. Sem testes próprios (componente trivial — coberto pelos snapshots dos drill-downs que o usam).

---

## Sumário de arquivos a modificar

### UI components (Client)
- `src/components/dashboard/period-navigator.tsx` — G1 refactor.
- `src/components/dashboard/conversations-line-chart.tsx` — G1 (não muda nada além de aceitar PeriodNavigator maior; layout do header pode precisar `flex-col` em telas menores).
- `src/components/dashboard/kpi-clickable-card.tsx` — G3 refactor.
- `src/components/dashboard/dashboard-content.tsx` — G3 (passar `subtitle="no período"` aos cards).
- `src/components/dashboard/drill-down-contents.tsx` — G4 (todas as 4 funções).
- `src/components/dashboard/no-response-drill-down.tsx` — G6, G7.
- **NEW** `src/components/dashboard/total-badge.tsx` — G4.6/G8.
- **NEW** `src/components/dashboard/waiting-buckets-donut.tsx` — G6.

### Server (queries)
- `src/lib/chatwoot/queries/dashboard-drill-down.ts`:
  - `RowConversation` add `team_name`.
  - `getReceivedDrillDown.sqlRecent`, `getResolvedDrillDown.sqlRecent`, `getStatusDrillDown.sqlList`: `LEFT JOIN teams t ON t.id = c.team_id` + `t.name AS team_name`.
  - `DrillDownConversationItem.teamName: string | null`.
  - `getNoResponseDrillDown`: G5 fix (last_activity_at + msg_type filter), bump cache key.
  - `RowNoResponseFull` + `NoResponseDrillDownItem` add `team_name` / `teamName`.
- `src/lib/chatwoot/queries/dashboard-data.ts` — só se G2 exigir após diagnóstico.

### Tests
- **NEW** `src/components/dashboard/__tests__/period-navigator.test.tsx` — UI size assertions + clique prev/next + disabled state.
- **NEW** `src/components/dashboard/__tests__/total-badge.test.tsx` — render + locale pt-BR.
- **NEW** `src/components/dashboard/__tests__/waiting-buckets-donut.test.tsx` — bucketização correta dado um array de items.
- **NEW** `src/components/dashboard/__tests__/no-response-drill-down.test.tsx` — substitui Resumo + Estado label + tag âmbar + remoção da coluna "Última msg" + departamento presente.
- **NEW** `src/components/dashboard/__tests__/drill-down-contents.test.tsx` — Estado label + departamento column + tag âmbar em Quando + TotalBadge no título.
- **NEW** `src/components/dashboard/__tests__/kpi-clickable-card.test.tsx` — layout label-uppercase + 3xl + subtitle prop + click handler.
- **NEW** `src/lib/chatwoot/queries/__tests__/dashboard-drill-down-no-response.test.ts` — alinhamento da query (smoke unit verificando o SQL gerado, sem hit no DB).

### Release
- `package.json` — bump 0.20.0 → 0.22.0.
- `CHANGELOG.md` — entrada v0.22.0 com 8 grupos.
- `docs/STATUS.md` — atualizar pra v0.22.0.

---

## Critérios de aceitação (resumo)

| Item | Critério |
|------|----------|
| G1 | PeriodNavigator visualmente similar em padding/fonte às checkboxes (text-sm, px-2 py-1.5). Clique prev/next funciona. Disabled estado visível. |
| G2 | Tooltip do gráfico em modo Semana/Mês para uma data X mostra **mesma** soma que o agregado horário do modo Dia para a mesma X. Diagnóstico documentado em comment ou commit msg. |
| G3 | KPIs: label UPPERCASE em cima, valor 3xl, subtitle "no período" abaixo, ícone top-right. Sparkline preserve. Hover "ver detalhes" preserve. Click → drill-down preserve. |
| G4 | Headers/labels exibem "Estado". Coluna Departamento presente. Tag âmbar em Quando. TotalBadge no título. Distribuição por estado: todos os labels visíveis. Distribuição por hora: labels só HH:00. |
| G5 | `getNoResponseDrillDown(args).total === dashboardData(args).noResponse.total` (mesma definição). Cache key bumpado. |
| G6 | Card "Faixa de espera" renderiza donut com 4 fatias coerentes. Centro mostra `total`. Empty state limpo quando 0. |
| G7 | Tabela sem coluna "Última msg". Headers Estado/Departamento. Tag âmbar pill em "Esperando há". TotalBadge. |
| G8 | TotalBadge consistente nos 4+ títulos. |
| Tests | Novos arquivos passam. `npm run typecheck` 0 erros. Existing 1170+ tests continuam passando. |

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| G2 sem evidência → fix errado | Aceito risco — diagnostic logging primeiro, fix em PR separado se inconclusivo. |
| JOIN teams pesar query | `c.team_id` é índice + LEFT JOIN; impacto irrelevante. |
| Volume noResponse > 100 distorce donut | Documentado inline. Backend pode ganhar agregação por bucket em v0.22.1 se necessário. |
| Coordenação com claude-empresa-ativa-global e claude-nex-suite-polish-v020 | Files-not-to-touch documentado. Cache keys em namespaces independentes. Bump v0.22.0 evita colisão. |
| Mudança no `KpiClickableCard` quebra outros usos | grep mostra usado **só em dashboard-content.tsx** — sem risco. |

---

## Pente fino #1 (review da v1)

Achados aplicados na v2:

1. **G1 ambíguo**: v1 dizia "padding generoso" sem números. v2 já tem px-2 py-1.5 + h-7 nos botões + text-sm explícito.
2. **G2 sem plano de fallback** se diagnóstico falhar: v2 acrescentou contingência (PR diagnostic-only + hotfix v0.22.1).
3. **G3 omitia tour data-attrs**: v2 documenta que `data-tour="dashboard-kpis"` (no parent) é preservado.
4. **G4.3 plano B implícito**: v2 explicita que tooltip detalhado é trade-off aceito; descrição do card cobre.
5. **G4.4 contrato sem `teamName` em todos os lugares**: v2 lista que `DrillDownConversationItem`, `RowConversation`, `NoResponseDrillDownItem`, `RowNoResponseFull` ganham `teamName/team_name`.
6. **G5 cache key não bumpado**: v2 acrescenta v2 no cache key.
7. **G6 sem comportamento empty state**: v2 acrescenta comportamento + texto.
8. **G7 não removia "Última msg" explicitamente**: v2 lista a deleção.
9. **G8 sem decisão de localização do componente**: v2 escolhe `src/components/dashboard/total-badge.tsx`.
10. **Sem critério de aceitação consolidado**: v2 acrescentou tabela.

## Pente fino #2 (review da v2 — mais profundo)

Achados aplicados na v3:

1. **G2 lista 4 hipóteses mas a #1 conclui "logicamente casa"** — contradição: se logicamente casa, por que listar como hipótese? Reescrito: v3 mantém como hipótese mas adiciona a nuance "verificar com log estruturado em vez de só raciocinar". Honesto.
2. **G3 mantém prop `sublabel` por compat mas não usa em lugar nenhum** — v3 esclarece: remove `sublabel` totalmente do uso (em `dashboard-content.tsx` migra todos pra `subtitle`); deixa o type opcional só pra quem usar `KpiClickableCard` em outros pontos. Após grep confirmar **um único uso**, v3 simplifica: pode renomear sem deixar alias morto.
3. **G4.5 tag âmbar pode confundir em status já em vermelho** — v3 nota que cor âmbar é coerência com o sistema (no-response-card já usa amber para "esperando" / Quando = "tempo passado", contexto similar). Mantém.
4. **G6 cálculo client-side com items LIMIT 100** — v3 adiciona alternativa potencial (server-side bucket query) mas mantém client-side por escopo. Documentado.
5. **G7 não verificou se `byInbox` array já tem `name` ≠ id null** — v3 nota que a entrada `(sem inbox)` já é tratada via `COALESCE(NULLIF(TRIM(name), ''), '(sem inbox)')`. Sem ação.
6. **G4.4 SQL JOIN teams: nome de coluna `team_name` colide com nada?** — confirmado por grep: nenhuma ambiguidade.
7. **G4.2 height dinâmico pode estourar no mobile** — v3 adiciona cap `max(280, min(480, count * 28 + 60))` pra não criar scroll absurdo.
8. **Critério de aceitação G2 ambíguo "bater exatamente"** — v3 esclarece: tolera diferença ≤ 1 conversa por race window (TTL=30s do cache pode dessincronizar 30s).
9. **Plano não menciona o banner stale do cache** — não relevante (cache pull-through tem fallback automático).
10. **`granularity` selection na drill-down** continua usando `pickGranularity(period)` (≤ 48h → hour, senão day). Não muda.
11. **`team-drill-down.tsx` (componente existente) presumivelmente também usa "Inbox" — falta auditar** — v3 agrega item: revisar `team-drill-down.tsx` e renomear se aplicável.
12. **Tour `data-attrs` no PeriodNavigator** — não tem nem precisa.

## Decisões consolidadas (v3 final)

- Adiciona ao G3 limpeza de `sublabel` (renomear pra `subtitle` em todos os usos — só `dashboard-content.tsx`, e mantém o type para retrocompat numa única release).
- Adiciona ao G4.2 cap de height: `Math.max(280, Math.min(480, count * 28 + 60))`.
- Adiciona ao G4 auditoria do `team-drill-down.tsx`.
- G2 critério de aceitação tolera diferença de ≤ 1 conversa por race do cache.
- `WaitingBucketsDonut` é client-side a partir de `items` (top-100). Documentado.

---

## Pronto pra plan

Spec aprovada autonomamente (modo autônomo total confirmado pelo João).
Próximo passo: `superpowers:writing-plans` com tasks granulares TDD.
