# claude-nex-v0.15.4-hotfix

**Iniciado:** 2026-04-30
**Escopo:** Hotfix v0.15.4 — UX bubble audio refinements (4 ajustes).

## Tarefas
1. AudioPlayer: speed button refinado (sem Gauge, dentro do balão violeta, hover animado).
2. Input bar: layout estável idle ↔ recording (mesma caixa/altura/borda; Mic externo some quando grava; Send externo dispara recorder.sendNow quando grava).
3. Áudio aparece imediatamente ao enviar (player visível antes da transcrição; loading "Nex pensando" abaixo).
4. Persistência IndexedDB: `src/lib/nex/audio-storage.ts` (saveAudio/getAudio/clearAllAudios). Restaura no reload, limpa no "Limpar conversa".

## Arquivos previstos
- `src/components/nex/audio-player.tsx`
- `src/components/nex/audio-recorder.tsx`
- `src/components/nex/nex-chat-panel.tsx`
- `src/components/nex/nex-message.tsx`
- `src/lib/nex/audio-storage.ts` (novo)
- Testes: `__tests__/audio-player.test.tsx`, `__tests__/audio-recorder.test.tsx`, `__tests__/nex-message.test.tsx`
- `CHANGELOG.md` + `package.json` (bump 0.15.3 → 0.15.4)

## Domínios
UI/UX exclusivamente do bubble Nex (`src/components/nex/*` + lib específica). Não toca em dashboard, llm, conversas, settings.
