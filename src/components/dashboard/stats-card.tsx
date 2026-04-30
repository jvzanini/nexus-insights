"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

export interface StatsCardProps {
  label: string;
  sublabel?: string;
  value: string | number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  comparison?: number | null;
  /** true = mais é pior (ex: falhas). Default false. */
  invertTrend?: boolean;
  /** Badge alternativo no topo (ex: "agora") quando comparison não se aplica. */
  badge?: string;
  /** Sufixo no comparison (ex: "pp" para pontos percentuais). */
  comparisonSuffix?: string;
}

export function StatsCard({
  label,
  sublabel,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  comparison,
  invertTrend = false,
  badge,
  comparisonSuffix = "%",
}: StatsCardProps) {
  const isPositive = comparison !== null && comparison !== undefined && comparison > 0;
  const isNegative = comparison !== null && comparison !== undefined && comparison < 0;
  const trendIsGood = invertTrend ? isNegative : isPositive;
  const trendIsBad = invertTrend ? isPositive : isNegative;

  return (
    <motion.div variants={itemVariants}>
      <Card className="bg-card border border-border hover:border-muted-foreground/30 transition-all duration-200 rounded-xl cursor-default">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className={`p-2.5 rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div className="flex items-center gap-1 text-xs font-medium">
              {badge ? (
                <Badge
                  variant="outline"
                  className="text-xs border-border text-muted-foreground"
                >
                  {badge}
                </Badge>
              ) : comparison === null || comparison === undefined ? (
                <Badge
                  variant="outline"
                  className="text-xs border-border text-muted-foreground"
                >
                  Novo
                </Badge>
              ) : (
                <span
                  className={
                    trendIsGood
                      ? "text-emerald-400"
                      : trendIsBad
                        ? "text-red-400"
                        : "text-muted-foreground"
                  }
                >
                  <span className="inline-flex items-center gap-0.5">
                    {isPositive ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : isNegative ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : null}
                    {comparison > 0 ? "+" : ""}
                    {comparison.toFixed(1)}
                    {comparisonSuffix}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {label}
              {sublabel ? <span className="ml-1">{sublabel}</span> : null}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
