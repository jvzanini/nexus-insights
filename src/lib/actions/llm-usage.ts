"use server";

import { auth } from "@/auth";
import {
  getDistinctModelsInRange,
  getDistinctProvidersInRange,
  getUsageDetails,
  getUsageStats,
  type UsageDetailsResult,
  type UsageSummary,
} from "@/lib/llm/queries/usage-stats";

async function ensureSuperAdmin(): Promise<void> {
  const session = await auth();
  const role = (session?.user as { platformRole?: string } | undefined)
    ?.platformRole;
  if (role !== "super_admin") {
    throw new Error("Apenas super_admin pode acessar dados de consumo de IA.");
  }
}

function parseDate(value: string, label: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Parâmetro "${label}" inválido: ${value}`);
  }
  return d;
}

export async function fetchUsageStats(args: {
  start: string;
  end: string;
  provider?: string | null;
}): Promise<UsageSummary> {
  await ensureSuperAdmin();
  return getUsageStats({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
    provider: args.provider,
  });
}

export async function fetchUsageDetails(args: {
  start: string;
  end: string;
  limit?: number;
  offset?: number;
  provider?: string | null;
  model?: string | null;
  /** v0.31.0: true = só Playground; false = só Bubble; null/undefined = ambos. */
  isPlayground?: boolean | null;
}): Promise<UsageDetailsResult> {
  await ensureSuperAdmin();
  return getUsageDetails({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
    limit: args.limit,
    offset: args.offset,
    provider: args.provider,
    model: args.model,
    isPlayground: args.isPlayground,
  });
}

export async function fetchDistinctProvidersInRange(args: {
  start: string;
  end: string;
}): Promise<string[]> {
  await ensureSuperAdmin();
  return getDistinctProvidersInRange({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
  });
}

export async function fetchDistinctModelsInRange(args: {
  start: string;
  end: string;
  provider?: string | null;
}): Promise<string[]> {
  await ensureSuperAdmin();
  return getDistinctModelsInRange({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
    provider: args.provider,
  });
}
