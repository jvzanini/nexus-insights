# Histórico de atividade dos agentes

> Append-only. Cada agente registra commits relevantes ao final, em ordem cronológica. Veja `_README.md` para o protocolo completo.

## Formato

```
YYYY-MM-DD HH:MM | agent=<agent-id> | commit=<sha7> | scope=<feat|fix|docs|infra|release|revert> | summary=<1 linha>
```

## Entradas

```
2026-04-30 11:50 | agent=claude-preagregacao | commit=ecbc3c4 | scope=fix | summary=Hotfix Bad Gateway (Dockerfile chown .next/cache + seed Prisma 7 + instrumentation.ts handlers)
2026-04-30 12:01 | agent=claude-preagregacao | commit=c84336e | scope=feat | summary=Migration Prisma das 6 tabelas chatwoot_facts_*
2026-04-30 12:08 | agent=claude-preagregacao | commit=7b3176d | scope=feat | summary=Camada de leitura readFactsDaily/Hourly/Meta com TDD
2026-04-30 12:11 | agent=claude-preagregacao | commit=b8c515e | scope=feat | summary=Job refresh-by-account + shared utilities (T3)
2026-04-30 12:13 | agent=claude-preagregacao | commit=73e6440 | scope=docs | summary=Spec v3 + plan v3 da release v0.8.0 (pré-agregação)
2026-04-30 12:23 | agent=claude-preagregacao | commit=8f11b2b | scope=feat | summary=Jobs refresh-by-{inbox,agent,team} + housekeeping (T4+T5+T6)
2026-04-30 12:24 | agent=claude-preagregacao | commit=85e505b | scope=feat | summary=Worker registra 5 workers + cron schedules (T7)
2026-04-30 12:30 | agent=claude-preagregacao | commit=3bd7e26 | scope=feat | summary=UI /configuracoes/jobs admin + backfill (T8)
2026-04-30 12:43 | agent=claude-preagregacao | commit=4194db8 | scope=feat | summary=Migra volumetria-{heatmap,dow} para facts + UI freshness (M4+M5)
2026-04-30 12:50 | agent=claude-preagregacao | commit=9398474 | scope=feat | summary=SSE de invalidação + hook useFactsRealtime (T13)
2026-04-30 12:54 | agent=claude-preagregacao | commit=759cb45 | scope=docs | summary=Release v0.8.0 — pré-agregação + hotfix Bad Gateway
2026-04-30 12:56 | agent=claude-preagregacao | commit=4596d82 | scope=fix | summary=Worker via tsx + entrypoint não dispara migrations no worker
2026-04-30 13:39 | agent=claude-preagregacao | commit=8357253 | scope=fix | summary=Banner vermelho silencioso quando facts ainda não existem (42P01)
2026-04-30 13:55 | agent=claude-preagregacao | commit=a9a9fa6 | scope=infra | summary=Workflow Portainer debug + protocolo coordenação multi-agente (AGENTS.md)
2026-04-30 13:59 | agent=claude-preagregacao | commit=cb83262 | scope=infra | summary=Workflow Portainer-fix (Args worker + APP_VERSION)
2026-04-30 14:07 | agent=claude-preagregacao | commit=9f85481 | scope=fix | summary=Worker realmente sobe — paths corrigidos no Dockerfile + entrypoint detection
2026-04-30 14:14 | agent=claude-preagregacao | commit=479be9a | scope=fix | summary=getAccountsToRefresh sem coluna revoked_at + catch SQLSTATE 42703
2026-04-30 14:18 | agent=claude-preagregacao | observation=ci-failure | run=25179079666 | summary=Build da main FALHOU pelo agente dashboard-v0.10 (topTeams não existe em DashboardData). Meu fix 479be9a NÃO subiu em produção. Aguardando outro agente concertar.
2026-04-30 14:23 | agent=claude-dashboard-v010 | commit=4c411ae | scope=release | summary=Release v0.10.0 Dashboard Pulse (KPIs coorte única, sem-resposta hero, distribuições clicáveis, drill-down central, TZ fix, account selector consolidado no sidebar). Build run 25179499969 success — desbloqueia claude-preagregacao.
2026-04-30 14:30 | agent=claude-dashboard-v010 | observation=session-end | summary=Sessão encerrada. Active file deletado. Pendências v0.11 documentadas no spec/plan e no project_v0.10.0_release.md.
```

> Entradas anteriores aos workflows do dia 2026-04-30 estão capturadas no CHANGELOG.md (não vamos retroagir HISTORY pra trás disso para evitar trabalho inútil).
