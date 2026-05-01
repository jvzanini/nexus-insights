# Runbook — Consumo do Agente Nex (drill-down v0.16.0)

**Última atualização:** 2026-05-01 (v0.16.0)
**Tela:** `/agente-nex/consumo`
**Quem acessa:** super_admin (Visibility = "super admin only" por default).

---

## 1. O que é

A tela `/agente-nex/consumo` mostra:

1. **PeriodPills** (Hoje / Semana atual / Mês atual / Tudo / Custom) — compartilhada com `/relatorios/conversas`.
2. **4 KPIs** uniformes (4 casas decimais, `min-h-[128px]`):
   - Custo total (BRL)
   - Total de chamadas (ícone `Activity`, novo na v0.16 — antes era `PhoneCall`)
   - Tempo médio (ms)
   - Erros / total
3. **Gráfico custo por dia** (AreaChart) — eixo Y com `R$` + 2 casas, fonte 13px, datas `30/ABR`.
4. **Gráfico custo por modelo** (BarChart) — mesmas regras de eixo.
5. **Donut "Distribuição por provider"** — tooltip top-right, centro com 4 casas.
6. **Tabela "Histórico de chamadas"** (renomeado na v0.16 — antes "Chamadas detalhadas") com filtros cascade Provider → Modelo, linha de total sticky, paginação 3-zonas, drill-down por linha.

---

## 2. Filtros cascade (Provider → Modelo)

Implementado em `<UsageTableFilters>`:

- **Provider**: dropdown lista providers distintos no período (`fetchDistinctProvidersInRange`).
- **Modelo**: dropdown depende do provider selecionado (`fetchDistinctModelsInRange` por provider). Reseta quando troca provider.

Filtros são **server-side** via SQL: `($n::text IS NULL OR coluna = $n)` no `getUsageDetails`.

URL state shareable: `?provider=openai&model=gpt-5-pro&page=2&pageSize=50`.

---

## 3. Paginação 3-zonas

Footer da tabela em 3 colunas:

| Esquerda | Centro | Direita |
|---------|--------|---------|
| `Mostrando X-Y de N` | `Página X de Y` + setas (`ChevronLeft` / `ChevronRight`) | Dropdown `25 / 50 / 100` por página |

Trocar `pageSize` reseta `page=0`. Trocar página fecha drill-down sheet (se aberto).

---

## 4. Drill-down por linha

Clicar em qualquer linha da tabela abre `<UsageDetailSheet>` (side="right") com **5 seções**:

### 4.1 Identificação
- ID da chamada (UUID).
- Provider / Modelo.
- Data/hora da chamada.
- Conversa associada (se existir, com link).

### 4.2 Tokens
- Tokens de entrada.
- Tokens de saída.
- Whisper: **"—"** em ambos campos com nota explicativa: "Whisper-1 cobra por minuto, não por token. Ver duração."

### 4.3 Duração
- Latência total (ms).
- Para Whisper: duração do áudio enviado (segundos, multiplicado pela tarifa $0.006/min).

### 4.4 Custo
- **Custo bruto USD** (sem round adicional).
- **Cotação USD/BRL aplicada** = base + spread embutido (cartão).
- **Spread atual** (informativo) — pode ter sido diferente na época da chamada.
- **Cotação base estimada** = `cotação aplicada / (1 + spread atual)`. É uma aproximação; pode divergir 1-2% do valor real do dia.
- **Custo final BRL** (gravado no DB no momento da chamada).

### 4.5 Erro
- Se a chamada falhou: `error_type` + `error_message` + stack (se houver).
- Se OK: "Sem erros".

### 4.6 Footer do sheet
- Botão **Copiar JSON** copia objeto completo da linha (todos os campos do `llm_usage`).

---

## 5. Whisper — investigação SQL

Whisper-1 cobra **$0.006 por minuto de áudio** — não usa tokens. Pra investigar se há cobrança correta, super_admin pode rodar:

```sql
SELECT
  DATE(created_at) AS dia,
  COUNT(*) chamadas,
  SUM(tokens_input) ti,
  SUM(tokens_output) tout,
  SUM(duration_ms) dur_ms,
  SUM(cost_usd) usd,
  SUM(cost_brl) brl
FROM llm_usage
WHERE model = 'whisper-1'
  AND created_at > '2026-04-01'
GROUP BY DATE(created_at)
ORDER BY 1;
```

Esperado:
- `ti` e `tout` sempre `0` (Whisper não usa tokens).
- `dur_ms` > 0 (duração do áudio em ms).
- `cost_usd` ≈ `(dur_ms / 60000) * 0.006` (com tolerância de 0.1%).

Se `cost_usd = 0` mas `dur_ms > 0`: bug na captura de duração no `/api/nex/transcribe`. Investigar log de upload.

---

## 6. Linha de total (sticky, no topo)

A primeira linha da tabela é uma **linha de total** com `bg-muted/40 font-semibold`, sticky:

- Total de tokens (entrada + saída agregados no escopo dos filtros).
- Custo total USD/BRL.
- Latência média.

Vem de `getUsageDetails` que retorna `{ rows, total, totals }` — totals server-side com mesmos filtros aplicados.

---

## 7. Colunas (renomeadas na v0.16)

| Antes (v0.15) | Agora (v0.16) |
|--------------|---------------|
| Tokens in | Tokens de entrada |
| Tokens out | Tokens de saída |
| Chamadas detalhadas | Histórico de chamadas |

Outras colunas: Data/hora, Provider, Modelo, Custo USD, Custo BRL, Latência, Erro.

---

## 8. URL state e share

Toda config (período + filtros + página + pageSize) está em URL. Compartilhar URL = compartilhar exato estado da tela.

Exemplo: `/agente-nex/consumo?period=mes_atual&provider=openai&page=3&pageSize=50` → super_admin que abrir vai ver mesma view (filtros e paginação aplicados).

---

## 9. Troubleshooting

| Sintoma | Possível causa | Ação |
|---------|---------------|------|
| KPIs e gráficos não batem | Filtros aplicados (chips visíveis) | Limpar filtros; verificar período |
| Whisper aparece "—" em tokens | Comportamento esperado (cobra por minuto) | OK; ver duração |
| Modelo dropdown vazio | Provider sem modelos no período | Trocar provider |
| Tabela vazia | Sem chamadas no período/filtros | Ampliar período |
| Drill-down não abre | JS error no sheet (raro) | Hard refresh; ver console |
| Cotação BRL "estranha" | Cotação base estimada (aproximação) | Real = `cost_brl / (cost_usd * usd_to_brl_rate)` exato no DB |

---

## 10. Referências

- Spec: `docs/superpowers/specs/2026-05-01-suite-agente-nex-refinement-v3.md` (Section D)
- Plan: `docs/superpowers/plans/2026-05-01-suite-agente-nex-refinement-v3.md` (T6d)
- Action: `src/lib/actions/llm-usage.ts` → `getUsageDetails`
- Componentes: `src/components/agente-nex/usage-table-filters.tsx`, `usage-detail-sheet.tsx`
- Helpers: `formatBrl4`, `formatUsd4` em `src/lib/format/numbers.ts`
- Runbook Prompt: `docs/runbooks/agente-nex-prompt-v0.16.md`
