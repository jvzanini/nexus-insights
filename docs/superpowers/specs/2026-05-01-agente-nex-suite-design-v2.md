# Spec — Suite Agente Nex (v0.15.0) — VERSÃO 2

> **Status:** v2 — após pente fino #1 (22 achados aplicados). Sujeita a pente fino #2 mais profundo.
> **Versão alvo:** v0.15.0
> **Autor:** claude-agente-nex-suite
> **Data:** 2026-05-01

## 1. Contexto

Reorganização e expansão do Agente Nex em três frentes:

1. **Bubble** — copy em qualquer mensagem; gravação/envio de áudio com pause/cancel/send; player com controle de velocidade; transcrição automática Whisper.
2. **Sidebar dedicado `/agente-nex`** com 4 sub-páginas: Configuração / Chaves de API / Prompt / Consumo. Cards Nex saem de `/configuracoes`.
3. **Nova área "Prompt"** — system prompt configurável (personalidade + tom + guardrails), KB de PDFs/TXT, playground.

## 2. Objetivos

### 2A — Bubble

- Copy button em **toda** mensagem (user + assistant), aparecendo no hover (`opacity-0 → group-hover:opacity-100`).
- Botão microfone à esquerda do enviar **somente quando `audio_input_enabled = true` E provider ativo é OpenAI** (Whisper).
- Gravador inline com 3 ações (Cancelar, Pausar/Retomar, Enviar).
- Mensagem de áudio renderizada como **uma única mensagem `role=user`** com `kind="audio"`, contendo dois sub-elementos visuais: player (encima) + transcrição (embaixo, em fonte muted).
- Conteúdo enviado pro `runNexAgent`: a string da transcrição. Áudio fica só no client (Blob URL temporário).
- Custo Whisper logado em `llm_usage` com `model="whisper-1"`, `cost_usd` por minuto, `cost_brl` automático via `getUsdBrlRate()`.

### 2B — Sidebar / arquitetura

- Submenu colapsável "Agente Nex" no sidebar (super_admin only), entre Relatórios e Usuários.
- 4 sub-itens, todos super_admin only: **Configuração**, **Chaves de API**, **Prompt**, **Consumo**.
- `/agente-nex/configuracao` — provider/modelo/chave/spread (atual aba "Configuração" do `LlmConfigCard`).
- `/agente-nex/chaves` — CRUD de chaves de API (atual aba "Chaves" do `LlmConfigCard`).
- `/agente-nex/consumo` — relatório de uso (conteúdo de `/configuracoes/consumo` integral).
- `/agente-nex/prompt` — NOVA área (descrita em §2C).
- `/configuracoes` perde os cards Nex e o item "Consumo IA" do sidebar.
- `/configuracoes/consumo` ganha redirect 308 → `/agente-nex/consumo`.
- Filtro Matrix IA no Nex (corrigido em v0.13.9) é preservado.

### 2C — Prompt configurável

- System prompt **dinâmico** lido de `nex_settings` (singleton) + KB documents.
- Campos editáveis (compostos no prompt final):
  - **Personalidade** — texto livre, 0–500 chars.
  - **Tom** — texto livre, 0–500 chars.
  - **Guardrails** — lista de regras, cada uma 0–300 chars, até 20 itens.
  - **Override avançado** — toggle + textarea (até 50k chars). Quando ON, substitui tudo o que está acima.
- Toggles:
  - **Entrada de áudio do usuário** (`audio_input_enabled`) — gating client-side (mostra/esconde mic). Validação server: só pode ligar quando provider é OpenAI.
  - **Base de conhecimento ativa** (`kb_enabled`) — gating server-side (KB só vai pro prompt se `true`).
- **Base de conhecimento (KB)**:
  - Upload de PDFs e TXT (≤ 5 MB cada).
  - Extração via `pdf-parse` (PDF) ou direto (TXT).
  - Cada doc capado em 100k chars (extras ignorados).
  - Cap total 30k chars no prompt — trunca último doc com marca `[...truncado...]`.
  - Lista visual com nome, tamanho, char count, data, ação delete.
  - Warning quando total > 25k chars (próximo do cap).
- **Playground inline**:
  - textarea (cap 1000 chars no client) + botão Enviar.
  - Reusa `runNexAgent` com `promptOverride` (calculado a partir da config sendo editada) e `isPlayground=true`.
  - Não loga em `llm_usage`.
  - Resposta renderizada no mesmo card.
  - **KB no playground**: SEMPRE vem do banco (não permite simular KB diferente). Flag `kbEnabled` decide se inclui ou não.

