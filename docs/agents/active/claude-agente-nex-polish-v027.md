---
agent: claude-agente-nex-polish-v027
started_at: 2026-05-03T19:15-03:00
target_version: v0.28.0
status: in_progress
---

## Tópico
Polish v4 — correções de UX/funcionalidade da v0.26 apontadas pelo user (super_admin). 6 fixes críticos que deixaram a v0.26 "uma porcaria" segundo feedback direto.

## Problemas a corrigir

1. **Editar do Prompt abre tela errada** (super_admin): hoje abre PromptConfigForm (Personalidade/Tom/Guardrails) que JÁ existe na seção Comportamento abaixo. User quer editar o **IDENTITY_BASE em si** (texto canônico do agente). Solução: column `identity_base TEXT NULL` em `nex_settings`, fallback pro hardcoded; Server Action saveIdentityBaseAction; Dialog max-edit com Textarea grande do IDENTITY_BASE atual + botão "Restaurar padrão".
2. **Prompt sempre visível (não collapse)**: remover state `showFull` e o botão "Ver prompt completo". `<pre>` aparece direto.
3. **Playground input bar feio**: hoje botões Mic/Send no rodapé encostados nas bordas do Sheet com counter "0/1000" embaixo. User quer **EXATAMENTE como o nex-chat-panel** — alinhado, centralizado, mesma sensação. Footer HTML normal (não SheetFooter sticky). Placeholder "Pergunte ao agente Nex".
4. **Playground qualidade ruim** (respostas/áudio "uma porcaria"): hoje usa `testNexPromptAction` sem histórico (cada turno isolado, sem contexto). User quer mesma qualidade da bubble. Solução: trocar por `sendNexMessage` com histórico completo (mesmo path).
5. **AudioPlayer speed tag vazando** (na bubble): button speed atual `min-w-[44px]` deixa a tag "1.75×" sair do balão violet. Compactar pra `h-5 min-w-[34px] px-1 text-[9px]` cabe dentro.
6. **Dialog "Ver prompt usado" não aparece**: clica no botão e nada acontece. Investigar — pode ser que Sheet capture focus + Dialog falha ao abrir, ou portal não monta. Solução provável: garantir Dialog rendered no document.body via Portal, z-[60] confirmado em overlay+content, ou fechar Sheet temporariamente quando preview abrir.

## Arquivos que provavelmente vou tocar

### E1 — IDENTITY_BASE editável
- `src/lib/nex/ensure-tables.ts` (column `identity_base TEXT NULL`)
- `src/lib/nex/prompt-compose.ts` (NexPromptConfig.identityBase opcional; usa cfg.identityBase ?? IDENTITY_BASE)
- `src/lib/nex/prompt.ts` (getNexPromptConfig retorna identity_base; saveNexPromptConfig persiste)
- `src/lib/actions/nex-prompt.ts` (saveIdentityBaseAction + resetIdentityBaseAction; super_admin gate)

### E2 — PromptPreviewCard sem collapse + Editar abre IDENTITY_BASE editor
- `src/components/agente-nex/prompt-preview-card.tsx` (remove showFull state; remove collapse; Editar abre IdentityBaseEditor não PromptConfigForm)
- Create: `src/components/agente-nex/identity-base-editor.tsx` (Textarea grande + Restaurar padrão + Salvar)

### E3 — PlaygroundSheet input bar
- `src/components/agente-nex/playground-sheet.tsx` (footer HTML em vez de SheetFooter; layout exato do nex-chat-panel; placeholder "Pergunte ao agente Nex")

### E4 — Playground qualidade
- `src/components/agente-nex/playground-sheet.tsx` (substituir testNexPromptAction por sendNexMessage com history; submitMessage passa todo items + new user msg)

### E5 — AudioPlayer speed tag compacta
- `src/components/nex/audio-player.tsx` (h-5 min-w-[34px] px-1 text-[9px] — caber dentro do balão)

### E6 — Dialog "Ver prompt usado" fix
- `src/components/agente-nex/playground-sheet.tsx` (debug + fix — Portal explícito, z-[60] reconfirmar, ou fallback pra Sheet temporário)

### Release
- `package.json` (bump 0.26 → 0.27)
- `CHANGELOG.md` (entrada v0.28.0)
- `docs/STATUS.md`
- `docs/agents/HISTORY.md`

## Arquivos compartilhados que VOU modificar
- `package.json` (bump v0.28.0)
- `CHANGELOG.md`
- `docs/STATUS.md`
- `src/lib/nex/ensure-tables.ts` (column nova — aditiva, sem conflito)

## Decisões / contexto importante
- v0.26.0 LIVE em produção (commit `558780c..77c970c`). Bump pra v0.28.0.
- Workflow rigoroso: plan v1→v2→v3 com 2 pentes-finos REAIS · subagent-driven-development com TDD · ui-ux-pro-max em toda task UI.
- IDENTITY_BASE editável é decisão arquitetural — column `identity_base TEXT NULL`, NULL = usa hardcoded default. Não muda comportamento de installs existentes (NULL preserva).
- Playground usar `sendNexMessage` significa que a config do DB (não state do form em edição) é usada. Isso simplifica MUITO — remove `testNexPromptAction` se não houver outro consumer (verificar).
- Fix do Dialog "Ver prompt usado": investigar root cause antes de mexer. Se for portal/z-index, ajustar. Se for action falhando silenciosamente, expor erro.

## Bloqueios
- (vazio)
