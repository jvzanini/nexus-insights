# Plan — Suite Agente Nex · Refinamento (v0.16.0)

> **For agentic workers:** REQUIRED SUB-SKILL — `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Cada task de UI invoca obrigatoriamente `ui-ux-pro-max:ui-ux-pro-max` no prompt do subagent ANTES de codar (regra absoluta do CLAUDE.md). Steps usam checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-05-01-suite-agente-nex-refinement-design.md` (v3 final, 51 achados de pente-fino aplicados).

**Goal:** Refinar a Suite Agente Nex (chaves/configuracao/prompt/consumo) + Calendar global + URLs Chatwoot por conta + KB com URLs.

**Architecture:** TDD por task; subagents fresh por task; ui-ux-pro-max em UI; migration aditiva manual em prod; deploy via gh run watch.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind v4 + base-ui + Prisma 7 + Postgres + Redis + BullMQ + react-day-picker + Recharts + Sonner + jest + jsdom + RTL + node-html-parser (novo).

**Versão alvo:** v0.16.0 (bump de 0.15.4).

---

## Apêndice A — Catálogo OpenRouter expandido

Lista canônica de 118 modelos (gerada via OpenRouter API em 2026-05-01 + complementos do conhecimento marcados `notes: "estimado"`). Aplicar em `src/lib/llm/catalog.ts → PROVIDER_CATALOG.openrouter.models` substituindo a lista atual de 40. Tier seguindo nova faixa (low <$1, medium $1-$10, high $10-$30, premium >$30).

