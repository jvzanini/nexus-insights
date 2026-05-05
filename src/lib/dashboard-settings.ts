// Settings do dashboard — congelados em valores canônicos a partir da v0.42.
//
// REGRA SUPREMA do projeto (definida pelo usuário):
//   "começa na segunda e termina no domingo, sempre"
//
// Settings persistidos em `app_settings` (week_starts_on, week_mode,
// month_mode) são IGNORADOS a partir de v0.42 — o helper retorna sempre
// a configuração canônica (segunda-feira, current). Settings antigos
// permanecem no DB para compat shim, mas não afetam comportamento.
//
// @canonical see src/lib/datetime-core.ts (getCanonicalPeriod)

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DashboardMode = "current" | "rolling";

export interface DashboardSettings {
  weekStartsOn: WeekStartsOn;
  weekMode: DashboardMode;
  monthMode: DashboardMode;
}

export const DASHBOARD_DEFAULTS: DashboardSettings = {
  weekStartsOn: 1,
  weekMode: "current",
  monthMode: "current",
};

let warned = false;

/**
 * Retorna sempre os defaults canônicos: { weekStartsOn:1, weekMode:'current',
 * monthMode:'current' }. Settings persistidos em DB ficam ignorados.
 */
export async function getDashboardSettings(): Promise<DashboardSettings> {
  if (!warned && process.env.NODE_ENV !== "test") {
    warned = true;
    console.warn(
      "[dashboard-settings] v0.42 canonical: settings dashboard.week_starts_on/" +
        "week_mode/month_mode estão deprecados e ignorados. Helper retorna " +
        "sempre { weekStartsOn:1, weekMode:'current', monthMode:'current' }.",
    );
  }
  return { ...DASHBOARD_DEFAULTS };
}

/** Mantido para compat — no-op. */
export function invalidateDashboardSettings(): void {
  // no-op
}
