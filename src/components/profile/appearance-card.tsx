"use client";

import { useTransition } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/providers/theme-provider";
import { updateProfile } from "@/lib/actions/profile";

type ThemeOption = "dark" | "light" | "system";

interface AppearanceCardProps {
  currentTheme: ThemeOption;
}

const THEME_OPTIONS: Array<{
  value: ThemeOption;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "dark",
    label: "Escuro",
    description: "Tema escuro padrão",
    icon: Moon,
  },
  {
    value: "light",
    label: "Claro",
    description: "Tema claro",
    icon: Sun,
  },
  {
    value: "system",
    label: "Sistema",
    description: "Segue o sistema",
    icon: Monitor,
  },
];

export function AppearanceCard({ currentTheme }: AppearanceCardProps) {
  const { theme, setTheme } = useTheme();
  const [isPending, start] = useTransition();

  // Mantém o tema do contexto como fonte primária; usa currentTheme só como fallback inicial.
  const active: ThemeOption = (theme as ThemeOption | undefined) ?? currentTheme;

  function handleSelect(option: ThemeOption) {
    if (option === active) return;
    setTheme(option);
    start(async () => {
      const result = await updateProfile({ theme: option });
      if (!result.success) {
        toast.error(result.error || "Não foi possível salvar o tema");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Palette className="h-4 w-4 text-violet-500" />
          Aparência
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Tema da plataforma"
          className="grid grid-cols-3 gap-3"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = active === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${option.label} — ${option.description}`}
                onClick={() => handleSelect(option.value)}
                disabled={isPending}
                className={[
                  "flex h-full min-h-[7rem] flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center outline-none transition-all duration-200 cursor-pointer",
                  "focus-visible:ring-2 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? "border-violet-500 bg-violet-500/10 text-violet-300 ring-2 ring-violet-500/40"
                    : "border-border bg-background/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-muted-foreground/30",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
