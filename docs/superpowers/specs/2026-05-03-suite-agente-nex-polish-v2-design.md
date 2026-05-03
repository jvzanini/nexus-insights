# Spec — Suite Agente Nex · Polish (v0.24.0) — v3 final

**Versão:** v3 (consolidada após 2 pente-finos rigorosos).
**Data:** 2026-05-03.
**Release-alvo:** v0.24.0 (pula 0.23 ocupada por outro agente).

## 1. Contexto

Após v0.20.0 LIVE, super_admin reportou (com prints) novos polish em 4 áreas: Consumo (gráficos donut + bar tag + linha total + cotação real), Tabela (clicabilidade indicada visualmente + Whisper tokens), Bubble (input bar layout estável), AudioPlayer (speed button vazando). Esta release entrega correções dirigidas + remove empty state que confunde.

## 2. Escopo

| § | Bloco | Resumo |
|---|-------|--------|
| 3.A | Consumo · Empty state | **REMOVER** `EmptyConsumoState` — sempre carregar dashboard zerado |
| 3.B | Consumo · Donut | Voltar espessura anterior + aumentar gap textos centrais ↔ donut + tooltip near-mouse + nunca cobrir gráfico |
| 3.C | Consumo · Bar tag | Substituir `(Provider)` em parênteses por `<ProviderBadge>` style tag sem cor |
| 3.D | Consumo · Linha total | Destaque MAIS sutil + remover Sigma + remover `(80)` + setinha hover indicando clique nas linhas + cotação real por timestamp + Whisper explicação |
| 3.E | Bubble · Input bar | Layout estável idle ↔ gravando (sem subir/descer) + esconder dica "Enter envia" quando gravando |
| 3.F | Bubble · AudioPlayer | Speed button respeita margem do container (não vaza) |
| 3.G | Doc/release | Bump 0.22.0 → 0.24.0 + CHANGELOG + STATUS + memory |

## 3. Requisitos

### 3.A — REMOVER empty state `/agente-nex/consumo`

**Problema:** quando `stats.totalCalls === 0 && page === 0 && !isPending`, renderiza `<EmptyConsumoState />` ("Nenhuma chamada ao Agente Nex registrada ainda" + botão "Ir para Configurações"). Isso ESCONDE o dashboard mesmo quando usuário só quer ver as métricas zeradas.

**Solução:**
- Em `src/components/llm/consumo-content.tsx`:
  - Remover branch `if (showEmpty) return <EmptyConsumoState />;` (linha ~413).
  - Remover variável `showEmpty` (linha ~362).
  - Deletar componente `EmptyConsumoState` (linhas ~846-871).
  - Remover imports não usados: `Link`, `Sparkles` (se só usado pelo empty), `buttonVariants`.
- Dashboard sempre renderiza KPIs/gráficos/tabela. Quando vazio, KPIs mostram "0", gráficos mostram `EmptyChartState` (já existente), tabela mostra "Nenhuma chamada no período." (já existente, linha ~715).

**Critério:** acessar `/agente-nex/consumo` com 0 chamadas mostra dashboard normal com tudo zerado, não a tela "Ir para Configurações".

### 3.B — Donut: espessura + gap + tooltip near-mouse

**Problema atual:**
- v0.20.0 mudou `outerRadius=88` mantendo `innerRadius=70` (espessura = 18). Antes era espessura maior (~22-25, padrão).
- Textos centrais (R$ + label CUSTO TOTAL) estão muito próximos do anel donut (sensação visual ruim).
- Tooltip fixo `top-right` — quando usuário passa mouse no donut, tooltip aparece NO CANTO LONGE (não próximo do mouse).

**Solução:**
- `outerRadius`: voltar pra `80` (era 80 antes da v0.20).
- `innerRadius`: aumentar pra `60` (espessura agora = 80-60 = 20 — leve a mais para "voltar" a sensação anterior + aumentar buraco central pra ter mais espaço pros textos).
- Textos centrais: aumentar `max-w` ou `padding` interno do `<div data-slot="donut-center">` (ainda dentro do `<motion.div>` pai). Adicionar `px-6` ou similar pra dar respiro horizontal.
- Tooltip:
  - REMOVER `position={{x:0,y:0}}` + `wrapperStyle={donutTooltipWrapperStyle(...)}` fixos.
  - Deixar Recharts seguir o mouse (default `position` undefined OU `position={{x: undefined, y: undefined}}`).
  - Adicionar `offset={12}` pra distância do cursor.
  - Garantir que tooltip nunca cubra o donut: posição relative do tooltip se ajusta automaticamente com `allowEscapeViewBox={{x:true, y:true}}` que já temos.
  - Manter `<DonutTooltipStacked>` content (já é compacto max-w-[180px]).
