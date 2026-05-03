/**
 * @jest-environment jsdom
 *
 * Sanity audit (v0.25 T5): valida que toda a affordance visual de "clicável"
 * está padronizada com `cursor-pointer` na seção Conversas.
 *
 * Regras (alinhadas a ui-ux-pro-max §2 Touch & Interaction + §8 disabled-states):
 * - Todo `<button>` clicável renderizado tem `cursor-pointer` no className.
 * - Buttons com atributo `disabled` ganham `cursor-not-allowed`
 *   (manual ou via `disabled:cursor-not-allowed` Tailwind variant).
 *
 * O teste cobre PeriodPills (pills de período) e ConversasPagination
 * (setas + numerada + dropdown da atual). É um smoke test simbólico — se
 * algum componente futuro perder o cursor-pointer em algum botão clicável,
 * o teste falha e documenta a expectativa.
 */
import "@testing-library/jest-dom";

// PeriodPills → server action `getMinReportDate` → next-auth.
// Mock para isolar render.
jest.mock("@/lib/actions/reports/period", () => ({
  getMinReportDate: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

// PeriodPills usa `window.matchMedia` no useIsMobile(); jsdom não fornece.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

import { render } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";

import { PeriodPills } from "@/components/reports/period-pills";
import { ConversasPagination } from "@/components/reports/conversas-pagination";

describe("Cursor pointer audit v0.25 (Conversas section)", () => {
  it("PeriodPills — todos os buttons têm cursor-pointer", () => {
    const { container } = render(
      <PeriodPills value="hoje" onChange={() => {}} />,
    );
    // Usa querySelectorAll: as pills têm role=tab (não button), mas o elemento
    // HTML é <button>; precisamos varrer todos os <button> independente do role.
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of Array.from(buttons)) {
      expect(btn.className).toMatch(/cursor-pointer/);
    }
  });

  it("ConversasPagination — clicáveis cursor-pointer; disabled cursor-not-allowed", () => {
    const { container } = render(
      <ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of Array.from(buttons)) {
      const cls = btn.className;
      if (btn.hasAttribute("disabled")) {
        expect(cls).toMatch(/cursor-not-allowed|disabled:cursor-not-allowed/);
      } else {
        expect(cls).toMatch(/cursor-pointer/);
      }
    }
  });
});
