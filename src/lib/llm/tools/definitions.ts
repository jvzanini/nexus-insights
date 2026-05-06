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
      "Conta ou lista conversas por filtros. Inboxes = estados brasileiros (ex: 'São Paulo', 'Minas Gerais'). Para perguntas de estado atual sem período, omita 'period'.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "integer",
          description: "Status: 0=em aberto (open), 1=resolvida, 2=pendente, 3=adiada (snoozed)",
          enum: [0, 1, 2, 3],
        },
        period: {
          type: "string",
          description:
            "Filtro de período. Sem status (recebidas/novas): filtra por created_at. Com status (aberta/resolvida/pendente): filtra por last_activity_at. Valores: 'hoje' | 'ontem' | '7d' | '30d' | 'mes_atual' | 'mes_anterior' | 'semana_atual'. Range customizado: JSON {\"start\":\"ISO\",\"end\":\"ISO\"}. Omita para retornar todas sem filtro de data.",
        },
        assignee_name: {
          type: "string",
          description: "Nome (parcial) do atendente responsável (busca ILIKE)",
        },
        inbox_name: {
          type: "string",
          description: "Nome (parcial) da inbox / estado brasileiro (ex: 'São Paulo', 'MG', 'Bahia'). Busca ILIKE.",
        },
        team_name: {
          type: "string",
          description: "Nome (parcial) do departamento/team (ex: 'financeiro', 'comercial'). Busca ILIKE.",
        },
        label_name: {
          type: "string",
          description: "Nome exato ou parcial da etiqueta/label (ex: 'falhou', 'emp', 'concluído'). Busca ILIKE em cached_label_list.",
        },
        limit: { type: "integer", default: 50, maximum: 200, description: "Máximo de linhas retornadas (ignorado quando count_only=true)" },
        count_only: {
          type: "boolean",
          default: false,
          description: "Se true, retorna apenas o total (número). Use sempre que o usuário pedir uma contagem.",
        },
        unanswered_only: {
          type: "boolean",
          default: false,
          description: "Se true, filtra apenas conversas SEM RESPOSTA: em aberto cuja última mensagem classificável é do cliente (incoming). Use para 'conversas sem resposta', 'aguardando resposta', 'não respondidas'. Não combine com period — essas conversas existem no momento atual.",
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
      "Agrega conversas com contagem ou tempo médio de resposta, agrupado por inbox/estado, departamento, atendente, status, prioridade, dia ou hora. Use para rankings e distribuições. 'avg_first_response_time' = tempo até primeira resposta do atendente. 'avg_reply_time' = tempo médio de todas as respostas.",
    parameters: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["inbox", "team", "assignee", "status", "priority", "day", "hour"],
          description: "Dimensão de agrupamento: inbox=estado, team=departamento, assignee=atendente",
        },
        agg: {
          type: "string",
          enum: ["count", "avg_first_response_time", "avg_reply_time"],
          description: "count=contagem, avg_first_response_time=tempo até 1ª resposta (segundos), avg_reply_time=tempo médio de resposta (segundos)",
        },
        period: { type: "string", description: "Filtro de período. Sem status: filtra por created_at. Com status: filtra por last_activity_at." },
        status: { type: "integer", enum: [0, 1, 2, 3], description: "Filtrar por status" },
        limit: { type: "integer", default: 10, description: "Máximo de grupos retornados" },
      },
      required: ["group_by", "agg"],
    },
  },
  {
    name: "get_top_agents",
    description:
      "Ranking de atendentes: mais rápidos na primeira resposta (fastest), com mais conversas abertas (most_open) ou mais resoluções (most_resolved). Para 'melhor atendente', use fastest. Para 'atendente com mais conversas abertas', use most_open.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["fastest", "most_open", "most_resolved"],
          description: "fastest=menor tempo de 1ª resposta, most_open=mais conversas abertas, most_resolved=mais conversas resolvidas",
        },
        period: { type: "string", description: "Período para filtrar (para fastest: data do evento; para most_resolved: last_activity_at)" },
        limit: { type: "integer", default: 5, description: "Quantos atendentes retornar (padrão: 5)" },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_dashboard_summary",
    description:
      "Resumo operacional rápido. ATENÇÃO: 'em_aberto' e 'pendentes' são SEMPRE contagem atual total (snapshot do momento), independente do período informado. Apenas 'resolvidas_no_periodo' respeita o filtro de período. Use para relatório geral do dia ou visão rápida. Para contar abertas/pendentes em um período específico, use query_conversations com status e period.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", default: "hoje", description: "Período para contar resolvidas (opened/pending sempre são snapshot total)" },
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