## 3. Não-objetivos

- Tools customizadas pelo usuário (definir ferramentas no UI). Mantém as 7 tools embutidas.
- Embeddings/RAG real (vector search). MVP é injeção de texto direto.
- Modelos multimodais nativos (GPT-4o áudio, Gemini áudio).
- Suporte a vídeo ou imagens.
- Voice output (TTS — IA falando).
- Histórico de conversas server-side.
- Multi-tenant em prompt config.
- Importar/exportar prompt (backup textual).
- Versionamento de prompt (rollback).
- Whisper em provider != OpenAI nesta release. Toggle áudio fica desabilitado se provider ≠ OpenAI.
- Mudar comportamento do `nex.bubble_enabled` (toggle existente que liga/desliga a bolha inteira). Os dois toggles são independentes — documentado em §7.6.

## 4. Arquitetura

### 4.1 Diagrama geral

```
┌──────────────────────────── Cliente (browser) ────────────────────────────┐
│                                                                            │
│  ┌────────── NexBubble ──────────┐    ┌────── /agente-nex/* ────────────┐ │
│  │ chat texto + áudio + copy     │    │ Configuração / Chaves / Prompt  │ │
│  │ recebe `audioInputEnabled`    │    │ Consumo (todos super_admin)     │ │
│  │ via Server Component layout   │    │                                 │ │
│  └─────┬─────────────────────────┘    └──────┬──────────────────────────┘ │
│        │                                     │                             │
│  fetch /api/nex/transcribe        Server Actions /lib/actions/nex-prompt   │
└────────┼─────────────────────────────────────┼─────────────────────────────┘
         │                                     │
         ▼                                     ▼
   ┌──────────────────┐           ┌─────────────────────────────────┐
   │ Route Handler    │           │ runNexAgent (extended)          │
   │ /api/nex/        │           │ - composeSystemPrompt           │
   │   transcribe     │──┐        │ - promptOverride (playground)   │
   │ (Whisper API)    │  │        │ - isPlayground (sem logUsage)   │
   │ + logUsage       │  │        └─────────────────────────────────┘
   └──────────────────┘  │                  │
                         │                  │
                         ▼                  ▼
              ┌──────────────────────────────────────────┐
              │                Postgres                  │
              │  NOVO:                                   │
              │   nex_settings (singleton id='global')   │
              │   nex_kb_documents                       │
              │  EXISTENTE:                              │
              │   llm_configs / llm_credentials          │
              │   llm_usage / app_settings               │
              └──────────────────────────────────────────┘
```

### 4.2 Fluxo do áudio (em detalhe)

```
1. user pressiona 🎤 (existe se audio_input_enabled = true)
2. browser pede permissão mic (uma vez; cacheia na origem)
3. MediaRecorder.start() coleta blocos webm/opus
4. UI mostra: ● gravando 0:08 [⏸] [❌] [➤]
5. user pode pausar (resume) / cancelar (descarta) / enviar
6. on send:
   - cliente cria audioBlobUrl = URL.createObjectURL(blob)
   - POST /api/nex/transcribe (multipart) → Whisper → {text, durationSeconds}
   - se text === "" ou só whitespace: toast "Não consegui transcrever" + descarta
   - senão: cliente cria UiMessage { role:"user", kind:"audio", audioBlobUrl, durationSeconds, content: text }
   - cliente despacha sendNexMessage(text) (mensagem normal pro agente)
7. server log /api/nex/transcribe:
   - logUsage({ model:"whisper-1", costUsd: minutes × 0.006, durationMs, ... })
   - cost_brl populado pelo usage-logger
```

### 4.3 Persistência do áudio

- **Sessão atual**: `audioBlobUrl` permanece válido (Blob in memory).
- **Após reload**: localStorage só preserva `kind="audio"` + transcrição (`content`). `audioBlobUrl` se perde — UI renderiza só transcrição com nota "(áudio expirado)" em cinza.
- Trade-off aceito: simplicidade vs persistência permanente. Para áudio durável seria preciso S3/upload server, fora do escopo MVP.

### 4.4 Fallback de provider para áudio

