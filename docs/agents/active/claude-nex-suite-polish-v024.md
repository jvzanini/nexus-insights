---
agent: claude-nex-suite-polish-v024
started_at: 2026-05-03T04:20-03:00
target_version: v0.24.0
status: in_progress
---

## Tópico
Polish v0.24.0 (Suite Agente Nex): A) remover empty state /agente-nex/consumo (sempre dashboard zerado); B) donut espessura + espaço + tooltip near-mouse; C) bar tag style (Badge sem cor); D) row total sutil + remover Sigma + remover (80) + setinha hover; E) cotação real por timestamp; F) Whisper tokens explicar; G) audio recorder layout estável; H) AudioPlayer speed button respeita margem.

## Versão
- Pula v0.23.0 (ocupada por agent claude-conversas-v023). Bumpo direto pra **v0.24.0**.

## Arquivos que provavelmente vou tocar
- src/app/(protected)/agente-nex/consumo/page.tsx (remover redirect/guard de empty state)
- src/components/llm/consumo-content.tsx (linha total sutil + setinha hover + remover (80))
- src/components/charts/donut-with-center.tsx (espessura + raio interno + tooltip near-mouse)
- src/components/charts/bar-chart.tsx (custom tick com Badge component)
- src/components/llm/usage-detail-sheet.tsx (cotação real explicação + Whisper nota)
- src/lib/llm/exchange-rate.ts + usage-logger.ts (cotação por timestamp)
- src/components/nex/nex-chat-panel.tsx (input bar layout estável)
- src/components/nex/audio-player.tsx (speed button margem)

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.22.0 → 0.24.0)
- CHANGELOG.md
- docs/STATUS.md

## Arquivos NÃO posso tocar (outros agentes ativos)
- claude-conversas-v023: tudo de relatorios/conversas, src/lib/actions/reports/conversas*

## Decisões / contexto importante
- Workflow rigoroso: spec v1→v2→v3, plan v1→v2→v3, subagent-driven-development com TDD, ui-ux-pro-max em UI.
- Empty state /agente-nex/consumo: provavelmente redirect quando `getSystemCreatedAt` falha ou retorna null. Remover guard, deixar `ConsumoContent` lidar com vazio.
- Donut: voltar `outerRadius=80`, `innerRadius` aumentar se espessura ficou fina (em v0.20 só mudou outerRadius 80→88). Reverter outerRadius 88→80 OU manter 88 mas aumentar innerRadius pra mesma espessura ANTERIOR a v0.20 — testar visual.
- Tooltip donut: `position={{x,y}}` numérico fixo no top-right NÃO é near-mouse. Trocar pra `position={undefined}` (default Recharts segue mouse) + offset/wrapperStyle pra evitar overlap com gráfico.
- Bar tag: criar componente `<ProviderBadge label="OpenAI" />` (text-[10px] uppercase + border + padding 1.5/0.5 rounded) sem cor.
- Linha total: trocar `bg-violet-500/15 border-y-2 border-violet-500/40 text-violet-700/300 font-bold` por algo MAIS sutil — `bg-muted/40 border-t border-border/40 text-foreground font-semibold text-xs uppercase`. Remover Sigma. Remover `(N)` do label.
- Setinha hover: `<ChevronRight className="opacity-0 group-hover:opacity-100" />` na primeira coluna.
- Cotação: `usage-logger` chama `getUsdBrlRate()` que tem cache 4h. Precisamos: ao invés de cache, buscar cotação live no momento da requisição (sem cache OR cache curto 5min). Documentar trade-off.
- Whisper tokens: chamadas LEGADAS (pre v0.20.0) com model=whisper-1 não têm tokens (cobrança por minuto). Chamadas NOVAS deveriam ir pra gpt-4o-mini-transcribe — mas se cair em fallback, vai pra whisper-1. Verificar se há registros novos com whisper-1 (= fallback ativando) ou se tudo é legado. Smoke test: forçar uma chamada e ver no log se gpt-4o-mini-transcribe está sendo escolhido.
- Input bar gravando: o problema é que o textarea sai E o componente AudioRecorder entra com altura diferente. Solução: container `min-h-[fixed]` que mantém altura idêntica em ambos estados. Esconder dica "Enter envia" via display:none quando gravando.
- AudioPlayer speed button: largura aumenta com 1.25×/1.75× e estoura container. Solução: `min-w-[40px]` no botão (mesmo tamanho pra todos labels) + `mr-2` ou similar pra respeitar margem do container pai.

## Bloqueios
- (vazio)
