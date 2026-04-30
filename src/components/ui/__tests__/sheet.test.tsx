/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";

function Controlled({ initial = false }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetHeader>Título</SheetHeader>
      <SheetBody>Conteúdo</SheetBody>
      <SheetFooter>
        <button onClick={() => setOpen(false)}>Fechar</button>
      </SheetFooter>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("não renderiza conteúdo quando fechado", () => {
    render(<Controlled />);
    expect(screen.queryByText("Conteúdo")).toBeNull();
  });

  it("renderiza quando aberto e fecha em ESC", () => {
    render(<Controlled initial />);
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText("Conteúdo")).toBeNull();
  });

  it("aria-modal=true e role dialog", () => {
    render(<Controlled initial />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
