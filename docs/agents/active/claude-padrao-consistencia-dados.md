---
agent: claude-padrao-consistencia-dados
started_at: 2026-05-04T13:35-03:00
target_version: v0.42.0
status: in_progress
---

## Tópico
Padrão único de consistência de dados em TODA a plataforma — dashboard + relatórios + gráficos + tabelas. Define semântica canônica de `conversas recebidas`, `pendentes`, `abertas`, `resolvidas`, `sem resposta`, `aberta há`, e regra obrigatória de filtro de período por `last_activity_at` (fallback `created_at`) em TODOS os filtros (hoje/semana/mês/todos/personalizado). Mantém respeitar setting Matrix IA (incluir/excluir).

## Arquivos que provavelmente vou tocar
- src/lib/chatwoot/facts.ts
- src/lib/chatwoot/queries/** (todas)
- src/lib/charts/**
- src/lib/reports/**
- src/lib/dashboard-period.ts
- src/lib/datetime.ts / datetime-core.ts
- src/lib/cache/**
- src/lib/chatwoot/sync/** (table-syncs e pré-agregação se necessário ajustar agregados)
- src/components/dashboard/**
- src/components/reports/**
- src/app/(protected)/dashboard/**
- src/app/(protected)/relatorios/**
- src/worker/jobs/pre-agregacao/** (se exigir mudança de bucket de fato)
- prisma/schema.prisma (provavelmente NÃO precisa mexer; somente se houver índices a criar)
- docs/superpowers/plans/2026-05-04-padrao-consistencia-dados.md (novo)

## Arquivos compartilhados que VOU modificar
- package.json (bump v0.42.0)
- CHANGELOG.md (entrada release)
- docs/STATUS.md
- CLAUDE.md (consolidar §4.1 com regra de last_activity_at + glossário)

## Decisões / contexto importante
- João pediu pular brainstorming/spec → ir direto pro plan double-check (v1→v2→v3) e depois subagent-driven-development.
- ui-ux-pro-max obrigatória em qualquer subagente que toca UI.
- Deploy em produção sob responsabilidade desta sessão; só chamar João pra validação quando estiver no ar.

## Bloqueios
- (vazio)
