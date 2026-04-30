"use server";

import { auth } from "@/auth";
import {
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
}): Promise<UsageSummary> {
  await ensureSuperAdmin();
  return getUsageStats({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
  });
}

export async function fetchUsageDetails(args: {
  start: string;
  end: string;
  limit?: number;
  offset?: number;
}): Promise<UsageDetailsResult> {
  await ensureSuperAdmin();
  return getUsageDetails({
    start: parseDate(args.start, "start"),
    end: parseDate(args.end, "end"),
    limit: args.limit,
    offset: args.offset,
  });
}
