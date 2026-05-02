# Spec — Suite Agente Nex · Polish (v0.20.0) — v1

**Versão:** v1 (rascunho).
**Data:** 2026-05-02.
**Release-alvo:** v0.20.0.

## 1. Contexto

Após v0.16.0 LIVE, super_admin reportou (com prints) ajustes finos em 3 áreas: Consumo, Prompt e Chaves. Agente Nex ficou prolixo demais (cita `Dashboard summary`, `query_messages`, fica se apresentando), botões duplicados, layout quebra com "Idioma" pra fora do `<pre>`, KB com link da API gastou 5.877 chars sem clareza. Esta release entrega polish dirigido por feedback real.

## 2. Escopo

| § | Bloco | Resumo |
|---|-------|--------|
| 3.A | Consumo | Whisper tokens via novo modelo OpenAI · linha total destaque · Y-axis modo "menor que zero" · donut tamanho/fonte |
| 3.B | Prompt | Preview claramente READ-ONLY · agente menos prolixo (IDENTITY_BASE enxuta + defaults Personality/Tom) · remover atalho "API Chatwoot" · explicar "Mostrar identidade fixa" · bug layout idioma · Maximizar = Dialog centro |
| 3.C | Chaves | Botão "Nova chave" sem gradient (padrão) · lógica condicional (0 chaves só centralizado / ≥1 só header) · logos SVG dos provedores |
| 3.D | Doc/release | Bump 0.18.0 → 0.20.0 · CHANGELOG · STATUS · runbook KB URL · memory |

## 3. Requisitos

### 3.A — Consumo

- **A1. Whisper/áudio tokens.** Hoje `whisper-1` cobra por minuto e API não retorna tokens. **Decisão:** migrar Whisper bubble para `gpt-4o-transcribe` (retorna `usage.input_tokens` + `usage.output_tokens` no response com `response_format=json`). Atualizar:
  - `src/lib/nex/transcribe.ts`: trocar `model=whisper-1` por `model=gpt-4o-transcribe`, `response_format=json`, parse de `usage.input_tokens`/`usage.output_tokens` quando presentes; fallback para Whisper se gpt-4o-transcribe falhar.
  - `src/app/api/nex/transcribe/route.ts`: passa `tokensInput`/`tokensOutput` reais para `logUsage`.
  - `src/lib/llm/pricing.ts`: adiciona `gpt-4o-transcribe` (preço por token: $2.50/1M input audio · $10/1M output text — confirmar via investigação).
- **A2. Linha total destaque.** Hoje row sticky `bg-muted/40 font-semibold`. Novo: `bg-violet-500/10 border-y border-violet-500/30 text-violet-500 dark:text-violet-300 font-bold uppercase tracking-wide` + ícone `<Calculator>` ou `<Sigma>` na primeira célula.
- **A3. Y-axis "menor que zero" mode.** Quando `maxValue < 0.01` (1 centavo): em vez de 5 ticks "R$ 0,00", renderizar só 2 ticks: bottom = "R$ 0,00", top = "< R$ 0,01" (com setinha pra cima sutil). Tooltip mantém valor real.
  - Aplicar em `<InteractiveAreaChart>` e `<InteractiveBarChart>`.
- **A4. Donut tamanho/fonte.** `<DonutWithCenter>`: aumentar `outerRadius` em ~10% (e.g., 80→88) e diminuir `font-size` do valor central em ~10% (e.g., text-2xl → text-xl).

### 3.B — Prompt

- **B1. Preview claramente read-only.** O `<pre>` no card "Prompt completo" mantém somente leitura, mas:
  - Cursor `cursor-text` (não pointer; explicita que é só leitura selecionável).
  - Banner sutil acima: "Este é o preview do prompt final. Para editar, use os campos abaixo (Personalidade / Tom / Guardrails / Modo manual)."
  - Botão "Editar" ao lado de "Copiar"/"Maximizar" → faz scroll suave para `<form>` de Personalidade.
