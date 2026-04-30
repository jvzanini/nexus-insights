import {
  collectLeafHrefs,
  isGroupActive,
  isLeafActive,
} from "../sidebar-active-path";
import type { NavItem } from "@/lib/constants/nav";
import { Home } from "lucide-react";

const ICON = Home;

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: ICON },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: ICON,
    children: [
      { label: "Visão Geral", href: "/relatorios/visao-geral", icon: ICON },
      { label: "Conversas", href: "/relatorios/conversas", icon: ICON },
    ],
  },
  { label: "Usuários", href: "/usuarios", icon: ICON },
  { label: "Configurações", href: "/configuracoes", icon: ICON },
  { label: "Consumo IA", href: "/configuracoes/consumo", icon: ICON },
  { label: "Perfil", href: "/perfil", icon: ICON },
];

const LEAFS = collectLeafHrefs(NAV);

describe("collectLeafHrefs", () => {
  it("recolhe folhas e ignora item com children no nível raiz", () => {
    expect(LEAFS).toEqual([
      "/dashboard",
      "/relatorios/visao-geral",
      "/relatorios/conversas",
      "/usuarios",
      "/configuracoes",
      "/configuracoes/consumo",
      "/perfil",
    ]);
  });
});

describe("isLeafActive", () => {
  it("dashboard exact match", () => {
    expect(isLeafActive("/dashboard", "/dashboard", LEAFS)).toBe(true);
    expect(isLeafActive("/dashboard", "/dashboard/foo", LEAFS)).toBe(false);
    expect(isLeafActive("/dashboard", "/", LEAFS)).toBe(false);
  });

  it("configuracoes NÃO ativa em /configuracoes/consumo", () => {
    expect(isLeafActive("/configuracoes", "/configuracoes/consumo", LEAFS)).toBe(
      false,
    );
  });

  it("configuracoes ATIVA em /configuracoes (próprio)", () => {
    expect(isLeafActive("/configuracoes", "/configuracoes", LEAFS)).toBe(true);
  });

  it("consumo ativa em /configuracoes/consumo (próprio)", () => {
    expect(
      isLeafActive("/configuracoes/consumo", "/configuracoes/consumo", LEAFS),
    ).toBe(true);
  });

  it("usuarios ativa em subrota não listada (/usuarios/123/edit)", () => {
    expect(isLeafActive("/usuarios", "/usuarios/123/edit", LEAFS)).toBe(true);
  });

  it("perfil exact em /perfil", () => {
    expect(isLeafActive("/perfil", "/perfil", LEAFS)).toBe(true);
  });

  it("conversas ativa em /relatorios/conversas", () => {
    expect(
      isLeafActive("/relatorios/conversas", "/relatorios/conversas", LEAFS),
    ).toBe(true);
  });

  it("visao-geral NÃO ativa em /relatorios/conversas", () => {
    expect(
      isLeafActive("/relatorios/visao-geral", "/relatorios/conversas", LEAFS),
    ).toBe(false);
  });
});

describe("isGroupActive", () => {
  it("relatorios ativa em /relatorios/conversas", () => {
    expect(isGroupActive("/relatorios", "/relatorios/conversas")).toBe(true);
  });

  it("relatorios ativa em /relatorios", () => {
    expect(isGroupActive("/relatorios", "/relatorios")).toBe(true);
  });

  it("relatorios NÃO ativa em /usuarios", () => {
    expect(isGroupActive("/relatorios", "/usuarios")).toBe(false);
  });
});
