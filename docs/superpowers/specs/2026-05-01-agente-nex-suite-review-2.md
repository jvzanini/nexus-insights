# Pente Fino #2 — Spec Suite Agente Nex (mais profundo)

> **Input:** `2026-05-01-agente-nex-suite-design-v2.md`
> **Posture:** análise linha-a-linha, contradições internas, edge cases não-óbvios, requisitos implícitos, decisões não-justificadas, riscos não-considerados, contratos de API, modelos de dados.
> **Output:** lista de achados refinada para v3 final.

---

## Achados de severidade ALTA (mudam contratos ou semântica)

### A1. **§4.4 contradiz §6.2 sobre validação de provider para áudio**
**Onde:** §4.4 ("Bubble Server Component computa `effectiveAudioEnabled`") vs §6.2 ("`saveNexPromptConfigAction` rejeita audio_input_enabled=true se provider != openai").
**Problema real:** A v2 cria DUAS validações para a mesma regra:
- Save server-side (§6.2): impede que `audio_input_enabled=true` seja persistido se provider ≠ openai.
- Compute em runtime (§4.4): mesmo se persistido, recomputa baseado no provider atual.

A combinação cria comportamento inconsistente: se super_admin liga áudio (com OpenAI ativo), depois troca pra Anthropic, o flag fica `true` no banco mas o bubble ignora. Se trocar de volta pra OpenAI, o áudio volta. Isso pode confundir.

**Decisão para v3:** **Remover** a validação no save (§6.2). Permitir `audio_input_enabled=true` independente do provider. A UI mostra disabled+tooltip; o computed em runtime decide se mic aparece. Isso é mais simples e consistente com toggles tipo "feature flag" do resto da plataforma. Documentar claramente: "ligar o toggle não força provider; a bolha checa automaticamente em runtime."

### A2. **§4.3 — persistência do áudio: detalhe esquecido**
**Onde:** §4.3.
**Problema:** `localStorage` em chat-panel persiste mensagens, mas `URL.createObjectURL` cria URL apenas em memória da página atual. Ao recarregar:
- localStorage tem `kind="audio"`, `audioBlobUrl="blob:..."` (URL morto), `content=transcrição`.
- UI tenta renderizar player com URL morto → audio.error → quebra silenciosamente.

**Decisão para v3:** Ao serializar no localStorage, **não** salvar `audioBlobUrl` (definir como `null`/omit). Ao restaurar, se `kind === "audio" && !audioBlobUrl`, render fallback "(áudio expirado)" (já estava em §7.2). **Adicionar** ao schema explicitamente: campo `audioBlobUrl?: string | null`. Documentar a regra de serialização.

### A3. **§5.1 — `nex_settings.audio_input_enabled` como persistir Falso x Não Aplicável?**
**Onde:** §5.1 + §4.4.
**Problema:** Suponha provider=Anthropic, super_admin nunca ligou áudio. Banco: `false`. Provider muda pra OpenAI: ainda `false` (ok). Super_admin liga: `true`. Provider volta pra Anthropic: ainda `true`. Esta v2 deixa `true` persistido (achado A1 confirma).
**Edge case:** Há diferença entre "super_admin não quis" e "não dá pra ligar agora". Preview do toggle: hoje a UI vai mostrar como `ON disabled`. Visualmente confuso.
**Decisão para v3:** Quando provider ≠ OpenAI E `audio_input_enabled=true`, UI mostra: "ON (inativo — provider atual não suporta)". Quando provider = OpenAI, mostra normal. Aceita a complexidade extra.

### A4. **§7.10 — toggles: comportamento ao desabilitar bolha**
**Onde:** §7.10.
**Problema:** Se `nex.bubble_enabled = false`, a bolha nem aparece (independente de áudio). Mas o card "Recursos" em `/agente-nex/prompt` ainda mostra o toggle áudio. Confuso: "estou ligando áudio mas a bolha está desligada".
**Decisão para v3:** Card "Recursos" mostra um aviso amigável quando `nex.bubble_enabled = false`: "ℹ️ Bolha desligada — esses recursos só funcionam com a bolha ativa. Ative em Configuração."

### A5. **§6.5 — `composeSystemPrompt`: ordem do KB no prompt afeta qualidade**
**Onde:** §6.5.
**Problema:** A v2 coloca KB como ÚLTIMO segmento. Modelos modernos (GPT-5, Claude 4.5+) tendem a respeitar mais a parte FINAL do prompt. Bom — KB no fim funciona como contexto fresco.
**Edge case:** Se override avançado está ativo, KB **não** é injetado. A v2 pode não ser óbvia neste caso. Decisão: documentar que override avançado = "controle absoluto"; KB ignorado; super_admin é responsável por incluir manualmente se quiser.
**Decisão para v3:** Adicionar nota explicativa na §6.5 sobre o trade-off. UI do override avançado mostra warning amarelo: "Override desativa KB e demais campos automaticamente. Você precisa incluir manualmente o que quiser que entre."