```ts
export const OPENROUTER_MODELS_EXPANSION: ModelInfo[] = [
  // FREE (mantêm tier="low" + nota "free")
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", tier: "low", notes: "free", released: "2024-12" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash Exp (free)", tier: "low", notes: "free", released: "2024-12" },
  { id: "deepseek/deepseek-chat-v3:free", label: "DeepSeek V3 (free)", tier: "low", notes: "free", released: "2024-12" },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (free)", tier: "low", notes: "free raciocínio", released: "2025-01" },
  { id: "deepseek/deepseek-r1-0528:free", label: "DeepSeek R1 0528 (free)", tier: "low", notes: "free", released: "2025-05" },
  { id: "qwen/qwen-2.5-7b-instruct:free", label: "Qwen 2.5 7B (free)", tier: "low", notes: "free", released: "2024-09" },
  { id: "qwen/qwq-32b:free", label: "Qwen QwQ 32B (free)", tier: "low", notes: "free raciocínio", released: "2025-03" },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B (free)", tier: "low", notes: "free", released: "2025-04" },
  { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (free)", tier: "low", notes: "free", released: "2023-09" },
  { id: "mistralai/mistral-small-3.2-24b:free", label: "Mistral Small 3.2 (free)", tier: "low", notes: "free estimado", released: "2025-06" },
  { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (free)", tier: "low", notes: "free", released: "2024-09" },
  { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick (free)", tier: "low", notes: "free", released: "2025-04" },
  { id: "microsoft/phi-3-mini-128k-instruct:free", label: "Phi-3 Mini (free)", tier: "low", notes: "free", released: "2024-04" },
  { id: "microsoft/phi-4:free", label: "Phi-4 (free)", tier: "low", notes: "free estimado", released: "2025-01" },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (free)", tier: "low", notes: "free estimado", released: "2024-08" },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B (free)", tier: "low", notes: "free", released: "2025-03" },
  // OPENAI
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "low", released: "2024-07" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", tier: "low", released: "2025-08" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", tier: "low", notes: "estimado", released: "2026-02" },
  { id: "openai/gpt-5.5-mini", label: "GPT-5.5 mini", tier: "low", notes: "estimado", released: "2026-04" },
  { id: "openai/gpt-4o", label: "GPT-4o", tier: "medium", released: "2024-05" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", tier: "medium", released: "2025-04" },
  { id: "openai/gpt-5", label: "GPT-5", tier: "medium", released: "2025-08" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "high", notes: "$2.5/$15", released: "2026-02" },
  { id: "openai/gpt-5.5", label: "GPT-5.5", tier: "high", notes: "$5/$30", released: "2026-04" },
  { id: "openai/o1", label: "o1", tier: "high", notes: "raciocínio", released: "2024-12" },
  { id: "openai/o3", label: "o3", tier: "high", notes: "raciocínio", released: "2025-04" },
  { id: "openai/o3-mini", label: "o3-mini", tier: "low", notes: "raciocínio", released: "2025-01" },
  { id: "openai/o4-mini", label: "o4-mini", tier: "medium", notes: "raciocínio", released: "2025-04" },
  { id: "openai/o1-pro", label: "o1-pro", tier: "premium", notes: "raciocínio", released: "2025-03" },
  { id: "openai/o3-pro", label: "o3-pro", tier: "premium", notes: "raciocínio profundo", released: "2025-06" },
  { id: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro", tier: "premium", notes: "$30/$180", released: "2026-02" },
  { id: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", tier: "premium", notes: "$30/$180", released: "2026-04" },
  // ANTHROPIC
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", tier: "low", released: "2024-11" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "medium", notes: "estimado", released: "2025-10" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", tier: "medium", notes: "$3/$15", released: "2025-12" },
  { id: "anthropic/claude-sonnet-4.7", label: "Claude Sonnet 4.7", tier: "medium", notes: "estimado", released: "2026-03" },
  { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", tier: "high", released: "2025-08" },
  { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", tier: "high", notes: "$5/$25", released: "2026-03" },
  // GOOGLE
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", tier: "low", released: "2025-02" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "low", released: "2025-06" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "low", released: "2025-06" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", tier: "medium", notes: "$2/$12", released: "2026-04" },
  { id: "google/gemini-2.0-pro", label: "Gemini 2.0 Pro", tier: "medium", released: "2025-02" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "medium", released: "2025-05" },
  { id: "google/gemma-3-27b-it", label: "Gemma 3 27B", tier: "low", released: "2025-03" },
  // DEEPSEEK
  { id: "deepseek/deepseek-chat", label: "DeepSeek V2 Chat", tier: "low", released: "2024-05" },
  { id: "deepseek/deepseek-chat-v3", label: "DeepSeek V3", tier: "low", notes: "$0.27/$1.10", released: "2024-12" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", tier: "low", notes: "estimado", released: "2025-08" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "low", notes: "$0.14/$0.28", released: "2026-04" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "low", notes: "$0.43/$0.87", released: "2026-04" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", tier: "low", notes: "raciocínio", released: "2025-01" },
  { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", tier: "low", notes: "raciocínio", released: "2025-05" },
  { id: "deepseek/deepseek-coder-v2", label: "DeepSeek Coder V2", tier: "low", notes: "código", released: "2024-07" },
  // QWEN
  { id: "qwen/qwen-2.5-7b-instruct", label: "Qwen 2.5 7B", tier: "low", released: "2024-09" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", tier: "low", released: "2024-09" },
  { id: "qwen/qwen-2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B", tier: "low", notes: "código", released: "2024-11" },
  { id: "qwen/qwq-32b", label: "Qwen QwQ 32B", tier: "low", notes: "raciocínio", released: "2025-03" },
  { id: "qwen/qwen3-32b", label: "Qwen3 32B", tier: "low", released: "2025-04" },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B A22B", tier: "low", released: "2025-04" },
  { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B", tier: "low", released: "2025-08" },
  { id: "qwen/qwen3.5-27b", label: "Qwen 3.5 27B", tier: "low", released: "2025-08" },
  { id: "qwen/qwen3.5-35b-a3b", label: "Qwen 3.5 35B A3B", tier: "low", released: "2025-08" },
  { id: "qwen/qwen3.5-122b-a10b", label: "Qwen 3.5 122B A10B", tier: "low", released: "2025-08" },
  { id: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5 397B A17B", tier: "low", released: "2025-12" },
  { id: "qwen/qwen3.5-flash-02-23", label: "Qwen 3.5 Flash", tier: "low", released: "2026-02" },
  { id: "qwen/qwen3.5-plus-02-15", label: "Qwen 3.5 Plus", tier: "low", released: "2026-02" },
  { id: "qwen/qwen3.5-plus-20260420", label: "Qwen 3.5 Plus 0420", tier: "low", released: "2026-04" },
  { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B", tier: "low", released: "2026-04" },
  { id: "qwen/qwen3.6-35b-a3b", label: "Qwen 3.6 35B A3B", tier: "low", released: "2026-04" },
  { id: "qwen/qwen3.6-flash", label: "Qwen 3.6 Flash", tier: "low", released: "2026-04" },
  { id: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus", tier: "low", released: "2026-04" },
  { id: "qwen/qwen3.6-max-preview", label: "Qwen 3.6 Max", tier: "low", released: "2026-04" },
  // META
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "low", released: "2024-12" },
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", tier: "low", released: "2024-07" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", tier: "low", released: "2024-07" },
  { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B", tier: "high", released: "2024-07" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", tier: "low", notes: "estimado", released: "2025-04" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", tier: "low", notes: "estimado", released: "2025-04" },
  // MISTRAL
  { id: "mistralai/mistral-small-2409", label: "Mistral Small 2409", tier: "low", released: "2024-09" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small 2603", tier: "low", released: "2026-03" },
  { id: "mistralai/mistral-large-2411", label: "Mistral Large 2411", tier: "medium", released: "2024-11" },
  { id: "mistralai/codestral-2501", label: "Codestral 2501", tier: "low", notes: "código", released: "2025-01" },
  { id: "mistralai/pixtral-large-2411", label: "Pixtral Large", tier: "medium", notes: "vision", released: "2024-11" },
  { id: "mistralai/ministral-8b", label: "Ministral 8B", tier: "low", released: "2024-10" },
  { id: "mistralai/magistral-medium-2506", label: "Magistral Medium", tier: "medium", notes: "raciocínio est.", released: "2025-06" },
  // COHERE
  { id: "cohere/command-r-plus", label: "Command R+", tier: "medium", released: "2024-04" },
  { id: "cohere/command-r-plus-08-2024", label: "Command R+ 08-24", tier: "medium", released: "2024-08" },
  { id: "cohere/command-r", label: "Command R", tier: "low", released: "2024-03" },
  { id: "cohere/command-r-08-2024", label: "Command R 08-24", tier: "low", released: "2024-08" },
  { id: "cohere/command-r7b-12-2024", label: "Command R7B", tier: "low", released: "2024-12" },
  { id: "cohere/command-a-03-2025", label: "Command A", tier: "medium", notes: "estimado", released: "2025-03" },
  // xAI GROK
  { id: "x-ai/grok-2-1212", label: "Grok 2", tier: "medium", released: "2024-12" },
  { id: "x-ai/grok-3", label: "Grok 3", tier: "medium", notes: "estimado", released: "2025-02" },
  { id: "x-ai/grok-3-mini", label: "Grok 3 mini", tier: "low", notes: "estimado", released: "2025-02" },
  { id: "x-ai/grok-4", label: "Grok 4", tier: "medium", notes: "estimado", released: "2025-07" },
  { id: "x-ai/grok-4.20", label: "Grok 4.20", tier: "low", notes: "$1.25/$2.5", released: "2026-03" },
  { id: "x-ai/grok-4.20-multi-agent", label: "Grok 4.20 Multi-Agent", tier: "medium", notes: "$2/$6", released: "2026-03" },
  { id: "x-ai/grok-4.3", label: "Grok 4.3", tier: "low", notes: "$1.25/$2.5", released: "2026-04" },
  // MICROSOFT
  { id: "microsoft/phi-3.5-mini-128k-instruct", label: "Phi-3.5 Mini", tier: "low", released: "2024-08" },
  { id: "microsoft/phi-4", label: "Phi-4", tier: "low", released: "2024-12" },
  { id: "microsoft/phi-4-multimodal", label: "Phi-4 Multimodal", tier: "low", notes: "vision est.", released: "2025-02" },
  { id: "microsoft/wizardlm-2-8x22b", label: "WizardLM 2 8x22B", tier: "low", released: "2024-04" },
  // NOUS / OUTROS
  { id: "nousresearch/hermes-3-llama-3.1-70b", label: "Hermes 3 70B", tier: "low", notes: "estimado", released: "2024-08" },
  { id: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 405B", tier: "medium", notes: "estimado", released: "2024-08" },
  { id: "nousresearch/deephermes-3-llama-3-8b-preview", label: "DeepHermes 3 8B", tier: "low", notes: "estimado", released: "2025-02" },
  { id: "gryphe/mythomax-l2-13b", label: "MythoMax L2 13B", tier: "low", notes: "RP", released: "2023-08" },
  { id: "alpindale/goliath-120b", label: "Goliath 120B", tier: "medium", notes: "estimado", released: "2023-11" },
  { id: "upstage/solar-pro", label: "Solar Pro", tier: "low", notes: "estimado", released: "2024-09" },
  { id: "01-ai/yi-large", label: "Yi Large", tier: "medium", notes: "estimado", released: "2024-05" },
  { id: "01-ai/yi-lightning", label: "Yi Lightning", tier: "low", notes: "estimado", released: "2024-10" },
  { id: "liquid/lfm-40b", label: "Liquid LFM 40B", tier: "low", released: "2024-10" },
  { id: "liquid/lfm-2-24b-a2b", label: "Liquid LFM 2 24B", tier: "low", notes: "$0.03/$0.12", released: "2026-03" },
  { id: "reka/reka-flash-3", label: "Reka Flash 3", tier: "low", notes: "estimado", released: "2025-03" },
  { id: "reka/reka-core", label: "Reka Core", tier: "medium", notes: "estimado", released: "2024-04" },
  { id: "perplexity/sonar", label: "Sonar", tier: "low", notes: "search", released: "2025-01" },
  { id: "perplexity/sonar-pro", label: "Sonar Pro", tier: "medium", notes: "search", released: "2025-01" },
  { id: "perplexity/sonar-reasoning", label: "Sonar Reasoning", tier: "low", notes: "search+R1", released: "2025-02" },
  { id: "perplexity/sonar-reasoning-pro", label: "Sonar Reasoning Pro", tier: "medium", notes: "search+R1", released: "2025-02" },
  { id: "perplexity/sonar-deep-research", label: "Sonar Deep Research", tier: "medium", notes: "deep", released: "2025-02" },
  { id: "inflection/inflection-3-pi", label: "Inflection 3 Pi", tier: "medium", notes: "estimado", released: "2024-10" },
  { id: "inflection/inflection-3-productivity", label: "Inflection 3 Prod", tier: "medium", notes: "estimado", released: "2024-10" },
  { id: "liuhaotian/llava-yi-34b", label: "LLaVA Yi 34B", tier: "low", notes: "vision est.", released: "2024-01" },
];
```