- Toggle `audio_input_enabled` só pode ser `true` quando `getActiveLlmConfig()?.provider === "openai"`.
- UI do toggle: disabled + tooltip explicativo quando provider ≠ openai.
- Server: `saveNexPromptConfigAction` valida e rejeita `audio_input_enabled=true` se provider não é openai (retorna `{ ok:false, error: "Whisper requer chave OpenAI ativa" }`).
- Bubble Server Component (`(protected)/layout.tsx`): mesmo se toggle estiver `true` no banco, se o provider tiver mudado depois, computa `effectiveAudioEnabled = toggle && provider==="openai"` e passa pra `<NexBubble>`.

## 5. Modelo de dados

### 5.1 `nex_settings` (singleton)

```sql
CREATE TABLE IF NOT EXISTS "nex_settings" (
  "id"                  TEXT NOT NULL DEFAULT 'global',
  "personality"         TEXT NOT NULL DEFAULT '',
  "tone"                TEXT NOT NULL DEFAULT '',
  "guardrails"          JSONB NOT NULL DEFAULT '[]'::jsonb,
  "advanced_override"   TEXT,
  "audio_input_enabled" BOOLEAN NOT NULL DEFAULT false,
  "kb_enabled"          BOOLEAN NOT NULL DEFAULT true,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"       UUID,
  CONSTRAINT "nex_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nex_settings_singleton" CHECK (id = 'global')
);
INSERT INTO nex_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
```

- `guardrails`: array de strings, máx 20 items × 300 chars cada.
- `advanced_override`: NULL ou string (≤ 50_000 chars).
- `personality` ≤ 500 chars; `tone` ≤ 500 chars.

### 5.2 `nex_kb_documents`

```sql
CREATE TABLE IF NOT EXISTS "nex_kb_documents" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT NOT NULL,
  "mime_type"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "char_count"     INTEGER NOT NULL,
  "extracted_text" TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" UUID,
  CONSTRAINT "nex_kb_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx"
  ON "nex_kb_documents"("created_at" DESC);
```

- `extracted_text`: texto puro (não HTML, não markdown). Cap por doc 100k chars.
- `mime_type`: `application/pdf` ou `text/plain` (validados na ação).

### 5.3 `MODEL_PRICING["whisper-1"]`

Adicionar em `src/lib/llm/pricing.ts`:

```ts
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Custo por minuto de áudio (modelos como whisper-1). */
  perMinuteUsd?: number;
}

"whisper-1": { inputPerMillion: 0, outputPerMillion: 0, perMinuteUsd: 0.006 },
```

E `calculateCost` aceita 4º arg opcional `extras?: { durationMs?: number }`. Se `pricing.perMinuteUsd && extras.durationMs`, calcula por minuto. Senão, usa tokens (comportamento atual).

## 6. APIs / Server Actions

### 6.1 Route Handler `POST /api/nex/transcribe`

- `runtime = "nodejs"` (multipart + buffers).
- `maxDuration = 60`.
- Auth obrigatório (`auth()` retorna user).
- FormData fields:
  - `audio` (Blob, ≤ 25 MB).
  - `language` (opcional, BCP-47, default `pt`).
- Validações:
  - `audio.size ≤ 25 MB`.
  - `getActiveLlmConfig()?.provider === "openai"` — senão retorna 400 com mensagem clara.
- Chama Whisper (`POST /v1/audio/transcriptions` com `model=whisper-1`, `file=audio`, `response_format=verbose_json`, `language=pt`).
- Retorna `{ ok: true, text, durationSeconds }`.
- Loga em `llm_usage`: provider="openai", model="whisper-1", tokens=0, cost_usd computed, duration_ms = elapsed.
- Erros: 401 (não auth), 400 (size/provider), 500 (Whisper falhou).

### 6.2 Server Actions — `src/lib/actions/nex-prompt.ts`

Todas guarded por `requireSuperAdmin()`. Todas com `safeAction` wrapper (não-throw).

```ts
getNexPromptConfigAction(): ActionResult<NexPromptConfig>
saveNexPromptConfigAction(input: NexPromptConfig): ActionResult
previewSystemPromptAction(input: NexPromptConfig): ActionResult<{ composedPrompt: string }>
listKbDocumentsAction(): ActionResult<KbSummary[]>
uploadKbDocumentAction(formData: FormData): ActionResult<{ id: string; charCount: number }>
deleteKbDocumentAction(id: string): ActionResult
```

