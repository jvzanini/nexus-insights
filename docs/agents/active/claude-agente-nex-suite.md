---
agent: claude-agente-nex-suite
started_at: 2026-05-01T08:00-03:00
target_version: v0.15.0
status: in_progress
---

## Tópico
Suite Agente Nex (release MAJOR):
1. Bubble: copiar mensagens do usuário (não só da IA), gravação de áudio (record/pause/cancel/send), player de áudio com speed control (1x/1.25x/1.5x/1.75x/2x), transcrição automática.
2. Mover seção Agente Nex de `/configuracoes` para um menu dedicado no sidebar `/agente-nex` com submenus: Configuração, Chaves de API, Consumo, Prompt.
3. Tela de Consumo IA migra para `/agente-nex/consumo` (preservar 100%, melhor distribuída).
4. NOVA tela `/agente-nex/prompt` com:
   - Visualizar/editar system prompt
   - Toggle áudio in (controla se aparece o botão na bubble)
   - Personalidade, tom, guardrails (campos separados)
   - Base de conhecimento (PDFs)
   - Tools customizadas
   - Playground de teste
5. Testes reais que façam sentido + deploy assistido.

## Workflow obrigatório
- superpowers:brainstorming → spec v1 → v2 → v3 (double-check real)
- superpowers:writing-plans → plan v1 → v2 → v3 (pente fino MAIS profundo no v3)
- ui-ux-pro-max em TUDO de UI/layout
- subagent-driven-development com tasks granulares (quanto mais melhor)
- Modo autônomo total — não vou perguntar até 100%

## Arquivos prováveis
**NOVOS:**
- src/app/(protected)/agente-nex/layout.tsx (sub-nav)
- src/app/(protected)/agente-nex/configuracao/page.tsx
- src/app/(protected)/agente-nex/chaves/page.tsx
- src/app/(protected)/agente-nex/consumo/page.tsx
- src/app/(protected)/agente-nex/prompt/page.tsx
- src/components/agente-nex/* (componentes da nova área)
- src/components/nex/audio-recorder.tsx
- src/components/nex/audio-player.tsx
- src/components/nex/copy-button.tsx
- src/lib/nex/prompt.ts (system prompt configurável)
- src/lib/nex/transcribe.ts (Whisper API)
- src/lib/nex/knowledge-base.ts (KB documents)
- src/lib/actions/nex-prompt.ts
- src/lib/actions/nex-transcribe.ts
- prisma migrations: nex_settings, nex_kb_documents

**MODIFICADOS:**
- src/components/nex/nex-bubble.tsx (botão áudio + copy)
- src/components/layout/sidebar.tsx (item Agente Nex com submenu)
- src/app/(protected)/configuracoes/page.tsx (remove cards Nex)
- src/app/(protected)/configuracoes/consumo/page.tsx (redirect → /agente-nex/consumo)
- src/lib/llm/agent/run-nex.ts (system prompt vem de db agora)

## Bloqueios
- (vazio)
