---
agent: claude-agente-nex-polish-v031
started_at: 2026-05-03T20:30-03:00
target_version: v0.31.0
status: in_progress
---

## Tópico
Suite Agente Nex Polish v5 — feature grande + 6 polish após feedback v0.28/v0.30.

## Demandas (do user, agrupadas por surface)

### Configuração
- Remover botão "Criar API key" do form (já tem redirect via select).
- **REMOVER** Spread cartão UI + UsdRateTicker da tela.
- Toggle "Agente Nex ativo" — redesign visual (componente dentro de outro, melhorar elegância).
- **Cotação USD→BRL automática nos bastidores** sem UI. Bug: cost_brl atual está inflated (>R$6/USD), provavelmente spread setado em 1.40+. Reset spread fixo 1.10 (≈ IOF 3.5% + 6.5% spread real do cartão); usar AwesomeAPI única fonte; sem manipulação por UI.

### Chaves de API
- Botão "Adicionar crédito" por provider redirecionando (já existe via catalog.topUpUrl — só verificar/melhorar UX).

### Prompt
- **Comportamento**: nova seção **Nomenclaturas/Termos** (configurável). Pré-seedar com defaults pro cliente Matrix:
  - "estados" → "inboxes"
  - "colaboradores", "funcionários", "minha equipe", "meu time" → "agentes"
  - "departamento", "setor", "time" (contextual) → "teams"
- **Comportamento**: novo toggle **Sugestões em botões** (antes dos guardrails) — quando ativo, agente sugere ações em botões clicáveis (não texto).
- Remover frase "Preview somente leitura. Use Editar para alterar..." do PromptPreviewCard.
- Botão "Adicionar documento" → "Adicionar conhecimento".

### Bubble (renderização)
- Quando o agente entender que cabe sugerir, retorna mensagem com `suggestions: string[]` → frontend renderiza botões clicáveis. Click envia a sugestão como nova msg do user.

### Consumo
- Período "Hoje" → gráfico **por hora** (igual dashboard `Conversas por hora` — eixo X 00:00..23:00).
- Donut "Distribuição por provider": espessura **mais fina** (sutil) + tooltip **fora do gráfico** (não em cima).
- Tabela: coluna nova **Origem** (Agente Nex / Playground) — depois de Data/hora.
- Filtro novo **Ambiente** (todos/Agente Nex/Playground) ao lado do Provider global.

## Arquivos que vou tocar (preliminar)

### Schema (ensure-tables)
- `src/lib/nex/ensure-tables.ts` — column `terminology JSONB DEFAULT '{}'`; column `suggestions_enabled BOOLEAN DEFAULT false`.
- `src/lib/llm/exchange-rate.ts` — auto-set spread=1.10 na primeira leitura (defensive reset).

### Configuração
- `src/components/agente-nex/llm-config-form.tsx` — remove Spread + Ticker UI; redesign toggle Nex ativo; remove botão "Criar API key" interno.
- `src/app/(protected)/agente-nex/configuracao/page.tsx` — remove props initialCommercialRate/Source/FetchedAt.

### Prompt
- `src/components/agente-nex/prompt-preview-card.tsx` — remove a frase italic.
- `src/components/agente-nex/kb-section.tsx` — botão "Adicionar conhecimento".
- `src/components/agente-nex/prompt-config-form.tsx` — adiciona seção Nomenclaturas + toggle Sugestões.
- `src/lib/nex/prompt-compose.ts` — terminology + suggestions_enabled na compose (instruções no prompt).
- `src/lib/nex/prompt.ts` — getNexPromptConfig/saveNexPromptConfig persiste novos fields.
- `src/lib/actions/nex-prompt.ts` — saveTerminologyAction, setSuggestionsEnabledAction.

### Bubble
- `src/lib/llm/agent/run-nex.ts` — emit `suggestions: string[]` quando aplicável.
- `src/lib/actions/nex-chat.ts` — sendNexMessage retorna `{ ok, message, suggestions? }`.
- `src/components/nex/nex-chat-panel.tsx` — render botões clicáveis pra sugestões.

### Consumo
- `src/components/llm/consumo-content.tsx` — Período Hoje virou hourly (24 buckets); coluna Origem; filtro Ambiente; donut spacing/tooltip.
- `src/lib/llm/queries/usage-stats.ts` — agrupar por hora quando range <=1 dia; flag `is_playground` no detail row + filter.
- `src/components/charts/donut-with-center.tsx` — espessura mais fina + tooltipPosition `outside` ou similar.

### Release
- `package.json` (0.30 → 0.31).
- CHANGELOG.md, docs/STATUS.md, docs/agents/HISTORY.md.

## Decisões / contexto importante

- v0.30.0 LIVE em produção (outro agente).
- Bug de cotação inflated: spread no DB provavelmente em 1.40+ (user pode ter testado no UI v0.20/v0.26). Solução: reset fixo 1.10 + remover controle do UI.
- Nomenclaturas: schema novo `terminology JSONB` permite mapear termos custom por install. Pré-seed pra Matrix (estados→inboxes, equipe→agentes, departamento→teams).
- Sugestões em botões: feature complexa — agent precisa decidir QUANDO sugerir, payload structured (não texto), frontend renderiza botões. Schema `suggestions_enabled BOOLEAN` controla globalmente.

## Arquivos compartilhados que VOU modificar
- package.json (bump v0.31.0)
- CHANGELOG.md
- docs/STATUS.md
- src/lib/nex/ensure-tables.ts (column nova — aditiva)
- src/lib/llm/exchange-rate.ts (reset spread)

## Bloqueios
- (vazio)
