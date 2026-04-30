"use client";

import { Users, Shield, EyeOff } from "lucide-react";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import type { Visibility } from "@/lib/reports/visibility";

const OPTIONS: SelectOption[] = [
  {
    value: "all",
    label: "Todos",
    description: "Visível para todos os usuários",
    icon: <Users className="h-4 w-4 text-muted-foreground" />,
  },
  {
    value: "super_admin_only",
    label: "Somente super admin",
    description: "Apenas super admin vê",
    icon: <Shield className="h-4 w-4 text-muted-foreground" />,
  },
  {
    value: "none",
    label: "Ninguém",
    description: "Oculto para todos, inclusive super admin",
    icon: <EyeOff className="h-4 w-4 text-muted-foreground" />,
  },
];

interface VisibilitySelectProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

/**
 * Dropdown de visibilidade com 3 níveis (all / super_admin_only / none).
 * Reusa o `CustomSelect` (base-ui Popover) para herdar foco/dismiss/portal.
 */
export function VisibilitySelect({
  value,
  onChange,
  disabled,
  className,
  triggerClassName,
}: VisibilitySelectProps) {
  return (
    <CustomSelect
      value={value}
      onChange={(v) => onChange(v as Visibility)}
      options={OPTIONS}
      disabled={disabled}
      className={className}
      triggerClassName={triggerClassName}
    />
  );
}
