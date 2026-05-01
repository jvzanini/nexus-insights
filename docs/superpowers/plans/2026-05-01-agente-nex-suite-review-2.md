# Pente Fino #2 — Plan Suite Agente Nex (mais profundo)

> **Input:** `2026-05-01-agente-nex-suite-v2.md`
> **Posture:** análise profundíssima — contradições internas, dependências escondidas, edge cases, ordem de execução, contratos cross-task, expected outputs faltantes.

## Achados ALTA

### A1. **T8 muda `RunNexInput` mas T6 (route handler) NÃO usa runNexAgent**
**Problema:** T6 (Route Handler /api/nex/transcribe) chama `transcribeAudio` direto. Não passa por `runNexAgent`. Tudo bem (caminho separado). Mas a v2 não esclarece — precisa documentar que o áudio NÃO passa pelo agente; só a transcrição (texto) passa via `sendNexMessage` no client.
**Fix:** v3 adiciona nota em T6 e T21c.

### A2. **T18 atualiza `nex-message.tsx` mas T17 não rebobina o tipo `UiMessage`**
**Problema:** A v2 propõe adicionar `kind?: "text" | "audio"` em `nex-message.tsx`. Mas `UiMessage` é definida em `nex-chat-panel.tsx` (cliente). Os campos novos precisam ir lá também.
**Fix:** v3 adiciona step explícito em T18 atualizando a interface `UiMessage`.

### A3. **T21d (persistência sem audioBlobUrl) não cobre carregar back**
**Problema:** v2 strip ao salvar. Mas ao carregar, código atual faz `JSON.parse(raw)` direto. Se loaded message tem `kind="audio"` E `audioBlobUrl=null`, NexMessage precisa renderizar o fallback. v2 já confirma fallback em T18 — mas o flow load → render precisa ser verificado.
**Fix:** v3 adiciona step de teste E2E "reload página com mensagem áudio antiga". Smoke check.

### A4. **T7 não documenta o erro caso pdf-parse falhe**
**Problema:** Spec v3 §13 diz "Try/catch específico. Toast: 'Tente exportar como TXT'". v2 plano não detalha onde isso acontece.
**Fix:** v3 detalha em T7 step 3: try/catch ao redor do `pdf-parse` no `uploadKbDocumentAction`, retorna error específico.

### A5. **T9 não documenta os imports lucide novos**
**Problema:** v2 menciona ícones `SlidersHorizontal`, `KeyRound`, `BookOpen`, `TrendingUp` mas o `nav.ts` atual já tem alguns. Verificar quais precisam ser adicionados.
**Fix:** v3 lista os imports exatos.

### A6. **T15 reusa `<ConsumoContent>`, mas o componente está em `src/components/llm/`**
**Problema:** Esse path é "llm" — pode confundir agora que existe `src/components/agente-nex/`. Decisão de **não** mover (mais barato), mas confirmar.
**Fix:** v3 confirma no Step 1.

### A7. **T13 fetcha 4 coisas — uma delas falhou em produção (getUsdBrlRate)**
**Problema:** v2 copia o pattern `Promise.all([..., getUsdBrlRate().catch(() => null)])`. Mas o catch retorna `null` e o spread default fica em `DEFAULT_CARD_SPREAD`. Confirmar import de `DEFAULT_CARD_SPREAD`.
**Fix:** v3 mostra o código completo do page.tsx.

### A8. **T20 mock de MediaRecorder em jest é frágil**
**Problema:** v2 sugere mock global. Funciona, mas se algum teste roda primeiro e seta o mock errado, pode quebrar outros tests. Best practice: definir mock como helper reutilizável.
**Fix:** v3 sugere `src/test-utils/media-recorder-mock.ts` como helper, importado nos tests que precisam. Aceita complexidade extra para robustez.

### A9. **Steps de TYPECHECK + TESTS antes de commit às vezes ausentes**
**Problema:** Algumas tasks (T9, T10, T11) só tem "typecheck + commit" sem rodar tests. Está correto pra essas tasks pequenas (sem código testável). Outras tasks como T17 também não tem tests novos. Documentar quando é OK pular tests.
**Fix:** v3 adiciona regra: "se task não tem código testável (só edição de constants ou config), pular `npm test`. Caso contrário, sempre rodar."

