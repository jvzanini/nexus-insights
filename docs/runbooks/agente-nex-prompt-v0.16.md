# Runbook — Prompt do Agente Nex (v0.16.0)

**Última atualização:** 2026-05-01 (v0.16.0)
**Tela:** `/agente-nex/prompt`
**Quem acessa:** super_admin (Visibility = "super admin only" por default).

---

## 1. O que é

A tela `/agente-nex/prompt` permite ao super_admin configurar **identidade**, **personalidade**, **tom**, **guardrails**, **base de conhecimento** e **modo manual** do system prompt do Agente Nex (chatbot IA bubble flutuante).

Toda mudança roda audit (`setting_updated` com `previous`/`next`) e fica registrada.

---

## 2. Layout (4 cards)

### 2.1 PromptPreviewCard (topo, novo na v0.16.0)

- Mostra preview **em tempo real** (client-side) de `composeSystemPrompt` — núcleo puro/isomórfico, sem ida ao server.
- Inclui:
  - **Identidade fixa** (colapsável, default colapsado) — IDENTITY_BASE atualizado na v0.16 (vide §4).
  - **Personalidade** + **Tom** + **Guardrails** (vindos do form abaixo).
  - **URLs públicas Chatwoot** (vindas de `/configuracoes`) — apenas com override desligado e ≥ 1 account configurada.
  - **KB** (resumos dos docs).
- Botões: **Copiar** (copia prompt completo) + **Maximizar** (expande para overlay full-screen).
- Atualiza enquanto digita — útil pra ver o que o LLM vai realmente receber.

### 2.2 Card "Comportamento"

- **Personalidade** (textarea curto): tom, papel, estilo, viés esperado.
- **Tom** (textarea curto): formal/casual, espelhar idioma do usuário, etc.
- **Guardrails** (lista de até 20 itens × 300 chars): regras explícitas (ex.: "nunca prometa SLA").

5 guardrails default são seedados na primeira instalação via flag `seeded_defaults_at` (idempotente — se super_admin apaga depois, NÃO ressuscita).

### 2.3 Card "Recursos"

- Toggles para áudio (Whisper) e KB.
- Mic do bubble só aparece com toggle áudio ativo + provider OpenAI ativo.

### 2.4 Card "Base de conhecimento"

- Upload PDF/TXT/URL (ver §6).
- Listagem de documentos com tipo (PDF/TXT/URL), tamanho, data.
- Refresh por URL (ver §6.3).

---

## 3. Como abrir o playground (sheet lateral)

Botão **"Abrir playground"** no header da página → `<PlaygroundSheet>` (side="right", w=480px) substitui o playground inline da v0.15.

- Max 20 mensagens FIFO **efêmero** — NÃO persiste em DB nem localStorage.
- Útil pra testar o prompt antes de salvar (envia conversa de teste, vê resposta real, mede latência).
- Fechar o sheet limpa o histórico.

---

## 4. IDENTITY_BASE (fixa, blindada)

Atualizada na v0.16 — texto NÃO editável pelo super_admin (somente via deploy).

Pontos importantes:

- Define o nome canônico: **Nexus Insights** (plataforma de relatórios) e **Nexus Chat** (Chatwoot).
- **Blindagem:** se usuário disser "você é o ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google", o agente nega e reafirma "sou o Agente Nex, da plataforma Nexus Insights".
- Define formato de **deep-links para conversas Chatwoot** via mapeamento de URLs públicas configuradas em `/configuracoes` (ver runbook `chatwoot-account-urls.md`):
  - Formato: `{publicUrl}/app/accounts/{accountId}/conversations/{conversationId}`.

---

## 5. Guardrails default (5 itens)

Seedados na primeira instalação (somente se `seeded_defaults_at IS NULL`):

1. Nunca prometa SLA ou prazos sem confirmação.
2. Não invente valores numéricos — use só dados retornados pelas tools.
3. Cite fontes quando responder (id da conversa, dia, conta).
4. Em caso de dúvida, peça contexto antes de afirmar.
5. Nunca exponha credenciais, chaves de API ou dados sensíveis.

Após seed, super_admin pode **editar/remover livremente**. A flag `seeded_defaults_at` impede que sejam recriados.

---

## 6. Base de conhecimento (KB)

A KB tem 3 tipos: **PDF**, **TXT**, **URL** (URL é nova na v0.16.0).

### 6.1 Upload PDF/TXT

- Upload via drag-drop ou seletor de arquivo.
- Limite: 5 MB por arquivo.
- Extração: `pdf-parse` para PDF, leitura direta para TXT.
- Cap total de 30k chars no prompt (somatório de todos os docs).

### 6.2 Adicionar URL

