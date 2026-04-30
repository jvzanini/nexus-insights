/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { VisibilitySelect } from "../visibility-select";

describe("<VisibilitySelect />", () => {
  it("mostra label da visibility selecionada", () => {
    render(<VisibilitySelect value="super_admin_only" onChange={() => {}} />);
    expect(screen.getByText(/Somente super admin/)).toBeInTheDocument();
  });

  it("invoca onChange ao selecionar nova opção", () => {
    const onChange = jest.fn();
    render(<VisibilitySelect value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Ninguém/));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("respeita prop disabled", () => {
    render(<VisibilitySelect value="all" onChange={() => {}} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
