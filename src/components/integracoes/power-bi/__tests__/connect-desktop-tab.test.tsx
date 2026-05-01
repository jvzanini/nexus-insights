/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

const toastMock = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({ toast: toastMock }));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  revealPasswordAction: jest.fn(),
}));

import { ConnectDesktopTab } from "../connect-desktop-tab";

const baseConnection = {
  host: "db.example.com",
  port: 5432,
  database: "nexus_insights",
  user: "pbi_diretoria_a3f8c2",
  passwordLast4: "x123",
};

describe("ConnectDesktopTab", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it("renderiza 7 passos numerados", () => {
    render(
      <ConnectDesktopTab profileId="p-1" connectionInfo={baseConnection} />,
    );
    const steps = screen.getByTestId("connect-desktop-steps");
    expect(steps).toBeInTheDocument();
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`connect-desktop-step-${i}`)).toBeInTheDocument();
    }
  });

  it("renderiza SnippetBlocks Server, Database, User", () => {
    render(
      <ConnectDesktopTab profileId="p-1" connectionInfo={baseConnection} />,
    );
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("db.example.com:5432")).toBeInTheDocument();
    expect(screen.getByText("nexus_insights")).toBeInTheDocument();
    expect(screen.getByText("pbi_diretoria_a3f8c2")).toBeInTheDocument();
  });

  it("mostra senha mascarada por default + botão Mostrar senha", () => {
    render(
      <ConnectDesktopTab profileId="p-1" connectionInfo={baseConnection} />,
    );
    expect(screen.getByTestId("connect-desktop-password-masked")).toHaveTextContent(
      "••••••••x123",
    );
    expect(screen.getByTestId("connect-desktop-reveal")).toBeInTheDocument();
  });

  it("renderiza nota Windows TLS workaround no footer", () => {
    render(
      <ConnectDesktopTab profileId="p-1" connectionInfo={baseConnection} />,
    );
    expect(screen.getByText(/Windows TLS workaround/i)).toBeInTheDocument();
  });
});
