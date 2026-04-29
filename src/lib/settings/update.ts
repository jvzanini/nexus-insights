"use server";

import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache } from "./get";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";

export async function updateSetting(args: {
  key: string;
  value: unknown;
  category?: string;
  userId?: string;
}) {
  const setting = await prisma.appSetting.upsert({
    where: { key: args.key },
    update: {
      value: args.value as never,
      ...(args.category ? { category: args.category } : {}),
      updatedById: args.userId,
    },
    create: {
      key: args.key,
      value: args.value as never,
      category: args.category ?? "general",
      updatedById: args.userId,
    },
  });

  await invalidateSettingsCache(args.key);

  await logAudit({
    userId: args.userId,
    action: "setting_updated",
    targetType: "AppSetting",
    targetId: args.key,
    details: { value: args.value },
  });

  await publishRealtimeEvent({
    type: "settings:updated",
    key: args.key,
  } as never);

  return setting;
}