- Remover prop `tooltipPosition` (ou manter como deprecated/no-op pra back-compat — decisão: manter prop por agora, marcar `@deprecated`).

### 3.C — Bar tag: estilo Badge sem cor

**Problema:** v0.20.0 adicionou `(Provider)` em parênteses abaixo do nome do modelo. Visual amador.

**Solução:**
- Criar novo componente `<ProviderBadge label="OpenAI" />` em `src/components/llm/provider-badge.tsx`:
  ```tsx
  export function ProviderBadge({ label }: { label: string }) {
    return (
      <span className="inline-flex items-center rounded-md border border-border/60 bg-transparent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    );
  }
  ```
  - Sem cor de background (transparent).
  - Border sutil (`border-border/60`).
  - Texto uppercase + tracking-wide.
  - Padding compacto (`px-1.5 py-0.5`).
  - Cor texto `text-muted-foreground` (sutil, sem destaque).

- Em `src/components/charts/bar-chart.tsx`:
  - No `CustomBarTick`, substituir `<text>(Provider)</text>` por estrutura SVG que renderize como Badge.
  - Recharts não aceita componentes React diretos no `tick` (recebe SVG props). Solução: renderizar manualmente em SVG mimicking Badge:
    ```tsx
    {providerLabel ? (
      <g transform="translate(0, 24)">
        <rect
          x={-providerLabel.length * 3.2}
          y={0}
          width={providerLabel.length * 6.4}
          height={14}
          rx={3}
          fill="transparent"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1}
        />
        <text x={0} y={10} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6} letterSpacing={0.5}>
          {providerLabel.toUpperCase()}
        </text>
      </g>
    ) : null}
    ```
    Tamanho do rect calculado dinamicamente baseado no tamanho do label.

### 3.D — Tabela: linha total sutil + setinha hover + cotação real + Whisper

**D1. Linha total sutil**

**Atual:** `bg-violet-500/15 dark:bg-violet-500/10 border-y-2 border-violet-500/40 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 font-bold tracking-wide` + ícone Sigma + `(N)` no label.

**Novo:**
- Classes: `bg-muted/30 border-b border-border/40 text-foreground font-semibold text-xs uppercase tracking-wide`.
- Remover `<Sigma>` icon.
- Remover `({numberFmt.format(detailsTotals.count)})` do label — fica só "Total no filtro".
- Manter sticky no topo + colspan=3.
- Visual mais sutil, parecido com headers secundários da plataforma.

**D2. Setinha hover indica clicável**

- Adicionar coluna invisível antes da Data/Hora OU setinha sobre a primeira coluna que aparece em hover.
- Solução: `<TableRow className="group ...">` + `<TableCell className="relative ...">` na primeira coluna + `<ChevronRight className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />`.
- Padding-left do TableCell aumenta um pouco pra acomodar a setinha.
- Linha total não tem setinha (não é clicável).

**D3. Cotação real por timestamp**

**Problema:** drill-down mostra cotação USD/BRL aplicada, mas valor é da última cache (até 4h velha) — não é a cotação real do momento da chamada.

**Solução:**
- `usage_logger.logUsage` JÁ grava `usd_to_brl_rate` da cotação atual no momento (via `getUsdBrlRate()`).
- Drill-down já mostra esse valor armazenado por linha.
- **Mas:** `getUsdBrlRate` tem cache 4h — então se houve cache hit, o valor pode estar desatualizado pelo período do cache.
- **Decisão:** documentar isso no drill-down via tooltip explicativo:
  ```tsx
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline-offset-2 underline decoration-dotted decoration-muted-foreground">
          Cotação USD→BRL aplicada
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-xs">
          Cotação USD/BRL gravada no momento da chamada via AwesomeAPI (cache 4h, fallback 5.50). Spread cartão atual aplicado.
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  ```
- **Melhoria opcional (rejeitada nesta release):** reduzir cache pra 30min em vez de 4h. Trade-off: mais latência + maior chance de fallback. **Decisão:** manter 4h por agora, documentar em runbook.