### A10. **T21a: edição em `(protected)/layout.tsx` é mudança crítica**
**Problema:** Layout afeta todas as páginas autenticadas. Erro aqui = produção quebrada.
**Fix:** v3 destaca a criticidade. Step extra: rodar `npm run build` localmente após edição (catch de erro de SSR).

### A11. **T7 server actions FormData no ambiente Next.js 16**
**Problema:** Server Action recebendo FormData com Blob — Next.js 16 deve suportar. Confirmar não há limite de payload (5 MB no PDF).
**Fix:** v3 confirma e documenta limite default Server Action Next.js 16 (1 MB body padrão; precisa configurar maior). Alternativa: Route Handler (igual transcribe). Decisão: avaliar se Server Action funciona; se não, mover upload pra Route Handler `/api/nex/kb/upload`.

### A12. **T21d: depois de strip e save, o react state está OK?**
**Problema:** Strip apenas para localStorage. State em memória mantém audioBlobUrl. Reload = state limpo, carrega do storage = strip aplicado. Comportamento correto.
**Fix:** v3 confirma.

## Achados MÉDIA

### M1. **Tasks sem step de "rodar tests da área"**
**Fix:** v3 garante em todas tasks que tem código testável.

### M2. **T12 — confirmar que `LlmConfigForm` não duplica lógica**
**Fix:** v3 detalha que `LlmConfigCard.tsx` ainda existe e DEVE ser eventualmente removido (em release futura) — não nesta. v0.15.0 mantém o legado para evitar quebra.

### M3. **T22, T24: `router.refresh()` após save**
**Fix:** v3 documenta em cada componente Save → router.refresh().

### M4. **T26 (page /prompt) busca config + KB. Quando atualiza?**
**Fix:** v3 confirma `dynamic = "force-dynamic"` na page.

### M5. **T28 não menciona update de HISTORY.md durante deploy**
**Fix:** v3 adiciona step explícito.

### M6. **Versão do package.json em quando?**
**Fix:** v3 confirma em T27 step 1.

### M7. **T20 cap 5min auto-send: o componente anuncia ao usuário?**
**Fix:** v3 menciona toast antes de auto-send.

### M8. **T21c: erros de `fetch` (network down) não tratados**
**Fix:** v3 adiciona catch específico (já adicionado parcialmente; confirmar).

### M9. **T2 — IDENTITY_BASE como constante exportada**
**Fix:** OK, já exportada. v3 confirma.

### M10. **T5 — perMinuteUsd cobre futuras integrações?**
**Fix:** v3 menciona que `extras.durationMs` é genérico — se futuro adicionar Vision (per-image), pode reusar pattern.

### M11. **Smoke checks da T28 não cobrem rollback**
**Fix:** v3 adiciona "se falhar, gh run watch + investigate logs".

### M12. **Sem step explícito de active file delete após deploy**
**Fix:** v3 adiciona `rm docs/agents/active/<id>.md` em T28.

## Achados BAIXA

### B1. **T20 — botão Mic com tooltip não está na v2**
**Fix:** v3 confirma aria-label simples (sem tooltip extra, conforme spec).

### B2. **T11 layout passthrough — vale criar?**
**Fix:** v3 explica que existe pra futura customização (sub-nav própria pode vir aqui).

### B3. **Order de tasks**
**Fix:** v3 confirma a ordem é lógica (deps respeitadas).

### B4. **Commit messages padrão**
**Fix:** v3 documenta `feat(escopo): descrição (T<n>)` sempre.

### B5. **T21 cap 25MB no client antes de enviar?**
**Fix:** v3 adiciona check client-side antes do fetch (5min × bitrate típico = ~5MB; 25MB é folga). Apenas documentar — se ultrapassar, mostra toast.

## Resumo

| Severidade | Quantidade |
|------------|------------|
| ALTA       | 12 (A1–A12)|
| MÉDIA      | 12 (M1–M12)|
| BAIXA      | 5 (B1–B5)  |
| **Total**  | **29**     |

## Decisão

V3 final aplicará todos os 29 itens. Atenção especial em:
- A1, A2, A11 (contratos cross-task, payload limits).
- A3, A12 (persistência local).
- A4, A8 (resilência: pdf-parse, MediaRecorder mock).

Em paralelo, o plano final fica robusto para subagent-driven-development. Cada task tem código completo e validável.
