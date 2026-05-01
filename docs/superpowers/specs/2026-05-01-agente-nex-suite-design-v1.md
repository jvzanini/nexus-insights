# Spec — Suite Agente Nex (v0.15.0) — VERSÃO 1 (rascunho)

> **Status:** v1 — RASCUNHO INICIAL. Sujeito a revisão crítica (ver `-review-1.md`).
> **Versão alvo:** v0.15.0
> **Autor:** claude-agente-nex-suite
> **Data:** 2026-05-01

## 1. Contexto

O super_admin pediu uma reorganização e expansão do Agente Nex:

1. **Bubble**: copiar mensagens do usuário também (não só da IA). Habilitar gravação e envio de áudio (record/pause/cancel/send). Player de áudio no balão com controle de velocidade (1×/1.25×/1.5×/1.75×/2×). IA transcreve áudio e responde em texto.
2. **Reorganização**: tirar cards Nex de `/configuracoes` e criar menu novo no sidebar `/agente-nex` com submenu (Configuração, Chaves de API, Consumo, Prompt). Tela "Consumo IA" migra para dentro deste menu.
3. **Nova área "Prompt"**: ver/editar system prompt; campos separados pra personalidade, tom e guardrails; toggle "habilitar entrada de áudio"; base de conhecimento (PDFs); playground de teste.

## 2. Objetivos

### Bubble

- Copy button em toda mensagem (user + assistant).
- Botão microfone ao lado do enviar (visível só quando `audioInputEnabled = true`).
- Gravador inline com 3 ações (Cancelar, Pausar/Retomar, Enviar).
- Mensagem de áudio com player customizado (play/pause + speed dropdown).
- Transcrição via Whisper API (OpenAI); chat exibe player + transcrição + IA responde.

### Sidebar / arquitetura

- Nova rota `/agente-nex` com submenu de 4 itens.
- `/agente-nex/configuracao` — provider/modelo/chave/spread.
- `/agente-nex/chaves` — CRUD de chaves de API.
- `/agente-nex/consumo` — relatório de uso (atual `/configuracoes/consumo`).
- `/agente-nex/prompt` — NOVA área (prompt config + KB + playground).
- `/configuracoes` perde os cards Nex.
- `/configuracoes/consumo` ganha redirect para `/agente-nex/consumo`.

### Prompt configurável

- System prompt dinâmico (não mais constante).
- Campos: personalidade (texto livre), tom (texto livre), guardrails (lista), advanced override (texto livre).
- Toggles: áudio in (bubble), KB ativa.
- KB: upload PDF/TXT, extração de texto, lista visual.
- Playground inline.

## 3. Não-objetivos

- Tools customizadas pelo usuário (definir ferramentas no UI).
- Embeddings/RAG real (vector search).
- Modelos multimodais nativos (GPT-4o áudio).
- Suporte a vídeo ou imagens.
- Voice output (TTS).
- Histórico de conversas server-side.

## 4. Arquitetura

### 4.1 Visão geral