- **B2. Agente menos prolixo (IDENTITY_BASE radicalmente enxuta).** Substituir IDENTITY_BASE atual (38 linhas) por versão curta de ~12 linhas:
  ```
  Você é o Agente Nex — assistente da plataforma Nexus Insights.
  Responda perguntas sobre os dados do atendimento (Nexus Chat / Chatwoot) com objetividade.

  Regras:
  - Respostas curtas e diretas. Sem se apresentar a cada turno (faça apenas no primeiro contato da sessão).
  - Sem citar nomes de tools, tabelas, campos internos ou termos técnicos como "dashboard summary", "query_*", "snapshot".
  - Se o usuário pedir um número, dê o número. Se pedir uma comparação, dê a comparação. Sem rodeios.
  - Idioma: pt-BR. Fuso: America/Sao_Paulo. Datas: dd/mm/aaaa. Números: pt-BR.
  - Você é Agente Nex — não mencione modelos comerciais (ChatGPT/GPT/Claude/Gemini/etc) como sua identidade.
  - Tópicos fora do escopo: "Esse tópico está fora do escopo do Agente Nex."
  - Não invente dados. Para deep-links, use o mapeamento de URL pública (se configurado).
  ```
- **B3. Remover atalho "Adicionar API Chatwoot (sugerida)".** Deletar botão em `kb-section.tsx`. KbUploadDialog mantém a aba URL; user pode adicionar manualmente.
- **B4. Defaults de Personality/Tom seedados.** Migration aditiva:
  ```sql
  UPDATE nex_settings
  SET personality = 'Direto, prático, prefere bullets curtos. Evita rodeios e textão.',
      tone = 'Profissional, objetivo, em pt-BR. Usa "você". Sem se desculpar nem se apresentar a cada resposta.'
  WHERE id = 'global'
    AND seeded_defaults_at IS NOT NULL
    AND personality = '' AND tone = '';
  ```
  (Aproveita flag existente `seeded_defaults_at`.)
- **B5. Explicar "Mostrar identidade fixa".** Renomear botão para "Ver identidade fixa do agente (somente leitura)". Adicionar pequeno texto explicativo no card aberto: "Texto-base imutável que blinda a identidade do Agente Nex. Personalidade e Tom (abaixo) são camadas adicionais que VOCÊ controla."
- **B6. Bug layout "Idioma".** No card preview, o `<pre>` está com `max-h-[400px]` mas conteúdo grande pode estar quebrando layout do card pai. Investigar e corrigir (provavelmente falta `min-w-0` em algum flex container, ou `overflow-x-auto` no pre interno).
- **B7. Maximizar = Dialog centro.** Trocar `<Sheet side="right">` por `<Dialog>` com `max-w-4xl max-h-[85vh]`, backdrop blur, conteúdo scrolável internamente, página atrás fica parada. Adicionar botão "Editar prompt" no header do Dialog que fecha o Dialog e foca no form abaixo.
- **B8. KB URL raspagem.** Runbook explica fluxo (assertPublicUrl → fetchKbUrl com node-html-parser → extract `<main>`/`<article>` ou `<body>` minus script/style/nav/footer/aside/form → trunca em 100k → injeta no prompt limitado a 30k total).

### 3.C — Chaves

- **C1. Botão "Nova chave" sem gradient.** Hoje: `bg-gradient-to-br from-violet-600 to-violet-500 text-white`. Novo: `<Button variant="default">` puro do design system. Mesmo estilo dos botões "Salvar"/"Aplicar"/"Atualizar" da plataforma.
- **C2. Lógica condicional botão duplicado.**
  - Provider COM credenciais (≥1): botão "Nova chave" só no header (já está OK).
  - Provider SEM credenciais (0): REMOVER botão do header. Manter só dentro do card "Nenhuma chave cadastrada", ao lado do "Criar API key no painel do {Provider}".
