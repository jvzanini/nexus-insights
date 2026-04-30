/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import {
  STATUS_OPTIONS,
  StatusBadge,
} from "@/components/reports/status-badge";

describe("StatusBadge — labels no feminino", () => {
  it("renderiza 'Aberta' (status 0) com cor amber", () => {
    const { container } = render(<StatusBadge status={0} />);
    expect(screen.getByText("Aberta")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-amber-500");
  });

  it("renderiza 'Resolvida' (status 1) com cor sky", () => {
    const { container } = render(<StatusBadge status={1} />);
    expect(screen.getByText("Resolvida")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-sky-500");
    // Sanity: garante que não voltamos pro emerald antigo.
    expect(container.firstChild).not.toHaveClass("text-emerald-500");
  });

  it("renderiza 'Pendente' (status 2) com cor violet", () => {
    const { container } = render(<StatusBadge status={2} />);
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-violet-500");
  });

  it("renderiza 'Adiada' (status 3) com cor slate", () => {
    const { container } = render(<StatusBadge status={3} />);
    expect(screen.getByText("Adiada")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-slate-400");
    // Sanity: zinc antigo foi removido.
    expect(container.firstChild).not.toHaveClass("text-zinc-400");
  });

  it("STATUS_OPTIONS expõe todos os status no feminino", () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: 0, label: "Aberta" },
      { value: 1, label: "Resolvida" },
      { value: 2, label: "Pendente" },
      { value: 3, label: "Adiada" },
    ]);
  });

  it("status desconhecido cai no fallback '—'", () => {
    render(<StatusBadge status={999} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
