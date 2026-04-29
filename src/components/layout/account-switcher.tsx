"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { switchAccount } from "@/lib/actions/account-switch";

interface AccountOption {
  id: number;
  name: string;
}

interface AccountSwitcherProps {
  accounts: AccountOption[];
  currentAccountId: number;
}

export function AccountSwitcher({
  accounts,
  currentAccountId,
}: AccountSwitcherProps) {
  const [pending, startTransition] = useTransition();

  const active =
    accounts.find((a) => a.id === currentAccountId) ?? accounts[0] ?? null;

  function handleSelect(id: number) {
    if (id === currentAccountId || pending) return;
    startTransition(async () => {
      const result = await switchAccount(id);
      if (result.success) {
        const next = accounts.find((a) => a.id === id);
        toast.success(
          next ? `Conta alterada para ${next.name}` : "Conta alterada",
        );
      } else {
        toast.error(result.error ?? "Erro ao trocar de conta");
      }
    });
  }

  if (!active || accounts.length <= 1) {
    // Sem opções de troca: só mostra a label estática (sem dropdown).
    return (
      <div
        className="mx-3 mb-2 flex max-w-[200px] items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs"
        aria-label="Conta ativa"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-foreground">
          {active?.name ?? "Sem contas"}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2">
      <Popover>
        <PopoverTrigger
          aria-label="Trocar conta ativa"
          disabled={pending}
          className={cn(
            "group flex w-full max-w-[200px] items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs",
            "transition-all duration-200 cursor-pointer",
            "hover:border-violet-500/60 hover:bg-muted/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-violet-400" />
          <span className="flex-1 truncate text-left font-medium text-foreground">
            {active.name}
          </span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[220px] p-1"
        >
          <div
            role="listbox"
            aria-label="Contas disponíveis"
            className="flex flex-col gap-0.5"
          >
            {accounts.map((acc) => {
              const isActive = acc.id === currentAccountId;
              return (
                <button
                  key={acc.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={pending || isActive}
                  onClick={() => handleSelect(acc.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
                    "disabled:cursor-default",
                    isActive
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Building2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-violet-400" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate font-medium">
                    {acc.name}
                  </span>
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
