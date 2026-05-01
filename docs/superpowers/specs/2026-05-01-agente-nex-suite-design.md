# Spec — Suite Agente Nex (v0.15.0)

> **Status:** v3 (após dois pente-finos)
> **Versão alvo:** v0.15.0
> **Autor:** claude-agente-nex-suite
> **Data:** 2026-05-01
> **Tipo:** feature MAJOR (release significativa, multi-superfície)

---

## 1. Contexto

O Agente Nex hoje vive como dois fragmentos:
- **Bubble flutuante** (canto inferior direito) — chat texto-only, copy só nas respostas da IA, persistência em localStorage.
- **Cards em `/configuracoes`** — abas Configuração + Chaves de API; e tela separada `/configuracoes/consumo` para uso/custo.

O super_admin pediu uma reorganização e expansão simultaneamente:

1. **Bubble**: copiar mensagens do usuário também (não só da IA). Habilitar **gravação e envio de áudio** com pause/cancel/send. **Player de áudio** no balão (1×/1.25×/1.5×/1.75×/2×). IA transcreve áudio e responde em texto.
2. **Reorganização**: tirar cards Nex de `/configuracoes` e criar **menu novo no sidebar** `/agente-nex` com submenu (Configuração, Chaves de API, Consumo, Prompt). Tela "Consumo IA" migra para dentro deste menu (preservar 100% do conteúdo atual).
3. **Nova área "Prompt"**: ver/editar system prompt; campos separados pra personalidade, tom e guardrails; toggle "habilitar entrada de áudio"; base de conhecimento (PDFs); playground de teste.

## 2. Objetivos

### Bubble

- Botão **copiar** em **toda** mensagem (user + assistant).
- Botão **microfone** ao lado do botão Enviar — visível apenas quando `nex.audio_input_enabled = true`.
- **Gravador inline** com waveform/timer + 3 ações (Cancelar, Pausar/Retomar, Enviar).
- Mensagem de áudio renderizada como **player** com play/pause + barra de progresso + dropdown de velocidade (5 níveis).
- Transcrição automática em backend; chat exibe **balão de áudio** (player) + **balão de transcrição** (texto, mesma cor do user) — IA recebe só o texto.

### Sidebar / arquitetura de páginas

- **NOVA rota** `/agente-nex` com submenu de 4 itens (estilo `/relatorios`).
- `/agente-nex/configuracao` — provider + modelo + chave + spread (conteúdo atual da aba "Configuração").
- `/agente-nex/chaves` — CRUD de chaves de API (conteúdo atual da aba "Chaves").
- `/agente-nex/consumo` — relatório de uso (conteúdo atual de `/configuracoes/consumo` **integralmente**).
- `/agente-nex/prompt` — **NOVA** área (system prompt + personalidade + tom + guardrails + KB + playground + toggles).
- `/configuracoes` perde os cards Nex e o item "Consumo IA" do sidebar.
- `/configuracoes/consumo` ganha redirect 308 → `/agente-nex/consumo` (rotas antigas em links/bookmarks continuam funcionando).
- Sidebar: novo item "Agente Nex" como **submenu colapsável** entre "Relatórios" e "Usuários".

### Prompt configurável

- System prompt **dinâmico** lido do banco em vez de constante hardcoded.
- Campos editáveis separados (compostos no prompt final):
  - **Identidade base** (read-only, multiline) — explica o que o Nex é.
  - **Personalidade** (texto livre, 0–500 chars) — ex.: "amigável e direto".
  - **Tom** (texto livre, 0–500 chars) — ex.: "informal mas profissional".
  - **Guardrails** (lista de regras, cada uma 0–300 chars, até 20 itens) — ex.: "não fale de finanças pessoais".
  - **System prompt completo** (computed, read-only no MVP) — preview do que será enviado à API.
  - Modo "**override avançado**" (toggle) que substitui o prompt computed por um livre.
- Toggle **"Entrada de áudio do usuário"** (controla a presença do botão na bubble).
- Toggle **"Base de conhecimento ativa"** (controla se KB é injetada no prompt).
- **Base de conhecimento**: upload de PDFs/TXT, extração automática de texto, lista visual com tamanho + data, ações (deletar). MVP injeta os textos diretamente no prompt (cap 30k chars total) — sem embeddings/RAG nesta release.
- **Playground** inline: caixa "Teste o prompt" + botão "Enviar" — reutiliza `runNexAgent` com **override do prompt configurado mas não salvo** (evita "salvar pra testar"). Não loga em `llm_usage` (param `isPlayground=true`).

## 3. Não-objetivos