`saveNexPromptConfigAction` valida:
- Personality ≤ 500.
- Tone ≤ 500.
- Guardrails ≤ 20 itens × 300 chars cada.
- AdvancedOverride ≤ 50k chars.
- `audio_input_enabled === true` → exige `getActiveLlmConfig()?.provider === "openai"`. Senão: erro tipado.

Todos mutadores logam audit: `action="setting_updated"`, `targetType="nex_prompt"` ou `"nex_kb_document"`.

### 6.3 Server Action — `testNexPromptAction(message, cfg)` em `nex-chat.ts`

Wrapper de `runNexAgent`:
- Compõe prompt usando `cfg` (não persistido) + KB docs do banco (se `cfg.kbEnabled`).
- Chama `runNexAgent({ messages: [{ role: "user", content: message }], promptOverride, isPlayground: true })`.
- Não loga uso.
- Cap mensagem playground = 1000 chars (validação client-side; server reforça).

### 6.4 `runNexAgent` extended

```ts
export interface RunNexInput {
  messages: ChatMessage[];
  accountId: number;
  userId?: string;
  platformRole?: string | null;
  /** Override do prompt — usado pelo playground. Não persiste, não loga uso. */
  promptOverride?: string;
  /** Quando true, NÃO chama logUsage. */
  isPlayground?: boolean;
  clientOverride?: ProviderClient | null;
}
```

System prompt:
- Se `promptOverride && length > 0`: usa `promptOverride.slice(0, MAX_PROMPT_OVERRIDE_LEN)` (cap defensivo).
- Senão: `composeSystemPrompt(getNexPromptConfig(), kbEnabled ? getKbDocsForPrompt() : [])`.

Quando `isPlayground === true`: pula todos os `logUsage` calls.

### 6.5 `composeSystemPrompt(cfg, kbDocs)`

Algoritmo (deterministic):

1. Se `cfg.advancedOverride && cfg.advancedOverride.trim().length > 0`: retorna `cfg.advancedOverride` (substitui tudo).
2. Senão, monta string em ordem:
   ```
   IDENTITY_BASE
   
   [se personality não-vazia]
   [PERSONALIDADE]
   Personalidade: <personality>
   
   [se tone não-vazio]
   [TOM]
   Tom: <tone>
   
   [se guardrails.length > 0]
   [GUARDRAILS]
   Regras importantes:
   - <guardrail 1>
   - <guardrail 2>
   ...
   
   [se kbEnabled && kbDocs.length > 0]
   [BASE DE CONHECIMENTO]
   Conhecimento adicional fornecido pelo administrador:
   
   === <doc.name> ===
   <doc.extractedText>
   ...
   ```
3. KB respeita cap MAX_KB_TOTAL_CHARS=30000. Trunca último doc inteiro com `[...truncado...]`.
4. `IDENTITY_BASE` é uma constante (mesma do v0.14, mantém a base de capacidades + diretrizes + timezone).

## 7. UI/UX

> Toda task UI invoca skill `ui-ux-pro-max:ui-ux-pro-max` antes de qualquer Edit. Padrão: `rounded-2xl border border-border bg-muted/30 p-2`, violet-500 highlights, ícones lucide-react.

### 7.1 Bubble — input bar

Estado idle (texto):
```
┌────────────────────────────────────────────────────┐
│  [textarea: pergunte algo]                       ✓ │
│  Enter envia · Shift+Enter quebra linha            │
│                                            🎤   ➤  │
└────────────────────────────────────────────────────┘
```
- Botão 🎤 visível somente se `effectiveAudioEnabled = true`.
- Botão ➤ envia o texto digitado.

Estado gravando:
```
┌────────────────────────────────────────────────────┐
│  ● Gravando 0:08                  [⏸] [❌] [➤]    │
└────────────────────────────────────────────────────┘
```
- ● animado (pulse vermelho).
- Timer mm:ss.
- ⏸ pausar / ▶ retomar (Pause/Play); ❌ cancelar; ➤ enviar.

Sem waveform animada na v2 (simplificação). Adicionar futuramente se relevante.

Cap duração: 5 min (auto-send se atinge).

### 7.2 Bubble — mensagem áudio

Layout (alinhado direita, cor user):
```
                           ┌─────────────────────────────────┐
                           │ ▶ ━━━━○────  0:00/0:08  1× ⌄    │
                           └─────────────────────────────────┘
                                       ┌────────────────────┐
                                       │ 📝 transcrição...  │
                                       └────────────────────┘
```

