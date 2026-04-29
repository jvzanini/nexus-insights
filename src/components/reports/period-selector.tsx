"use client";

// Wrapper de compatibilidade: o seletor antigo (segmented control) foi
// substituído pelo componente de pills mobile-friendly em
// `@/components/reports/period-pills`. Este arquivo só re-exporta tipos e
// helpers para preservar imports legados.

export {
  type PeriodKey,
  getPeriod,
  PERIOD_OPTIONS,
} from "@/lib/reports/period";

export { PeriodPills as PeriodSelector } from "@/components/reports/period-pills";
