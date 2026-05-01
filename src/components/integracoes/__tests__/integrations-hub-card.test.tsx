/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { IntegrationsHubCard } from "../integrations-hub-card";

describe("IntegrationsHubCard", () => {
  it("render card disponível com link", () => {
    render(
      <IntegrationsHubCard
        descriptor={{
          kind: "power_bi",
          label: "Power BI",
          vendor: "Microsoft",
          description: "Test desc",
          href: "/integracoes/power-bi",
          status: "available",
          icon: "BarChart3",
        }}
        activeProfilesCount={3}
      />,
    );
    expect(screen.getByText("Power BI")).toBeInTheDocument();
    expect(screen.getByText("Microsoft")).toBeInTheDocument();
    expect(screen.getByText("Disponível")).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/perfis ativos/)).toBeInTheDocument();
    expect(screen.getByText(/Configurar/)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/integracoes/power-bi");
  });

  it("render card 'Em breve' sem link", () => {
    render(
      <IntegrationsHubCard
        descriptor={{
          kind: "looker_studio",
          label: "Looker Studio",
          vendor: "Google",
          description: "Conexão direta a PostgreSQL.",
          href: null,
          status: "coming_soon",
          icon: "TrendingUp",
        }}
      />,
    );
    expect(screen.getByText("Em breve")).toBeInTheDocument();
    expect(screen.queryByText(/Configurar/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("singular 'perfil ativo' quando count=1", () => {
    render(
      <IntegrationsHubCard
        descriptor={{
          kind: "power_bi",
          label: "Power BI",
          vendor: "Microsoft",
          description: "x",
          href: "/x",
          status: "available",
          icon: "BarChart3",
        }}
        activeProfilesCount={1}
      />,
    );
    expect(screen.getByText(/perfil ativo$/)).toBeInTheDocument();
  });
});
