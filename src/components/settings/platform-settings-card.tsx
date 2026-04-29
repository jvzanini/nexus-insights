"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Globe, ChevronDown, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import { updatePlatformSettings } from "@/lib/actions/platform-settings";

interface PlatformSettingsCardProps {
  currentTimezone: string;
  currentLocale: string;
  canEdit: boolean;
}

// Timezones priorizados para Brasil + principais internacionais.
// Ao digitar a busca, o usuário pode encontrar qualquer um suportado pelo Intl.
const PRIORITY_TIMEZONES: string[] = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Cuiaba",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
  "America/New_York",
  "Europe/London",
  "Europe/Lisbon",
];

const LOCALE_OPTIONS: SelectOption[] = [
  { value: "pt-BR", label: "Português (Brasil)", description: "pt-BR" },
  { value: "en-US", label: "English (United States)", description: "en-US" },
  { value: "es-ES", label: "Español (España)", description: "es-ES" },
  { value: "fr-FR", label: "Français (France)", description: "fr-FR" },
];

function getAllTimezones(): string[] {
  try {
    const intlAny = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intlAny.supportedValuesOf === "function") {
      return intlAny.supportedValuesOf("timeZone");
    }
  } catch {
    // ignore
  }
  return PRIORITY_TIMEZONES;
}

function formatTzLabel(tz: string): string {
  return tz.replace(/_/g, " ");
}

interface TimezoneComboboxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

function TimezoneCombobox({ value, onChange, disabled, id }: TimezoneComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTimezones = useMemo(() => getAllTimezones(), []);

  const orderedTimezones = useMemo(() => {
    const priority = PRIORITY_TIMEZONES.filter((tz) => allTimezones.includes(tz));
    const rest = allTimezones.filter((tz) => !PRIORITY_TIMEZONES.includes(tz));
    return [...priority, ...rest];
  }, [allTimezones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedTimezones.slice(0, 200);
    return orderedTimezones
      .filter((tz) => tz.toLowerCase().includes(q))
      .slice(0, 200);
  }, [orderedTimezones, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      // Foca o input de busca quando abre
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  function handleSelect(tz: string) {
    onChange(tz);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full min-h-[44px] items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{formatTzLabel(value)}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-[100] mt-1 rounded-lg border border-border bg-popover shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar timezone…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div
              role="listbox"
              aria-label="Timezones disponíveis"
              className="max-h-64 overflow-y-auto"
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Nenhum timezone encontrado.
                </div>
              ) : (
                filtered.map((tz) => {
                  const selected = tz === value;
                  return (
                    <button
                      key={tz}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleSelect(tz)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-accent",
                        selected && "bg-accent/50",
                      )}
                    >
                      <span className="text-sm font-medium text-foreground truncate">
                        {formatTzLabel(tz)}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PlatformSettingsCard({
  currentTimezone,
  currentLocale,
  canEdit,
}: PlatformSettingsCardProps) {
  const router = useRouter();
  const [timezone, setTimezone] = useState<string>(currentTimezone);
  const [locale, setLocale] = useState<string>(currentLocale);
  const [isPending, start] = useTransition();

  const dirty = timezone !== currentTimezone || locale !== currentLocale;

  function handleSave() {
    if (!canEdit || isPending || !dirty) return;

    start(async () => {
      try {
        await updatePlatformSettings({ timezone, locale });
        toast.success("Configurações da plataforma salvas");
        router.refresh();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Erro ao salvar configurações da plataforma";
        toast.error(msg);
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Globe className="h-4 w-4 text-violet-500" />
          Plataforma
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Fuso horário e idioma do sistema.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="platform-timezone">Fuso horário</Label>
              <TimezoneCombobox
                id="platform-timezone"
                value={timezone}
                onChange={setTimezone}
                disabled={!canEdit || isPending}
              />
              <p className="text-xs text-muted-foreground">
                Usado para agrupar conversas por dia, semana e mês nos
                relatórios.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-locale">Idioma</Label>
              <CustomSelect
                value={locale}
                onChange={setLocale}
                options={LOCALE_OPTIONS}
                placeholder="Selecionar idioma"
                disabled={!canEdit || isPending}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Formato de números, datas e textos do sistema.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || isPending || !dirty}
              className="cursor-pointer min-h-[44px]"
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Salvar configurações
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