- **Player** (cor user, bg-violet-600/15): play/pause + barra seek + tempo + speed dropdown (1×/1.25×/1.5×/1.75×/2×).
- **Transcrição** (cor user-muted, fonte menor): prefixada por 📝, em fonte cinza.
- Após reload sem áudio: player vira "(áudio expirado)" em cinza; transcrição permanece.

### 7.3 Bubble — copy button universal

`<NexMessage>` ganha `<CopyButton>` em **TODA** mensagem (user + assistant). Mesma estética de antes (-top-2, -right-2, opacity-0 group-hover:opacity-100).

### 7.4 Sidebar — submenu Agente Nex

Estilo igual /relatorios (já implementado). Posição: entre "Relatórios" e "Usuários".

```
✨ Agente Nex                              ⌄
  ├─ ⚙  Configuração       /agente-nex/configuracao
  ├─ 🔑 Chaves de API     /agente-nex/chaves
  ├─ 📖 Prompt            /agente-nex/prompt
  └─ 📈 Consumo           /agente-nex/consumo
```

- Ícones: `Sparkles` (root), `SlidersHorizontal`, `KeyRound`, `BookOpen`, `TrendingUp`.
- `superAdminOnly: true` em todos.
- Item antigo "Consumo IA" removido do `NAV_ITEMS`.

### 7.5 `/agente-nex/configuracao`

- PageShell variant="narrow" + PageHeader.
- Card único com `<LlmConfigForm>` (extraído do atual `LlmConfigCard`).
- Mantém: toggle bolha + status configurado + provider/model/credential + spread + Testar/Salvar.

### 7.6 `/agente-nex/chaves`

- PageShell + PageHeader.
- Card com `<LlmCredentialsManager>` (já extraído em v0.13).

### 7.7 `/agente-nex/consumo`

- PageShell + PageHeader.
- Conteúdo idêntico ao `/configuracoes/consumo` atual (`<ConsumoContent>`).
- Whisper-1 entries aparecem com modelo "whisper-1" e custo per-minute correto.

### 7.8 `/agente-nex/prompt`

4 cards verticais:

**Card 1 — Comportamento**
- Personality (textarea, contador X/500).
- Tone (textarea, contador X/500).
- Guardrails (lista chips — Input + Trash; botão "+Adicionar regra"; max 20).
- Toggle "Modo override avançado" → revela textarea livre (max 50k chars, font-mono text-xs).
- Botão "Pré-visualizar prompt completo" → abre Dialog modal com `<pre>` mostrando `composeSystemPrompt(currentForm, kbDocs)`.
- Botão "Salvar" (commit toda a config).

**Card 2 — Recursos**
- Toggle "🎤 Entrada de áudio" — desabilitado se provider ≠ openai (com tooltip "Disponível apenas com OpenAI"). On change: salva imediato + revalidate.
- Toggle "📚 Base de conhecimento" — On change: salva imediato + revalidate.

**Card 3 — Base de conhecimento**
- Header com contador "1.234 / 30.000 chars" + barra de progresso.
- Warning amarelo quando >25k chars ("próximo do limite").
- Lista: 📄 nome · tamanho · X chars · 🗑.
- Botão "+ Adicionar documento" → abre Dialog upload (file input, accept `.pdf,.txt`, max 5MB).

**Card 4 — Playground**
- Textarea (cap 1000 chars).
- Botão "▶ Enviar" → loading → resposta render como `<NexMessage role="assistant" content={...} />` (sem persistência, sem afetar histórico real do bubble).
- Limpar resultado: botão "Nova pergunta".

### 7.9 `/configuracoes` (limpeza)

Remove imports `LlmConfigCard`, `getPublicActiveLlmConfig`, `listCredentials`, `getUsdBrlRate`, `DEFAULT_CARD_SPREAD`, `isNexBubbleEnabled`. Remove o `<LlmConfigCard>` do JSX. Mantém Plataforma, EnabledReports, MatrixIA, Visibility, Polling.

### 7.10 Toggles independentes — documentação UX

Há **dois toggles relacionados mas distintos**:

