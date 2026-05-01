# Pente Fino #1 — Spec Suite Agente Nex

> **Input:** `2026-05-01-agente-nex-suite-design-v1.md`
> **Posture:** análise crítica real. Encontrar lacunas, ambiguidades, contradições, escopo mal-definido, riscos não-tratados, requisitos implícitos do usuário não capturados.
> **Output:** lista de achados com severidade + correção proposta para a v2.

---

## Achados de severidade ALTA (mudam decisões arquiteturais)

### A1. **Bubble não diferencia "audio enviado" de "transcript automático" — ambiguidade visual**
**Onde:** §7.2.
**Problema:** A v1 diz "balão player + balão menor abaixo com transcrição". Mas a transcrição **é** o que o usuário "disse" — ela vai ser o conteúdo da mensagem do usuário no fluxo de chat. Não fica claro se aparece duplicado (player + transcrição como duas mensagens distintas) ou se é uma mensagem única com player + texto interno.
**Correção:** documentar explicitamente que mensagem áudio é **uma única mensagem de role=user** com 2 sub-elementos visuais (player encima + transcrição embaixo), e que o `content` enviado para o agente IA é a string da transcrição (sem o áudio). Schema da `UiMessage` ganha campos novos: `kind: "text" | "audio"`, `audioBlobUrl?`, `durationSeconds?`. Para UI: render condicional baseado em `kind`.

### A2. **Sem definição de fallback quando provider não é OpenAI**
**Onde:** §6.1, §8.3.
**Problema:** Whisper só funciona com chave OpenAI. Se o super_admin tiver chave Anthropic ativa e ligar o toggle de áudio, a UI da bolha vai mostrar o microfone — mas qualquer envio falha com mensagem técnica.
**Correção:** Toggle "audio_input_enabled" só pode ser ligado quando o provider ativo é OpenAI. UI mostra ToggleDisabled+tooltip ("disponível apenas com chave OpenAI ativa"). Server Action de save valida e rejeita.

### A3. **Playground: como sabe se a config no playground tem KB enabled?**
**Onde:** §6.4, §6.2 (testNexPromptAction).
**Problema:** Playground passa `cfg` para o `composeSystemPrompt`. Se `cfg.kbEnabled = true`, o KB injetado vem dos docs **persistidos no banco** — mesmo o user não tendo "salvo" essa config ainda. Resultado: testar com KB enabled retorna prompt já incluindo KB; OK. Mas se `kbEnabled = false`, não injeta. Está correto.
**Correção:** Confirmar comportamento explícito: KB sempre vem do banco (`getKbDocsForPrompt()`). Playground não permite "simular KB diferente" — só testar com flag ON/OFF. Documentar.

### A4. **Toggle áudio "vive" em duas tabelas?**
**Onde:** §5.1 (`audio_input_enabled` em `nex_settings`).
**Problema:** Hoje há `app_settings.nex.bubble_enabled` (toggle global da bubble — liga/desliga o componente flutuante). Agora propomos `nex_settings.audio_input_enabled` (toggle do mic). São dois toggles relacionados mas diferentes: um liga a bolha (tudo), outro liga apenas o mic dentro dela.
**Correção:** Documentar claramente que são DOIS toggles independentes, em duas tabelas distintas, e o motivo (separação histórica). UI mostra os dois separadamente.

### A5. **Bubble busca `audioInputEnabled` em qual momento?**
**Onde:** §7.1 + §7.5 (toggles na page /prompt).
**Problema:** Quando o super_admin liga o toggle em `/agente-nex/prompt`, a bubble (que é renderizada em `(protected)/layout.tsx`) precisa saber. Layout é Server Component que roda em cada navigation. Se super_admin está em outra aba e liga, é preciso reload pra ver o mic.
**Correção:** Decisão pragmática: `audioInputEnabled` é fetched no Server Component `(protected)/layout.tsx` via `getNexPromptConfig()` e passado pra `<NexBubble audioInputEnabled={...}>`. Toggle save chama `router.refresh()` no client. Documentar.

### A6. **Custo Whisper vai pra `llm_usage` mas o BRL é calculado quando?**
**Onde:** §8.4.
**Problema:** Outros entries de `llm_usage` têm `cost_brl` populado pelo `usage-logger` (que chama `getUsdBrlRate()`). Whisper precisa do mesmo tratamento.
**Correção:** Route Handler `/api/nex/transcribe` chama `logUsage()` (já existente). `logUsage` já popula BRL automaticamente. OK por design — só validar.

### A7. **Falta caminho de erro: usuário grava áudio mas Whisper retorna texto vazio**
**Onde:** §8.
**Problema:** Áudios silenciosos (ou só ruído) podem retornar `text: ""`. Se isso for enviado pro `runNexAgent` como mensagem do user, a IA recebe string vazia.
**Correção:** Cliente checa `text.trim().length === 0` → mostra toast "Não consegui transcrever — áudio inaudível?" e descarta a mensagem. Não envia pro agente.

---

## Achados de severidade MÉDIA (UX, edge cases)

### M1. **Cap de 30k chars do KB pode estourar tokens do modelo**
**Onde:** §6.4.
**Problema:** 30k chars ≈ 7-8k tokens. Combinado com a personalidade + tom + guardrails + histórico de conversa + tools, o prompt pode ultrapassar context window de modelos pequenos (gpt-5-nano tem 128k tokens — folga). Cap está conservador OK.
**Correção:** Documentar que cap é por SAFETY (evitar context overflow), não custo. Adicionar warning no UI quando KB total > 25k chars (perto do cap).

