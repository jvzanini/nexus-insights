---
agent: claude-nex-suite-polish-v020
started_at: 2026-05-02T04:45-03:00
target_version: v0.20.0
status: in_progress
---

## Tópico
Polish da Suite Agente Nex (v0.20.0): Whisper tokens + linha total destaque + Y-axis 0/menor que zero + donut tamanho/fonte + prompt editável + agente menos prolixo + remover botão Chatwoot atalho + identidade fixa explicação + idioma fora do componente + maximizar centro + chaves botão padrão + lógica condicional + logos provedores SVG.

## Arquivos que provavelmente vou tocar
- src/app/api/nex/transcribe/route.ts (Whisper verbose_json/usage)
- src/lib/llm/agent/usage-logger.ts + pricing.ts (Whisper tokens audio in/out)
- src/components/llm/consumo-content.tsx (linha total destaque + table)
- src/components/charts/area-chart.tsx, bar-chart.tsx (Y-axis "menor que zero" mode)
- src/components/charts/donut-with-center.tsx (tamanho + fonte)
- src/components/agente-nex/prompt-preview-card.tsx (editável + maximizar dialog centro + idioma layout)
- src/components/agente-nex/prompt-config-form.tsx (defaults personalidade/tom + identidade fixa explicação)
- src/components/agente-nex/kb-section.tsx (remover botão Chatwoot atalho)
- src/components/agente-nex/kb-upload-dialog.tsx (remover initialTab/initialValues — não usados sem o atalho)
- src/components/settings/llm-credentials-manager.tsx (botão único condicional + logos SVG)
- src/lib/llm/catalog.ts (logoUrl ou ícone por provider)
- src/lib/nex/prompt.ts (IDENTITY_BASE menos prolixa)

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.19.x → 0.20.0)
- CHANGELOG.md
- docs/STATUS.md
- prisma/schema.prisma (LlmUsage: tokens_input_audio + tokens_output_audio? ou estender com Whisper-specific)

## Arquivos NÃO posso tocar (outros agentes ativos)
- claude-conversas-v019: src/lib/actions/reports/conversas.ts, src/types/pg-format.d.ts, src/app/(protected)/relatorios/conversas/page.tsx (already modified by them locally)

## Decisões / contexto importante
- Workflow rigoroso: spec v1→v2→v3, plan v1→v2→v3, subagent-driven-development com TDD, ui-ux-pro-max em UI.
- Whisper tokens: OpenAI retorna tokens via `verbose_json` response_format do endpoint /v1/audio/transcriptions. Investigar.
- Y-axis "menor que zero": só ativa quando max value < 0.01 (1 centavo). Caso contrário, comportamento padrão (ticks normais).
- Maximizar prompt: Dialog modal centro (não Sheet lateral). Backdrop blur. Conteúdo scrolável.
- Editar prompt: botão "Editar" no card OR no dialog maximizado. Editar o quê? O override avançado já permite. Mas user quer editar o IDENTITY_BASE? Se sim, vai contra blindagem. Decidir na spec.
- Logos SVG: buscar publicly disponíveis no GitHub (simple-icons) ou usar lucide com customização. Provavelmente simple-icons via CDN ou bundle.
- IDENTITY_BASE "atual" tá prolixa demais — agente fica explicando demais, citando Dashboard summary, tools, fonte. Reduzir radicalmente.

## Bloqueios
- (vazio)
