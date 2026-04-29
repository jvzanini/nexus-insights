"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/providers/theme-provider";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import {
  filterNav,
  NAV_ITEMS,
  type NavItem,
} from "@/lib/constants/nav";
import type { PlatformRole } from "@/generated/prisma/client";

interface SidebarUser {
  id: string;
  name: string;
  email: string;
  role: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  avatarUrl: string | null;
}

interface SidebarProps {
  user: SidebarUser;
  appSettings?: Record<string, unknown>;
}

export function Sidebar({ user, appSettings = {} }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "/relatorios": pathname.startsWith("/relatorios"),
  });
  const { theme, setTheme } = useTheme();

  const THEME_CYCLE = ["dark", "light", "system"] as const;
  const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
  const THEME_LABELS = {
    dark: "Modo escuro",
    light: "Modo claro",
    system: "Sistema",
  } as const;

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

  const ThemeIcon = THEME_ICONS[theme] ?? Moon;
  const visibleNav = filterNav(NAV_ITEMS, user, appSettings);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function toggleGroup(href: string) {
    setOpenGroups((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function renderItem(item: NavItem, depth = 0) {
    const active = isActive(item.href);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const isOpen = openGroups[item.href] ?? false;

    if (hasChildren) {
      return (
        <div key={item.href}>
          <button
            onClick={() => toggleGroup(item.href)}
            className={`
              group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
              transition-all duration-200 cursor-pointer
              ${
                active
                  ? "bg-muted/50 text-violet-500 border-l-2 border-violet-500 pl-[10px]"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }
            `}
          >
            <item.icon
              className={`h-[18px] w-[18px] transition-colors duration-200 ${
                active
                  ? "text-violet-500"
                  : "text-muted-foreground group-hover:text-foreground"
              }`}
            />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                key="children"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
                  {item.children!.map((child) => renderItem(child, depth + 1))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`
          group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
          transition-all duration-200 cursor-pointer
          ${
            active
              ? "bg-muted/50 text-violet-500 border-l-2 border-violet-500 pl-[10px]"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          }
        `}
      >
        <item.icon
          className={`h-[16px] w-[16px] transition-colors duration-200 ${
            active
              ? "text-violet-500"
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        />
        <span>{item.label}</span>
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-6">
        <Image
          src="/logo-nexus-ai.png"
          alt="Nexus AI"
          width={40}
          height={40}
          className="rounded-[22%] shadow-[0_0_12px_rgba(124,58,237,0.3)]"
        />
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">
            Nexus Insights
          </h1>
          <p className="text-[11px] text-muted-foreground leading-none">
            Relatórios e insights
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map((item, index) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-4 space-y-3">
        <Link
          href="/perfil"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {user.role}
            </p>
          </div>
        </Link>

        <Button
          variant="ghost"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <ThemeIcon className="h-4 w-4" />
          {THEME_LABELS[theme]}
        </Button>

        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">{sidebarContent}</aside>

      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-11 w-11 bg-card border border-border text-foreground hover:text-foreground cursor-pointer"
        >
          {mobileOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </Button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