### M2. **Upload de PDF: extração via pdf-parse pode falhar silenciosamente**
**Onde:** §6.2 (uploadKbDocumentAction).
**Problema:** Se `pdf-parse` levanta erro (PDF corrompido), a action retorna error genérico.
**Correção:** Capturar erro de parsing e retornar mensagem específica: "Não foi possível extrair texto do PDF. Tente exportar como texto (.txt)".

### M3. **MediaRecorder em Safari iOS — qual fallback?**
**Onde:** §8.1, §13.
**Problema:** Safari iOS < 14.5 não tem MediaRecorder. iOS 14.5+ suporta mas com mime restrito (`audio/mp4`).
**Correção:** Detect feature em runtime. Se `typeof MediaRecorder === "undefined"`, esconder botão mic (mesmo com toggle ON) e mostrar tooltip "Navegador não suporta gravação". Tentar mime `audio/mp4` como fallback.

### M4. **Playground não tem controle de tamanho da mensagem teste**
**Onde:** §7.5.
**Problema:** Pode encher um prompt de teste enorme. Sem cap, eats tokens da conta.
**Correção:** Cap mensagem playground em 1000 chars no client.

### M5. **`/agente-nex/prompt` com 4 cards é denso**
**Onde:** §7.5.
**Problema:** 4 cards em sequência (Comportamento, Recursos, KB, Playground) = scroll longo.
**Correção:** Aceitar densidade — alvo é super_admin (poucos usuários, muito poder). Em layout: cards bem espaçados, max-w-3xl pra não ficar largo demais. UI/UX Pro Max ajusta.

### M6. **KB upload sem revalidate**
**Onde:** §6.2.
**Problema:** Após upload, a `KbSection` precisa atualizar a lista. Server Action não faz `revalidatePath` automaticamente.
**Correção:** Após `uploadKbDocumentAction`/`deleteKbDocumentAction`, client chama `router.refresh()`.

### M7. **Spec não menciona acessibilidade dos componentes de áudio**
**Onde:** §7.
**Problema:** Aria-labels para mic, player, controls. Importantes pra acessibilidade.
**Correção:** Adicionar §7.6: cada componente tem `aria-label` em PT-BR. Foco visível. Respeita `prefers-reduced-motion` (no waveform).

### M8. **Preview do prompt completo: onde fica?**
**Onde:** §7.5.
**Problema:** A v1 fala em "previewSystemPromptAction" mas não diz onde aparece o resultado. UI fica confuso.
**Correção:** Botão "Pré-visualizar prompt completo" abre Dialog modal com o prompt em `<pre>`.

### M9. **Histórico de áudio na conversa do localStorage**
**Onde:** §7 (não trata).
**Problema:** O chat persiste em localStorage. Mas Blob URL não persiste (cria novo a cada reload). Se user recarrega, mensagens de áudio antigas tem player quebrado.
**Correção:** Persistir só a transcrição (texto) das mensagens áudio antigas. Player só funciona na sessão atual. Documentar.

---

## Achados de severidade BAIXA (refinamentos)

### B1. Ortografia/clareza
- "AlternativAtivar" não — não tem desse erro. OK.
- §7.2 "Balão menor" — usar "balão" consistentemente.

### B2. **"Tools customizadas" deveria estar no roadmap futuro?**
**Onde:** §3.
**Problema:** É um non-goal claro, mas pode ser útil documentar como "futura release" para evitar perguntas.
**Correção:** Mover de §3 para uma seção "Roadmap pós-MVP" no apêndice.

### B3. **Whisper language default = "pt"**
**Onde:** §8.
**Problema:** Hardcoded. E se o user fala inglês?
**Correção:** Whisper detecta automaticamente quando language é omitido, mas qualidade cai. MVP: passar `pt` (a maioria do uso). Tornar configurável fica futuro.

### B4. **Guardrails: limite por item e total**
**Onde:** §5.1.
**Problema:** v1 não diz limite de chars por guardrail nem total.
**Correção:** Cap: 300 chars/guardrail, máx 20 guardrails (já estabelecido na lib). Documentar.

### B5. **`testNexPromptAction` não marca `isPlayground`?**
**Onde:** §6.2.
**Problema:** v1 menciona mas não conecta no `runNexAgent`.
**Correção:** Confirmar no §6.3: action passa `isPlayground=true` pro runNexAgent. Já está no v1 §6.3. OK — refraseando.

### B6. **`SimcheckMatrixIA` não está no escopo?**
**Onde:** §3 (não-objetivos).
**Problema:** v0.13.9 corrigiu o filter Matrix IA no Nex. Esta release não muda isso.
**Correção:** Mencionar explicitamente que filter Matrix IA do Nex (v0.13.9) é preservado.

---

## Resumo dos achados

| Severidade | Quantidade |
|------------|------------|
| ALTA       | 7 (A1–A7)  |
| MÉDIA      | 9 (M1–M9)  |
| BAIXA      | 6 (B1–B6)  |
| **Total**  | **22**     |

## Decisão: gerar v2

A v1 cobria os pontos principais mas tinha 7 buracos arquiteturais sérios + 9 problemas de UX/edge case. A **v2** vai corrigir todos os 22 itens acima. Os achados ALTA são especialmente importantes — sem eles a implementação iria gerar bugs reais (áudio silencioso, fallback de provider, dois-toggles-confusos).

A v2 será gerada em `2026-05-01-agente-nex-suite-design-v2.md`.
