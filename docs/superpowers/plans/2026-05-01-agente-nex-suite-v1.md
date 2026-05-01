# Plano — Suite Agente Nex (v0.15.0) — VERSÃO 1 (rascunho)

> **Status:** v1 (rascunho honesto). Sujeito a pente fino #1 → v2 → pente fino #2 → v3 final.
> **Spec referência:** `docs/superpowers/specs/2026-05-01-agente-nex-suite-design.md`

## Goal
Implementar o que a spec v3 final define.

## Tech stack
Next.js 16, Postgres, Whisper API (OpenAI), MediaRecorder, pdf-parse, Jest+RTL.

## Tasks (preliminares)

### T1. Schema nex_settings + nex_kb_documents
- Criar `prisma/schema.prisma` com 2 models novos.
- Criar `src/lib/nex/ensure-tables.ts` com `CREATE TABLE IF NOT EXISTS` + seed singleton.
- Test `__tests__/ensure-tables.test.ts`.
- TDD red→green→commit.

### T2. lib `prompt.ts`
- `composeSystemPrompt`, `getNexPromptConfig`, `saveNexPromptConfig`.
- Validações: personality ≤ 500, tone ≤ 500, guardrails ≤ 20×300, override ≤ 50k.
- Test `__tests__/prompt.test.ts`.
- TDD red→green→commit.

### T3. lib `kb.ts`
- `listKbDocuments`, `getKbDocsForPrompt`, `createKbDocument` (com cap 100k + sanitize NUL), `deleteKbDocument`.
- Test `__tests__/kb.test.ts`.
- TDD.

### T4. lib `transcribe.ts`
- `transcribeAudio(blob, language)`. Whisper API.
- Provider != openai → erro tipado.
- Cap 25MB.
- Test `__tests__/transcribe.test.ts`.
- TDD.

### T5. pricing whisper-1
- Estender `MODEL_PRICING["whisper-1"]` com `perMinuteUsd: 0.006`.
- Estender `calculateCost` com 4º arg opcional `extras: { durationMs }`.
- Não regredir tests existentes.
- Test `__tests__/pricing-whisper.test.ts`.

### T6. Route Handler `/api/nex/transcribe`
- POST multipart.
- Auth → provider check → Whisper → logUsage.
- runtime nodejs, maxDuration 60.
- Smoke test.

### T7. Server Actions `nex-prompt.ts`
- 6 actions: get/save config, preview, list/upload/delete KB.
- safeAction wrapper.
- audit log.
- Test `__tests__/nex-prompt.test.ts`.

### T8. runNexAgent dinâmico
- Adicionar `promptOverride` + `isPlayground` ao input.
- `composeSystemPrompt` em runtime.
- Skip logUsage se isPlayground.
- testNexPromptAction em nex-chat.ts.
- Atualizar test existente run-nex.test.ts.

### T9. NAV_ITEMS — submenu
- Add item Agente Nex com 4 children.
- Remove "Consumo IA" standalone.
- Imports lucide.

### T10. /agente-nex/page.tsx
- Redirect → /configuracao.

### T11. /agente-nex/layout.tsx
- Passthrough.

### T12. LlmConfigForm extraído
- Mover body de LlmConfigCard sem o tab switcher pra novo componente reutilizável.

### T13. /agente-nex/configuracao/page.tsx
- Server component, fetch llmConfig + credentials + spread.
- Renderiza LlmConfigForm.

### T14. /agente-nex/chaves/page.tsx
- Renderiza LlmCredentialsManager existente.

### T15. /agente-nex/consumo/page.tsx
- Cópia idêntica de /configuracoes/consumo/page.tsx.

### T16. Redirect /configuracoes/consumo → /agente-nex/consumo
- permanentRedirect 308.

### T17. Limpar /configuracoes/page.tsx
- Remover cards Nex.

### T18. NexMessage — copy em user
- Group + CopyButton sempre.
- Test ajustado.

### T19. AudioPlayer
- HTML5 audio + custom controls.
- Speed dropdown 5 níveis.
- Test.

### T20. AudioRecorder
- MediaRecorder + ações.
- Cap 5min.
- Test.

### T21. Bubble integra mic + envio
- (protected)/layout.tsx busca effectiveAudioEnabled.
- NexBubble + NexChatPanel recebem prop.
- Handler envia áudio → Whisper → mensagem áudio + send to agent.
- Persistência local sem audioBlobUrl.

### T22. PromptConfigForm
- Personality, tone, guardrails, override.
- Preview dialog.
- Save action.
- Test.

### T23. ResourcesToggles
- Toggle áudio com gating provider.
- Toggle KB.
- Save imediato.

### T24. KbSection + UploadDialog
- Lista + upload.
- Cap chars + warnings.
- Test.

### T25. Playground
- Textarea + send.
- testNexPromptAction.
- Mostra prompt usado (link).
- Test.

### T26. /agente-nex/prompt/page.tsx
- Compõe 4 cards.

### T27. Release
- bump 0.15.0.
- CHANGELOG + STATUS.
- HISTORY.

### T28. Verify + push + deploy
- typecheck + tests + build.
- gh run list + push.
- portainer-fix.
- smoke production.
- session-end.

## Convenções
- TDD onde aplicável.
- UI/UX Pro Max em todas as tasks UI.
- Cada task fecha em commit.
- safeAction wrapper.
- aria-labels.
