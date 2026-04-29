"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface CachedBadgeProps {
  cachedAt?: Date | string | null;
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatRelative(deltaMs: number): string {
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 30) return "agora mesmo";
  if (seconds < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

export function CachedBadge({ cachedAt }: CachedBadgeProps) {
  const referenceMs = cachedAt
    ? cachedAt instanceof Date
      ? cachedAt.getTime()
      : new Date(cachedAt).getTime()
    : null;

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  if (!referenceMs || Number.isNaN(referenceMs)) return null;

  const delta = Math.max(0, now - referenceMs);
  const label = formatRelative(delta);
  const text = label === "agora mesmo" ? "agora mesmo" : label;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      Atualizado {text}
    </span>
  );
}