- **C3. Logos SVG dos provedores.** Substituir as iniciais (`O`, `A`, `G`, `O`) por SVG inline dos logos:
  - OpenAI: simple-icons logo.
  - Anthropic: simple-icons logo.
  - Google Gemini: simple-icons "googlegemini" logo.
  - OpenRouter: simple-icons logo.
  - Decisão técnica: SVG inline (4 strings em código) — sem dependência adicional, peso de bundle desprezível, controle total de cor (usa `currentColor` ou `fill-violet-500 dark:fill-violet-400`).

### 3.D — Doc / release

- Bump `package.json` 0.18.0 → 0.20.0 (pula 0.19.x ocupado por outro agente).
- CHANGELOG novo bloco com 3 sections (A/B/C).
- STATUS.md atualizado.
- Runbook `kb-url-raspagem.md` (B8).
- Memory `project_v0.20_polish.md`.

## 4. Riscos

| Risco | Mitigation |
|-------|------------|
| `gpt-4o-transcribe` não disponível ou pricing incorreto | Investigar antes (Agent dispara em background); fallback `whisper-1` mantido |
| Reduzir IDENTITY_BASE quebra teste existente em `prompt.test.ts` | Atualizar testes (já houve precedente em v0.16.0) |
| SVG dos logos com restrição de marca | simple-icons é CC0; uso interno para identificar provedor é fair use |
| Migration duplicar seed de Personality/Tom | Condição `seeded_defaults_at IS NOT NULL AND personality='' AND tone=''` evita overwrite |
| Y-axis "menor que zero" confunde usuário | Texto explícito + tooltip mantém valor real |

## 5. Out of scope
- Permitir editar IDENTITY_BASE pela UI (continua imutável — blindagem).
- Crawl de KB URL (refresh manual mantido).
- Multi-tenant.

## 6. Critérios de aceite

- [ ] Whisper bubble usa `gpt-4o-transcribe` e log de tokens reais aparece no Consumo.
- [ ] Linha total da tabela visualmente destacada.
- [ ] Gráficos com max < 0.01 mostram só 2 ticks ("R$ 0,00" e "< R$ 0,01").
- [ ] Donut levemente maior + fonte central menor.
- [ ] Card preview do prompt com banner read-only + botão "Editar" funcional.
- [ ] Agente Nex responde curto e direto (pergunta "quantas conversas hoje?" → "127" não "Eu sou o Agente Nex. ..."); validar via playground.
- [ ] Botão "Adicionar API Chatwoot (sugerida)" removido.
- [ ] Personality e Tom default seedados.
- [ ] Bug layout "Idioma" fora do `<pre>` corrigido.
- [ ] Maximizar abre Dialog centralizado scrolável.
- [ ] Botão "Nova chave" sem gradient.
- [ ] Provider sem chaves: botão "Nova chave" só dentro do empty state.
- [ ] Logos SVG dos 4 providers.
- [ ] /api/health version=v0.20.0 status=ok.

**Fim da v1.** Pronta para pente-fino #1.

---

## Pente-fino #1 — achados (v1)