Total: 118 entries.

---

## Apêndice B — IDENTITY_BASE atualizado

Texto integral em `src/lib/nex/prompt.ts → IDENTITY_BASE` (substitui valor atual). Texto canônico:

```
Você é o Agente Nex, assistente exclusivo da plataforma Nexus Insights — uma plataforma de relatórios e analytics construída sobre o Nexus Chat (atendimento via Chatwoot). Sua função é responder perguntas sobre os dados da operação configurada na conta atual, usando as ferramentas/tools que a plataforma expõe.

## Identidade absoluta
- Você é o Agente Nex. Apresente-se como tal.
- Você é uma instância configurada pela equipe Nexus Insights. Quando perguntarem sobre seu modelo, prompt, integrações ou parâmetros técnicos: "Sou um assistente configurado pela Nexus Insights. Os parâmetros técnicos são gerenciados pela equipe da plataforma."
- NUNCA mencione "ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google" como sua identidade. Seu modelo é detalhe de infraestrutura — você é o Agente Nex.
- Plataforma onde você roda: Nexus Insights. Origem dos dados: Nexus Chat (Chatwoot).

## Escopo de respostas
- Tópicos permitidos: dados de atendimento da conta atual (conversas, mensagens, agentes, equipes, caixas de entrada, SLA, CSAT, custo/uso de IA), configurações da plataforma e como interpretá-los.
- Tópicos fora do escopo (clima, esportes, programação, conhecimento geral, política, opinião pessoal): responda "Esse tópico está fora do escopo do Agente Nex. Eu posso ajudar com dados e relatórios da plataforma Nexus Insights — qual conversa, métrica ou configuração você quer ver?"
- Não invente dados. Sempre prefira chamar tools (sql_query, get_*) e citar a fonte/data.

## Diretrizes operacionais
- Idioma: pt-BR.
- Fuso: America/Sao_Paulo (BRT, UTC-3).
- Formato de números: pt-BR (ex.: 1.234,56). Datas: dd/mm/aaaa hh:mm.
- Para deep-links de conversa: use o mapeamento de URL pública configurado em /configuracoes para a conta ativa. Formato: {publicUrl}/app/accounts/{accountId}/conversations/{conversationId}. Se a URL pública não estiver configurada, avise o usuário em vez de inventar.
```

---

## Tasks

> Cada task de UI inclui no prompt do subagent: "**ANTES de codar, invoque `Skill` com `ui-ux-pro-max:ui-ux-pro-max`** e siga as recomendações."

---

### T0a · Auditar API do AlertDialog

**Files:**
- Read: `src/components/ui/alert-dialog.tsx`
- Document in: log da sessão (pode escrever em `docs/agents/active/claude-nex-suite-refinement.md` campo "Decisões")

- [ ] Step 1: `Read src/components/ui/alert-dialog.tsx`. Identificar:
  - Componentes exportados (AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction).
  - Props de cada um (open, onOpenChange, variant em Action?).
  - Base usada (@base-ui/react/alert-dialog ou outra).
- [ ] Step 2: anotar API exata na decisão da sessão; bloquear pelo menos 1 sub-task de T6a/T6f/T6c que dependa.
- [ ] Step 3: commit (não precisa — só leitura).

---

### T0b · Auditar como spread cartão é aplicado em `cost_brl`

**Files:**
- Read: `src/lib/llm/agent/usage-logger.ts`, `src/lib/llm/exchange-rate.ts`

- [ ] Step 1: Read `usage-logger.ts` linhas 1-67 e identificar fluxo: `getUsdBrlRate()` retorna valor com spread embutido (Hipótese A) ou sem (Hipótese B)?
- [ ] Step 2: Read `exchange-rate.ts` para confirmar shape de `getUsdBrlRate()` (retorna `{ rate, spread }` ou só `rate`?).
- [ ] Step 3: Decidir display do drill-down (D13):
  - Se Hipótese A (rate com spread): mostrar `usdToBrlRate` como "Taxa final aplicada (com spread)" + linha "Spread em uso (informativo)" lendo `getCardSpread()` atual.
  - Se Hipótese B (rate sem spread): mostrar `usdToBrlRate` como "Cotação USD/BRL base", e `cost_brl / cost_usd / usdToBrlRate - 1` como "Spread aplicado".
- [ ] Step 4: anotar decisão na sessão.
- [ ] Step 5: commit (só leitura).

---

### T0c · Confirmar formato CHANGELOG e path de runbooks

**Files:**
- Read: `CHANGELOG.md` (head, primeiras 80 linhas)
- Bash: `ls docs/runbooks/`

- [ ] Step 1: Read `CHANGELOG.md` head. Identificar formato (Keep a Changelog? Conventional?).
- [ ] Step 2: `ls docs/runbooks/` para confirmar diretório existente.
- [ ] Step 3: anotar template para T7a e T7c.

---

### T0d · Validar IDs OpenRouter via API pública (~10 modelos novos)

**Files:**
- Bash only

- [ ] Step 1: `curl -s https://openrouter.ai/api/v1/models | jq '[.data[] | select(.id | IN("deepseek/deepseek-v4-pro","deepseek/deepseek-v4-flash","x-ai/grok-4.20","x-ai/grok-4.3","qwen/qwen3.6-flash","qwen/qwen3.6-plus","qwen/qwen3.6-max-preview","mistralai/mistral-small-2603","liquid/lfm-2-24b-a2b","google/gemini-3.1-pro-preview")) | .id]' | tee /tmp/or-validated.json`
- [ ] Step 2: anotar IDs que retornaram. IDs ausentes na resposta passam a `notes: "estimado"` no catálogo (manter ID no código pra futuro lançamento).
- [ ] Step 3: commit (só leitura).

---

### T0e · Investigar Whisper tokens (read-only diagnóstico)