- **Tools customizadas pelo usuário** (definir ferramentas no UI). Fica fora — as 7 tools existentes do executor continuam imutáveis.
- **Embeddings/RAG real** (vector search). MVP usa injeção direta de texto no prompt; cap 30k chars do total dos KB documents.
- **Modelos multimodais nativos** (GPT-4o áudio, Gemini áudio in). MVP usa Whisper API (OpenAI) → texto → modelo configurado. Multimodal fica como evolução.
- **Suporte a vídeo** ou imagens.
- **Voice output** (TTS — IA falando). Resposta sempre em texto.
- **Histórico de conversas server-side**. Continua localStorage por conversa.
- **Multi-tenant em prompt config**. É singleton global da plataforma (igual `LlmConfig`).
- **Importar/exportar prompt** (backup textual). Pode ser feito copy-paste manual.
- **Versionamento de prompt** (rollback). MVP grava só o estado atual.

## 4. Arquitetura

### 4.1 Visão geral

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Cliente (browser)                            │
│                                                                           │
│  ┌────────────────────┐         ┌──────────────────────────────────────┐ │
│  │   NexBubble        │         │    /agente-nex/{config,chaves,        │ │
│  │   - chat texto     │         │              consumo,prompt}          │ │
│  │   - audio recorder │         │    - cards reaproveitados             │ │
│  │   - audio player   │         │    - novo PromptConfigForm + KB       │ │
│  │   - copy buttons   │         │    - playground inline                │ │
│  └─────┬──────────────┘         └─────┬────────────────────────────────┘ │
│        │                               │                                  │
│  Form Action / fetch                   │ Server Actions                   │
└────────┼───────────────────────────────┼──────────────────────────────────┘
         │                               │
         ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────────────────┐
│ POST /api/nex/transcribe│    │ Server Actions                           │
│  multipart blob webm    │    │ - sendNexMessage(messages, isPlayground?)│
│  → Whisper API          │    │ - getNexPromptConfig                     │
│  → returns { text }     │    │ - saveNexPromptConfig(input)             │
└────────────────────────┘    │ - listKbDocuments                        │
                              │ - uploadKbDocument(formdata)              │
                              │ - deleteKbDocument(id)                    │
                              │ - testNexPrompt(input, message) (playground)
                              └──────────────────────────────────────────┘
                                     │
                                     ▼
                        ┌──────────────────────────────────────┐
                        │  Postgres (db) — schema novo:        │
                        │   nex_settings (singleton)           │
                        │   nex_kb_documents                   │
                        │  Existente:                          │
                        │   llm_configs / llm_credentials      │
                        │   llm_usage                          │
                        │   app_settings                       │
                        └──────────────────────────────────────┘
```

### 4.2 Fluxo do áudio

```
[user] presiona botão mic
   ▼
MediaRecorder.start() → coleta blocos (timeslice 250ms)
   ▼
botões: ⏸ pausar (resume) / ❌ cancelar (descarta) / ➤ enviar
   ▼
on send: Blob webm/opus → POST /api/nex/transcribe (multipart)
   ▼
servidor recebe → openai.audio.transcriptions.create({ model: "whisper-1", file })
   ▼
retorna { text, durationSeconds }
   ▼
cliente cria 2 mensagens UI:
   - { role: "user", kind: "audio", audioBlobUrl, durationSeconds, text } (player + transcrição abaixo)
   - mensagem normal envia text para sendNexMessage()
   ▼
IA responde em texto normalmente
```

## 5. Modelo de dados

### 5.1 Tabela `nex_settings` (singleton)

Há um único row global. ID literal "global".

```sql
CREATE TABLE IF NOT EXISTS "nex_settings" (
  "id"                       TEXT PRIMARY KEY DEFAULT 'global',
  "personality"              TEXT NOT NULL DEFAULT '',
  "tone"                     TEXT NOT NULL DEFAULT '',
  "guardrails"               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "advanced_override"        TEXT NULL,
  "audio_input_enabled"      BOOLEAN NOT NULL DEFAULT false,
  "kb_enabled"               BOOLEAN NOT NULL DEFAULT true,
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"            UUID NULL,
  CONSTRAINT "nex_settings_singleton"
    CHECK (id = 'global')
);
```

- `guardrails`: array JSON de strings (até 20 items, cada ≤ 300 chars).
- `advanced_override`: quando preenchido (não null, não vazio), substitui completamente o prompt composto.
- Idempotente via `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`.

### 5.2 Tabela `nex_kb_documents`

```sql
CREATE TABLE IF NOT EXISTS "nex_kb_documents" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          TEXT NOT NULL,
  "mime_type"     TEXT NOT NULL,
  "file_size"     INT NOT NULL,
  "char_count"    INT NOT NULL,
  "extracted_text" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" UUID NULL
);
CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx"
  ON "nex_kb_documents"("created_at" DESC);
