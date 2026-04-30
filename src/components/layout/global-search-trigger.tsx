"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { GlobalSearch } from "@/components/layout/global-search";

export function GlobalSearchTrigger() {
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const platform =
      // navigator.platform é deprecated mas ainda é o jeito mais consistente
      // de detectar Mac em ambientes onde userAgentData não existe.
      (navigator as unknown as { platform?: string }).platform ?? "";
    const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
    setShortcutLabel(isMac ? "⌘ K" : "Ctrl K");
  }, []);

  return (
    <GlobalSearch
      trigger={
        <button
          type="button"
          aria-label="Abrir busca global"
          className="group flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-all duration-200 cursor-pointer hover:border-violet-500/40 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-violet-400" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="shrink-0 rounded border border-border bg-background/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
            {shortcutLabel}
          </kbd>
        </button>
      }
    />
  );
}
