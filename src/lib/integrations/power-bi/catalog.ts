/**
 * Catálogo declarativo de tabelas/views expostas para integração Power BI.
 *
 * Cada entry descreve metadata pra UI (label/description), colunas
 * pré-marcadas no wizard (essentialColumns), colunas totais (allColumns),
 * PK forçada (pkColumns) e capacidade de RLS (hasAccountId/hasTeamId).
 *
 * BLOCKED_TABLES_REGEX é defesa em profundidade: o provisioner valida ANTES
 * de emitir DDL — UI nunca passa BLOCKED, mas sanity check garante.
 */

export interface CatalogTableEntry {
  label: string;
  description: string;
  pkColumns: readonly string[];
  essentialColumns: readonly string[];
  allColumns: readonly string[];
  hasAccountId: boolean;
  hasTeamId: boolean;
}

export const POWER_BI_CATALOG = {
  facts: {
    chatwoot_facts_daily_by_account: {
      label: "Diário por conta",
      description: "Volumes diários por conta (recebidas, resolvidas, abertas).",
      pkColumns: ["account_id", "bucket_date"],
      essentialColumns: ["account_id", "bucket_date", "received", "resolved", "open_at_eod"],
      allColumns: ["account_id", "bucket_date", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_inbox: {
      label: "Diário por caixa",
      description: "Volumes diários por caixa de entrada.",
      pkColumns: ["account_id", "bucket_date", "inbox_id"],
      essentialColumns: ["account_id", "bucket_date", "inbox_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "inbox_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_agent: {
      label: "Diário por atendente",
      description: "Volumes diários por atendente.",
      pkColumns: ["account_id", "bucket_date", "agent_id"],
      essentialColumns: ["account_id", "bucket_date", "agent_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "agent_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds", "is_active_at_eod"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_team: {
      label: "Diário por equipe",
      description: "Volumes diários por equipe.",
      pkColumns: ["account_id", "bucket_date", "team_id"],
      essentialColumns: ["account_id", "bucket_date", "team_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "team_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: true,
    },
    chatwoot_facts_hourly_by_account: {
      label: "Por hora por conta",
      description: "Volumes por hora por conta (granularidade horária).",
      pkColumns: ["account_id", "bucket_date", "bucket_hour"],
      essentialColumns: ["account_id", "bucket_date", "bucket_hour", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "bucket_hour", "received", "resolved", "messages_in", "messages_out", "unique_contacts"],
      hasAccountId: true,
      hasTeamId: false,
    },
  },
  dims: {
    dim_accounts: {
      label: "Contas",
      description: "Lista de contas Nexus Chat (snapshot atualizado a cada 30 min).",
      pkColumns: ["account_id"],
      essentialColumns: ["account_id", "name"],
      allColumns: ["account_id", "name", "status"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_inboxes: {
      label: "Caixas de entrada",
      description: "Lista de inboxes (Whatsapp, web, etc) por conta.",
      pkColumns: ["account_id", "inbox_id"],
      essentialColumns: ["account_id", "inbox_id", "name", "channel_type"],
      allColumns: ["account_id", "inbox_id", "name", "channel_type"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_agents: {
      label: "Atendentes",
      description: "Lista de atendentes por conta.",
      pkColumns: ["account_id", "agent_id"],
      essentialColumns: ["account_id", "agent_id", "name"],
      allColumns: ["account_id", "agent_id", "name", "email"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_teams: {
      label: "Equipes",
      description: "Lista de equipes por conta.",
      pkColumns: ["account_id", "team_id"],
      essentialColumns: ["account_id", "team_id", "name"],
      allColumns: ["account_id", "team_id", "name"],
      hasAccountId: true,
      hasTeamId: true,
    },
    dim_dates: {
      label: "Calendário",
      description: "Tabela calendário (2024–2030) com year, month, day, day_of_week, iso_week, month_name_pt.",
      pkColumns: ["bucket_date"],
      essentialColumns: ["bucket_date", "year", "month", "day"],
      allColumns: ["bucket_date", "year", "month", "day", "day_of_week", "iso_week", "month_name_pt"],
      hasAccountId: false,
      hasTeamId: false,
    },
  },
} as const satisfies {
  facts: Record<string, CatalogTableEntry>;
  dims: Record<string, CatalogTableEntry>;
};

export const BLOCKED_TABLES_REGEX = /^(users|accounts|audit_logs|llm_.*|nex_.*|password_reset_tokens|email_change_tokens|app_settings|integration_.*|user_account_access|user_team_access|sessions|verification_tokens)$/;

export function getCatalogEntry(name: string): CatalogTableEntry | undefined {
  return (POWER_BI_CATALOG.facts as Record<string, CatalogTableEntry>)[name]
    ?? (POWER_BI_CATALOG.dims as Record<string, CatalogTableEntry>)[name];
}

export function getAllCatalogTableNames(): string[] {
  return [...Object.keys(POWER_BI_CATALOG.facts), ...Object.keys(POWER_BI_CATALOG.dims)];
}

export function validateAllowedTables(tables: string[]): void {
  for (const t of tables) {
    if (BLOCKED_TABLES_REGEX.test(t)) {
      throw new Error(`Tabela bloqueada por política de segurança: "${t}".`);
    }
    if (!getCatalogEntry(t)) {
      throw new Error(`Tabela desconhecida: "${t}".`);
    }
  }
}
