---
agent: claude-dashboard-v013
started_at: 2026-04-30T22:50-03:00
target_version: v0.13.0
status: in_progress
---

## Tópico
Dashboard polish — variação relativa nos KPIs, semana/mês "atual" como default, drill-downs completos para todos os status, lista paginada de conversas recebidas, configurações de dashboard em /configuracoes, fix overlay "Ver detalhes", visibilidade Matrix IA aplicada nos drill-downs.

## Pacotes
- A — UI fixes nos KPI cards (overlap + Novo + pp→% + rename pills)
- B — Configurações de Dashboard em /configuracoes (week_start_day, week_mode, month_mode)
- C — Comparações coerentes (open + taxa de resolução em %)
- D — Lista "Todas" paginada server-side
- E — Drill-down completo para Resolvido/Pendente/Adiado
- F — Visibilidade Matrix IA em todos os drill-downs
- G — Hour visualization clarity

## Arquivos que provavelmente vou tocar
- src/components/dashboard/* (todos)
- src/components/charts/* (tooltip de hora)
- src/components/settings/* (novo card de dashboard config)
- src/lib/datetime.ts / datetime-core.ts (regras de período)
- src/lib/actions/dashboard.ts
- src/lib/actions/dashboard-drill-down.ts
- src/lib/chatwoot/queries/dashboard-data.ts
- src/lib/chatwoot/queries/dashboard-drill-down.ts
- src/lib/chatwoot/facts.ts (suporte a custom range)
- src/lib/chatwoot/queries/conversations-list.ts (novo, ou reuso do existente paginado)
- src/lib/settings.ts (4 chaves novas)
- src/app/(protected)/configuracoes/page.tsx (nova seção)

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.12.1 → 0.13.0)
- CHANGELOG.md (entrada v0.13.0)
- docs/STATUS.md (versão atual)
- docs/superpowers/specs/2026-04-30-dashboard-v0.13.0-design.md (criar)
- docs/superpowers/plans/2026-04-30-dashboard-v0.13.0.md (criar)

## Decisões / contexto importante
- João autorizou modo autônomo total — sem confirmação para reversíveis nem deploys.
- Recomendações fechadas: config global (super_admin) + semanas/meses atuais como default + comparação coerente (mesma coorte) + paginação server-side 50/pg + drill-down de status espelhando "Aberto".
- Variação relativa em **%** (não pp) para Taxa de Resolução: `(curr - prev) / prev * 100`.
- Período atual:
  - Hoje = 00:00 → agora
  - Semana atual = início_semana → fim do dia de hoje
  - Mês atual = dia 1 → fim do dia de hoje
  - Período anterior comparativo = mesma janela "deslocada para trás" (semana passada toda; mês passado toda).

## Bloqueios
- (vazio)
