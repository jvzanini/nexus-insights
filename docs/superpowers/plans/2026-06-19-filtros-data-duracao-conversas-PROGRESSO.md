# PROGRESSO — Filtros de Data e Duração em Conversas

> Ponto de retomada para modo autônomo. Atualizar a cada bloco/commit.

## Estado atual
- **Fase:** PLANO pronto (v3, pós review adversarial). Iniciando IMPLEMENTAÇÃO (subagent-driven + TDD).
- **Spec:** `docs/superpowers/specs/2026-06-19-filtros-data-duracao-conversas-design.md` (v3)
- **Plano:** `docs/superpowers/plans/2026-06-19-filtros-data-duracao-conversas.md` (v3, 8 tasks)
- **Tasks de lógica (subagente):** T1 filter-state, T2 match-duration, T5 export.
- **Tasks de UI (inline + ui-ux-pro-max):** T3+T4 (page/client/table, checkpoint único), T6 contadores/builder, T7 modal, T8 chips.

## Status das tasks
- [ ] T1 filter-state (tipos+serialização+diff)
- [ ] T2 match-duration (helper+testes)
- [ ] T3+T4 page→periodColumn/serverNow + pipeline tabela + title (checkpoint único)
- [ ] T5 export XLSX
- [ ] T6 contadores/resets/builder stalled
- [ ] T7 UI bloco Data+Tempo no modal
- [ ] T8 chips Data/Duração
- [ ] Verificação tsc+jest+e2e → release

## Decisões travadas (do usuário)
1. Dois filtros novos no **modal de Filtros** (Simples + Avançado), vinculados às pílulas de período.
2. **Data:** escolher coluna do período — "Criado em" (`created_at`/`periodColumn=created`) ou "Última atualização em" (`last_activity_at`/`active`, default).
3. **Duração:** indicadores "Sem resposta há" (`waiting_seconds`), "Aberta há" (`open_seconds`), "Parada há" (novo, `stalled_seconds = now - last_activity_at`).
4. **Sem trava** de valor; unidade (minuto/hora/dia/mês/ano) como multiplicador.
5. **Modo** visual: "a partir de" (gte) / "até" (lte) / "faixa" (between, com início e fim).
6. Descrições embutidas precisas por indicador e por campo de data (usuário leigo).
7. Modo autônomo total — não perguntar mais nada; trabalhar direto na `main`.

## Semântica verificada (canonical.ts + conversas-list.ts)
- waiting/open zeram em conversa RESOLVED (CASE WHEN status=1 THEN NULL).
- Nota privada do atendente conta como "movimento do atendente" → tira de waiting, põe em open.
- stalled usa last_activity_at (NOT NULL) — nunca vazio.

## Próximas etapas
- [ ] Consolidar spec v3 com achados dos reviews.
- [ ] Plan (writing-plans) v1→v2→v3.
- [ ] Implementação subagent-driven + TDD (match-duration primeiro).
- [ ] UI com ui-ux-pro-max (inline, sessão principal).
- [ ] Verificação tsc + jest + e2e dado real.
- [ ] Release: CHANGELOG + STATUS + HISTORY, push main, portainer-fix, /api/health.
