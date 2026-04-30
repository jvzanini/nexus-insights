"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Building2,
  User,
  LayoutDashboard,
  MessageSquare,
  MailWarning,
  BarChart3,
  Zap,
  Users,
  Map,
  Sparkles,
  Settings,
  UserCog,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import {
  globalSearch,
  type GlobalSearchResponse,
  type SearchResult,
} from "@/lib/actions/global-search";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  trigger: ReactNode;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  User,
  LayoutDashboard,
  MessageSquare,
  MailWarning,
  BarChart3,
  Zap,
  Users,
  Map,
  Sparkles,
  Settings,
  UserCog,
};

const EMPTY_RESPONSE: GlobalSearchResponse = {
  empresas: [],
  usuarios: [],
  paginas: [],
  total: 0,
};

const SECTION_LABELS: Record<keyof Omit<GlobalSearchResponse, "total">, string> = {
  empresas: "Empresas",
  usuarios: "Usuários",
  paginas: "Páginas",
};

const SECTION_ORDER: Array<keyof Omit<GlobalSearchResponse, "total">> = [
  "empresas",
  "usuarios",
  "paginas",
];

function getIcon(iconKey?: string): LucideIcon {
  if (iconKey && ICON_MAP[iconKey]) return ICON_MAP[iconKey];
  return Search;
}

export function GlobalSearch({ trigger }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const flatResults = useMemo<SearchResult[]>(() => {
    return SECTION_ORDER.flatMap((key) => results[key]);
  }, [results]);

  const sections = useMemo(
    () =>
      SECTION_ORDER.map((key) => ({
        key,
        label: SECTION_LABELS[key],
        items: results[key],
      })).filter((s) => s.items.length > 0),
    [results],
  );

  // Atalho global Cmd/Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Travar scroll do body enquanto modal aberto + auto-focus
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = prev;
        window.clearTimeout(id);
      };
    }
    // Reset estado ao fechar
    setQuery("");
    setResults(EMPTY_RESPONSE);
    setActiveIndex(0);
    setLoading(false);
    return undefined;
  }, [open]);

  // Debounce 150ms na busca
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(EMPTY_RESPONSE);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const res = await globalSearch(trimmed);
        setResults(res);
        setActiveIndex(0);
      } catch {
        setResults(EMPTY_RESPONSE);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [query, open]);

  // Garante que o item ativo esteja visível ao navegar com setas
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-result-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (item: SearchResult) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (flatResults.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + flatResults.length) % flatResults.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatResults[activeIndex];
        if (item) handleSelect(item);
      }
    },
    [flatResults, activeIndex, handleSelect],
  );

  const trimmedQuery = query.trim();
  const showEmpty =
    !loading && trimmedQuery.length >= 2 && flatResults.length === 0;
  const showHint = trimmedQuery.length < 2;

  // index global helper
  let runningIndex = -1;

  return (
    <>
      <div onClick={() => setOpen(true)} role="presentation">
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                key="global-search-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              >
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Busca global"
                  className="fixed top-24 left-1/2 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Search input */}
                  <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Buscar empresas, usuários, páginas..."
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Termo de busca"
                      className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                    <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      ESC
                    </kbd>
                  </div>

                  {/* Results */}
                  <div
                    ref={listRef}
                    className="max-h-[60vh] overflow-y-auto"
                    role="listbox"
                    aria-label="Resultados da busca"
                  >
                    {showHint ? (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Digite ao menos 2 caracteres para buscar.
                      </div>
                    ) : showEmpty ? (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Nenhum resultado para
                        <span className="ml-1 font-medium text-foreground">
                          “{trimmedQuery}”
                        </span>
                      </div>
                    ) : (
                      <div className="py-2">
                        {sections.map((section) => (
                          <div key={section.key} className="mb-1">
                            <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {section.label} ({section.items.length})
                            </div>
                            <ul className="px-2">
                              {section.items.map((item) => {
                                runningIndex += 1;
                                const idx = runningIndex;
                                const Icon = getIcon(item.iconKey);
                                const isActive = idx === activeIndex;
                                return (
                                  <li key={`${item.type}-${item.id}`}>
                                    <button
                                      type="button"
                                      data-result-index={idx}
                                      onMouseEnter={() => setActiveIndex(idx)}
                                      onClick={() => handleSelect(item)}
                                      className={cn(
                                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 cursor-pointer",
                                        isActive
                                          ? "bg-accent/40"
                                          : "hover:bg-accent/30",
                                      )}
                                    >
                                      <Icon
                                        className={cn(
                                          "h-4 w-4 shrink-0",
                                          isActive
                                            ? "text-violet-500"
                                            : "text-muted-foreground",
                                        )}
                                      />
                                      <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-semibold text-foreground">
                                          {item.title}
                                        </span>
                                        {item.subtitle ? (
                                          <span className="truncate text-[11px] text-muted-foreground">
                                            {item.subtitle}
                                          </span>
                                        ) : null}
                                      </div>
                                      {item.badge ? (
                                        <span className="shrink-0 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                          {item.badge}
                                        </span>
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span>
                      {trimmedQuery.length < 2
                        ? "Pronto para buscar"
                        : `${results.total} resultado${results.total === 1 ? "" : "s"}`}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border bg-background/50 p-0.5">
                          <ArrowUp className="h-3 w-3" />
                        </kbd>
                        <kbd className="rounded border border-border bg-background/50 p-0.5">
                          <ArrowDown className="h-3 w-3" />
                        </kbd>
                        navegar
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border bg-background/50 p-0.5">
                          <CornerDownLeft className="h-3 w-3" />
                        </kbd>
                        abrir
                      </span>
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
