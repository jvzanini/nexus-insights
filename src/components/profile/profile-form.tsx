"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, User as UserIcon, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/lib/actions/profile";

type ThemeOption = "dark" | "light" | "system";

interface ProfileFormProps {
  initial: {
    name: string;
    theme: ThemeOption;
  };
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
    description: "Segue o sistema operacional",
    icon: Monitor,
  },
];

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState<string>(initial.name);
  const [theme, setTheme] = useState<ThemeOption>(initial.theme);
  const [isPending, start] = useTransition();

  function handleSave() {
    if (name.trim().length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres");
      return;
    }

    start(async () => {
      const result = await updateProfile({ name: name.trim(), theme });
      if (result.success) {
        toast.success("Perfil atualizado");
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao salvar perfil");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <UserIcon className="h-4 w-4 text-violet-500" />
          Editar perfil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            Como você quer ser chamado na plataforma.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Tema</Label>
          <div
            role="radiogroup"
            aria-label="Tema da plataforma"
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option.value)}
                  disabled={isPending}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    selected
                      ? "border-violet-500 bg-violet-500/10 text-violet-300"
                      : "border-border bg-background/40 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
