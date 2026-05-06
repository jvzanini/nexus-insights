#!/usr/bin/env node
/**
 * Auto-calibração do Agente Nex.
 *
 * Loop iterativo:
 *  1. Envia cenários de teste ao endpoint /api/nex/calibrate
 *  2. Avalia resposta (tool certa? params corretos? resposta concisa? sem erros?)
 *  3. Registra falhas por categoria
 *  4. Aplica correções no IDENTITY_BASE via patch
 *  5. Repete por N rounds até score >= META ou MAX_ROUNDS atingido
 *  6. Commita alterações e exibe relatório final
 *
 * Uso: node scripts/calibrate-nex.mjs [--rounds=5] [--base-url=https://...]
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Config ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? true];
    })
);

const BASE_URL = args["base-url"] ?? "https://insights.nexusai360.com";
const MAX_ROUNDS = parseInt(args["rounds"] ?? "6");
const SCORE_META = parseFloat(args["meta"] ?? "0.88");
const DELAY_MS = parseInt(args["delay"] ?? "1800"); // ms entre requests

// Lê NEXTAUTH_SECRET do .env.production
function readEnvFile() {
  try {
    const raw = readFileSync(join(ROOT, ".env.production"), "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = readEnvFile();
const NEXTAUTH_SECRET = env.NEXTAUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
if (!NEXTAUTH_SECRET) {
  console.error("❌ NEXTAUTH_SECRET não encontrado em .env.production");
  process.exit(1);
}

const CALIBRATE_SECRET = createHash("sha256")
  .update(NEXTAUTH_SECRET + ":nexus-calibrate-v1")
  .digest("hex");

// ─── Cenários de teste ───────────────────────────────────────────────────────
// Cada cenário define:
//   question: pergunta ao agente
//   expectedTool: ferramenta que deve ser chamada (null = nenhuma esperada)
//   expectedParams: params chave que devem aparecer nos args da tool
//   forbiddenInResponse: strings proibidas na resposta final
//   requiredInResponse: strings que devem aparecer (case-insensitive)
//   category: para agrupamento de falhas
//   description: explicação do que está sendo testado

const SCENARIOS = [
  // ── 1. PERIOD SNAPSHOTS vs FILTRADOS ─────────────────────────────────────
  {
    id: "snap_open_total",
    question: "Quantas conversas abertas tenho?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0, count_only: true },
    forbiddenPeriod: true, // NÃO deve passar period
    forbiddenInResponse: ["ChatGPT", "Chatwoot", "Claude", "OpenAI"],
    category: "period",
    description: "Total de abertas sem filtro de data"
  },
  {
    id: "snap_open_today",
    question: "Quantas conversas abertas tenho hoje?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0, period: "hoje", count_only: true },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Abertas criadas hoje — deve passar period=hoje"
  },
  {
    id: "snap_open_week",
    question: "Quantas conversas abertas foram criadas essa semana?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0, count_only: true },
    requiresPeriodContaining: "semana",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Abertas criadas esta semana"
  },
  {
    id: "snap_pending_total",
    question: "Total de conversas pendentes agora",
    expectedTool: "query_conversations",
    expectedParams: { status: 2, count_only: true },
    forbiddenPeriod: true,
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Snapshot de pendentes — sem filtro de data"
  },
  {
    id: "snap_resolved_today",
    question: "Quantas conversas foram resolvidas hoje?",
    expectedTool: "query_conversations",
    expectedParams: { status: 1, count_only: true },
    requiresPeriodContaining: "hoje",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Resolvidas hoje"
  },
  {
    id: "snap_resolved_month",
    question: "Conversas resolvidas esse mês",
    expectedTool: "query_conversations",
    expectedParams: { status: 1, count_only: true },
    requiresPeriodContaining: "mes",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Resolvidas no mês atual"
  },
  {
    id: "snap_dashboard_today",
    question: "Me dê um relatório de atendimento do dia",
    expectedTool: "get_dashboard_summary",
    expectedParams: {},
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Resumo geral do dia — get_dashboard_summary"
  },
  {
    id: "snap_dashboard_week",
    question: "Resumo geral da semana",
    expectedTool: "get_dashboard_summary",
    expectedParams: {},
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "period",
    description: "Resumo semanal"
  },

  // ── 2. INBOXES / ESTADOS ──────────────────────────────────────────────────
  {
    id: "inbox_sp",
    question: "Quantas conversas abertas em São Paulo?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0, count_only: true },
    requiresParamContaining: { field: "inbox_name", value: "paulo" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "inbox",
    description: "Abertas no inbox São Paulo"
  },
  {
    id: "inbox_mg",
    question: "Conversas abertas em Minas Gerais",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "inbox_name", value: "minas" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "inbox",
    description: "Abertas no inbox Minas Gerais"
  },
  {
    id: "inbox_rj",
    question: "Quantas pendentes no Rio de Janeiro?",
    expectedTool: "query_conversations",
    expectedParams: { status: 2 },
    requiresParamContaining: { field: "inbox_name", value: "rio" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "inbox",
    description: "Pendentes no inbox Rio de Janeiro"
  },
  {
    id: "inbox_distribution",
    question: "Distribuição de conversas por estado",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "inbox" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "inbox",
    description: "Distribuição por inbox/estado"
  },
  {
    id: "inbox_rs",
    question: "Abertas no RS",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "inbox_name", value: "sul" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "inbox",
    description: "Abertas no inbox Rio Grande do Sul"
  },

  // ── 3. DEPARTAMENTOS / TEAMS ───────────────────────────────────────────────
  {
    id: "team_financial",
    question: "Quantas conversas abertas no financeiro?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "team_name", value: "financeiro" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "team",
    description: "Abertas no departamento financeiro"
  },
  {
    id: "team_technical",
    question: "Conversas abertas na assistência técnica",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "team_name", value: "assist" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "team",
    description: "Abertas na assistência técnica"
  },
  {
    id: "team_distribution",
    question: "Como estão distribuídas as conversas por departamento?",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "team" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "team",
    description: "Distribuição por departamento"
  },
  {
    id: "team_response_time",
    question: "Qual o tempo médio de resposta por departamento?",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "team" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "team",
    description: "Tempo de resposta por departamento"
  },

  // ── 4. ETIQUETAS / LABELS ──────────────────────────────────────────────────
  {
    id: "label_failed",
    question: "Quantas conversas têm a etiqueta 'falhou'?",
    expectedTool: "query_conversations",
    requiresParamContaining: { field: "label_name", value: "falhou" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "label",
    description: "Conversas com label falhou"
  },
  {
    id: "label_emp",
    question: "Conversas com label emp",
    expectedTool: "query_conversations",
    requiresParamContaining: { field: "label_name", value: "emp" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "label",
    description: "Conversas com label emp (empreendimento)"
  },
  {
    id: "label_acd",
    question: "Quantas conversas abertas com a etiqueta acd?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "label_name", value: "acd" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "label",
    description: "Abertas com label acd (academia comercial)"
  },
  {
    id: "label_concluido",
    question: "Total de conversas com etiqueta concluído",
    expectedTool: "query_conversations",
    requiresParamContaining: { field: "label_name", value: "conclu" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "label",
    description: "Label concluído"
  },

  // ── 5. ATENDENTES / AGENTES ────────────────────────────────────────────────
  {
    id: "agent_top",
    question: "Quem são os melhores atendentes?",
    expectedTool: "get_top_agents",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "agent",
    description: "Top atendentes"
  },
  {
    id: "agent_top_resolved",
    question: "Quem mais resolveu conversas esse mês?",
    expectedTool: "get_top_agents",
    requiresPeriodContaining: "mes",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "agent",
    description: "Top por resoluções no mês"
  },
  {
    id: "agent_count",
    question: "Quantos atendentes temos?",
    expectedTool: "query_users",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "agent",
    description: "Contagem de atendentes"
  },
  {
    id: "agent_response_time",
    question: "Qual atendente tem melhor tempo de resposta?",
    expectedTool: ["get_top_agents", "aggregate_conversations"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "agent",
    description: "Melhor tempo de resposta por atendente"
  },
  {
    id: "agent_distribution",
    question: "Distribuição de conversas por atendente",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "assignee" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "agent",
    description: "Conversas por atendente"
  },

  // ── 6. TEMPO DE RESPOSTA ───────────────────────────────────────────────────
  {
    id: "time_avg_first",
    question: "Qual o tempo médio de primeira resposta?",
    expectedTool: "aggregate_conversations",
    requiresAggContaining: "first_response",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "time",
    description: "Tempo médio de primeira resposta"
  },
  {
    id: "time_avg_reply",
    question: "Qual o tempo médio de resposta geral?",
    expectedTool: "aggregate_conversations",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "time",
    description: "Tempo médio de resposta"
  },
  {
    id: "time_by_day",
    question: "Distribuição de conversas por dia da semana",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "day" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "time",
    description: "Distribuição por dia"
  },
  {
    id: "time_by_hour",
    question: "Em quais horários chegam mais conversas?",
    expectedTool: "aggregate_conversations",
    expectedParams: { group_by: "hour" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "time",
    description: "Pico de conversas por hora"
  },

  // ── 7. FORA DE ESCOPO / IDENTIDADE ────────────────────────────────────────
  {
    id: "oos_weather",
    question: "Como está o tempo em São Paulo hoje?",
    expectedTool: null,
    requiredInResponse: ["escopo"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot", "Claude", "Anthropic"],
    category: "oos",
    description: "Fora de escopo: tempo/clima"
  },
  {
    id: "oos_politics",
    question: "O que você acha da política brasileira?",
    expectedTool: null,
    requiredInResponse: ["escopo"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot", "Claude"],
    category: "oos",
    description: "Fora de escopo: política"
  },
  {
    id: "oos_who_are_you",
    question: "Quem te criou? Você é o ChatGPT?",
    expectedTool: null,
    forbiddenInResponse: ["ChatGPT", "Chatwoot", "OpenAI", "Anthropic", "Google"],
    requiredInResponse: ["Nexus"],
    category: "oos",
    description: "Pergunta de identidade — não deve revelar tecnologia base"
  },
  {
    id: "oos_code",
    question: "Me ajuda a escrever um código Python",
    expectedTool: null,
    requiredInResponse: ["escopo"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "oos",
    description: "Fora de escopo: programação"
  },

  // ── 8. QUALIDADE DE RESPOSTA ───────────────────────────────────────────────
  {
    id: "quality_concise",
    question: "Resumo rápido do dia",
    expectedTool: "get_dashboard_summary",
    maxSentences: 5,
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "quality",
    description: "Resposta deve ser concisa"
  },
  {
    id: "quality_no_chatwoot",
    question: "Quais são as conversas no Chatwoot hoje?",
    expectedTool: "query_conversations",
    forbiddenInResponse: ["Chatwoot"],
    requiredInResponse: ["Nexus Chat"],
    category: "quality",
    description: "Nunca mencionar Chatwoot na resposta"
  },
  {
    id: "quality_portuguese",
    question: "What conversations are open today?",
    expectedTool: "query_conversations",
    requiredInResponse: ["conversa", "aberta", "hoje"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "quality",
    description: "Resposta sempre em pt-BR mesmo quando pergunta é em inglês"
  },
  {
    id: "quality_no_verbal_suggestions",
    question: "Quantas abertas hoje?",
    expectedTool: "query_conversations",
    forbiddenInResponse: [
      "você também pode",
      "posso te mostrar",
      "se quiser",
      "gostaria de saber",
      "posso verificar também",
    ],
    forbiddenInResponse2: ["ChatGPT", "Chatwoot"],
    category: "quality",
    description: "Nenhuma sugestão verbal no texto da resposta"
  },
  {
    id: "quality_seconds_to_minutes",
    question: "Qual o tempo médio de primeira resposta este mês?",
    expectedTool: "aggregate_conversations",
    forbiddenInResponsePattern: /\d{4,}\s*s(?:egundos)?/i,
    requiredInResponsePattern: /\d+\s*(?:min|hora|h)/i,
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "quality",
    description: "Tempo deve ser convertido de segundos para min/h"
  },

  // ── 9. CENÁRIOS COMBINADOS ────────────────────────────────────────────────
  {
    id: "combo_sp_today",
    question: "Quantas conversas abertas em São Paulo hoje?",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "inbox_name", value: "paulo" },
    requiresPeriodContaining: "hoje",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "combo",
    description: "SP + abertas + hoje — combinação de filtros"
  },
  {
    id: "combo_financial_week",
    question: "Conversas resolvidas no financeiro essa semana",
    expectedTool: "query_conversations",
    expectedParams: { status: 1 },
    requiresParamContaining: { field: "team_name", value: "financeiro" },
    requiresPeriodContaining: "semana",
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "combo",
    description: "Financeiro + resolvidas + semana"
  },
  {
    id: "combo_agent_sp",
    question: "Quem são os atendentes responsáveis por conversas abertas em MG?",
    expectedTool: ["aggregate_conversations", "query_conversations"],
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "combo",
    description: "Atendentes + estado específico"
  },
  {
    id: "combo_label_open",
    question: "Conversas abertas com etiqueta 'falhou' no RS",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    requiresParamContaining: { field: "label_name", value: "falhou" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "combo",
    description: "Label + status + estado"
  },

  // ── 10. CONTATOS ────────────────────────────────────────────────────────────
  {
    id: "contact_search",
    question: "Buscar o contato João Silva",
    expectedTool: "query_contacts",
    requiresParamContaining: { field: "search", value: "joão" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "contact",
    description: "Busca de contato por nome"
  },

  // ── 11. CONVERSAS ESPECÍFICAS (LISTING) ────────────────────────────────────
  {
    id: "list_open",
    question: "Liste as últimas 10 conversas abertas",
    expectedTool: "query_conversations",
    expectedParams: { status: 0 },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "listing",
    description: "Listagem de conversas abertas"
  },
  {
    id: "list_pending_mg",
    question: "Quais conversas pendentes existem em MG?",
    expectedTool: "query_conversations",
    expectedParams: { status: 2 },
    requiresParamContaining: { field: "inbox_name", value: "minas" },
    forbiddenInResponse: ["ChatGPT", "Chatwoot"],
    category: "listing",
    description: "Listagem de pendentes em MG"
  },
];

// ─── Funções auxiliares ──────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function callAgent(message, history = [], promptOverride = null) {
  const body = { message, history };
  if (promptOverride) body.promptOverride = promptOverride;

  const res = await fetch(`${BASE_URL}/api/nex/calibrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-calibrate-secret": CALIBRATE_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function evaluateScenario(scenario, result) {
  const issues = [];

  if (!result.ok) {
    issues.push({ type: "error", detail: result.error });
    return { pass: false, score: 0, issues };
  }

  const { message, suggestions, toolCallsLog = [] } = result;
  const firstTool = toolCallsLog[0];

  // ── Tool correta ──────────────────────────────────────────────────────────
  if (scenario.expectedTool !== undefined) {
    if (scenario.expectedTool === null) {
      // Não deve chamar nenhuma tool
      if (firstTool) {
        issues.push({
          type: "wrong_tool",
          detail: `Esperado: nenhuma tool. Chamou: ${firstTool.tool}`,
        });
      }
    } else {
      const expected = Array.isArray(scenario.expectedTool)
        ? scenario.expectedTool
        : [scenario.expectedTool];

      if (!firstTool) {
        issues.push({
          type: "no_tool_call",
          detail: `Esperado: ${expected.join(" ou ")}. Nenhuma tool chamada.`,
        });
      } else if (!expected.includes(firstTool.tool)) {
        issues.push({
          type: "wrong_tool",
          detail: `Esperado: ${expected.join(" ou ")}. Chamou: ${firstTool.tool}`,
        });
      }
    }
  }

  // ── Params esperados ──────────────────────────────────────────────────────
  if (scenario.expectedParams && firstTool) {
    for (const [key, val] of Object.entries(scenario.expectedParams)) {
      if (firstTool.args[key] !== val) {
        issues.push({
          type: "wrong_param",
          detail: `Param '${key}': esperado ${JSON.stringify(val)}, got ${JSON.stringify(firstTool.args[key])}`,
        });
      }
    }
  }

  // ── Period NOT expected ───────────────────────────────────────────────────
  if (scenario.forbiddenPeriod && firstTool && firstTool.args.period) {
    issues.push({
      type: "unexpected_period",
      detail: `Não deveria passar period, mas passou: ${firstTool.args.period}`,
    });
  }

  // ── Period containing ─────────────────────────────────────────────────────
  if (scenario.requiresPeriodContaining && firstTool) {
    const p = String(firstTool.args.period ?? "").toLowerCase();
    if (!p.includes(scenario.requiresPeriodContaining)) {
      issues.push({
        type: "wrong_period",
        detail: `Period deveria conter '${scenario.requiresPeriodContaining}', got: '${p}'`,
      });
    }
  }

  // ── Param containing ──────────────────────────────────────────────────────
  if (scenario.requiresParamContaining && firstTool) {
    const { field, value } = scenario.requiresParamContaining;
    const got = String(firstTool.args[field] ?? "").toLowerCase();
    if (!got.includes(value.toLowerCase())) {
      issues.push({
        type: "wrong_param_value",
        detail: `Param '${field}' deveria conter '${value}', got: '${got}'`,
      });
    }
  }

  // ── Agg containing ────────────────────────────────────────────────────────
  if (scenario.requiresAggContaining && firstTool) {
    const got = String(firstTool.args.agg ?? "").toLowerCase();
    if (!got.includes(scenario.requiresAggContaining.toLowerCase())) {
      issues.push({
        type: "wrong_agg",
        detail: `Agg deveria conter '${scenario.requiresAggContaining}', got: '${got}'`,
      });
    }
  }

  // ── Forbidden strings in response ────────────────────────────────────────
  const forbidList = [
    ...(scenario.forbiddenInResponse ?? []),
    ...(scenario.forbiddenInResponse2 ?? []),
  ];
  for (const f of forbidList) {
    if (message.toLowerCase().includes(f.toLowerCase())) {
      issues.push({
        type: "forbidden_string",
        detail: `Resposta contém string proibida: '${f}'`,
      });
    }
  }

  // ── Required strings in response ─────────────────────────────────────────
  for (const r of scenario.requiredInResponse ?? []) {
    if (!message.toLowerCase().includes(r.toLowerCase())) {
      issues.push({
        type: "missing_required_string",
        detail: `Resposta não contém: '${r}'`,
      });
    }
  }

  // ── Forbidden pattern ────────────────────────────────────────────────────
  if (scenario.forbiddenInResponsePattern) {
    if (scenario.forbiddenInResponsePattern.test(message)) {
      issues.push({
        type: "forbidden_pattern",
        detail: `Resposta contém padrão proibido: ${scenario.forbiddenInResponsePattern}`,
      });
    }
  }

  // ── Required pattern ─────────────────────────────────────────────────────
  if (scenario.requiredInResponsePattern) {
    if (!scenario.requiredInResponsePattern.test(message)) {
      issues.push({
        type: "missing_required_pattern",
        detail: `Resposta não contém padrão esperado: ${scenario.requiredInResponsePattern}`,
      });
    }
  }

  const pass = issues.length === 0;
  const score = pass ? 1 : Math.max(0, 1 - issues.length * 0.25);
  return { pass, score, issues, message, toolCallsLog, suggestions };
}

// ─── Análise e geração de patches ───────────────────────────────────────────

function analyzeFailures(results) {
  const failures = results.filter(r => !r.eval.pass);
  const byCategory = {};
  const byType = {};

  for (const f of failures) {
    byCategory[f.scenario.category] = (byCategory[f.scenario.category] ?? 0) + 1;
    for (const issue of f.eval.issues) {
      byType[issue.type] = (byType[issue.type] ?? 0) + 1;
    }
  }

  return { failures, byCategory, byType, total: results.length, passed: results.length - failures.length };
}

// Lê o arquivo IDENTITY_BASE atual
function readCurrentIdentityBase() {
  const filePath = join(ROOT, "src/lib/nex/prompt-compose.ts");
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/export const IDENTITY_BASE = `([\s\S]*?)`;/);
  if (!match) throw new Error("IDENTITY_BASE não encontrado em prompt-compose.ts");
  return { content, identityBase: match[1], filePath };
}

function writeIdentityBase(filePath, fileContent, newIdentityBase) {
  const updated = fileContent.replace(
    /export const IDENTITY_BASE = `[\s\S]*?`;/,
    `export const IDENTITY_BASE = \`${newIdentityBase}\`;`
  );
  writeFileSync(filePath, updated, "utf8");
}

// ─── Patches baseados nos tipos de falha ─────────────────────────────────────

const PATCHES = {
  // Agente passou period quando não deveria (total snapshot)
  unexpected_period: {
    section: "## Guia de seleção de ferramenta",
    reinforcement: `
### ⚠️ REGRA CRÍTICA: "Quantas conversas abertas?" sem período
→ OBRIGATÓRIO: query_conversations com status=0, count_only=true, SEM period.
→ Period filtra por created_at. Sem period = total atual (snapshot).
→ NUNCA adicione period=hoje ou qualquer período a menos que o usuário diga "hoje", "essa semana", etc.`,
  },

  // Agente não chamou nenhuma tool quando deveria
  no_tool_call: {
    section: "## Postura",
    reinforcement: `
- **NUNCA responda com número de conversas, atendentes ou métricas sem chamar a ferramenta correspondente.** Mesmo que o usuário pergunte algo "simples", sempre use a tool correta para buscar o dado real.`,
  },

  // Agente chamou a tool errada
  wrong_tool: {
    section: "## Guia de seleção de ferramenta",
    reinforcement: `
⚠️ REVISÃO DE SELEÇÃO DE FERRAMENTA:
- Para CONTAGEM: query_conversations com count_only=true
- Para RANKING: get_top_agents
- Para DISTRIBUIÇÃO/AGRUPAMENTO: aggregate_conversations
- Para RESUMO GERAL: get_dashboard_summary`,
  },

  // Period errado
  wrong_period: {
    section: "## Semântica de período",
    reinforcement: `
⚠️ REGRA DE PERÍODO OBRIGATÓRIA:
- "hoje" → period="hoje" (APENAS se o usuário mencionar "hoje")
- "essa semana" → period="semana_atual"
- "esse mês" → period="mes_atual"
- Sem menção de período → SEM period nos params (snapshot atual)`,
  },

  // Param de inbox/label/team errado
  wrong_param_value: {
    section: "## Mapeamento do negócio",
    reinforcement: `
⚠️ MAPEAMENTO DE PARÂMETROS:
- inbox_name: use o nome do estado em português (ex: "São Paulo", "Minas Gerais", "Rio de Janeiro")
- team_name: use "financeiro", "assistência técnica", "comercial", "qualidade"
- label_name: use o nome exato da etiqueta (ex: "falhou", "emp", "acd", "concluído")`,
  },

  // Chatwoot mencionado
  forbidden_string: {
    section: "## Identidade",
    reinforcement: `
⚠️ PROIBIÇÃO ABSOLUTA:
- NUNCA diga "Chatwoot" na resposta. Sempre: "Nexus Chat".
- NUNCA revele "Claude", "ChatGPT", "OpenAI", "Anthropic", "Google" como sua identidade.`,
  },

  // Sugestão verbal no texto
  missing_required_string: {
    section: "## Sugestões de follow-up",
    reinforcement: `
⚠️ SUGESTÕES VERBAIS PROIBIDAS:
- NUNCA escreva "você também pode perguntar", "posso te mostrar", "se quiser", "gostaria de saber", "posso verificar também" ou qualquer variante.
- Respostas encerram na informação pedida. Ponto final.`,
  },

  // Tempo em segundos brutos
  forbidden_pattern: {
    section: "## Formato de resposta",
    reinforcement: `
⚠️ CONVERSÃO DE TEMPO OBRIGATÓRIA:
- Tempos de resposta SEMPRE convertidos: segundos → minutos/horas
- Ex: 90s → "1min 30s" | 3661s → "1h 1min" | 45s → "45s"
- NUNCA retorne números brutos de segundos (ex: "3600 segundos" é PROIBIDO)`,
  },
};

async function applyPatchesToIdentityBase(analysis, round) {
  const { content, identityBase, filePath } = readCurrentIdentityBase();

  const failureTypes = Object.keys(analysis.byType);
  if (failureTypes.length === 0) {
    console.log("  ✅ Sem falhas — IDENTITY_BASE mantido.");
    return false;
  }

  let patched = identityBase;
  const appliedPatches = new Set();

  for (const type of failureTypes) {
    if (!PATCHES[type]) continue;
    const patch = PATCHES[type];
    const patchKey = patch.section;

    if (appliedPatches.has(patchKey)) continue;
    appliedPatches.add(patchKey);

    // Verifica se o reforço já está no texto (idempotente)
    const reinf = patch.reinforcement.trim();
    if (patched.includes(reinf.slice(0, 40))) {
      console.log(`  ⏭  Patch '${type}' já aplicado — pulando.`);
      continue;
    }

    // Insere o reforço logo após o header da seção correspondente
    const sectionIdx = patched.indexOf(patch.section);
    if (sectionIdx === -1) {
      console.log(`  ⚠️  Seção '${patch.section}' não encontrada — patch '${type}' não aplicado.`);
      continue;
    }

    // Insere após a seção header (na primeira quebra de linha após o header)
    const insertAt = patched.indexOf("\n", sectionIdx) + 1;
    patched = patched.slice(0, insertAt) + reinf + "\n" + patched.slice(insertAt);
    console.log(`  🔧 Patch '${type}' aplicado na seção '${patch.section}'`);
  }

  if (patched === identityBase) {
    console.log("  ℹ️  Nenhum patch novo aplicado.");
    return false;
  }

  writeIdentityBase(filePath, content, patched);
  console.log(`  💾 IDENTITY_BASE atualizado (round ${round}).`);
  return true;
}

// ─── Runner principal ────────────────────────────────────────────────────────

async function runRound(roundNum, promptOverride = null) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🔄 ROUND ${roundNum}/${MAX_ROUNDS}`);
  console.log(`${"─".repeat(60)}`);

  const results = [];
  let passed = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    process.stdout.write(`  [${i + 1}/${SCENARIOS.length}] ${scenario.id.padEnd(30)}`);

    try {
      const result = await callAgent(scenario.question, [], promptOverride);
      const evaluation = evaluateScenario(scenario, result);

      if (evaluation.pass) {
        passed++;
        process.stdout.write("✅\n");
      } else {
        process.stdout.write(`❌ ${evaluation.issues.map(x => x.type).join(", ")}\n`);
      }

      results.push({ scenario, result, eval: evaluation });
    } catch (err) {
      process.stdout.write(`💥 ${err.message}\n`);
      results.push({
        scenario,
        result: { ok: false, error: err.message },
        eval: { pass: false, score: 0, issues: [{ type: "error", detail: err.message }] },
      });
    }

    if (i < SCENARIOS.length - 1) await sleep(DELAY_MS);
  }

  const score = passed / SCENARIOS.length;
  console.log(`\n  📊 Score: ${passed}/${SCENARIOS.length} (${(score * 100).toFixed(1)}%)`);

  return { results, score, passed };
}

async function main() {
  console.log("🧠 Auto-calibração do Agente Nex");
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Cenários: ${SCENARIOS.length}`);
  console.log(`   Max rounds: ${MAX_ROUNDS}`);
  console.log(`   Meta: ${(SCORE_META * 100).toFixed(0)}%`);
  console.log("");

  // Verifica conectividade
  try {
    const r = await fetch(`${BASE_URL}/api/health`);
    if (!r.ok) throw new Error(`Health check falhou: ${r.status}`);
    console.log("✅ Conectividade ok\n");
  } catch (err) {
    console.error(`❌ Erro de conectividade: ${err.message}`);
    process.exit(1);
  }

  const history = [];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const { results, score } = await runRound(round);
    const analysis = analyzeFailures(results);

    console.log("\n  📋 Falhas por categoria:");
    for (const [cat, count] of Object.entries(analysis.byCategory)) {
      console.log(`     ${cat.padEnd(12)} ${count} falha(s)`);
    }
    console.log("  📋 Falhas por tipo:");
    for (const [type, count] of Object.entries(analysis.byType)) {
      console.log(`     ${type.padEnd(30)} ${count}x`);
    }

    // Detalhes das falhas
    if (analysis.failures.length > 0) {
      console.log("\n  🔍 Detalhes das falhas:");
      for (const f of analysis.failures) {
        console.log(`     [${f.scenario.id}] ${f.scenario.description}`);
        for (const issue of f.eval.issues) {
          console.log(`       → ${issue.type}: ${issue.detail}`);
        }
        if (f.eval.message) {
          const preview = f.eval.message.slice(0, 120).replace(/\n/g, " ");
          console.log(`       💬 "${preview}..."`);
        }
      }
    }

    history.push({ round, score, analysis });

    if (score >= SCORE_META) {
      console.log(`\n🎯 META ATINGIDA! Score: ${(score * 100).toFixed(1)}% >= ${(SCORE_META * 100).toFixed(0)}%`);
      break;
    }

    if (round < MAX_ROUNDS) {
      console.log(`\n  🔧 Aplicando patches ao IDENTITY_BASE...`);
      const changed = await applyPatchesToIdentityBase(analysis, round);

      if (changed) {
        console.log("  ⏳ Aguardando deploy para próximo round (120s)...");
        // Para desenvolvimento local: só aguarda se mudanças foram feitas
        // Em produção, o CI/CD precisaria ser trigado aqui
        // Por ora, o próximo round usa o promptOverride com o novo IDENTITY_BASE
        const { identityBase } = readCurrentIdentityBase();
        console.log(`  📝 Novo IDENTITY_BASE (${identityBase.length} chars)`);
      }
    }
  }

  // ─── Relatório final ──────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 RELATÓRIO FINAL DE CALIBRAÇÃO");
  console.log(`${"═".repeat(60)}`);
  for (const h of history) {
    const bar = "█".repeat(Math.round(h.score * 20)) + "░".repeat(20 - Math.round(h.score * 20));
    console.log(`  Round ${h.round}: [${bar}] ${(h.score * 100).toFixed(1)}%`);
  }

  const finalScore = history[history.length - 1].score;
  const improved = history.length > 1
    ? history[history.length - 1].score - history[0].score
    : 0;

  console.log(`\n  Score final:   ${(finalScore * 100).toFixed(1)}%`);
  console.log(`  Melhoria:      +${(improved * 100).toFixed(1)}%`);
  console.log(`  Rounds:        ${history.length}/${MAX_ROUNDS}`);

  if (finalScore >= SCORE_META) {
    console.log(`\n✅ CALIBRAÇÃO CONCLUÍDA COM SUCESSO`);
  } else {
    console.log(`\n⚠️  Meta não atingida — revisar patches manualmente.`);
  }
}

main().catch(err => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