| Toggle | Onde | Tabela | O que controla |
|--------|------|--------|----------------|
| **Bolha do Agente Nex** (existente) | `/agente-nex/configuracao` (status card) | `app_settings.nex.bubble_enabled` | Se a bolha flutuante aparece em todas as páginas |
| **Entrada de áudio** (NOVO) | `/agente-nex/prompt` (card Recursos) | `nex_settings.audio_input_enabled` | Se o botão 🎤 aparece dentro da bolha |

`nex.bubble_enabled = false` ⇒ bolha sumida (irrelevante o áudio).
`nex.bubble_enabled = true` ⇒ bolha aparece; áudio segue o segundo toggle.

### 7.11 Acessibilidade

- Todos os botões de áudio (mic, play, pause, send, cancel, speed dropdown) têm `aria-label` em PT-BR.
- Foco visível em todos os interativos (default da plataforma).
- `prefers-reduced-motion` respeitado (sem pulse animado em mic se preferência ON).
- Keyboard: Enter/Space ativa botões; Esc cancela gravação ativa.
- `aria-live="polite"` no timer de gravação.

## 8. Áudio em detalhe

### 8.1 Captura client

- `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Erro `NotAllowedError` → toast "Acesso ao microfone negado".
- Erro `NotSupportedError` ou `MediaRecorder undefined` → esconde mic permanentemente.
- Tenta mime `audio/webm;codecs=opus` → fallback `audio/webm` → fallback `audio/mp4` (Safari).
- `MediaRecorder.start(250)` (timeslice para coletar blocos rápidos).
- Pause/resume nativos via `MediaRecorder.pause()` / `resume()`.

### 8.2 Player client

- HTML5 `<audio>` invisível + controles custom.
- Speed via `audio.playbackRate`. Memorizada em estado por sessão (nunca persiste).
- Seek via `<input type="range">` ligado a `audio.currentTime`.

### 8.3 Servidor — Route Handler

- `runtime: "nodejs"`.
- Limita 25 MB no servidor (cap defensivo, igual Whisper).
- Timeout 30s.
- POST para `https://api.openai.com/v1/audio/transcriptions`.
- Body multipart: `model=whisper-1`, `file=<blob>`, `response_format=verbose_json`, `language=pt` (configurável via FormData).

### 8.4 Custo

- Whisper $0.006/min.
- `calculateCost("whisper-1", 0, 0, { durationMs })` retorna `Math.round(min × 0.006 × 1e6) / 1e6`.
- Aparece no `/agente-nex/consumo` como modelo `whisper-1`.

### 8.5 Erros do path completo

| Cenário | UI |
|--------|----|
| Permissão de mic negada | Toast "Acesso ao microfone negado" |
| MediaRecorder não suportado | Mic escondido permanentemente |
| Áudio > 5 min | Auto-send |
| Provider ≠ OpenAI no momento do envio | Toast "Whisper requer OpenAI ativo" + descarta |
| Whisper retorna 401 | Toast "Chave OpenAI inválida" + descarta |
| Whisper retorna 5xx | Toast "Falha na transcrição. Tente novamente" + descarta |
| Whisper retorna `text=""` (silêncio) | Toast "Não consegui transcrever — áudio inaudível?" + descarta |
| Texto OK | UiMessage criada + envia para agente |

## 9. Migração

- `ensureNexTables()` segue padrão `ensureLlmTables`:
  - `CREATE TABLE IF NOT EXISTS nex_settings (...)` + INSERT singleton ON CONFLICT DO NOTHING.
  - `CREATE TABLE IF NOT EXISTS nex_kb_documents (...)`.
  - Cache em memória pra evitar overhead.
- Roda na primeira chamada que usa `getNexPromptConfig` ou `composeSystemPrompt`.
- Nada para "migrar" — é greenfield.

## 10. Compatibilidade & rollout

- `/configuracoes/consumo` mantém link funcional via redirect 308.
- Bookmarks/tutoriais com URL antiga: redirect transparente.
- Deploy zero-downtime: pod novo aplica `ensureNexTables()` na primeira request relevante. Pod antigo segue lendo só o que conhece (não toca em `nex_*`).
- Rollback: remove o NAV item, sub-rotas viram 404; resto reverte normal.
- A bolha continua igual ao v0.14.x até `audio_input_enabled` ser ligado.

## 11. Testes

### 11.1 Unidade (libs)