- Bubble: gravação client (`MediaRecorder`) → upload Blob para Route Handler `/api/nex/transcribe` → Whisper → texto → segue fluxo normal `sendNexMessage`.
- /agente-nex/*: páginas Server Component que buscam config + delegam pro UI.
- System prompt: lido de `nex_settings` (singleton) + composição em runtime.
- KB: documentos persistidos com texto extraído.

### 4.2 Fluxo do áudio

```
[user] mic → MediaRecorder → Blob webm/opus → POST /api/nex/transcribe → Whisper → text → mostra balão de áudio com player + transcrição → text vai pra runNexAgent → IA responde
```

## 5. Modelo de dados

### 5.1 Tabela `nex_settings` (singleton)

```sql
CREATE TABLE nex_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  personality TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  guardrails JSONB NOT NULL DEFAULT '[]',
  advanced_override TEXT,
  audio_input_enabled BOOLEAN NOT NULL DEFAULT false,
  kb_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID
);
```

### 5.2 Tabela `nex_kb_documents`

```sql
CREATE TABLE nex_kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INT NOT NULL,
  char_count INT NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_by_id UUID
);
```

## 6. APIs / Server Actions

### 6.1 Route Handler: `POST /api/nex/transcribe`

- Multipart form com `audio` blob.
- Auth requerido.
- Chama Whisper.
- Retorna `{ text, durationSeconds }`.
- Loga em `llm_usage` com modelo `whisper-1`.

### 6.2 Server Actions

`src/lib/actions/nex-prompt.ts`:
- `getNexPromptConfigAction()`
- `saveNexPromptConfigAction(input)`
- `previewSystemPromptAction(input)` — retorna prompt composto (sem salvar).
- `listKbDocumentsAction()`
- `uploadKbDocumentAction(formData)`
- `deleteKbDocumentAction(id)`
- `testNexPromptAction(message, config)` — playground.

### 6.3 `runNexAgent` ganha override

```ts
interface RunNexInput {
  ...existentes,
  promptOverride?: string;
  isPlayground?: boolean;
}
```

Quando `promptOverride` está set, usa-o. Senão, lê `nex_settings` + KB e compõe.
`isPlayground=true` não loga em `llm_usage`.

### 6.4 `composeSystemPrompt(cfg, kbDocs)`

```
[IDENTITY_BASE]
... constante ...

[PERSONALIDADE] (se preenchida)
[TOM] (se preenchido)
[GUARDRAILS] (se preenchidos)
[BASE DE CONHECIMENTO] (se kb_enabled e docs)
```

Override avançado substitui tudo.

## 7. UI

> Implementação obriga `ui-ux-pro-max:ui-ux-pro-max`.

### 7.1 Bubble — input

- Botão mic à esquerda do enviar quando habilitado.
- Click mic → estado "gravando" (timer + waveform).
- Botões: ⏸ pausar / ❌ cancelar / ➤ enviar.

### 7.2 Bubble — mensagem áudio

- Balão player customizado (play/pause + seek + speed dropdown).
- Balão menor abaixo com transcrição.

### 7.3 Sidebar

- Item "Agente Nex" submenu colapsável (igual /relatorios).
- Sub-itens super_admin only: Configuração, Chaves, Prompt, Consumo.
- Item antigo "Consumo IA" sai do sidebar.

### 7.4 /agente-nex/{configuracao,chaves,consumo}

- Cada um reaproveita componentes existentes (LlmConfigCard, LlmCredentialsManager, ConsumoContent).

### 7.5 /agente-nex/prompt

- Card "Comportamento": personalidade, tom, guardrails, override.
- Card "Recursos": toggles áudio + KB.
- Card "Base de conhecimento": lista + upload.
- Card "Playground": teste rápido.

## 8. Áudio em detalhe

### 8.1 Gravação client

- `MediaRecorder` com mime `audio/webm;codecs=opus`.
- `getUserMedia({audio:true})`.

### 8.2 Player

- HTML `<audio>` + custom controls.
- Speed via `audio.playbackRate`.

### 8.3 Servidor

- Route Handler com Whisper API.
- 25 MB limite.

### 8.4 Custo

- Whisper $0.006/minuto.
- `MODEL_PRICING["whisper-1"]` com `perMinuteUsd: 0.006`.

## 9. Migração

- `ensureNexTables()` cria as duas tabelas + seed singleton.
- Roda no primeiro request relevante.

## 10. Compatibilidade

- `/configuracoes/consumo` → redirect 308 para `/agente-nex/consumo`.
- Bubble continua igual até toggle áudio ser ligado.

## 11. Testes

- Unidade: composeSystemPrompt, KB CRUD, transcribeAudio, pricing whisper.
- Componente: AudioRecorder, AudioPlayer, PromptConfigForm, KbSection, Playground.
- Server Actions: nex-prompt actions com mock auth.

## 12. Segurança

- KB upload valida mime + tamanho.
- Whisper key não exposta ao client.
- Auth em /api/nex/transcribe.

## 13. Riscos

- pdf-parse pode falhar em PDFs complexos.
- MediaRecorder não disponível em Safari iOS antigo.
- Whisper pode demorar.

## 14. Critérios de aceite

1. Bubble: copy em user + assistant.
2. Bubble: mic + record/pause/cancel/send funciona.
3. Player: 5 níveis de velocidade.
4. Sidebar: submenu Agente Nex.
5. /agente-nex/* funciona.
6. /configuracoes/consumo redireciona.
7. /configuracoes sem cards Nex.
8. /agente-nex/prompt completo.
9. System prompt dinâmico.
10. Whisper logado em llm_usage.
11. Build + tests verde.