**D4. Whisper tokens explicação**

**Problema:** chamadas com `model=whisper-1` mostram tokens "—" (legacy). User quer entender por quê.

**Resposta clara (nota condicional já existe — apenas REFINAR):**
- `usage-detail-sheet.tsx` linha onde aparece nota:
  ```tsx
  {row.model === "whisper-1" ? (
    <p className="text-xs text-muted-foreground italic">
      O modelo whisper-1 (legado) é cobrado por minuto de áudio, não por tokens.
      Versões a partir de v0.20+ usam gpt-4o-mini-transcribe que retorna tokens reais
      (input_token_details.audio_tokens). Veja runbook agente-nex-audio-e-kb-url.md.
    </p>
  ) : null}
  ```

### 3.E — Bubble: input bar layout estável

**Problema:** ao iniciar gravação, todo o componente "treme" pra baixo e depois volta. Causado pela troca de `<textarea>` (com altura mínima ~36px) por `<AudioRecorder>` (com altura ~36-40px) E remoção da dica "Enter envia · Shift+Enter quebra linha" que ocupava espaço abaixo.

**Solução em `src/components/nex/nex-chat-panel.tsx`:**
- Container externo da inner area: garantir `min-h-9` é mantido com mesma altura em ambos estados (já é).
- Container do hint "Enter envia": `<div className="text-xs text-muted-foreground min-h-[20px]">{!isRecording ? "Enter envia · Shift+Enter quebra linha" : null}</div>` — sempre renderiza container com `min-h-[20px]`, conteúdo só aparece quando idle.
- **Alternativa:** sempre renderizar texto MAS com `visibility: hidden` quando gravando — mantém altura sem mostrar:
  ```tsx
  <p
    className={cn(
      "px-1 text-xs text-muted-foreground transition-opacity",
      isRecording ? "invisible" : "visible"
    )}
  >
    Enter envia · Shift+Enter quebra linha
  </p>
  ```
- Botão "Enviar" (gradient violet): garantir mesma posição absoluta — já é `flex items-end gap-2` então deve estar OK; problema é só o container do hint.

### 3.F — AudioPlayer: speed button respeita margem

**Problema:** quando label muda de "1×" (largura ~16px) para "1.75×" (largura ~32px), botão estica e ultrapassa a margem direita do container `bg-violet-600/15 max-w-[320px]`.

**Solução em `src/components/nex/audio-player.tsx`:**
- Botão speed:
  - Adicionar `min-w-[44px]` no botão (acomoda "1.75×" sem stretch).
  - Adicionar `text-center justify-center` (já tem justify-center).
  - Container player ganha `pr-3` ou `pr-2` extra para garantir margem visual.
- Alternativa: alterar labels para terem largura uniforme — formatar como `1.0×` em vez de `1×`, `1.25×`, `1.50×`, `1.75×`, `2.0×` (todos 4-5 chars). Decisão: usar `min-w` é mais simples.
- Verificar via ui-ux-pro-max em viewport mobile (375px) onde max-w-[320px] já aperta.

### 3.G — Doc / release

- Bump `package.json` 0.22.0 → 0.24.0 (verificar via git log antes — outro agente em v0.23).
- CHANGELOG entry nova com 6 sections (A/B/C/D/E/F).
- STATUS.md atualizado.
- Memory `project_v0.24_polish.md` + atualizar MEMORY.md.

## 4. Arquivos

### 4.1 Modificados
- `src/components/llm/consumo-content.tsx` (3.A remover empty state · 3.D linha total sutil + setinha hover).
- `src/components/charts/donut-with-center.tsx` (3.B espessura + gap + tooltip near-mouse).
- `src/components/charts/bar-chart.tsx` (3.C custom tick com Badge SVG).
- `src/components/llm/usage-detail-sheet.tsx` (3.D cotação tooltip + Whisper nota refinada).
- `src/components/nex/nex-chat-panel.tsx` (3.E hint invisible em vez de remover).
- `src/components/nex/audio-player.tsx` (3.F min-w no speed button).

### 4.2 Novos
- `src/components/llm/provider-badge.tsx` (3.C — embora bar-chart use SVG inline, ainda bom ter componente HTML reutilizável).

## 5. Riscos