- `src/lib/nex/__tests__/prompt.test.ts`:
  - `composeSystemPrompt` sem campos → IDENTITY_BASE puro.
  - Com personality + tone + guardrails → composição correta na ordem.
  - `advancedOverride` substitui tudo.
  - KB desabilitada → não injeta.
  - KB habilitada → injeta com header.
  - KB cap 30k → trunca último doc com `[...truncado...]`.
  - Validações de `saveNexPromptConfig` (personality, tone, guardrails, override > 50k).
  - Validação áudio: rejeita `audio_input_enabled=true` se provider ≠ openai.
- `src/lib/nex/__tests__/kb.test.ts`:
  - listKbDocuments retorna sem extracted_text.
  - getKbDocsForPrompt retorna em ordem.
  - createKbDocument cap por doc + rejeita > 5MB.
  - deleteKbDocument.
- `src/lib/nex/__tests__/transcribe.test.ts`:
  - Provider != openai → erro tipado.
  - Áudio > 25MB → erro tipado.
  - Whisper retorna text → estrutura correta.
  - Whisper retorna erro → propaga.
- `src/lib/nex/__tests__/ensure-tables.test.ts`:
  - Cria tabelas + seed singleton.
  - Idempotente.
- `src/lib/llm/__tests__/pricing-whisper.test.ts`:
  - whisper-1 1min = $0.006.
  - whisper-1 30s = $0.003.
  - tokens-based ainda funciona pra outros modelos.

### 11.2 Componente (RTL)

- `src/components/nex/__tests__/audio-recorder.test.tsx`:
  - Estado idle mostra botão mic.
  - Click mic → estado recording (mock MediaRecorder global).
  - Pause/resume.
  - Cancel volta a idle.
- `src/components/nex/__tests__/audio-player.test.tsx`:
  - Renderiza play button.
  - Speed dropdown 5 opções.
  - Trocar speed muda playbackRate.
- `src/components/nex/__tests__/nex-message.test.tsx`:
  - Copy button visível em user E assistant.
  - kind="audio" renderiza player + transcrição.
- `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`:
  - Add/remove guardrails.
  - Override toggle revela textarea.
  - Save chama action com payload correto.
- `src/components/agente-nex/__tests__/kb-section.test.tsx`:
  - Renderiza lista.
  - Upload dispara FormData.
  - Warning quando total > 25k.
- `src/components/agente-nex/__tests__/playground.test.tsx`:
  - Submit chama testNexPromptAction.
  - Mostra resposta.

### 11.3 Server Actions

- `src/lib/actions/__tests__/nex-prompt.test.ts`:
  - Guarda super_admin.
  - Audit log emitido.
  - Rejeita áudio se provider != openai.

### 11.4 Smoke E2E (manual após deploy)

Lista de checks pós-deploy:
- [ ] Sidebar mostra Agente Nex como submenu colapsável.
- [ ] /agente-nex → redirect /configuracao.
- [ ] /agente-nex/configuracao: trocar modelo, salvar, status atualiza.
- [ ] /agente-nex/chaves: criar nova chave, deletar.
- [ ] /agente-nex/prompt: editar personalidade, salvar; bubble responde refletindo.
- [ ] /agente-nex/prompt: ativar toggle áudio; bubble: mic aparece.
- [ ] /agente-nex/prompt: upload PDF 1MB; lista atualiza com chars.
- [ ] /agente-nex/prompt: playground "Olá" → resposta da IA.
- [ ] Bubble: gravar 5s, pause, retomar 3s, enviar → player + transcrição + IA responde.
- [ ] Bubble: copy em mensagem do user funciona.
- [ ] /agente-nex/consumo: tela carrega; whisper-1 aparece após teste de áudio.
- [ ] /configuracoes/consumo → redireciona para /agente-nex/consumo.
- [ ] /configuracoes: sem cards Nex.
- [ ] Acessibilidade: tab navigation funciona em todos os novos botões.

## 12. Segurança

- KB upload: valida mime (`application/pdf`, `text/plain`), max 5 MB. Após extração, sanitize texto (remove caracteres de controle exceto whitespace).
- Whisper: API key nunca exposta ao client. Fica server-side em `getActiveLlmConfig()`.
- Auth obrigatório em `/api/nex/transcribe`. Não-autenticado → 401.
- Audio Blob no client: `URL.createObjectURL` revogado no `onunmount` da mensagem (cleanup com `useEffect`).
- Logs de uso (`llm_usage`) não armazenam conteúdo da fala (só duração).
- Playground: roda com prompt **não persistido**, mas usa chave/modelo configurado. Não loga em `llm_usage`.

