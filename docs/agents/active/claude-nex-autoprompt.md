---
agent: claude-nex-autoprompt
started_at: 2026-05-06T14:00-03:00
target_version: v0.49.0
status: in_progress
---

## Tópico
Auto-treinamento e calibração do Agente Nex: reescrita do IDENTITY_BASE, fix de sugestões (max 3, consistência), adição de filtro por etiqueta (label_name), melhoria das tool descriptions e semântica de período.

## Arquivos que provavelmente vou tocar
- src/lib/nex/prompt-compose.ts (IDENTITY_BASE + sugestões)
- src/lib/llm/tools/definitions.ts (tool descriptions + label_name param)
- src/lib/llm/tools/executor.ts (label_name filter + avg_reply_time)
- src/lib/llm/agent/run-nex.ts (MAX_SUGGESTIONS=3)
- CHANGELOG.md
- package.json (bump versão)
- docs/agents/HISTORY.md

## Arquivos compartilhados que VOU modificar
- package.json (bump versão)
- CHANGELOG.md

## Decisões / contexto importante
- Bugs identificados via análise profunda do código:
  1. getDashboardSummary: em_aberto/pendentes sem filtro de período → prompt precisa guiar uso correto
  2. Sugestões inconsistentes: max era 4, muda para 3; formato precisa de instrução mais clara
  3. Sem filtro por etiqueta (label) → adicionar label_name via cached_label_list
  4. Inboxes = estados brasileiros → prompt deve mencionar este mapeamento
  5. Quando sugestões desabilitadas, LLM pode verbalmente sugerir → proibir explicitamente

## Bloqueios
- (vazio)
