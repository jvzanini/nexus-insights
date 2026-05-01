/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { TierBadge } from "../tier-badge";

describe("TierBadge", () => {
  it.each([
    ["low", "$", /blue-500/],
    ["medium", "$$", /amber-500/],
    ["high", "$$$", /orange-500/],
    ["premium", "$$$$", /red-500/],
  ] as const)(
    "renderiza tier=%s com símbolo %s e classe esperada",
    (tier, symbols, classExp) => {
      const { container } = render(<TierBadge tier={tier} />);
      expect(screen.getByText(symbols)).toBeInTheDocument();
      const span = container.querySelector("span");
      expect(span?.className).toMatch(classExp);
    },
  );

  it("aplica className customizada além das padrões do tier", () => {
    const { container } = render(<TierBadge tier="low" className="ml-2" />);
    expect(container.querySelector("span")?.className).toContain("ml-2");
  });
});