### A6. **§6.1 — Route Handler valida provider mas não trata mudança em flight**
**Onde:** §6.1.
**Problema:** User clica "enviar áudio" → fetch para `/api/nex/transcribe`. Server checa provider, se OpenAI: prossegue. Mas o que acontece se outro user (super_admin) muda o provider para Anthropic em paralelo? Provavelmente race irrelevante (probabilidade quase zero numa plataforma single-tenant), mas vale anotar.
**Decisão para v3:** Aceitar (low impact). Documentar como risco em §13.

### A7. **§6.4 — `runNexAgent` e isPlayground com erro: mensagem genérica?**
**Onde:** §6.4.
**Problema:** Se playground der erro (modelo retorna 401 etc), o user vê mensagem técnica do `runNexAgent`. Em playground, não há audit log nem usage. UX: deve mostrar erro técnico ou amigável?
**Decisão para v3:** Mensagem **técnica + sugestão**: "Erro: <provider message>. Verifique a chave e o modelo em Configuração." Documentar.

---

## Achados de severidade MÉDIA

### M1. **§5.3 — `MODEL_PRICING` quebra retrocompatibilidade?**
**Onde:** §5.3.
**Problema:** Adicionar `extras?: { durationMs?: number }` é opcional, mas mudar a interface de `calculateCost` afeta callers existentes. Verificar se algum caller usa positional 4th arg ou similar.
**Decisão para v3:** Validar callers atuais (são poucos: `usage-logger.ts`, `pricing.test.ts`). Manter param opcional não quebra; só ADICIONAR. Confirmar no §5.3.

### M2. **§7.2 — Player de áudio em mensagem antiga sem `audioBlobUrl`**
**Onde:** §7.2.
**Problema:** Já tratado em A2. Adicionar fallback "(áudio expirado)" em fonte cinza.
**Decisão para v3:** Já contemplado. Confirmar.

### M3. **§6.2 — `uploadKbDocumentAction(formData)`: validação dupla?**
**Onde:** §6.2.
**Problema:** Cliente valida tamanho 5MB; servidor revalida. OK por defesa em profundidade. Mas o servidor SEMPRE precisa receber o blob inteiro pra checar — desperdício se já passou de 5MB no client. 
**Decisão para v3:** Aceitar custo. Documentar que validação client é UX (feedback imediato) e server é segurança.

### M4. **§7.8 — KB chars total: como é computado?**
**Onde:** §7.8.
**Problema:** Card 3 mostra "1.234 / 30.000 chars". É `sum(char_count)` dos docs ou `kb_total_chars_in_prompt` (após cap)? Diferença sutil:
- Docs: 35k total. No prompt: 30k (cap). Mostrar 35k/30k confunde (>100%).

**Decisão para v3:** Mostrar `min(sum, 30000) / 30000`, com warning vermelho se `sum > 30000` ("X chars excedendo o limite serão truncados"). Mais honesto.

### M5. **§7.8 — Playground com KB DESABILITADO mas user quer testar com KB**
**Onde:** §7.8.
**Problema:** Card 4 (Playground) usa o `kbEnabled` da config no formulário. Se user desativa o toggle no Card 2 e roda playground, KB não vai. Pode confundir: "salvei a config sem KB pra testar mas o playground continua sem KB."
**Decisão para v3:** Playground usa o `kbEnabled` do **estado atual do form** (não do banco). Documentar: "playground reflete a config sendo editada, mesmo sem salvar."

### M6. **§7.8 — Playground não mostra qual prompt foi usado**
**Onde:** §7.8.
**Problema:** User testa playground; vê resposta da IA. Mas não sabe qual prompt foi enviado (se tem dúvida sobre composição).
**Decisão para v3:** Adicionar link "ver prompt usado" no resultado, abrindo o mesmo Dialog modal do "Pré-visualizar prompt completo". Reusa código existente.

### M7. **§9 — `ensureNexTables` é chamado quando exatamente?**
**Onde:** §9.
**Problema:** A v2 diz "primeira chamada relevante" — vago. Quais funções ativam?
**Decisão para v3:** Lista explícita: `getNexPromptConfig`, `composeSystemPrompt` (indireto), `listKbDocuments`, `getKbDocsForPrompt`, `createKbDocument`, `deleteKbDocument`, `saveNexPromptConfig`. Cada uma chama no início.

### M8. **§11.1 — testes de pricing precisa testar NÃO-regressão**
**Onde:** §11.1.
**Problema:** v2 menciona que tokens-based ainda funciona. Garantir que algum teste antigo de pricing (gpt-5-mini, claude-sonnet-4.7) continua passando.
**Decisão para v3:** Listar explicitamente em §11.1: "rodar TODOS os testes de pricing.test.ts existentes — não regredir."

