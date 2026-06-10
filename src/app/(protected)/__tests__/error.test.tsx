/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import ProtectedError from "../error";

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

describe("ProtectedError (error boundary)", () => {
  it("mostra mensagem de recuperação e botão de tentar novamente", () => {
    render(<ProtectedError error={new Error("boom")} reset={jest.fn()} />);
    // getByText/getByRole lançam se o elemento não existir — a própria busca
    // já é a asserção de presença.
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /tentar novamente/i }),
    ).toBeTruthy();
  });

  it("chama reset() ao clicar em tentar novamente", () => {
    const reset = jest.fn();
    render(<ProtectedError error={new Error("boom")} reset={reset} />);
    fireEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
