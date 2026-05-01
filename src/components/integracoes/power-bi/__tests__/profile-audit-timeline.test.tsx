/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { ProfileAuditTimeline } from "../profile-audit-timeline";

describe("ProfileAuditTimeline", () => {
  it("mostra empty state quando 0 eventos", () => {
    render(<ProfileAuditTimeline events={[]} />);
    expect(screen.getByTestId("audit-empty-state")).toHaveTextContent(
      "Sem atividade registrada.",
    );
  });

  it("renderiza item por evento com chip + nome user + timestamp", () => {
    render(
      <ProfileAuditTimeline
        events={[
          {
            id: "e-1",
            event: "profile_created",
            userId: "u-1",
            details: { name: "Diretoria" },
            createdAt: new Date("2026-05-01T19:24:00Z"),
          },
          {
            id: "e-2",
            event: "password_revealed",
            userId: null,
            details: null,
            createdAt: new Date("2026-04-30T14:00:00Z"),
          },
        ]}
        userById={{
          "u-1": { id: "u-1", name: "Admin", email: "admin@example.com" },
        }}
      />,
    );

    expect(screen.getByTestId("audit-events-list")).toBeInTheDocument();
    expect(screen.getByTestId("audit-item-e-1")).toBeInTheDocument();
    expect(screen.getByTestId("audit-item-e-2")).toBeInTheDocument();

    // Chip violet pra profile_created
    expect(
      screen.getByTestId("audit-chip-profile_created"),
    ).toHaveTextContent("Criado");
    // Chip amber pra password_revealed
    expect(
      screen.getByTestId("audit-chip-password_revealed"),
    ).toHaveTextContent("Senha revelada");

    // User name
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Sistema (sem userId)
    expect(screen.getByText("Sistema")).toBeInTheDocument();
  });

  it("mostra 'sem detalhes' quando details vazio", () => {
    render(
      <ProfileAuditTimeline
        events={[
          {
            id: "e-x",
            event: "profile_disabled",
            userId: null,
            details: {},
            createdAt: new Date("2026-04-29T08:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.getByText("sem detalhes")).toBeInTheDocument();
  });

  it("mostra summary 'Ver detalhes' quando details existe", () => {
    render(
      <ProfileAuditTimeline
        events={[
          {
            id: "e-rich",
            event: "whitelist_changed",
            userId: null,
            details: { allowedTables: ["dim_accounts"] },
            createdAt: new Date(),
          },
        ]}
      />,
    );
    expect(screen.getByText("Ver detalhes")).toBeInTheDocument();
  });
});
