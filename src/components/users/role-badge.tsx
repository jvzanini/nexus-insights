import {
  PLATFORM_ROLE_ICONS,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_STYLES,
} from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";

export function RoleBadge({ role }: { role: PlatformRole }) {
  const Icon = PLATFORM_ROLE_ICONS[role];
  const style = PLATFORM_ROLE_STYLES[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${style.iconClassName}`} />
      {PLATFORM_ROLE_LABELS[role]}
    </span>
  );
}