| Risco | Mitigation |
|-------|------------|
| Remover empty state pode confundir usuário sem dados | Dashboard mostra "0" claramente em todos os cards/gráficos com `EmptyChartState` já existente |
| Mudar tooltip donut quebra alinhamento em mobile | Test em 375 + 1280px |
| Custom Badge SVG no bar tick mais complexo | Calcular largura dinâmica via `label.length * px_per_char` |
| Cotação 4h cache pode ser percebida como "desatualizada" | Tooltip explica + runbook documenta trade-off |
| Whisper nota técnica demais | Versão refinada cita "(legado)" + redirect runbook |
| Bump 0.24 colidir com outro agente | git fetch antes; v0.23 está com claude-conversas-v023 |

## 6. Out of scope

- Reduzir cache de cotação para 30min (avaliar v0.25+).
- Re-fetch cotação real-time on-demand no drill-down (custo).
- Migrar chamadas legadas whisper-1 (manter histórico imutável).
- Cor por provider no Badge (mantém sem cor por design).

## 7. Critérios de aceite

- [ ] `/agente-nex/consumo` com 0 chamadas mostra dashboard zerado normal (não tela "Ir para Configurações").
- [ ] Donut espessura visualmente similar a antes da v0.20 (mais grosso) + textos centrais com respiro (não encostados no anel).
- [ ] Tooltip do donut aparece próximo ao mouse (segue cursor) E nunca cobre o gráfico.
- [ ] Bar chart "Custo por modelo": tag estilo Badge sem cor (uppercase + border sutil) abaixo do nome do modelo.
- [ ] Linha total da tabela: visual sutil (bg-muted, border-b sutil, sem violet, sem Sigma, sem `(N)`).
- [ ] Setinha aparece em hover na primeira coluna das linhas clicáveis.
- [ ] Drill-down: tooltip explicativo na "Cotação USD→BRL aplicada".
- [ ] Drill-down whisper-1: nota refinada citando "legado" + redirect runbook.
- [ ] Bubble input bar: layout estável idle ↔ gravando (sem treme); hint "Enter envia" some sem reflow.
- [ ] AudioPlayer: speed button respeita margem do container em todos os labels (1×, 1.25×, 1.5×, 1.75×, 2×).
- [ ] /api/health version=v0.24.0 status=ok.
- [ ] Suite tests verde + typecheck 0.

## 8. Histórico de revisões

- **v1**: rascunho. 14 achados pente-fino #1.
- **v2**: incorpora achados v1 + investigação técnica. 11 achados pente-fino #2.
- **v3**: consolida 25 achados. **Pronta para plan.**

## 9. Pente-fino registrado (consolidado)

**v1 → v2 (14 achados):** EmptyConsumoState linha exata identificada (846-871); donut tooltip atual é fixed top-right (não near-mouse); bar tick custom já existe via PROVIDER_LABELS — só substituir render; linha total já tem `(N)` no label; setinha hover requer `group` na TableRow; cotação 4h cache é esperado (não bug); Whisper nota condicional já existe — apenas refinar texto; input bar hint "Enter envia" já tem condicional `!isRecording` mas REMOVE o elemento (causa reflow); AudioPlayer speed button já tem `shrink-0` mas falta `min-w`; provider Badge SVG inline mais robusto que componente HTML para SVG; ui-ux-pro-max obrigatória em todas tasks UI; testes existentes podem quebrar (donut espessura, linha total bg-muted vs bg-violet); bump 0.22→0.24 não 0.23 (conflito).

**v2 → v3 (11 achados):** removendo EmptyConsumoState — limpar imports não usados (Link, Sparkles, buttonVariants); donut innerRadius 70→60 + outerRadius 88→80 mantém centro maior + espessura similar; tooltip near-mouse — testar overflow em viewport pequeno; bar Badge SVG largura dinâmica = `label.length * 6.4px` (heurística); linha total sutil — manter sticky top-0 z-[1]; setinha hover — `<ChevronRight className="opacity-0 group-hover:opacity-60">` com posicionamento absolute na first cell; cotação tooltip — usar Tooltip component da plataforma se existe; runbook update — apontar pra existente `agente-nex-audio-e-kb-url.md` (criado em v0.20.0); input bar hint usa `invisible` em vez de `null` pra preservar altura; AudioPlayer min-w-[44px] cobre todos labels possíveis; ui-ux-pro-max valida cada UI change.

**Fim da spec v3 final.**