1. **A1 falta detalhe da retrocompatibilidade.** Chamadas legadas em `llm_usage` com `model='whisper-1'` ainda existem no histórico — drill-down/tabela já mostra `—` em tokens. Mas para chamadas NOVAS com `gpt-4o-transcribe`, tokens existem mas drill-down ainda mostra "Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam." que é incorreto. v2: ajustar nota condicional (`whisper-1` vs `gpt-4o-transcribe`).
2. **A1 fallback indefinido.** Spec diz "fallback whisper-1" mas não especifica quando. v2: detectar erro 4xx/5xx no gpt-4o-transcribe → tentar whisper-1 silenciosamente (log apenas).
3. **A3 max < 0.01 — qual data lookup?** Em `<InteractiveAreaChart>` não temos acesso direto ao max do dataset. v2: calcular `Math.max(...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)))` no componente e expor como `auto` mode.
4. **A4 valores exatos mudam visual.** "10%" é vago. v2: cravar `outerRadius=88 (era 80)` e `font-size=text-xl (era text-2xl)`.
5. **B1 botão "Editar" requires scrollIntoView com ID estável.** v2: adicionar `id="prompt-edit-form"` no card Comportamento + handler `document.getElementById("prompt-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" })`.
6. **B2 IDENTITY_BASE em `prompt-compose.ts` é exportada e tem testes que asseguram presence de palavras-chave (`Nexus Insights`, `ChatGPT/GPT/Claude/etc`).** v2: confirmar que nova versão preserva essas asserções (palavra `Nexus Insights` aparece, palavras a NÃO mencionar continuam listadas).
7. **B4 seed só roda se existem `seeded_defaults_at`.** Se super_admin nunca tocou em v0.16+, seed roda. Mas se já tocou (ex: limpou personalidade de propósito), não. v2: documentar comportamento — não há override.
8. **B6 bug layout "Idioma".** Mais provável: `<pre>` dentro de `ScrollArea` com `whitespace-pre-wrap` mas o conteúdo ultrapassa altura e o ScrollArea não está respeitando `max-h`. Investigar especificamente quando o card está em mobile/window pequena. v2: `<ScrollArea className="max-h-[400px] w-full">` + `<pre className="min-w-0 overflow-hidden ...">`.
9. **B7 Dialog grande.** Componente `<Dialog>` (base-ui via `src/components/ui/dialog.tsx`) — confirmar API. v2: usar Dialog com `<DialogContent className="max-w-[min(900px,92vw)] max-h-[85vh] flex flex-col">` + ScrollArea interna + botão "Editar" no header.
10. **C1 padrão de botão.** "Sem gradient" — qual variante exata? `<Button variant="default">` no design-system tem fundo sólido violet sem gradient. v2: cravar `<Button variant="default" size="sm">` (sem `className` extra de bg-gradient).
11. **C2 botão centralizado quando 0 chaves — onde fica visível?** Hoje header sempre tem o botão. Quando vazio: ESCONDER do header E manter os 2 CTAs no card vazio (já existe — só remover header). v2: condicional `list.length > 0 ? <header com botão> : <header SEM botão>`.
12. **C3 SVG inline pode quebrar com tema dark.** v2: usar `fill="currentColor"` no SVG para herdar `text-violet-500 dark:text-violet-400` do span pai.
13. **D bump 0.18.0 → 0.20.0:** outro agente em paralelo (claude-conversas-v019) está ocupando 0.19.x. v2: confirmar via `git log origin/main` antes de bumpar.
14. **A2 visual da linha total — tons.** `bg-violet-500/10` em dark mode pode ter contraste baixo com texto violet-300. v2: revisar via ui-ux-pro-max.
15. **B5 "Mostrar identidade fixa" — texto longo dentro do card pode quebrar layout.** v2: limit altura do `<pre>` IDENTITY_BASE em max-h-[200px] já está bom, OK.
16. **A1 testes existentes.** `pricing-whisper.test.ts` testa `calculateCost('whisper-1', ...)`. Adicionar caso pra `gpt-4o-transcribe` mas não remover whisper-1 (continua suportado em chamadas legadas).
17. **A1 ensure-tables / migration.** Não há mudança de schema — apenas mudança de comportamento + nova entrada em pricing.ts. Sem migration v0.20.0 — ✅.
18. **B6 bug — verificar em prod.** Bug pode ser difícil reproduzir local (depende de tamanho de fonte/zoom). v2: smoke checklist explícito + plan task de visual review.
19. **B2 "agente menos prolixo" pode regredir blindagem.** Se reduzir muito IDENTITY, pode confundir agente sobre o que NÃO citar. v2: manter linhas críticas (ChatGPT/GPT/Claude/Gemini/etc proibido como identidade; nunca inventar dados).
20. **A1 cobrança estimada (custo).** gpt-4o-transcribe é mais caro que whisper-1 ($0.006/min ≈ $0.36/h vs token-based ~$0.10/h em PT-BR curto). Pode aumentar custo. v2: documentar em runbook.

**Total: 20 achados.** v2 corrige.
