# Runbook — Agente Nex: Áudio + KB URL (v0.20.0)

## Áudio (transcrição)

A bolha do Agente Nex aceita áudio do usuário e transcreve via OpenAI antes
de mandar pro modelo principal.

### Modelos suportados

| Modelo | Cobrança | Tokens disponíveis | Default |
|--------|----------|-------------------|---------|
| `gpt-4o-mini-transcribe` | $3/M input audio + $5/M output tokens (~$0.003/min) | Sim (`usage.input_token_details.audio_tokens`) | **Sim** (v0.20+) |
| `whisper-1` | $0.006/min (~$0.36/h) | Não | Fallback |

### Fluxo

1. Frontend captura áudio na bolha (MediaRecorder).
2. POST `/api/nex/transcribe` com FormData (`audio`, `language`).
3. Tenta `gpt-4o-mini-transcribe` primeiro (`response_format=json`).
4. Se 4xx/5xx ou exception: fallback silencioso para `whisper-1` (`verbose_json`).
5. Loga em `llm_usage` com `model=r.modelUsed`, tokens reais (gpt-4o-mini-transcribe) ou zeros (whisper-1).

### Bug conhecido

`gpt-4o-mini-transcribe` pode retornar `output_tokens=0` na response (bug
documentado em https://learn.microsoft.com/en-us/answers/questions/5552343/...).
Usamos `input_token_details.audio_tokens` como fonte primária; `output_tokens`
ficam 0 sem prejuízo de custo (output em transcribe é texto, $5/M apenas).

## KB URL (Base de Conhecimento via URL)

Permite super_admin adicionar URL pública (HTTPS) como KB document. Conteúdo
é raspado, extraído como texto e injetado no system prompt do Agente Nex.

### Fluxo

1. UI `/agente-nex/prompt` → KbUploadDialog → aba URL → user cola URL + nome.
2. `addKbUrlAction({ name, url })` (Server Action, super_admin only):
   - **`assertPublicUrl(url)`** (`src/lib/nex/kb-url.ts`):
     - HTTPS-only.
     - DNS resolve → bloqueia ranges privados (RFC1918), loopback, link-local, cloud metadata (e.g., 169.254.169.254).
   - **`fetchKbUrl(url)`**:
     - AbortController timeout 10s.
     - Body cap 5MB.
     - Headers: `User-Agent: NexusInsights-KB/1.0`, `Accept: text/html, text/plain, application/json, application/xml`.
     - Aceita só status 2xx.
   - **HTML→texto** via `node-html-parser`:
     - Extrai `<main>`/`<article>` ou fallback `<body>` minus `<script>/<style>/<nav>/<footer>/<aside>/<form>`.
     - Trunca em `MAX_DOC_CHARS = 100_000`.
   - INSERT em `nex_kb_documents` com `kind="URL"`, `sourceUrl=url`.
   - `logAudit({ action: "setting_updated", target_type: "NexKbDocument", ... })`.
3. `composeSystemPrompt` injeta KB no prompt (cap total 30k chars).

### Limitação atual: SPAs

Páginas single-page application (e.g., `developers.chatwoot.com`) extraem
apenas o DOM inicial — links/conteúdo nested não são seguidos. Para
documentação profunda de API:
- Faça download manual do PDF/TXT da documentação.
- Ou aguarde v0.21+ com sitemap crawl.

### Erros UX (toast)

| Causa | Mensagem |
|-------|----------|
| URL não-HTTPS ou parse inválido | "URL inválida — use HTTPS." |
| SSRF (hostname privado/local) | "URL aponta para endereço privado/local — não permitida." |
| Timeout 10s | "A página demorou demais para responder. Tente outra fonte ou tente mais tarde." |
| 401/403 | "Página exige autenticação. Use uma URL pública ou faça download e suba como TXT." |
| 4xx outros | "Página inacessível ({status}). Confirme se a URL está correta e pública." |
| 5xx | "O servidor da página retornou erro ({status}). Tente novamente mais tarde." |
| Mime não permitido | "Conteúdo não é HTML/TXT. Tente outra fonte." |
| Body > 5MB | "Página muito grande (>5MB). Use uma versão simplificada ou link específico." |
| HTML sem texto extraível | "Não foi possível extrair texto da página. Verifique se aponta para um artigo/documento." |

## Refresh manual

Botão "Atualizar conteúdo" no card do KB document URL → `refreshKbUrlAction(docId)`:
- Re-fetch via mesmo pipeline.
- Em sucesso: atualiza `extractedText` + `charCount`.
- Em falha: **mantém conteúdo antigo** (UPDATE só roda em sucesso).

## Audit

Toda mutação de KB doc + ChatwootAccountUrl + prompt config gera entrada em
`audit_logs` com `action='setting_updated'`, `target_type` específico,
`details={ previous, next }`.