```

- `extracted_text` é o texto puro extraído do arquivo (PDF via `pdfjs-dist` ou `pdf-parse`; TXT direto).
- `char_count` permite o cap total (30k) sem precisar carregar todos os textos para somar.
- Cap por documento: 100k chars (ignorados acima disso).

### 5.3 Mudanças em código

- `runNexAgent` deixa de ter `SYSTEM_PROMPT` constante. Lê via novo helper `composeSystemPrompt()` → string final.
- `nex_settings` cria automaticamente um row inicial via `ensureNexTables()` (similar a `ensureLlmTables`).

## 6. APIs / Server Actions

### 6.1 NOVA Route Handler: `POST /api/nex/transcribe`

Suporta `multipart/form-data`. Form fields:
- `audio`: Blob webm/opus (≤ 25 MB).
- (opcional) `language`: BCP-47, default `pt`.

Resposta:
```json
{ "ok": true, "text": "Quantas conversas em aberto?", "durationSeconds": 7.42 }
```

Implementação:
- `auth()` obrigatório; super_admin OU role com acesso ao Nex (toggle `nex.bubble_enabled` já regula visibilidade da bolha).
- Lê chave da config ativa (`getActiveLlmConfig()`); se não for OpenAI, retorna 400 com mensagem clara: "Transcrição de áudio requer chave da OpenAI ativa". (Whisper é só OpenAI nesta release.)
- POST para `https://api.openai.com/v1/audio/transcriptions` com `model=whisper-1`, `file=<audio>`, `response_format=json`, `language`.
- Loga em `llm_usage` com `provider="openai"`, `model="whisper-1"`, `tokens_input=0`, `tokens_output=0`, **mas** `cost_usd = round(durationSeconds / 60 × 0.006, 6)` e `cost_brl` via cotação atual.

### 6.2 Server Actions

`src/lib/actions/nex-prompt.ts` (NOVO):
- `getNexPromptConfig(): Promise<NexPromptConfig>` — retorna shape com todos os campos + `composedPrompt` (preview).
- `saveNexPromptConfig(input): Promise<ActionResult>` — valida e persiste.
- `listKbDocuments(): Promise<KbSummary[]>` — sem `extracted_text`.
- `uploadKbDocument(formData): Promise<ActionResult<{id}>>` — extrai texto, valida tamanho, persiste.
- `deleteKbDocument(id: string): Promise<ActionResult>`.
- `testNexPrompt(promptInput, message): Promise<ActionResult<{reply: string}>>` — playground; chama `runNexAgent` com prompt override e `isPlayground=true`.

Todas as actions usam `safeAction` (introduzido em v0.12.1).
Todas as mutações: `requireSuperAdmin` + `logAudit`.

### 6.3 `runNexAgent` — extensão

```ts
export interface RunNexInput {
  messages: ChatMessage[];
  accountId: number;
  userId?: string;
  platformRole?: string | null;
  /** Override do prompt — usado pelo playground. Não persiste, não loga uso. */
  promptOverride?: string;
  /** Quando true, NÃO chama logUsage (playground). */
  isPlayground?: boolean;
  clientOverride?: ProviderClient | null;
}
```

Quando `promptOverride` é fornecido, usa-o direto. Senão, chama `composeSystemPrompt()` que lê `nex_settings` + KB documents.

### 6.4 `composeSystemPrompt()`

```
[IDENTIDADE BASE — read-only, vem de constante]
Você é o Agente Nex, assistente da plataforma Nexus Insights que analisa
dados de atendimento do Chatwoot.
... (mesmas capacidades + diretrizes da v0.14)
TIMEZONE: America/Sao_Paulo (BRT).

[PERSONALIDADE] (se preenchido)
Personalidade: <conteúdo>

[TOM] (se preenchido)
Tom: <conteúdo>

[GUARDRAILS] (se houver)
Regras importantes:
- <item 1>
- <item 2>
...

[BASE DE CONHECIMENTO] (se kb_enabled e houver docs)
Conhecimento adicional fornecido pelo administrador:
=== <nome 1> ===
<extracted_text 1>

=== <nome 2> ===
<extracted_text 2>
... (cap 30k chars total — trunca conteúdos extras)
```

Quando `advanced_override` está preenchido, ele substitui **tudo acima**.

## 7. UI/UX

> Todas as decisões de layout passam pela skill **ui-ux-pro-max** durante a implementação. Padrão visual segue o resto da plataforma (rounded-2xl, border-border, bg-muted/30, violet-500 highlights).

### 7.1 NexBubble — novo layout do input

```
┌────────────────────────────────────────────────────┐
│  [textarea: pergunte algo]                       ✓ │
│                                                    │
│  Enter envia · Shift+Enter quebra linha            │
│                                            🎤  ➤   │
└────────────────────────────────────────────────────┘
```

- Botão **🎤 mic** aparece à esquerda do **➤ enviar** quando `audio_input_enabled = true` na config global.
- Click no mic → estado "gravando":

```
┌────────────────────────────────────────────────────┐
│  ● Gravando 0:08 ▁▂▄▆▇▆▄▂▁▂▄▆▇       ⏸  ❌  ➤    │
└────────────────────────────────────────────────────┘
```

  - Pulse visual (vermelho) no ●.
  - Timer ao lado (mm:ss).
  - Waveform animada simples (5–7 barras) — usa `AnalyserNode` Web Audio com decay/decimação.
  - Botões: ⏸ pausar/▶ retomar; ❌ cancelar (descarta); ➤ enviar.

### 7.2 NexMessage — copy + audio

