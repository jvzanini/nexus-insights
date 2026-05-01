---
agent: claude-nex-v0.15.2-hotfix
started_at: 2026-04-30T16:00-03:00
target_version: v0.15.2
status: in_progress
---

## Tópico

Hotfix UX da Suite Agente Nex (bubble audio) — 3 bugs reportados pelo super_admin via screenshots.

## Arquivos compartilhados que VOU modificar

- `src/components/nex/audio-recorder.tsx` — prop `onRecordingStateChange` + fix timer pausado.
- `src/components/nex/nex-chat-panel.tsx` — render condicional input bar (modo texto vs gravação).
- `src/components/nex/audio-player.tsx` — speed dropdown → botão cíclico Gauge.
- `src/components/nex/__tests__/audio-recorder.test.tsx` — teste novo callback.
- `src/components/nex/__tests__/audio-player.test.tsx` — substitui testes do `<select>` por botão cíclico.
- `package.json` — bump para 0.15.2.
- `CHANGELOG.md` — entrada v0.15.2.

## Notas

- Sem conflito esperado com outros agentes (nenhum active/* além deste).
- Sem mudanças em schema/queue/worker.
