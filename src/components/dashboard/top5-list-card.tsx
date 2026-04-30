import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Top5ListItem {
  name: string;
  value: string;
  meta?: string;
}

export interface Top5ListCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  items: Top5ListItem[];
  emptyMessage?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Top5ListCard({
  icon: Icon,
  iconColor,
  iconBg = "bg-violet-500/10",
  title,
  subtitle,
  items,
  emptyMessage = "Sem dados no período.",
}: Top5ListCardProps) {
  return (
    <Card className="bg-card border border-border rounded-xl h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}
            aria-hidden="true"
          >
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </span>
          <span className="flex flex-col">
            <span className="leading-none">{title}</span>
            {subtitle ? (
              <span className="mt-1 text-xs font-normal text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40"
              aria-hidden="true"
            >
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item, idx) => (
              <li
                key={`${item.name}-${idx}`}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="w-4 text-xs font-medium tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg} text-xs font-semibold ${iconColor}`}
                  aria-hidden="true"
                >
                  {getInitials(item.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  {item.meta ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.meta}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-md bg-muted/40 px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