- **Copy button** (já existente) agora aparece em **TODA** mensagem (user + assistant). No user, posição mantida (top-right -2/-2).
- Mensagem do tipo "audio":
  - Balão **superior** (cor user, à direita) com player:
    ```
    ┌────────────────────────────────────────┐
    │  ▶ ━━━━━○────── 0:00 / 0:08    1×  ⌄  │
    └────────────────────────────────────────┘
    ```
  - Botão `⌄` abre dropdown 1× / 1.25× / 1.5× / 1.75× / 2× → ajusta `audio.playbackRate`.
  - Balão **inferior** abaixo do player (mesma alinhamento direita) com a transcrição em texto, fonte muted (it é "o que a IA leu"), prefixado por ícone 📝 minúsculo.
- Áudio do **assistant** (futuro TTS) — fora do escopo.

### 7.3 Sidebar — novo item

- Item "Agente Nex" como submenu colapsável (igual /relatorios), entre "Relatórios" e "Usuários".
- Ícone: `Sparkles` (já usado no LlmConfigCard).
- Submenu (super_admin only):
  - **Configuração** (`/agente-nex/configuracao`) — ícone `Settings` (ou `SlidersHorizontal`).
  - **Chaves de API** (`/agente-nex/chaves`) — ícone `KeyRound`.
  - **Prompt** (`/agente-nex/prompt`) — ícone `MessageSquareCode` (ou `BookOpen`).
  - **Consumo** (`/agente-nex/consumo`) — ícone `Sparkles` (ou `TrendingUp`).
- "Consumo IA" sai de `section: "admin"` no NAV_ITEMS atual.
- "Configurações" perde os cards Nex (LlmConfigCard); fica com Plataforma, EnabledReports, MatrixIA, Visibility, Polling, Jobs.

### 7.4 `/agente-nex` (root)

Server-side redirect 308 → `/agente-nex/configuracao` (default).

### 7.5 `/agente-nex/configuracao`

PageShell + PageHeader (ícone Sparkles + "Configuração do Agente Nex"). Reaproveita o componente `LlmConfigCard` **só com a aba Configuração visível** (sem as abas internas Configuração/Chaves — porque agora cada aba virou rota). Implementação: novo componente `LlmConfigForm` extraído do `LlmConfigCard.tsx` (já tem o body separado).

### 7.6 `/agente-nex/chaves`

PageShell + PageHeader. Reaproveita `LlmCredentialsManager` (já existe — extraído em v0.13).

### 7.7 `/agente-nex/consumo`

PageShell + PageHeader idêntico ao atual `/configuracoes/consumo/page.tsx`. Conteúdo (`ConsumoContent`) reutilizado integralmente.

### 7.8 `/agente-nex/prompt` — NOVO (a tela mais densa)

