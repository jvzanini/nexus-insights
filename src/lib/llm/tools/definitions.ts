/**
 * Definições JSON Schema das tools expostas ao Agente Nex.
 *
 * O modelo recebe estas definições e decide quais tools chamar para responder
 * perguntas sobre os dados do Chatwoot. O executor (`./executor.ts`) faz a
 * tradução para SQL parametrizado e devolve o resultado serializado.
 *
 * Convenções:
 *  - `period` aceita strings "amigáveis" (hoje, ontem, 7d, 30d, mes_atual,
 *    mes_anterior, semana_atual) e também ranges JSON: `{"start":ISO,"end":ISO}`.
 *  - `status` segue o enum do Chatwoot: 0=open, 1=resolved, 2=pending, 3=snoozed.
 *  - `message_type` segue o enum do Chatwoot: 0=incoming, 1=outgoing.
 */

import type { ToolDefinition } from "../types";

export const NEX_TOOLS: ToolDefinition[] = [
  {
    name: "query_conversations",
    description:
      "Lista ou conta conversas do Chatwoot. Use para perguntas sobre conversas em aberto, resolvidas, pendentes, ou para listar conversas por filtro (atendente, inbox/estado, departamento, período).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "integer",
          description: "Status Chatwoot: 0=open, 1=resolved, 2=pending, 3=snoozed",
          enum: [0, 1, 2, 3],
        },
        period: {
          type: "string",
          description:
            "Período em linguagem natural: 'hoje' | 'ontem' | '7d' | '30d' | 'mes_atual' | 'mes_anterior' | 'semana_atual'. Para range customizado, passe JSON {\"start\":ISO,\"end\":ISO}.",
        },
        assignee_name: {
          type: "string",
          description: "Nome (parcial) do atendente — busca por ILIKE em users.name",
        },
        inbox_name: {
          type: "string",
          description: "Nome (parcial) da inbox/estado — busca por ILIKE em inboxes.name",
        },
        team_name: {
          type: "string",
          description: "Nome (parcial) do departamento — busca por ILIKE em teams.name",
        },
        limit: { type: "integer", default: 50, maximum: 200 },
        count_only: {
          type: "boolean",
          default: false,
          description: "Se true, retorna apenas o total agregado",
        },
      },
    },
  },
  {
    name: "query_messages",
    description:
      "Conta mensagens recebidas/enviadas do Chatwoot por período, agente ou conversa.",
    parameters: {
      type: "object",
      properties: {
        message_type: {
          type: "integer",
          description: "Tipo Chatwoot: 0=incoming, 1=outgoing",
          enum: [0, 1],
        },
        period: { type: "string" },
        conversation_id: { type: "integer" },
        count_only: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "query_users",
    description:
      "Lista atendentes do Chatwoot. Use para perguntas sobre quantos atendentes existem ou para descobrir nomes/IDs.",
    parameters: {
      type: "object",
      properties: {
        only_active: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "query_contacts",
    description: "Busca contatos por nome, telefone ou e-mail (ILIKE parcial).",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Termo de busca aplicado em name, phone_number e email",
        },
        limit: { type: "integer", default: 20, maximum: 100 },
      },
    },
  },
  {
    name: "aggregate_conversations",
    description:
      "Agrega conversas com COUNT/AVG agrupado por inbox, team, assignee, status, priority, dia ou hora.",
    parameters: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: [
            "inbox",
            "team",
            "assignee",
            "status",
            "priority",
            "day",
            "hour",
          ],
        },
        agg: {
          type: "string",
          enum: ["count", "avg_first_response_time"],
        },
        period: { type: "string" },
        status: { type: "integer", enum: [0, 1, 2, 3] },
        limit: { type: "integer", default: 10 },
      },
      required: ["group_by", "agg"],
    },
  },
  {
    name: "get_top_agents",
    description:
      "Top N atendentes por velocidade de primeira resposta ou volume de conversas.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["fastest", "most_open", "most_resolved"],
        },
        period: { type: "string" },
        limit: { type: "integer", default: 5 },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_dashboard_summary",
    description:
      "Snapshot rápido do operacional: total de conversas em aberto/pendentes/resolvidas no período, top inbox e top atendente.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", default: "hoje" },
      },
    },
  },
  {
    name: "get_active_company",
    description:
      "Devolve a empresa (account Chatwoot) ativa para o usuário corrente, junto com role da plataforma. Use sempre que o usuário perguntar 'em qual empresa estou?', 'quem sou eu aqui?', 'qual conta?'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_integrations_status",
    description:
      "Lista integrações configuradas para a empresa ativa (Power BI, futuras), com contadores de profiles ativos/com erro. Use quando o usuário perguntar sobre integrações, Power BI, dashboards externos.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_nex_config_summary",
    description:
      "Resumo da configuração do Agente Nex e da plataforma: provedor/modelo de IA ativo, KB ligada, áudio, visibilidades de bubble e relatórios. NÃO retorna chaves nem segredos.",
    parameters: { type: "object", properties: {} },
  },
];
