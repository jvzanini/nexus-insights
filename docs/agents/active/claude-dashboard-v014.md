---
agent: claude-dashboard-v014
started_at: 2026-05-01T03:55-03:00
target_version: v0.14.0
status: in_progress
---

## Tópico
Polish do dashboard pós-feedback do João: chart full-width sem legenda recharts/dots, eixo X completo respeitando configs (semana/mês), navegação por período (← data →), pill "Hoje"→"Dia", granularity correta para "Mês", formatDuration nos cards "sem resposta".

## Arquivos que vou tocar
- src/lib/dashboard-period.ts (referenceDate)
- src/lib/chatwoot/queries/dashboard-data.ts (granularity forçada, nextAvailable)
- src/lib/actions/dashboard.ts (referenceDate)
- src/components/dashboard/dashboard-content.tsx (state referenceDate, pill rename)
- src/components/dashboard/dashboard-filters.tsx (pill rename)
- src/components/dashboard/conversations-line-chart.tsx (sem legend/dots, full-width, PeriodNavigator)
- src/components/dashboard/period-navigator.tsx (novo)
- src/components/dashboard/no-response-card.tsx (formatDuration)
- src/components/dashboard/no-response-drill-down.tsx (formatDuration)
- package.json + CHANGELOG.md (release prep)

## Bloqueios
- (vazio)
