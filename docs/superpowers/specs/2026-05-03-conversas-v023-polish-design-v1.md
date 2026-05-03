# Spec v1: Conversas v0.23 — Polish + Bug Fixes

> **Data**: 2026-05-03
> **Status**: v1 inicial (pente-fino #1 a seguir)

---

## 1. Objetivo

18 ajustes do super_admin no `/relatorios/conversas`, incluindo 3 bugs críticos:
- Busca não funciona (não filtra).
- Filtro single-day data personalizada retorna 0.
- Sorting permite duplicar coluna em múltiplos critérios.

---

## 2. Escopo

### Bugs críticos
1. **Busca**: page.tsx não passa `search` ao backend. Fix: adicionar `search: filterState.search` em `reportFilters`.
2. **Single-day filter**: investigar TZ vs endOfDay; provável correção em `datetime-core.ts` `case "custom"`.
3. **Sorting duplicação**: filtrar opções já usadas no select dos critérios subsequentes.

### Layout barra busca
4. Ajustar input search pra não quebrar layout ao digitar.
5. Badge ⏎ Enter inline (estilo Command+K) dentro do input, com a palavra "Enter" em violet.

### Calendar
6. Diminuir tamanho fonte dos números e componente (-1 unidade).
7. defaultMonth = hoje (não março/2025).

### Toolbar da tabela
8. Remover duplicação "X Ordenação 3".
9. Formato "Mostrando 1-1.000 de 7.183 conversas".
10. Paginação no TOPO (não rodapé).

### Paginação
11. Novo algoritmo:
    - 1 pág: "1"
    - 2 pág: "1 2"
    - 3 pág: "1 2 3"
    - 4+ pág + atual=1: "1 ... N"
    - 4+ pág + atual=N: "1 ... N"
    - 4+ pág + atual no meio: "1 ... atual ... N"
12. Reticências = dropdown clicável (lista todas as páginas do meio).
13. Número atual no meio tem chevron + dropdown.

### FiltersDialog
14. Abrir todas seções fechadas.
15. "Limpar todos" só limpa filtros; mantém modal aberto; não mexe em período/ordenação.
16. Header: "Filtros simples" / "Filtros avançados" conforme modo.

### Chips de Filtros/Ordenação
17. X "adesivo" na quina superior direita dos chips Filtros e Ordenação no toolbar.
18. Remove lixeirinhas separadas ("Limpar filtros", "Limpar ordenação").

### Tour
19. Atualizar/adicionar step da paginação no topo.

---

## 3. Versão
v0.23.0 (v0.22.0 LIVE).
