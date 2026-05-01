# Spec — Dashboard v0.14.0

**Status:** Aprovado pelo João via feedback verbal · **Data:** 2026-05-01

## Problemas reportados

1. **Legenda recharts redundante** acima do chart: bolinhas com "Recebidas/Abertas/Resolvidas/Pendentes" + os checkboxes embaixo. Duplicado.
2. **Eixo X incompleto em "Semana"**: a semana atual vai 27/04→03/05 mas o gráfico só mostra até 01/05 (último dia com dados). Precisa mostrar todos os dias da semana mesmo sem dados.
3. **Chart espremido à esquerda** quando há poucos dias com dados — não usa toda a largura disponível.
4. **Pill "Hoje" → "Dia"** para combinar com o conceito de navegação por período.
5. **Navegação por período**: setas ← → no canto superior direito do chart pra ir aos períodos anterior/seguinte (sem trava — vai até o primeiro dia de dados; setinha forward some quando range.end >= agora).
6. **Granularity errada em "Mês"**: hoje, com filtro "Mês" mas referenceDate=hoje (1º maio), o backend devolve `granularity="hour"` porque a window é só 1 dia. **Mês deve sempre ser por dia (1–31).**
7. **`formatWaiting` em "Conversas sem resposta"** mostra "82h 40min", "64h 34min". Quero "3 dias", "2 dias" depois de >= 24h (mesmo padrão do `formatDuration` corrigido em v0.13.7).

## Decisões

- **D1**: Pills `DashboardPeriod = "dia" | "semana" | "mes"` (rename de "hoje").
- **D2**: `getDashboardPeriod({period, mode, weekStartsOn, tz, referenceDate?})` — `referenceDate` default = `now`. Calcula range relativo a essa data.
- **D3**: `dashboardData()` força `granularity = "day"` para `period="semana"|"mes"`. Granularity = `"hour"` apenas para `period="dia"`.
- **D4**: Backend retorna `nextAvailable: boolean` no payload (false quando range.end >= now). `prevAvailable: true` sempre (limite real seria MIN(created_at) — não vamos consultar pra evitar query extra; navegação sem trava de fundo).
- **D5**: `<PeriodNavigator>` no header do chart:
  - "Dia": label `dd/MM` (ex.: `01/05`), setas ← →
  - "Semana": label `dd/MM — dd/MM` (ex.: `27/04 — 03/05`)
  - "Mês": label `MMM/YY` (ex.: `MAI/26`, `ABR/26`)
- **D6**: Chart remove `<Legend>` recharts (checkboxes substituem).
- **D7**: Chart `fillBuckets(data, granularity, tz, range)` preenche TODOS os buckets do range (mesmo zerados). Range vem do backend.
- **D8**: Chart com `<ResponsiveContainer width="100%" height={350}>` direto **sem wrapper de width fixo** quando `granularity="day"` (full-width). Para `granularity="hour"` (período "Dia"), mantém o scroll horizontal de 24 buckets centralizado em `referenceHour` (ou hora atual se for hoje).
- **D9**: `formatWaiting` (no-response-card e drill-down) substituído por `formatDuration` de `@/lib/utils/format-time`.

## Não-objetivos

- Não vou consultar MIN(created_at) por conta para definir trava real do prev. Se o user navegar 100 anos para trás, vai mostrar gráfico zerado — aceitável.
- Não vou implementar atalhos de teclado (← → globais). Só os botões.
- Não vou adicionar transição de animação de slide entre períodos. Estado simples (refetch + render).

## Plano de testes

- Build verde + typecheck 0 erros.
- `formatDuration(86400)` = "1 dia" / `formatDuration(297600)` = "3 dias" (já existe).
- Manual: clicar setas, verificar request com referenceDate.
