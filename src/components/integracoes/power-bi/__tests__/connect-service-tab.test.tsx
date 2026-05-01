/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { ConnectServiceTab } from "../connect-service-tab";

describe("ConnectServiceTab", () => {
  it("renderiza box Gateway recomendado com 5 passos", () => {
    render(<ConnectServiceTab />);
    expect(screen.getByTestId("service-gateway-recommended")).toBeInTheDocument();
    expect(screen.getByText("On-premises Data Gateway")).toBeInTheDocument();
    expect(screen.getByText(/Recomendado/i)).toBeInTheDocument();

    const steps = screen.getByTestId("service-gateway-steps");
    expect(steps).toBeInTheDocument();
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`service-gateway-step-${i}`)).toBeInTheDocument();
    }
  });

  it("renderiza box amarelo de Acesso direto (alternativa)", () => {
    render(<ConnectServiceTab />);
    expect(screen.getByTestId("service-direct-alternative")).toBeInTheDocument();
    expect(
      screen.getByText("Acesso direto via internet (alternativa)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Configurar IP allowlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Garantir TLS válido/i)).toBeInTheDocument();
  });
});