```
┌────────────────────────────────────────────────────────────────┐
│ ✨ Prompt do Agente Nex                                        │
│ Configure personalidade, tom e regras do agente.               │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ ⚙ Comportamento                                         │   │
│ │                                                         │   │
│ │ Personalidade  [textarea, 0/500 chars]                  │   │
│ │ Tom            [textarea, 0/500 chars]                  │   │
│ │                                                         │   │
│ │ Guardrails (regras a respeitar)                         │   │
│ │   - [input chip]                                  [🗑]  │   │
│ │   - [input chip]                                  [🗑]  │   │
│ │   [+ Adicionar regra]                                   │   │
│ │                                                         │   │
│ │ ▢ Modo override avançado                                │   │
│ │ [textarea full prompt — só visível se toggle ON]        │   │
│ │                                                         │   │
│ │                  [Pré-visualizar prompt completo]  [💾] │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ 🔧 Recursos                                             │   │
│ │                                                         │   │
│ │ 🎤 Entrada de áudio do usuário          [⏻ ON/OFF]      │   │
│ │ 📚 Base de conhecimento ativa           [⏻ ON/OFF]      │   │
│ │                                                         │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ 📚 Base de conhecimento (1.234 / 30.000 chars)          │   │
│ │                                                         │   │
│ │  📄  manual-atendimento.pdf · 12 KB · 4.521 chars  🗑  │   │
│ │  📄  vendas-faq.txt · 3 KB · 1.205 chars            🗑  │   │
│ │                                                         │   │
│ │  [+ Adicionar documento (PDF, TXT)]                     │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ 🧪 Playground                                           │   │
│ │ Teste o prompt sem salvar.                              │   │
│ │                                                         │   │
│ │  [textarea: digite uma pergunta de teste]               │   │
│ │                                            [▶ Enviar]   │   │
│ │                                                         │   │
│ │ Resposta:                                               │   │
│ │  <bubble com resposta da IA>                            │   │
│ └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Detalhes de comportamento:**
- Botão **💾** (Salvar) salva tudo: personalidade, tom, guardrails, override avançado, toggles. Loga audit `setting_updated` com targetType `nex_prompt`.
- Botão **Pré-visualizar prompt completo** abre Dialog modal mostrando o prompt composto (resultado de `composeSystemPrompt()`).
- Toggle **🎤** controla `nex_settings.audio_input_enabled`. Salva imediatamente (debounce 500ms) — sem precisar do botão Save.
- Toggle **📚** idem.
- Upload de KB: dialog com Input file (accept `.pdf,.txt`), preview de tamanho, validação client-side de 5 MB max. Server: extração via `pdf-parse` (PDF) ou direto (TXT). Conta `char_count` real após extração.
- Total de chars na lista: soma `char_count` dos docs. Se passar 30k, a UI mostra warning ("trecho final será truncado").
- Playground: textarea + botão. Submete `testNexPrompt({personality, tone, guardrails, advancedOverride}, message)` → resposta retorna em balão semelhante ao da bubble. Não persiste.

### 7.9 `/configuracoes` (limpeza)

Remove:
- `<LlmConfigCard ... />` (e import).
- Referências a `getPublicActiveLlmConfig`, `listCredentials`, `getUsdBrlRate`, `isNexBubbleEnabled` (estes 4 não são mais necessários nessa página).

`isNexBubbleEnabled` continua existindo (usado pelo `nex-bubble.tsx`); só não é fetched aqui.

### 7.10 Sidebar — toggle de bolha

Onde fica o toggle "Agente Nex ativo (bolha)"? Estava dentro do `LlmConfigCard`. Decisão: vai para `/agente-nex/configuracao` (segue o card atual quase inteiro).

## 8. Áudio em detalhe

### 8.1 Cliente — gravação

- API: `MediaRecorder` (Chrome/Firefox/Safari modernos suportam).
- MIME preferido: `audio/webm;codecs=opus`. Fallback: `audio/mp4` (Safari iOS), `audio/ogg`.
- Tamanho típico de 30s: ~120 KB.
- Permissão de microfone via `navigator.mediaDevices.getUserMedia({ audio: true })`. Erro `NotAllowedError` → toast amigável.
- Cap duração: 5 min. Acima disso, auto-envia ou solicita encerrar.

### 8.2 Cliente — player

- HTML `<audio>` com `controls={false}`; controles custom.
- Speed: `audio.playbackRate = X`. Persiste a velocidade selecionada na sessão (memória client).
- Progresso: `audio.currentTime / audio.duration`. Atualiza via `requestAnimationFrame` ou `timeupdate` event.
- Click na barra → seek (`audio.currentTime = posição`).

### 8.3 Servidor — transcrição

Endpoint Route Handler (NÃO Server Action porque uploads multipart de Blob são instáveis em SA):

```ts
// src/app/api/nex/transcribe/route.ts
export const runtime = "nodejs"; // Whisper precisa de fetch padrão; edge tem limites
export const maxDuration = 60; // segundos

