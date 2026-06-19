# PROGRESSO — Filtros de Data e Duração em Conversas

> Ponto de retomada para modo autônomo. Atualizar a cada bloco/commit.

## Estado atual
- **Fase:** SPEC — v1 escrita, rodando 2 reviews adversariais → consolidar v3.
- **Spec:** `docs/superpowers/specs/2026-06-19-filtros-data-duracao-conversas-design.md`

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