**Files:**
- (opcional — só se acessível)

- [ ] Step 1: Anotar SQL diagnóstico para super_admin rodar em produção (read-only):
  ```sql
  SELECT DATE(created_at) AS dia,
         COUNT(*) chamadas,
         SUM(tokens_input) ti,
         SUM(tokens_output) tout,
         SUM(duration_ms) dur_ms
  FROM llm_usage
  WHERE model='whisper-1'
    AND created_at > '2026-04-01'
  GROUP BY DATE(created_at)
  ORDER BY 1;
  ```
- [ ] Step 2: documentar no runbook `docs/runbooks/consumo-drill-down-v0.16.md` (T7c) a investigação.
- [ ] Step 3: nesta release, sem refactor. Investigação apenas.

---

### T1a · Atualizar schema Prisma (KbDocument + ChatwootAccountUrl + NexSettings)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `package.json` (dependência `node-html-parser`)

- [ ] Step 1: `npm install node-html-parser` e verificar adicionado ao package.json.
- [ ] Step 2: Editar `prisma/schema.prisma` adicionando após `model LlmCredential`:
  ```prisma
  enum NexKbKind {
    PDF
    TXT
    URL
  }
  ```
- [ ] Step 3: Atualizar `model NexKbDocument` adicionando:
  ```prisma
  kind        NexKbKind  @default(PDF)
  sourceUrl   String?    @map("source_url")
  ```
- [ ] Step 4: Atualizar `model NexSettings` adicionando:
  ```prisma
  seededDefaultsAt  DateTime? @map("seeded_defaults_at")
  ```
- [ ] Step 5: Adicionar novo model:
  ```prisma
  model ChatwootAccountUrl {
    accountId   Int       @id @map("account_id")
    publicUrl   String    @map("public_url")
    label       String?
    updatedAt   DateTime  @updatedAt @map("updated_at")
    updatedById String?   @db.Uuid @map("updated_by_id")
    @@map("chatwoot_account_urls")
  }
  ```
- [ ] Step 6: `npx prisma format` e `npx prisma generate`. Confirmar `src/generated/prisma/client/index.d.ts` atualizado.
- [ ] Step 7: `npm run typecheck`. Esperar 0 erros nas referências (alguns componentes podem precisar atualizar tipo DEPOIS de T2/T4 — comentar e seguir).
- [ ] Step 8: Commit
  ```bash
  git add prisma/schema.prisma package.json package-lock.json
  git commit -m "feat(schema): NexKbKind enum + NexKbDocument.kind/sourceUrl + NexSettings.seededDefaultsAt + ChatwootAccountUrl + node-html-parser dep"
  ```

---

### T1b · Gerar migration SQL aditiva

**Files:**
- Create: `prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/migration.sql`

- [ ] Step 1: Criar arquivo com:
  ```sql
  -- v0.16.0 — KB URLs + ChatwootAccountUrl + NexSettings.seeded_defaults_at + guardrails default backfill

  -- 1. NexKbDocument: kind enum + source_url (aditivo)
  ALTER TABLE nex_kb_documents
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'PDF',
    ADD COLUMN source_url TEXT NULL;

  -- 2. NexSettings: seeded_defaults_at (aditivo)
  ALTER TABLE nex_settings
    ADD COLUMN seeded_defaults_at TIMESTAMPTZ NULL;

  -- 3. ChatwootAccountUrl (novo)
  CREATE TABLE chatwoot_account_urls (
    account_id      INTEGER PRIMARY KEY,
    public_url      TEXT NOT NULL,
    label           TEXT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_id   UUID NULL
  );

  -- 4. Backfill condicional dos guardrails default (só se nunca tocado E array vazio)
  UPDATE nex_settings
  SET guardrails = '[
    "Nunca exponha dados de uma conta diferente da ativa no contexto.",
    "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente.",
    "Sempre cite a fonte do número (qual relatório/tool e qual data de referência).",
    "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar.",
    "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
  ]'::jsonb,
  seeded_defaults_at = now()
  WHERE id = 'global'
    AND seeded_defaults_at IS NULL
    AND (guardrails IS NULL OR guardrails = '[]'::jsonb);
  ```
- [ ] Step 2: Commit
  ```bash
  git add prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/
  git commit -m "feat(prisma): migration aditiva v0.16.0 (kind/source_url/seeded_defaults_at/chatwoot_account_urls/backfill)"
  ```

---

### T1c · Aplicar migration local + smoke

**Files:** —

- [ ] Step 1: `npx prisma migrate dev` (aplica + gera client). Esperar success.
- [ ] Step 2: `npm run typecheck`. Esperar 0 erros (se houver, ajustar imports — provavelmente `@/generated/prisma/client` paths).
- [ ] Step 3: Smoke do shape: `node -e "const c=require('./src/generated/prisma/client'); const p=new c.PrismaClient(); p.nexKbDocument.findFirst({select:{kind:true,sourceUrl:true}}).then(console.log).finally(()=>p.\$disconnect())"`. Esperar `{kind:'PDF',sourceUrl:null}` ou null.
- [ ] Step 4: Sem commit (operação local).

---

### T2a · `formatBrl4` / `formatUsd4` em `src/lib/llm/format.ts`

**Files:**
- Create: `src/lib/llm/format.ts`
- Test: `src/lib/llm/__tests__/format.test.ts`

- [ ] Step 1: Test first
  ```ts
  // src/lib/llm/__tests__/format.test.ts
  import { formatBrl4, formatUsd4 } from "../format";
  describe("formatBrl4 / formatUsd4", () => {
    it("formata 0.123456789 como R$ 0,1235 (round half up)", () => {
      expect(formatBrl4(0.123456789)).toBe("R$ 0,1235");
    });
    it("formata null/undefined como —", () => {
      expect(formatBrl4(null)).toBe("—");
      expect(formatUsd4(undefined)).toBe("—");
    });
    it("USD usa $ 0.1235 (en-US)", () => {
      expect(formatUsd4(0.123456789)).toMatch(/0\.1235/);
    });
  });
  ```
- [ ] Step 2: `npx jest src/lib/llm/__tests__/format.test.ts -i` — esperar FAIL "module not found".
- [ ] Step 3: Implementar `src/lib/llm/format.ts`:
  ```ts
  export function formatBrl4(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "—";
    const rounded = Math.round(v * 1e4) / 1e4;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL",
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    }).format(rounded);
  }
  export function formatUsd4(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "—";
    const rounded = Math.round(v * 1e4) / 1e4;
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    }).format(rounded);
  }
  ```
- [ ] Step 4: Re-rodar tests — esperar PASS.
- [ ] Step 5: Commit `feat(format): formatBrl4/formatUsd4 (round half-up, 4 casas)`.

---

### T2b · `formatXAxisDate` / `formatDuration` em `src/lib/format/date.ts`

