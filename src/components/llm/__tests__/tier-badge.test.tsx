/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { TierBadge } from "../tier-badge";

describe("TierBadge", () => {
  it.each([
    ["free", "FREE"],
    ["low", "$"],
    ["medium", "$$"],
    ["high", "$$$"],
  ] as const)("renderiza tier=%s como '%s'", (tier, symbols) => {
    render(<TierBadge tier={tier} />);
    expect(screen.getByText(symbols)).toBeInTheDocument();
  });
});
