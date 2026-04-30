/**
 * Decide qual item do sidebar deve estar marcado como ativo, sem que rotas
 * com prefixos compartilhados ativem o "pai" junto com o "filho".
 *
 * Exemplos:
 *  - pathname `/configuracoes/consumo`:
 *      - "Configurações" (`/configuracoes`, folha) → NÃO ativa.
 *      - "Consumo IA" (`/configuracoes/consumo`, folha) → ativa.
 *  - pathname `/usuarios/123/edit`:
 *      - "Usuários" (`/usuarios`, folha) → ativa (não há href mais específico).
 *  - pathname `/relatorios/conversas`:
 *      - "Relatórios" (com children) → ativa (grupo).
 *      - "Conversas" (folha) → ativa.
 */

import type { NavItem } from "@/lib/constants/nav";

/** Coleta hrefs de todos os itens "folha" (sem children) recursivamente. */
export function collectLeafHrefs(items: NavItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.children?.length) {
      out.push(...collectLeafHrefs(it.children));
    } else {
      out.push(it.href);
    }
  }
  return out;
}

/**
 * Item folha (sem children) está ativo se o pathname for igual ao href OU
 * começar com `${href}/`, EXCETO quando existe outro href folha mais
 * específico que também casa com o pathname.
 */
export function isLeafActive(
  href: string,
  pathname: string,
  allLeafHrefs: readonly string[],
): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  const moreSpecific = allLeafHrefs.find(
    (h) =>
      h !== href &&
      h.startsWith(href + "/") &&
      (pathname === h || pathname.startsWith(h + "/")),
  );
  return !moreSpecific;
}

/**
 * Item-grupo (com children) está ativo quando o pathname é o próprio href
 * ou começa com `${href}/` (i.e., algum filho está ativo).
 */
export function isGroupActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