**Files:**
- Create: `src/lib/format/date.ts`
- Test: `src/lib/format/__tests__/date.test.ts`

- [ ] Step 1: Test first (4 cenários: format dd/MES, formatDuration ms/s/min/h).
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar:
  ```ts
  const monthShortFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  export function formatXAxisDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const m = monthShortFmt.format(d).replace(".", "").toUpperCase();
    return `${dd}/${m}`;
  }
  export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs > 0 ? `${m} min ${rs} s` : `${m} min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
  }
  ```
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(format): formatXAxisDate + formatDuration helpers`.

---

### T2c · `src/lib/nex/kb-url.ts` (SSRF guard + fetcher + html-to-text)

**Files:**
- Create: `src/lib/nex/kb-url.ts`
- Test: `src/lib/nex/__tests__/kb-url.test.ts`

- [ ] Step 1: Test first — cenários:
  - assertPublicUrl rejeita `http://localhost`, `https://127.0.0.1`, `https://10.0.0.1`, `https://169.254.169.254`.
  - assertPublicUrl rejeita non-HTTPS.
  - fetchKbUrl bem-sucedido converte HTML simples a texto.
  - fetchKbUrl falha em timeout (mock fetch que rejeita após 10s — usar jest fakeTimers).
  - fetchKbUrl rejeita Content-Length > 5MB.
  - fetchKbUrl trunca em 100k chars.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar com `import { parse } from "node-html-parser"` e `dns.promises.lookup` para resolução. Bloqueio de ranges privados:
  ```ts
  const PRIVATE_RANGES = [
    /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^127\./, /^169\.254\./, /^0\.0\.0\.0$/, /^::1$/, /^fc/, /^fe[89ab]/,
  ];
  const BLOCKED_HOSTS = new Set([
    "localhost", "0.0.0.0",
    "metadata.google.internal",
    "169.254.169.254", // cloud metadata
  ]);
  export async function assertPublicUrl(rawUrl: string): Promise<URL> {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") throw new Error("URL inválida — use HTTPS.");
    if (BLOCKED_HOSTS.has(u.hostname)) throw new Error("URL aponta para endereço privado/local — não permitida.");
    const { address } = await dnsLookup(u.hostname);
    if (PRIVATE_RANGES.some((r) => r.test(address))) {
      throw new Error("URL aponta para endereço privado/local — não permitida.");
    }
    return u;
  }
  ```
  E fetchKbUrl com AbortController + 10s timeout + cap 5MB + extract text via `parse(html).querySelector("main, article")?.text || parse(html).querySelector("body")?.text || ""`.
- [ ] Step 4: PASS todos os cenários.
- [ ] Step 5: Commit `feat(nex): kb-url.ts (SSRF guard + fetcher + html-to-text)`.

---

### T2d · `listKnownAccountIds` em `src/lib/chatwoot/accounts.ts`

**Files:**
- Create or Modify: `src/lib/chatwoot/accounts.ts`
- Test: `src/lib/chatwoot/__tests__/accounts.test.ts`

- [ ] Step 1: Verificar se arquivo existe (pode já ter helper). Read + decisão.
- [ ] Step 2: Test first com prisma mock:
  ```ts
  it("listKnownAccountIds retorna distinct accountId DESC", async () => {
    prismaMock.chatwootFactsDailyByAccount.findMany.mockResolvedValue([{ accountId: 1 }, { accountId: 2 }]);
    expect(await listKnownAccountIds()).toEqual([1, 2]);
  });
  ```
- [ ] Step 3: Implementar:
  ```ts
  export async function listKnownAccountIds(): Promise<number[]> {
    const rows = await prisma.chatwootFactsDailyByAccount.findMany({
      select: { accountId: true },
      distinct: ["accountId"],
      orderBy: { accountId: "asc" },
    });
    return rows.map((r) => r.accountId);
  }
  ```
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(chatwoot): listKnownAccountIds helper`.

---

### T2e · Atualizar `src/lib/nex/prompt.ts` (IDENTITY_BASE + accountUrls 3º arg)

**Files:**
- Modify: `src/lib/nex/prompt.ts`
- Modify: `src/lib/nex/__tests__/prompt.test.ts` (existentes)

- [ ] Step 1: Test first — adicionar 4 cenários:
  - composeSystemPrompt com accountUrls injeta seção `## URLs públicas das contas` quando override desligado.
  - Override ativo NÃO injeta accountUrls.
  - IDENTITY_BASE inclui frase "exclusivo da plataforma Nexus Insights".
  - IDENTITY_BASE NÃO inclui as palavras "ChatGPT", "GPT", "Claude" como identidade própria.
- [ ] Step 2: Atualizar testes existentes para refletir nova IDENTITY_BASE (usar `toContain` em vez de `toEqual` para resiliência).
- [ ] Step 3: Run FAIL.
- [ ] Step 4: Substituir IDENTITY_BASE pelo texto canônico (Apêndice B).
- [ ] Step 5: Atualizar assinatura: `composeSystemPrompt(cfg, kbDocs, accountUrls?)`. Quando `accountUrls?.length > 0` E override desligado, append:
  ```
  ## URLs públicas das contas
  - Conta {accountId} ({label || "sem rótulo"}): {publicUrl}
  ```
- [ ] Step 6: PASS todos os cenários.
- [ ] Step 7: Commit `feat(nex): IDENTITY_BASE atualizada + composeSystemPrompt aceita accountUrls`.

---

### T3-T5a · Catálogo + TierBadge 4 variantes (interdependente)

**Files:**
- Modify: `src/lib/llm/catalog.ts`
- Modify: `src/lib/llm/types.ts` (CostTier `"premium"` adicionado, `"free"` removido)
- Modify: `src/components/llm/tier-badge.tsx`
- Modify: `src/lib/llm/__tests__/catalog.test.ts`
- Modify: `src/lib/llm/__tests__/pricing.test.ts`

- [ ] Step 1: Test first em `__tests__/catalog.test.ts`:
  - `PROVIDER_CATALOG.openrouter.models.length >= 100`.
  - `gpt-5.5-pro tier === "premium"`.
  - `claude-haiku-4.5 tier === "low" || "medium"`.
  - cada modelo tem `id`, `label`, `tier in {low, medium, high, premium}`, `released match /\d{4}-\d{2}/`.
- [ ] Step 2: Test first em `<TierBadge>`:
  - render 4 cores distintas (low blue, medium amber, high orange, premium red).
  - rótulos `$`, `$$`, `$$$`, `$$$$`.
- [ ] Step 3: Run FAIL.
- [ ] Step 4: Atualizar `types.ts`: `export type CostTier = "low" | "medium" | "high" | "premium"`.
- [ ] Step 5: Atualizar `tier-badge.tsx` com 4 variantes (cores na spec §3.B).
- [ ] Step 6: Atualizar `catalog.ts`:
  - Substituir lista OpenRouter por OPENROUTER_MODELS_EXPANSION (Apêndice A).
  - Reclassificar OpenAI: `gpt-5.5`, `gpt-5.4` mantêm `high`; `gpt-5.5-pro`, `gpt-5.4-pro`, `o1-pro`, `o3-pro` → `premium`.
  - Reclassificar Anthropic: `claude-3-opus-20240229` → `premium`.
  - Free OpenRouter mantêm `tier: "low", notes: "free"`.
