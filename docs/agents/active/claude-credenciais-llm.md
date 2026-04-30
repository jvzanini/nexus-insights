---
agent: claude-credenciais-llm
started_at: 2026-04-30T20:30-03:00
target_version: v0.12.0
status: in_progress
---

## Tópico
v0.12.0: (1) Renomear "Agente IA" → "Agente Nex", (2) separar credenciais (API
keys) da config ativa com CRUD por provider, (3) custo BRL no consumo + 4 casas
decimais mínimas + cotação USD→BRL cartão capturada por chamada.

## Arquivos que provavelmente vou tocar
- prisma/schema.prisma (LlmCredential novo + ajustes LlmConfig/LlmUsage)
- src/lib/llm/ensure-tables.ts (CREATE TABLE llm_credentials + ALTER)
- src/lib/llm/get-active-config.ts (JOIN com credentials)
- src/lib/llm/get-client.ts
- src/lib/llm/credentials.ts (NOVO — CRUD)
- src/lib/llm/exchange-rate.ts (NOVO — USD→BRL cache 4h)
- src/lib/llm/queries/usage-stats.ts (BRL nos agregados)
- src/lib/llm/agent/usage-logger.ts (registrar cost_brl + rate)
- src/lib/llm/agent/run-nex.ts (mensagem de erro)
- src/lib/actions/llm-config.ts (saveLlmConfig contrato novo)
- src/lib/actions/llm-credentials.ts (NOVO)
- src/lib/actions/exchange-rate.ts (NOVO — get rate + set spread)
- src/components/settings/llm-config-card.tsx (renomear + simplificar)
- src/components/settings/llm-credentials-card.tsx (NOVO)
- src/components/llm/consumo-content.tsx (KPI BRL + colunas + formatadores)
- src/app/(protected)/configuracoes/page.tsx (mount card novo)
- src/app/(protected)/configuracoes/consumo/page.tsx (renomear título)

## Arquivos compartilhados que VOU modificar
- package.json (bump versão para v0.12.0)
- CHANGELOG.md (entrada da release)
- prisma/schema.prisma (nova tabela)
- docs/STATUS.md (se aplicável no fim da release)

## Decisões / contexto importante
- Usuário pediu autonomia total ("vai meticulosamente"). Workflow completo
  (spec/plan/sub-agents) mas sem aprovação intermediária do humano.
- Approach escolhido: tabela `llm_credentials` separada; `llm_configs` mantém
  marcação de "config ativa" (provider + model + credential_id), sem armazenar
  encrypted_api_key direto. Migração one-shot via `ensureLlmTables`.
- Visualmente: renomear "Agente IA (Nex)" → "Agente Nex" no card principal e
  todos os call-sites ("Consumo do Agente IA", erro "Vá em Configurações →
  Agente IA (Nex)").

## Bloqueios
- (vazio)
