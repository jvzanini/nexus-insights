/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render } from "@testing-library/react";

import { PageShell } from "../page-shell";

describe("PageShell", () => {
  it("variant=wide aplica max-w-[1600px]", () => {
    const { container } = render(<PageShell variant="wide">x</PageShell>);
    expect(container.firstChild).toHaveClass("max-w-[1600px]");
  });

  it("variant=narrow aplica max-w-7xl", () => {
    const { container } = render(<PageShell variant="narrow">x</PageShell>);
    expect(container.firstChild).toHaveClass("max-w-7xl");
  });

  it("default = wide", () => {
    const { container } = render(<PageShell>x</PageShell>);
    expect(container.firstChild).toHaveClass("max-w-[1600px]");
  });
});
