"use client";

import { cn } from "@/lib/utils";

export interface SuggestionsBarProps {
  suggestions: string[];
  onPick: (s: string) => void;
}

/**
 * SuggestionsBar — chips violet outline com sugestões clicáveis emitidas pelo agente Nex.
 * Renderizado abaixo da última assistant message no Bubble e Playground.
 *
 * v0.31.0: componente compartilhado entre nex-chat-panel e playground-sheet.
 */
export function SuggestionsBar({ suggestions, onPick }: SuggestionsBarProps) {
  if (suggestions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Sugestões clicáveis"
      className="flex flex-wrap gap-2 px-1 pt-1"
    >
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={cn(
            "cursor-pointer rounded-full border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-700 transition-colors",
            "hover:border-violet-500/60 hover:bg-violet-500/15",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
            "dark:text-violet-300",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