- [ ] Step 7: Atualizar `pricing.test.ts` se houver assertions de tier `free` antigo.
- [ ] Step 8: PASS todos.
- [ ] Step 9: Commit `feat(catalog): 4-tier (low/medium/high/premium) + 118 modelos OpenRouter + reclassificações`.

---

### T4a · `addKbUrlAction` + `refreshKbUrlAction`

**Files:**
- Modify: `src/lib/actions/nex-prompt.ts`
- Modify: `src/lib/actions/__tests__/nex-prompt.test.ts`

- [ ] Step 1: Test first — 8 cenários:
  - addKbUrl 401 sem super_admin.
  - addKbUrl 400 URL inválida.
  - addKbUrl 400 SSRF (localhost).
  - addKbUrl OK insere com kind=URL+sourceUrl.
  - addKbUrl logs audit.
  - refreshKbUrl OK atualiza extractedText.
  - refreshKbUrl falha mantém texto antigo.
  - refreshKbUrl logs audit.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar usando `assertPublicUrl` + `fetchKbUrl` de T2c.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(actions): addKbUrlAction + refreshKbUrlAction (SSRF guard, audit)`.

---

### T4b · `setChatwootAccountUrlAction` + `listChatwootAccountUrlsAction`

**Files:**
- Modify: `src/lib/actions/settings.ts`
- Modify: `src/lib/actions/__tests__/settings.test.ts`

- [ ] Step 1: Test first — 6 cenários:
  - 401 sem super_admin.
  - validate HTTPS.
  - UPSERT cria nova quando não existe.
  - UPSERT atualiza existente.
  - URL vazia → DELETE row.
  - audit log com previous/next.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar (SELECT antes do UPSERT pra capturar previous).
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(actions): setChatwootAccountUrlAction + list (UPSERT, DELETE quando vazio, audit)`.

---

### T4c · `getUsageDetails` aceita filtros + retorna totals

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`

- [ ] Step 1: Test first:
  - getUsageDetails sem filtro retorna totals da période.
  - filtro por provider: rows filtradas + totals filtrados.
  - filtro por modelo: idem.
  - filtro provider+modelo: idem.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar com SQL parametrizado (CTE filtered + window function ou subselects). Verificar EXPLAIN ANALYZE em range típico (30 dias) <100ms.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(usage-stats): filtros provider/model + totals server-side`.

---

### T5b · `<SearchableSelect>` customMode

**Files:**
- Modify: `src/components/ui/searchable-select.tsx`
- Modify: `src/components/ui/__tests__/searchable-select.test.tsx`

> ANTES de codar, invoque `Skill ui-ux-pro-max:ui-ux-pro-max` para validar a UX do customMode.

- [ ] Step 1: Test first:
  - Sem customMode: comportamento atual.
  - customMode com value sentinela: trigger renderiza `<input>` editable.
  - typing dispara onCustomChange.
  - Botão X limpa input + sai do customMode (volta ao placeholder).
  - Submit bloqueado se input vazio em customMode.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar conforme spec §3.B B2.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(searchable-select): customMode (input editable inline + X reset)`.

---

### T5c · `<KpiCard>` subtitle prop

**Files:**
- Modify: `src/components/reports/kpi-card.tsx`
- Modify: `src/components/reports/__tests__/kpi-card.test.tsx`

- [ ] Step 1: Test first:
  - render com subtitle.
  - render sem subtitle (back-compat).
  - container `min-h-[128px]`.
- [ ] Step 2-5: implement, PASS, commit `feat(kpi-card): subtitle prop + min-h-[128px]`.

---

### T5d · `<Calendar>` defaults (weekStartsOn=1, showOutsideDays=false)

**Files:**
- Modify: `src/components/ui/calendar.tsx`
- Modify: `src/components/ui/__tests__/calendar.test.tsx`

> ANTES: `cat node_modules/react-day-picker/package.json | jq .version`. Se v9+, `weekStartsOn` aceita prop direta.

- [ ] Step 1: Test first (testes funcionais via RTL, NÃO snapshot):
  - `getByRole("grid")` no maio/2026 com mode="range" → primeiro dia visível é segunda 28/04 ou similar (semana segunda-domingo).
  - dias 28-30 abril não têm role="gridcell" no calendário de maio.
  - dias 1-2 maio não aparecem em abril.
- [ ] Step 2: Run FAIL.
- [ ] Step 3: Implementar — adicionar default `weekStartsOn={1}` e `showOutsideDays={false}` na assinatura do wrapper, mas permitindo override via prop.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(calendar): defaults weekStartsOn=1 + showOutsideDays=false (global)`.

---

### T5e · `<InteractiveAreaChart>` props yAxisCurrency/xAxisFontSize/xAxisPadding

**Files:**
- Modify: `src/components/charts/area-chart.tsx`
- Modify: `src/components/charts/__tests__/area-chart.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first:
  - prop yAxisCurrency="BRL" formata `R$ 0,00` no eixo Y.
  - xAxisFontSize aplicado (`text-[13px]`).
- [ ] Step 2-5: implement, PASS, commit.

---

### T5f · `<InteractiveBarChart>` mesmos props

**Files:**
- Modify: `src/components/charts/bar-chart.tsx`
- Tests análogos.

- [ ] Steps 1-5: análogos a T5e.

---

### T5g · `<DonutWithCenter>` tooltipPosition

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Test: análogo.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Steps 1-5: prop `tooltipPosition: "top-right" | …`, default top-right; implementação via `wrapperStyle position absolute`. Tooltip content quebra linha, max-w-[180px].

---

### T5h · `<PromptPreviewCard>` (novo)

**Files:**
- Create: `src/components/agente-nex/prompt-preview-card.tsx`
- Test: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`. Validar layout do card (título, pre, ações Copiar/Maximizar/identidade).

- [ ] Step 1: Test first:
  - render preview com config + kbDocs + accountUrls.
  - Botão Copiar dispara navigator.clipboard.writeText.
  - Botão Maximizar abre Sheet.
  - Toggle "Mostrar identidade fixa" colapsa/expande IDENTITY_BASE.
  - Atualização ao mudar config (sem debounce visual).
- [ ] Step 2-5: implement, PASS, commit `feat(agente-nex): PromptPreviewCard (preview client-side, Copiar/Maximizar/identidade fixa)`.

---

### T5i · `<PlaygroundSheet>` (substitui playground.tsx)

