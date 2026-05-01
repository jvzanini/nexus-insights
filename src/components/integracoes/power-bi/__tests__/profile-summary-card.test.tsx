/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  updateProfileAction: jest.fn(async () => ({ ok: true })),
}));

import type { ProfileDetail } from "@/lib/actions/integrations-power-bi";
import { ProfileSummaryCard } from "../profile-summary-card";

function buildProfile(overrides: Partial<ProfileDetail> = {}): ProfileDetail {
  return {
    id: "p-1",
    name: "Diretoria",
    description: "Acesso total para liderança",
    status: "active",
    pgUsername: "pbi_diretoria_a3f8c2",
    passwordLast4: "x123",
    allowedTables: ["dim_accounts"],
    accountIdFilter: null,
    teamIdFilter: null,
    lastProvisionedAt: new Date("2026-04-15T14:00:00Z"),
    lastProvisionError: null,
    createdAt: new Date("2026-04-10T10:00:00Z"),
    updatedAt: new Date("2026-04-12T11:00:00Z"),
    disabledAt: null,
    createdBy: { id: "u-1", name: "Admin Master", email: "admin@example.com" },
    allowedColumns: { dim_accounts: ["account_id", "name"] },
    auditEvents: [],
    ...overrides,
  };
}

describe("ProfileSummaryCard", () => {
  it("renderiza meta básica e status chip", () => {
    render(<ProfileSummaryCard profile={buildProfile()} />);
    expect(screen.getByTestId("profile-summary-card")).toBeInTheDocument();
    expect(screen.getByText("Resumo")).toBeInTheDocument();
    expect(screen.getByText("Admin Master")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
  });

  it("não mostra banner amarelo quando status=active", () => {
    render(<ProfileSummaryCard profile={buildProfile()} />);
    expect(
      screen.queryByTestId("provisioning-failed-banner"),
    ).not.toBeInTheDocument();
  });

  it("mostra banner amarelo + mensagem de erro + botão retry quando status=error", () => {
    render(
      <ProfileSummaryCard
        profile={buildProfile({
          status: "error",
          lastProvisionError:
            "DDL falhou: permission denied for schema powerbi",
        })}
      />,
    );

    expect(
      screen.getByTestId("provisioning-failed-banner"),
    ).toBeInTheDocument();
    expect(screen.getByText("Provisionamento falhou")).toBeInTheDocument();
    expect(
      screen.getByTestId("provisioning-error-message"),
    ).toHaveTextContent("DDL falhou: permission denied for schema powerbi");
    expect(screen.getByTestId("retry-provision-button")).toBeInTheDocument();
  });

  it('mostra "Nunca" para lastProvisionedAt null', () => {
    render(
      <ProfileSummaryCard
        profile={buildProfile({ lastProvisionedAt: null })}
      />,
    );
    expect(screen.getByText("Nunca")).toBeInTheDocument();
  });

  it('mostra "Sistema" quando createdBy é null', () => {
    render(<ProfileSummaryCard profile={buildProfile({ createdBy: null })} />);
    expect(screen.getByText("Sistema")).toBeInTheDocument();
  });
});