## 13. Riscos

| Risco | Mitigação |
|-------|-----------|
| `pdf-parse` quebra em PDFs com layout complexo | Try/catch específico. Erro: "Não foi possível extrair texto do PDF. Tente exportar como TXT". |
| MediaRecorder ausente em Safari iOS antigo | Detect feature → esconder mic. Tooltip explicativo no toggle. |
| Whisper lento para áudios longos | Timeout 30s no Route Handler. Cap 5 min de gravação ajuda. |
| Cap 30k chars do prompt explode | Cap server. Warning UI quando >25k. |
| Provider muda depois de toggle áudio ON | Bubble computa `effectiveAudioEnabled = toggle && provider==="openai"` em runtime. Toggle no UI mostra disabled se aplicável. |
| Outro agente Claude paralelo mexendo em sidebar/nav | Protocolo `AGENTS.md` cobre. |
| Build em paralelo com outro agente | `gh run list --limit 5` antes de push. |
| Áudio silencioso/inaudível | Transcrição vazia → toast e descarta. |
| Áudio de 5 min auto-send sem aviso | Cap conhecido; toast "Limite de 5 min atingido — enviando…" antes do send. |

## 14. Critérios de aceite

1. **Sidebar**: submenu "Agente Nex" entre Relatórios e Usuários (super_admin only). 4 itens. Item antigo "Consumo IA" removido.
2. **`/configuracoes`**: sem cards Nex; restantes cards intactos.
3. **`/configuracoes/consumo`**: redireciona 308 para `/agente-nex/consumo`.
4. **`/agente-nex/configuracao`**: provedor + modelo + chave + spread; ações Salvar e Testar funcionam.
5. **`/agente-nex/chaves`**: lista por provider + ações CRUD; ponto verde na ativa.
6. **`/agente-nex/consumo`**: idêntico ao /configuracoes/consumo anterior.
7. **`/agente-nex/prompt`**: 4 cards funcionam (Comportamento + Recursos + KB + Playground).
8. **System prompt**: dinâmico (lê `nex_settings`); bubble responde refletindo personalidade.
9. **Bubble copy**: visível e funcional em mensagens user e assistant.
10. **Bubble áudio (provider OpenAI + toggle ON)**: mic aparece; record/pause/cancel/send; player + speed; transcrição visível; IA responde texto.
11. **Bubble áudio (provider ≠ OpenAI ou toggle OFF)**: mic não aparece.
12. **Whisper logado**: `llm_usage` ganha row `model=whisper-1`, `cost_usd>0`, `cost_brl>0`.
13. **KB upload**: PDF/TXT extraídos; cap 5MB; cap por doc 100k; cap total prompt 30k.
14. **Playground**: testa sem persistir; não loga em `llm_usage`.
15. **Build/CI**: typecheck 0, tests verde, build verde, `/api/health version=v0.15.0`.
16. **Acessibilidade**: aria-labels nos novos botões; tab navigation; prefers-reduced-motion.

---

## Apêndice A — Glossário

- **KB** (Base de Conhecimento): conjunto de documentos texto persistidos em `nex_kb_documents`, opcionalmente injetados no system prompt do Nex.
- **Override avançado**: prompt cru que substitui toda a composição (personality + tone + guardrails + KB).
- **Toggle bolha**: existe há tempos, controla se `<NexBubble>` é renderizada no layout protegido.
- **Toggle áudio**: NOVO, controla apenas se o botão mic dentro da bolha aparece.
- **Playground**: caixa de teste em `/agente-nex/prompt` — testa config sem salvar e sem afetar histórico do bubble nem `llm_usage`.

## Apêndice B — Roadmap pós-MVP

Não fazem parte desta release, mas são caminhos naturais:
- **Tools customizadas via UI**: super_admin define functions com schema JSON.
- **RAG real**: embeddings em pgvector, vector similarity search.
- **Multimodal nativo**: GPT-4o áudio direto (sem Whisper intermediário).
- **TTS**: agente fala em vez de só escrever.
- **Histórico server-side**: persistência por usuário, busca, export.
- **Multi-tenant prompt**: configs distintas por account.
- **Versionamento de prompt**: rollback, A/B testing.
- **Whisper para Anthropic/Gemini providers**: cada um tem sua API de speech-to-text (Anthropic não tem nativo; Gemini tem). Adapter pluggable.