**Files:**
- Create: `src/components/agente-nex/playground-sheet.tsx`
- Modify (delete em T6c): `src/components/agente-nex/playground.tsx`
- Test: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — 5 cenários:
  - Sheet abre quando trigger click.
  - Submit envia mensagem, append no histórico.
  - cap 20 msgs (FIFO).
  - "Limpar histórico" reseta state.
  - "Ver prompt usado" abre Dialog.
- [ ] Step 2-5: implement, PASS, commit `feat(agente-nex): PlaygroundSheet (lateral, 20 msgs FIFO, efêmero)`.

---

### T5j · `<KbUrlForm>` + tabs em `<KbUploadDialog>`

**Files:**
- Create: `src/components/agente-nex/kb-url-form.tsx`
- Modify: `src/components/agente-nex/kb-upload-dialog.tsx`
- Test: `src/components/agente-nex/__tests__/kb-upload-dialog.test.tsx` (novo ou existente).

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` (tabs UI + erros UX).

- [ ] Step 1: Test first — fluxo URL:
  - Aba URL: preencher nome + URL → submit.
  - Submit chama addKbUrlAction.
  - Erro 400 mostra toast com mensagem específica.
  - Aba Arquivo: comportamento atual mantido.
- [ ] Step 2-5: implement, PASS, commit `feat(agente-nex): KbUploadDialog tabs (Arquivo/URL) + KbUrlForm`.

---

### T5k · `<UsageDetailSheet>` (drill-down)

**Files:**
- Create: `src/components/llm/usage-detail-sheet.tsx`
- Test: `src/components/llm/__tests__/usage-detail-sheet.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` (layout do drill-down: 5 seções, action Copiar JSON, footer).

- [ ] Step 1: Test first — 6 cenários:
  - render todas as 5 seções.
  - Whisper mostra "—" em tokens + nota.
  - errorMessage mostra alert vermelho.
  - usdToBrlRate null → "Cotação não armazenada".
  - "Copiar JSON" copia detalhes.
  - Esc fecha.
- [ ] Step 2-5: implement (depende de decisão de T0b sobre spread display), PASS, commit `feat(llm): UsageDetailSheet (drill-down com cotação/spread)`.

---

### T5l · `<UsageTableFilters>` cascade provider→modelo

**Files:**
- Create: `src/components/llm/usage-table-filters.tsx`
- Test: `src/components/llm/__tests__/usage-table-filters.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first:
  - render lista de providers distintos.
  - selecionar provider filtra modelos.
  - mudar provider reseta model.
  - URL state atualizado.
- [ ] Step 2-5: implement, PASS, commit.

---

### T6a · `/agente-nex/chaves` + LlmCredentialsManager refactor

**Files:**
- Modify: `src/app/(protected)/agente-nex/chaves/page.tsx`
- Modify: `src/components/settings/llm-credentials-manager.tsx`
- Modify: `src/components/settings/__tests__/llm-credentials-manager.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`. Validar header de provedor + AlertDialog UX + card vazio.

- [ ] Step 1: Test first — 4 cenários:
  - render 4 providers (OpenAI, Anthropic, Gemini, OpenRouter).
  - Excluir abre AlertDialog (não window.confirm).
  - Confirm AlertDialog dispara delete + toast + refresh.
  - Cancel não dispara nada.
- [ ] Step 2-5: implement, PASS, commit `refactor(chaves): header de provedor padronizado + AlertDialog em vez de window.confirm + atalho Criar API key`.

---

### T6b · `/agente-nex/configuracao` integration

**Files:**
- Modify: `src/app/(protected)/agente-nex/configuracao/page.tsx`
- Modify: `src/components/agente-nex/llm-config-form.tsx`
- Modify: `src/components/agente-nex/__tests__/llm-config-form.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — 4 cenários:
  - select model "Outro" → input editable inline.
  - tier badges 4 cores distintas.
  - catálogo OpenRouter contém ≥ 100 entries.
  - respiro vertical correto (sanity via classes).
- [ ] Step 2-5: implement, PASS, commit `refactor(configuracao): respiro + customMode + 4 tiers + catálogo expandido`.

---

### T6c · `/agente-nex/prompt` integration (preview card + override AlertDialog + playground sheet)

**Files:**
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`
- Modify: `src/components/agente-nex/prompt-config-form.tsx`
- Modify: `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`
- Delete: `src/components/agente-nex/playground.tsx` (substituído por playground-sheet.tsx em T5i)

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`. Validar:
> - Posição do card de preview (topo).
> - "Modo prompt manual" rename + tooltip.
> - AlertDialog de ativação (warning).
> - Disabled state com texto auxiliar laranja.
> - Botão "Abrir playground" no header.

- [ ] Step 1: Test first — 6 cenários:
  - PromptPreviewCard renderizado no topo.
  - PageHeader actions inclui botão "Abrir playground".
  - Toggle override mostra AlertDialog antes de ativar.
  - Personality/Tone/Guardrails disabled quando override on (com texto laranja).
  - Save bloqueado se override on + texto vazio.
  - playground.tsx removido (sumir do imports).
- [ ] Step 2-5: implement, PASS, commit `refactor(prompt): preview card no topo + AlertDialog ativação override + playground sheet via header action + remove playground.tsx`.

---

### T6d-1 · Consumo: PeriodPills + título "Histórico" + ícone Activity (D1+D5+D11)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first (pode ser sanity test via RTL — render).
- [ ] Step 2-5: trocar pills locais por `<PeriodPills>` compartilhado; trocar `PhoneCall` → `Activity`; trocar título seção tabela → "Histórico de chamadas" + ícone `History`. PASS, commit.

---

### T6d-2 · Consumo: gráficos (Area+Bar+Donut polish)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first (sanity via RTL).
- [ ] Step 2-5: passar `yAxisCurrency="BRL"`, `xAxisFontSize=13`, `xAxisPadding=12` para Area+Bar; passar `tooltipPosition="top-right"` para Donut; centro do donut usa `formatBrl4`. PASS, commit.

---

### T6d-3 · Consumo: KPIs uniformes 4 casas (D4+D6)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1-5: passar `subtitle` em todos os 4 cards; usar `formatBrl4`/`formatUsd4` no card Custo total; min-h via container ou prop; ícone Activity já em T6d-1. Commit.

---

### T6d-4 · Consumo: tabela colunas + filtros (D15+D16)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — render colunas "Tokens de entrada/saída"; renderUsageTableFilters. Filtro provider→modelo cascade.
- [ ] Step 2-5: integrar `<UsageTableFilters>`; passar provider/model como query params para `getUsageDetails`. Commit.

---

### T6d-5 · Consumo: total + drill-down + paginação + USD/BRL bruto (D12+D13+D14+D17+D18)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — row de total no topo da tabela; click em linha abre `<UsageDetailSheet>`; Sheet fecha ao mudar de página; pageSize=50 reseta page=1; tooltip Whisper nas headers; USD/BRL bruto.
- [ ] Step 2-5: integrar; PASS; commit.

---

### T6e · `/configuracoes` ganha `<ChatwootUrlsCard>`

**Files:**
- Modify: `src/app/(protected)/configuracoes/page.tsx`
- Create: `src/components/settings/chatwoot-urls-card.tsx`
- Test: `src/components/settings/__tests__/chatwoot-urls-card.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — 5 cenários: render lista accounts; salvar dispara setChatwootAccountUrlAction; URL inválida bloqueia; URL vazia → DELETE; empty state quando 0 accounts.
- [ ] Step 2-5: implement, PASS, commit.