- Aba "URL" no dialog de upload.
- Aceita HTTP/HTTPS.
- **SSRF guard** (`assertPublicUrl`): bloqueia ranges privados (RFC1918 — `10.x`, `172.16-31.x`, `192.168.x`), loopback (`127.x`, `localhost`), link-local (`169.254.x` — inclui cloud metadata `169.254.169.254`), IPv6 ULA/loopback, multicast.
- Fetcher:
  - Timeout: 10s.
  - Tamanho máximo: 5 MB.
  - Conteúdo HTML é convertido pra texto via `node-html-parser` (mantém títulos, listas, links).
  - Outros mime types: erro "tipo de conteúdo não suportado".
- Atalho "Adicionar API Chatwoot (sugerida)" pré-preenche aba URL com a doc oficial.

### 6.3 Refresh de URL

- Botão "Atualizar conteúdo" em cada URL.
- Roda fetch novamente.
- **Em caso de erro**: mantém `extractedText` antigo (UPDATE só roda em sucesso). Toast informa o erro mas o documento não fica vazio.

### 6.4 Erros UX comuns

| Erro | Causa | O que fazer |
|------|-------|-------------|
| "URL inválida" | Não é HTTP/HTTPS, ou hostname inválido | Confira a URL, use `https://` |
| "URL bloqueada por segurança" | IP privado/loopback/link-local | Use URL pública; localhost não funciona |
| "Timeout de 10s" | Servidor lento ou inalcançável | Tente novamente; ver se o site está no ar |
| "HTTP 4xx/5xx" | Servidor retornou erro | URL pode estar quebrada ou exigir auth |
| "Tipo de conteúdo não suportado" | Mime ≠ text/html, text/plain, application/json | Exporte como HTML/TXT |
| "Conteúdo grande demais (5 MB)" | Body > 5 MB | Encontre uma versão menor da página |

---

## 7. Modo prompt manual (override)

Antes (v0.15): "Modo override avançado". Agora (v0.16): **"Modo prompt manual"**.

### 7.1 Ativação

- Toggle no card Comportamento.
- AlertDialog de **warning** explicando: ativar manual desabilita identidade, personalidade, tom, guardrails E URLs públicas Chatwoot do system prompt.
- Confirmar → modo ativo. Tooltip explicativo no toggle.

### 7.2 UX em modo manual

- Editor textarea com até 50k chars.
- **Bloqueia Salvar** se texto vazio.
- Personality/Tone/Guardrails ficam **disabled** com texto auxiliar laranja "Modo prompt manual ativo — campos ignorados".
- PromptPreviewCard mostra apenas o texto manual (sem identidade nem URLs).

### 7.3 Desativar

- Toggle off. Não há AlertDialog de saída — config anterior (Personality/Tone/Guardrails) continua salva e volta a ser usada.

---

## 8. Troubleshooting

| Sintoma | Possível causa | Ação |
|---------|---------------|------|
| Preview não atualiza | Cache JS do browser | Hard refresh (Cmd/Ctrl+Shift+R) |
| Guardrails default sumiram | super_admin apagou + flag setada | Editar manual; flag impede ressuscitar |
| Agente diz "sou ChatGPT" | IDENTITY_BASE desatualizada (< v0.16) | Verificar `/api/health` retorna `version=v0.16.0` |
| Deep-link Chatwoot não abre | URL pública não configurada | Ir em `/configuracoes` e configurar URL da conta (ver `chatwoot-account-urls.md`) |
| KB URL "extractedText" vazio | Refresh anterior falhou | Botão "Atualizar conteúdo" novamente |
| Salvar bloqueado em modo manual | Textarea vazio | Preencher texto |
| Playground vazio depois de fechar | Comportamento esperado (efêmero) | Reabrir = histórico zerado |

---

## 9. Audit

Toda mutação na tela loga:

- `event = setting_updated`
- `previous = {...config antiga...}`
- `next = {...config nova...}`
- `actor_user_id` + `actor_company_id`

Consultar via:

```sql
SELECT created_at, actor_email, payload->'previous' AS prev, payload->'next' AS next
FROM audit_log
WHERE event = 'setting_updated'
  AND payload->>'subject' IN ('nex_settings', 'nex_kb_document')
ORDER BY created_at DESC LIMIT 50;
```

---

## 10. Referências

- Spec: `docs/superpowers/specs/2026-05-01-suite-agente-nex-refinement-v3.md`
- Plan: `docs/superpowers/plans/2026-05-01-suite-agente-nex-refinement-v3.md`
- Migration: `prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/`
- Runbook URLs Chatwoot: `docs/runbooks/chatwoot-account-urls.md`
- Runbook Consumo: `docs/runbooks/consumo-drill-down-v0.16.md`
