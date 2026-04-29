"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PeriodSelector,
  type PeriodKey,
} from "@/components/reports/period-selector";

interface PeriodSelectorUrlProps {
  value: PeriodKey;
  defaultValue?: PeriodKey;
  paramKey?: string;
  className?: string;
}

export function PeriodSelectorUrl({
  value,
  defaultValue = "30d",
  paramKey = "period",
  className,
}: PeriodSelectorUrlProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const onChange = (next: PeriodKey) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) {
      sp.delete(paramKey);
    } else {
      sp.set(paramKey, next);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    });
  };

  return (
    <PeriodSelector value={value} onChange={onChange} className={className} />
  );
}