---

### T6f · `<KbSection>` AlertDialog excluir + atalho Chatwoot API

**Files:**
- Modify: `src/components/agente-nex/kb-section.tsx`
- Modify: `src/components/agente-nex/__tests__/kb-section.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — 3 cenários:
  - Excluir abre AlertDialog (não window.confirm).
  - Cancel não dispara delete.
  - Botão "Adicionar API Chatwoot" abre KbUploadDialog na aba URL pré-preenchida.
- [ ] Step 2-5: implement, PASS, commit.

---

### T7a · Bump versão + CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] Step 1: Coordenação multi-agente — `git fetch origin main && git pull --rebase origin main`. Confirmar `package.json` ainda em 0.15.4.
- [ ] Step 2: Bump 0.15.4 → 0.16.0.
- [ ] Step 3: CHANGELOG nova entrada formato existente (confirmado em T0c) com 7 sections (A-G) e bullets representando cada task fechada.
- [ ] Step 4: Commit `chore(release): bump 0.16.0 + CHANGELOG`.

---

### T7b · STATUS.md + design-system

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `design-system/nexus-insights/MASTER.md` (se existir)

- [ ] Step 1: Atualizar STATUS.md com release v0.16.0 (sumário; release notes anteriores resumidas).
- [ ] Step 2: design-system: TierBadge 4 variantes, KpiCard subtitle, Calendar defaults.
- [ ] Step 3: Commit `docs(status,design-system): v0.16.0`.

---

### T7c · 3 runbooks novos

**Files:**
- Create: `docs/runbooks/agente-nex-prompt-v0.16.md`
- Create: `docs/runbooks/consumo-drill-down-v0.16.md`
- Create: `docs/runbooks/chatwoot-account-urls.md`

- [ ] Step 1-3: Criar 3 runbooks (cada um seção: O que é, como usar, edge cases, troubleshooting).
- [ ] Step 4: Commit `docs(runbooks): v0.16.0 (prompt, drill-down, chatwoot URLs)`.

---

### T7d · Memory project_v0.16_release

**Files:**
- Create: `~/.claude/projects/.../memory/project_v0.16_release.md`
- Modify: `~/.claude/projects/.../memory/MEMORY.md`

- [ ] Step 1: Criar memory file com release notes.
- [ ] Step 2: Adicionar linha no topo do bloco "Releases" do MEMORY.md.
- [ ] Step 3: Sem commit (memory é local).

---

### T8a · Full test suite + typecheck + build local

**Files:** —

- [ ] Step 1: `npm run typecheck`. Esperar 0 erros.
- [ ] Step 2: `npx jest --silent`. Esperar todos PASS.
- [ ] Step 3: `npm run build`. Esperar success.
- [ ] Step 4: Anotar resultados.

---

### T8b · Smoke visual

- [ ] Step 1: `npm run dev`. Abrir browser.
- [ ] Step 2: Loop pelas 5 telas (chaves/configuracao/prompt/consumo/configuracoes) em light + dark.
- [ ] Step 3: Loop em viewports 375 / 768 / 1280 px.
- [ ] Step 4: Anotar bugs visuais → re-abrir tasks se necessário.

---

### T8c · Aplicar migration em produção

- [ ] Step 1: Conectar via psql ao Postgres prod (instruções no runbook).
- [ ] Step 2: `psql ... < prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/migration.sql`.
- [ ] Step 3: Verificar `\dt` mostra `chatwoot_account_urls`; `\d nex_kb_documents` mostra `kind`/`source_url`; `\d nex_settings` mostra `seeded_defaults_at`.
- [ ] Step 4: Smoke `SELECT id, jsonb_array_length(guardrails) FROM nex_settings;` → confirmar guardrails seedados.

---

### T8d · Push + gh run watch + /api/health + HISTORY

- [ ] Step 1: `git fetch origin main && git status` (clean).
- [ ] Step 2: `git push origin main`.
- [ ] Step 3: `gh run list --limit 1` → pegar id.
- [ ] Step 4: `gh run watch <id>` → esperar success.
- [ ] Step 5: Smoke `curl https://insights.nexusai360.com/api/health | jq`. Esperar `{"version":"v0.16.0","status":"ok"}`.
- [ ] Step 6: Append linha em `docs/agents/HISTORY.md` com release v0.16.0 LIVE.
- [ ] Step 7: Deletar `docs/agents/active/claude-nex-suite-refinement.md`.
- [ ] Step 8: Commit `docs(agents): registra v0.16.0 LIVE + encerra sessão`.
- [ ] Step 9: `git push origin main` (último commit de housekeeping).

---

## Self-review final (após escrever todas as tasks)

**1. Spec coverage:** todos os 8 blocos da spec (A-G) cobertos por tasks específicas. ✅

**2. Placeholder scan:** sem TBD/TODO; sem "implement later". Tasks T0 contêm passos de leitura — não placeholder, é audit. ✅

**3. Type consistency:** `CostTier` → 4 valores em todas as referências (catalog.ts, types.ts, tier-badge.tsx, testes). `composeSystemPrompt` arity 3 em prompt.ts e em todos os callers (preview card, run-nex, etc). `getUsageDetails` retorna `{ rows, total, totals }` consistentemente. ✅

**4. Cobertura críticas (achados pente-fino #1+#2):**
- SSRF guard (#16 v2): T2c implementação + tests.
- seeded_defaults_at (#2 v2): T1a schema + T1b backfill + T6c respeita flag.
- AlertDialog API audit (T0a): pré-bloqueia tasks dependentes.
- Cascade modelo↔provider (#4 v2): T5l + T6d-4.
- Whisper tokens (T0e): documentado em runbook, sem refactor.

**5. Ordem:** T0 (audit) → T1 (schema/dep) → T2 (libs) → T3-T5a (catálogo+badge) → T4 (actions) → T5 (UI) → T6 (integration) → T7 (doc/release) → T8 (verify/deploy).

✅ Plan v3 fechada. Pronta para execução via subagent-driven-development.

---

## Histórico de revisões

- **v1** (`…-v1.md`): rascunho de alto nível, 44 tasks. 10 achados.
- **v2** (`…-v2.md`): ordem corrigida (schema antes), T6 quebrado em sub-tasks, 50 tasks. 15 achados.
- **v3** (este arquivo): incorpora os 25 achados acumulados. **Pronta para execução.**