export async function POST(req: Request): Promise<Response> {
  // auth → role check
  // FormData parse → blob audio
  // assert provider OpenAI + key disponível
  // POST /v1/audio/transcriptions
  // logUsage
  // return JSON
}
```

- Limita size em 25 MB (limite Whisper).
- Timeout total: 30s.
- Erros: 400 (provider não OpenAI / sem chave / size), 500 (falha Whisper), 401 (não autenticado).

### 8.4 Custo registrado

Whisper: `$0.006 / minuto` (cutoff May/2026).
- `cost_usd = round((durationSeconds / 60) × 0.006, 6)`.
- `cost_brl` via `getUsdBrlRate()` × cost_usd.
- Aparece no relatório de Consumo como modelo `whisper-1`.
- `MODEL_PRICING["whisper-1"]` (NOVA entrada): tratada de forma especial — não baseada em tokens. `inputPerMillion=0`, `outputPerMillion=0`, mas adicionamos campo opcional `perMinuteUsd: 0.006` que `calculateCost` privilegia se `durationMs` estiver presente.

### 8.5 Fluxo na UI

```
1. user clica 🎤
2. browser pede permissão (ou usa cache) → user accepta
3. mostra UI "gravando" + timer
4. user pausa/retoma livremente
5. user clica ➤ enviar
6. cliente: Blob → POST /api/nex/transcribe
7. recebe { text } → adiciona 1 mensagem UI tipo "user-audio" (com player) + envia text para sendNexMessage
8. IA responde normalmente
```

## 9. Migração de dados

### 9.1 `nex_settings`

`ensureNexTables()` (similar a `ensureLlmTables`):
- `CREATE TABLE IF NOT EXISTS nex_settings (...)`.
- `INSERT INTO nex_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;` — garante row.
- `CREATE TABLE IF NOT EXISTS nex_kb_documents (...)`.

Roda no primeiro request relevante (mesmo padrão do `ensureLlmTables`).

### 9.2 Dados antigos

- `app_settings.nex.bubble_enabled` (existe desde v0.10.x): mantém. Não migra para `nex_settings`. É independente.
- Não há "system prompt" atual no banco — está em código. Defaults vazios na primeira execução; super_admin preenche depois.

## 10. Compatibilidade & rollout

- `/configuracoes/consumo` mantém-se com **redirect 308** para `/agente-nex/consumo`. Bookmarks funcionam.
- Sidebar antigo do super_admin tinha "Consumo IA" item raiz — ele some (substituído pelo submenu).
- Bubble: até `audio_input_enabled` ser ligado, comportamento idêntico ao atual.
- Rollback v0.14.1 → v0.15.0: queda do submenu /agente-nex (404), mas o item da bubble + o card de configuracoes voltam (porque o código antigo ainda referenciaria os removidos; rollback exige revert do commit). Mitigação: tag git pré-deploy.
- Deploy zero-downtime: pod novo aplica `ensureNexTables()` na primeira request. Pod antigo lê apenas as tabelas que conhece (não toca em `nex_*`).

## 11. Testes

### 11.1 Unidade

- `src/lib/nex/__tests__/prompt.test.ts` (NOVO):
  - `composeSystemPrompt()` com personality + tone + guardrails compõe corretamente.
  - `composeSystemPrompt()` com `advanced_override` substitui tudo.
  - KB injection respeita cap 30k chars (trunca, marca com `[...]`).
  - KB desabilitada não injeta.
- `src/lib/nex/__tests__/transcribe.test.ts` (NOVO):
  - mock fetch da OpenAI → `text` retornado.
  - Provider != OpenAI → erro tipado.
  - Audio > 25MB → erro tipado.
- `src/lib/llm/__tests__/pricing.test.ts` (AJUSTE):
  - `whisper-1` por minuto retorna o custo certo (0.006 × min).
- `src/lib/llm/__tests__/ensure-tables.test.ts` (AJUSTE/NOVO):
  - cria `nex_settings` + `nex_kb_documents`.

### 11.2 Componente (RTL)

- `src/components/nex/__tests__/audio-recorder.test.tsx`:
  - mock `MediaRecorder` → click mic → start/stop/cancel chamados.
  - timer atualiza.
- `src/components/nex/__tests__/audio-player.test.tsx`:
  - speed dropdown muda `playbackRate`.
  - play/pause toggla.
- `src/components/nex/__tests__/nex-message.test.tsx` (AJUSTE):
  - copy button aparece em mensagem user E assistant.
- `src/components/agente-nex/__tests__/prompt-config-form.test.tsx` (NOVO):
  - guardrails: adicionar/remover.
  - override toggle ON revela textarea.
  - Salvar dispara saveNexPromptConfig com payload correto.
- `src/components/agente-nex/__tests__/kb-list.test.tsx` (NOVO):
  - upload dispara FormData server action.
  - cap 30k mostra warning quando ultrapassa.
- `src/components/agente-nex/__tests__/playground.test.tsx` (NOVO):
  - submit dispara testNexPrompt e mostra resposta.

### 11.3 Server Actions

- `src/lib/actions/__tests__/nex-prompt.test.ts` (NOVO):
  - guarda super_admin.
  - validações (size limits).
  - audit log emitido.

### 11.4 Route Handler

- `src/app/api/nex/transcribe/__tests__/route.test.ts` (NOVO) — usando `next-test-api-route-handler` ou similar. Se infra de teste de Route Handler não existir no projeto, mock direto da função handler.

### 11.5 E2E manual (smoke)

Lista de smoke checks pós-deploy:
- Bubble abre, manda texto, recebe resposta. ✓
- Bubble: ativa toggle áudio em /agente-nex/prompt. Volta na bubble: botão 🎤 aparece.
- Click 🎤, permite mic, fala 5s, pausa, retoma 3s, envia. Player aparece + transcrição + IA responde.
- /agente-nex/configuracao: troca modelo, salva, status atualiza.
- /agente-nex/chaves: cria nova chave, deleta.
- /agente-nex/prompt: edita personalidade, salva. Bubble nova mensagem reflete o tom.
- /agente-nex/prompt: upload de PDF 1 MB, lista atualiza com chars contados.
- /agente-nex/prompt: playground "Olá" → resposta da IA.
- /agente-nex/consumo: tela carrega com dados, KPIs em BRL, tabela.
- Acessar `/configuracoes/consumo` → redireciona para `/agente-nex/consumo`.
- Sidebar mostra Agente Nex como submenu colapsável.

## 12. Segurança

- KB upload: validar mime (`application/pdf`, `text/plain`), max 5 MB; após extração, sanitize (não renderizar HTML).
- Whisper: chave API nunca exposta ao client. Fica em `getActiveLlmConfig()` server-side.
- Auth em `/api/nex/transcribe`: igual qualquer Server Action protegida.
- Audio Blob no client: URL temporário (`URL.createObjectURL`); revogado ao fechar a aba ou unmount.
- Logs de uso (Whisper) em `llm_usage` mantém anonimato (não loga conteúdo da fala).
- Playground: roda com prompt **não persistido**, mas usa chave/modelo configurado. Não loga em `llm_usage` para não inflar custos exploratórios.

## 13. Riscos

| Risco | Mitigação |
|-------|-----------|
| `pdf-parse` quebra em PDFs com formatação complexa | Captura erro, mensagem clara para usuário; sugere converter PDF para TXT. |
| MediaRecorder não disponível (Safari iOS antigo) | Detecta no client; esconde botão 🎤 se não houver suporte; toast explicando. |
| Whisper lentidão (>30s p/ áudios longos) | Timeout 30s no Route Handler; mensagem clara em caso de timeout. |
| Cap 30k chars do prompt explode (modelo rejeita por context length) | Cap server-side; mensagem alerta no UI mostrando barra; trunca extras. |
| `app_settings.nex.bubble_enabled` ainda existe mas agora há `audio_input_enabled` em outro lugar | OK — dois toggles independentes (um liga a bolha, outro liga áudio). Documentar ambos no UI. |
| Outro agente Claude paralelo mexendo em `sidebar.tsx` ou `nav.ts` | Protocolo `AGENTS.md` cobre — `docs/agents/active/` checado antes de tocar. |
| `/configuracoes/consumo` redirecionando quebra integrações antigas | Redirect 308 (preserva method) — caso raro mas mitigado. |
| Build em paralelo com outro agente | `gh run list --limit 5` antes de push. |

## 14. Critérios de aceite

1. **Bubble**:
   - Copy button aparece em mensagens do usuário e do assistant.
   - Quando `audio_input_enabled = false`: botão mic não aparece.
   - Quando `true`: mic aparece; fluxo gravação completo (start/pause/cancel/send) funciona em Chrome desktop e mobile.
   - Áudio enviado é transcrito; chat mostra player + transcrição + resposta IA.
   - Player tem speed dropdown (5 níveis); seek funciona.
2. **Sidebar**:
   - Submenu "Agente Nex" entre Relatórios e Usuários, super_admin only.
   - 4 sub-itens: Configuração, Chaves de API, Prompt, Consumo.
   - Item antigo "Consumo IA" no sidebar removido.
3. **`/configuracoes`**:
   - Sem cards Nex; só Plataforma, EnabledReports, MatrixIA, Visibility, Polling, Jobs.
4. **`/agente-nex/configuracao`**:
   - Conteúdo equivalente à aba Configuração atual (provedor, modelo, chave, spread).
5. **`/agente-nex/chaves`**:
   - Conteúdo equivalente à aba Chaves de API atual (CRUD, ponto verde, dialog).
6. **`/agente-nex/consumo`**:
   - Conteúdo idêntico ao atual `/configuracoes/consumo`. Acessar a URL antiga redireciona para a nova.
7. **`/agente-nex/prompt`**:
   - Form com personalidade/tom/guardrails (CRUD inline) + override avançado.
   - Toggles áudio + KB com debounce save.
   - KB list + upload + delete; barra de progresso de chars; alerta acima de 30k.
   - Playground envia mensagem teste e mostra resposta sem persistir.
8. **System prompt dinâmico**:
   - `runNexAgent` lê `nex_settings` em vez de constante.
   - Bubble responde refletindo personalidade configurada.
9. **Whisper**:
   - Endpoint `/api/nex/transcribe` retorna `{text}`.
   - `llm_usage` ganha row `whisper-1` com custo correto.
   - `/agente-nex/consumo` mostra `whisper-1` na tabela.
10. **Build**: typecheck 0, tests verde, build verde, `/api/health version=v0.15.0`.
11. **Acessibilidade**: aria-labels nos novos botões, foco visível, prefers-reduced-motion respeitado.

---

## Apêndice A — Decisões justificadas

**Por que rota `/agente-nex` e não `/configuracoes/agente-nex`?**
Item de sidebar nominal pede URL curta. Submenu igual `/relatorios`. Funcionamento independente.

**Por que Whisper e não modelos multimodais?**
- Whisper: $0.006/min, baixíssima latência, qualidade excelente em PT-BR, único por provider (OpenAI).
- Multimodal (GPT-4o áudio): mais caro, complexidade extra de prompts; não justifica MVP.
- Decisão futura: quando mudar para modelo multimodal, fica simples — substituir transcribe por chamada multimodal direta.

**Por que separar personalidade + tom + guardrails em vez de só "system prompt"?**
- Edição em campos isolados é mais legível para super_admin.
- Permite que UI mostre warnings específicos (ex.: "guardrail muito longo").
- Override avançado fica como escape hatch para quem quer controle total.

**Por que KB sem RAG?**
- 30k chars é suficiente pra cobrir 5–10 PDFs de manuais curtos.
- RAG real exige `pgvector` + embeddings + custo OpenAI embeddings — overkill para MVP.
- Migração futura: se KB exceder 30k habitualmente, faz RAG.

**Por que Route Handler para transcribe e Server Action pro resto?**
- Multipart blob via Server Action é frágil no Next.js 16 (limites de payload, perda de tipo `Blob`).
- Route Handler é o padrão para uploads.
- Resto continua Server Action porque é JSON simples.

**Por que singleton `nex_settings` e não múltiplas configurações?**
- Plataforma single-tenant no momento (igual `LlmConfig`). Singleton é o que combina.
- Se virar multi-tenant: ID muda de `'global'` para `account_id` ou similar.

**Por que toggle áudio NÃO global (todos veem) e sim só pro super_admin habilitar/desabilitar?**
- Decisão simples: super_admin liga/desliga; quando ON, qualquer usuário com acesso ao Nex (visibility da bolha) pode usar áudio.
- Se quiser granular por role no futuro, é adendo.

**Por que `advanced_override` em vez de substituir os campos?**
- Permite voltar facilmente da edição livre para a edição estruturada (basta tirar o toggle).
- Caso de uso: super_admin testa um prompt experimental sem perder a config bonita.

**Por que NÃO logar uso no playground?**
- Inflaria a métrica de Consumo com testes exploratórios.
- Custo aparece somente em uso real do agente.

---

## Apêndice B — Self-review (v1 → v3)

### Pente fino #1 (resultou em v2)

Issues identificadas e corrigidas inline:

1. **v1** propunha tudo em uma rota só `/agente-nex` com tabs. Trocado por subrotas para deep link e SEO simples.
2. **v1** não tinha redirect de `/configuracoes/consumo`. Adicionado.
3. **v1** sugeria armazenar áudio Blob no banco. Trocado: client-side blob URL temporário (transcrição é o que importa).
4. **v1** propunha campo único `system_prompt` no banco. Substituído por composição (personalidade/tom/guardrails) + override.
5. **v1** dizia "use Server Action pra transcrever". Trocado para Route Handler (limites de Blob em SA).
6. **v1** não tratava o caso `provider != openai`. Adicionado erro tipado.
7. **v1** misturava o card LlmConfigCard inteiro em /agente-nex/configuracao. Refinado: extrair subcomponentes `LlmConfigForm` e `LlmCredentialsManager` (este último já existe).
8. **v1** dizia "playground loga em llm_usage". Trocado: não loga (evita inflar custo).
9. **v1** não cobria custo do Whisper no relatório de Consumo. Adicionado.

### Pente fino #2 (resultou em v3 final)

Análise mais profunda — issues menores e refinamentos:

1. **§4.2** fluxo de áudio não dizia o que acontece com o blob após transcrição. Esclarecido: vira `URL.createObjectURL` no client; revogado no unmount.
2. **§5.1** `nex_settings` precisa ter `id` text com check constraint pra forçar singleton. Adicionado.
3. **§6.1** route handler não dizia o `runtime` (`edge` falha com Whisper API multipart). Definido `nodejs`.
4. **§6.4** `composeSystemPrompt()` não documentava o que acontece se `kb_enabled=true` mas KB vazia. Esclarecido: nada injetado, sem texto residual.
5. **§7.1** waveform animada não tinha fallback pra `prefers-reduced-motion`. Adicionado: barras estáticas neste caso.
6. **§7.8** o toggle de áudio estava sendo salvo via debounce, mas e se o usuário fechar a página entre debounce e salvar? Mitigação: salvar imediato em `onChange` (não debounce) — a aba só tem 1 toggle, não há latência percebida. Corrigido na §7.8.
7. **§8.1** não dizia o cap de 5 minutos. Adicionado.
8. **§8.4** preço Whisper estava como `$0.006` mas precisa indicar a unidade. Corrigido para `$0.006/minuto`.
9. **§11** não tinha smoke check do redirect /configuracoes/consumo. Adicionado.
10. **§13** não listava risco de `MediaRecorder` indisponível. Adicionado linha.
11. **§14** critério #4 dizia "equivalente" — vago. Substituído por lista mais explícita.
12. **§7.2** botão copy no user message poderia poluir layout. Decisão: aparece apenas no hover, igual ao do assistant. Esclarecido em §7.2.
13. **§5.1** check constraint `id = 'global'` é bom, mas precisa de pleno suporte em Postgres recente. Postgres 16 do projeto suporta.
14. **§6.3** `RunNexInput` precisa de validação de tamanho do `promptOverride` (evitar 1MB de prompt). Adicionado cap de 50k chars.
15. **Glossário/Termos**: "KB" abreviado várias vezes. Documentado: "Base de conhecimento (KB) = lista de documentos texto que entra no system prompt".
16. **§7.3** não definia quem vê o submenu se `super_admin = false`. Esclarecido: `superAdminOnly: true`.
17. **§7.7** tela de Consumo passa por skill ui-ux-pro-max só pra ajustar o título de PageHeader e o subtítulo (já é bem). Detalhe pequeno mas marcado.
18. **§9.1** `ensureNexTables()` precisa ser chamada por algo. Decisão: chamada por `getNexPromptConfig` (lazy) e por `composeSystemPrompt`. Documentado.
19. **§14** critério #1 cobre desktop+mobile mas não Safari especificamente. Mantido genérico ("Chrome desktop e mobile") — mais restrito mas confiável.

### v3 — final

Documento consolidado, sem placeholders, internamente consistente, escopo focado para uma única release v0.15.0. Pronto para fase de plan.
