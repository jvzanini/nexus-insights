/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { ConversasPagination } from "@/components/reports/conversas-pagination";

describe("ConversasPagination", () => {
  it("totalPages=0: retorna null", () => {
    const { container } = render(
      <ConversasPagination page={1} totalPages={0} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("totalPages=1: retorna null", () => {
    const { container } = render(
      <ConversasPagination page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("totalPages=2: render 1, 2 sem elipsis", () => {
    render(
      <ConversasPagination page={1} totalPages={2} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /ir para página 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 2/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("totalPages=5, page=3: render 1-5 sem elipsis", () => {
    render(
      <ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />,
    );
    [1, 2, 3, 4, 5].forEach((p) => {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`ir para página ${p}`, "i"),
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("totalPages=12, page=1: 1 2 ... 12 (1 elipsis)", () => {
    render(
      <ConversasPagination page={1} totalPages={12} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /ir para página 12/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("…").length).toBe(1);
  });

  it("totalPages=12, page=6: 1 ... 5 6 7 ... 12 (2 elipsis)", () => {
    render(
      <ConversasPagination page={6} totalPages={12} onPageChange={() => {}} />,
    );
    expect(screen.getAllByText("…").length).toBe(2);
    expect(
      screen.getByRole("button", { name: /ir para página 5/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 7/i }),
    ).toBeInTheDocument();
  });

  it("setinha < disabled em page=1", () => {
    render(
      <ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /página anterior/i }),
    ).toBeDisabled();
  });

  it("setinha > disabled em page=totalPages", () => {
    render(
      <ConversasPagination page={5} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /próxima página/i }),
    ).toBeDisabled();
  });

  it("click em página dispara onPageChange(N)", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={1} totalPages={5} onPageChange={cb} />);
    fireEvent.click(
      screen.getByRole("button", { name: /ir para página 3/i }),
    );
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("aria-current='page' no atual e nav role", () => {
    render(
      <ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /ir para página 3/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("navigation", { name: /paginação/i }),
    ).toBeInTheDocument();
  });
});
