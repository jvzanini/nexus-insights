"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PeriodPills } from "@/components/reports/period-pills";
import { useFilterTransition } from "@/components/reports/filter-transition";
import {
  type PeriodKey,
  isPeriodKey,
} from "@/lib/reports/period";

interface PeriodSelectorUrlProps {
  value: PeriodKey;
  defaultValue?: PeriodKey;
  paramKey?: string;
  className?: string;
  accountId?: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function PeriodSelectorUrl({
  value,
  defaultValue = "30d",
  paramKey = "period",
  className,
  accountId,
}: PeriodSelectorUrlProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startTransition } = useFilterTransition();

  // Lê custom range da URL (somente válido se period === "custom").
  const customStart = searchParams.get("custom_start");
  const customEnd = searchParams.get("custom_end");
  const customRange =
    value === "custom" &&
    customStart &&
    customEnd &&
    ISO_DATE_RE.test(customStart) &&
    ISO_DATE_RE.test(customEnd)
      ? { start: customStart, end: customEnd }
      : undefined;

  const onChange = (
    next: PeriodKey,
    range?: { start: string; end: string },
  ) => {
    const sp = new URLSearchParams(searchParams.toString());

    // Reset dos params custom — só recolocamos se necessário.
    sp.delete("custom_start");
    sp.delete("custom_end");

    if (next === defaultValue && next !== "custom") {
      sp.delete(paramKey);
    } else {
      sp.set(paramKey, next);
    }

    if (next === "custom" && range) {
      sp.set("custom_start", range.start);
      sp.set("custom_end", range.end);
    }

    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    });
  };

  // Aceita só keys canônicas do PeriodPills; se a URL trouxer chave legada,
  // tratamos como default visual (a página continua funcionando via fallback
  // do `getPeriod`).
  const safeValue: PeriodKey = isPeriodKey(value) ? value : defaultValue;

  return (
    <PeriodPills
      value={safeValue}
      customRange={customRange}
      onChange={onChange}
      className={className}
      accountId={accountId}
    />
  );
}