### M9. **§7.4 — Onde abre o submenu? Sempre, ou só se subitem ativo?**
**Onde:** §7.4.
**Problema:** Padrão de Sidebar (já implementado em /relatorios) é abrir submenu se uma subrota está ativa. Confirmar mesmo padrão para /agente-nex.
**Decisão para v3:** Confirmar no §7.4 que segue mesmo padrão (`isGroupActive(href, pathname)`).

### M10. **§5.1 — `guardrails` JSONB sem index: queries futuras?**
**Onde:** §5.1.
**Problema:** Tabela é singleton (1 row). Queries em `guardrails` vão fazer scan pleno desse 1 row. Sem necessidade de index.
**Decisão para v3:** Aceitar. Documentar.

### M11. **§13 — Risco: usuário cancela gravação enquanto upload está em flight**
**Onde:** §13 (não listado).
**Problema:** Se user clicar enviar, request POST /api/nex/transcribe começa; user clica em outro lugar; cleanup do componente revoga blob URL antes da request voltar. Resposta da Whisper chega ao cliente, mas player mostra blob URL revogado.
**Decisão para v3:** Manter `audioBlobUrl` no estado da mensagem (não revoga até unmount FINAL). Adicionar ao §4.3.

### M12. **§7.1 — UI do mic: ícone Whisper ou simples mic?**
**Onde:** §7.1.
**Problema:** Decisão visual menor. Lucide tem `Mic`, `MicOff`, `Mic2`. Padrão da indústria: `Mic`.
**Decisão para v3:** Confirmar `Mic` (ícone simples, claro).

---

## Achados de severidade BAIXA

### B1. **§14 — critérios de aceite #11 e #10 estão acoplados**
**Onde:** §14.
**Problema:** "Bubble áudio (provider OpenAI + toggle ON)" e "(provider ≠ OpenAI ou toggle OFF)" são dois sub-casos de uma mesma asserção. Pode juntar.
**Decisão para v3:** Manter separados (cobertura mais clara). Aceitar verbosidade.

### B2. **Apêndice B inclui Whisper para Anthropic — viável?**
**Onde:** Apêndice B.
**Problema:** Anthropic não tem speech-to-text nativo. Listei como roadmap mas é misleading.
**Decisão para v3:** Reescrever: "Speech-to-text via providers alternativos (Gemini tem nativo; Anthropic exige stack externo, ex.: Deepgram via API)."

### B3. **§5.2 `extracted_text` é texto puro — qual encoding/limpeza?**
**Onde:** §5.2.
**Problema:** Vem de PDF: pode ter ` ` (NUL byte), caracteres de controle. Postgres TEXT NÃO aceita NUL. → `pdf-parse` pode entregar string com chars problemáticos.
**Decisão para v3:** Sanitize: `extractedText.replace(/ /g, "")` antes de salvar. Adicionar ao §6.2 e §12.

### B4. **§4.1 diagrama: faltam setas de auth**
**Onde:** §4.1.
**Problema:** Diagrama não mostra auth checks. Decisão visual menor — diagrama é simplificado.
**Decisão para v3:** Aceitar.

### B5. **§7.1 — botão "Gravar" precisa de tooltip?**
**Onde:** §7.1.
**Problema:** Mic isolado pode confundir usuário leigo.
**Decisão para v3:** `aria-label="Gravar áudio"` (já documentado em §7.11). Sem tooltip extra (a estética é minimal).

### B6. **§14 — falta critério de "performance"**
**Onde:** §14.
**Problema:** Não há critério explícito de performance (ex.: gravar áudio inicia em <500ms, playground responde em <30s).
**Decisão para v3:** Adicionar #17: "Latência: gravação inicia em <1s após click; playground retorna resposta em <30s para perguntas simples."

### B7. **§3 não-objetivos: e se o user quiser cancelar áudio durante envio?**
**Onde:** §3 (não tem).
**Problema:** Cancelar durante o envio (HTTP fetch em flight). User clica cancel: aborta fetch ou ignora? Aceitar e exibir resultado mesmo que clicado em cancelar é confuso.
**Decisão para v3:** Adicionar em §8.5: "Cancel durante upload: aborta o `fetch` (AbortController) e descarta resposta." Adicionar à lista de erros.

---

## Resumo dos achados

| Severidade | Quantidade |
|------------|------------|
| ALTA       | 7 (A1–A7)  |
| MÉDIA      | 12 (M1–M12)|
| BAIXA      | 7 (B1–B7)  |
| **Total**  | **26**     |

## Decisão: gerar v3 final

26 refinamentos sobre a v2. Os 7 ALTA mexem em decisões arquiteturais (validação de provider, persistência local de áudio, AbortController em fetch, ordem do KB).

A **v3 final** vai aplicar todos os 26 e ficará pronta para fase de plan.
