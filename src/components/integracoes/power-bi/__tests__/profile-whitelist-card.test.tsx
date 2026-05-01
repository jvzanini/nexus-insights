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
  updateProfileAction: jest.fn(),
  createProfileAction: jest.fn(),
  getProfileByIdAction: jest.fn(),
}));

jest.mock("@/lib/actions/integrations-options", () => ({
  getAvailableAccountsForFilterAction: jest.fn(async () => ({
    ok: true,
    data: [],
  })),
  getAvailableTeamsForFilterAction: jest.fn(async () => ({
    ok: true,
    data: [],
  })),
}));

import type { ProfileDetail } from "@/lib/actions/integrations-power-bi";
import { ProfileWhitelistCard } from "../profile-whitelist-card";

function buildProfile(overrides: Partial<ProfileDetail> = {}): ProfileDetail {
  return {
    id: "p-1",
    name: "Diretoria",
    description: null,
    status: "active",
    pgUsername: "pbi_diretoria_a3f8c2",
    passwordLast4: "x123",
    allowedTables: ["chatwoot_facts_daily_by_account", "dim_accounts"],
    accountIdFilter: null,
    teamIdFilter: null,
    lastProvisionedAt: null,
    lastProvisionError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    disabledAt: null,
    createdBy: null,
    allowedColumns: {
      chatwoot_facts_daily_by_account: ["account_id", "bucket_date", "received"],
      dim_accounts: ["account_id", "name"],
    },
    auditEvents: [],
    ...overrides,
  };
}

describe("ProfileWhitelistCard", () => {
  it("renderiza card e botão editar", () => {
    render(<ProfileWhitelistCard profile={buildProfile()} />);
    expect(screen.getByTestId("profile-whitelist-card")).toBeInTheDocument();
    expect(screen.getByTestId("edit-whitelist-button")).toBeInTheDocument();
    expect(screen.getByText("Whitelist")).toBeInTheDocument();
  });

  it("lista cada tabela liberada com label e código", () => {
    render(<ProfileWhitelistCard profile={buildProfile()} />);
    expect(
      screen.getByTestId("whitelist-row-chatwoot_facts_daily_by_account"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("whitelist-row-dim_accounts"),
    ).toBeInTheDocument();
    expect(screen.getByText("Diário por conta")).toBeInTheDocument();
    expect(screen.getByText("Contas")).toBeInTheDocument();
  });

  it("renderiza chips de colunas selecionadas", () => {
    render(<ProfileWhitelistCard profile={buildProfile()} />);
    expect(screen.getAllByText("account_id").length).toBeGreaterThan(0);
    expect(screen.getByText("bucket_date")).toBeInTheDocument();
    expect(screen.getByText("received")).toBeInTheDocument();
  });

  it("mostra footnote de filtro de contas quando accountIdFilter setado", () => {
    render(
      <ProfileWhitelistCard
        profile={buildProfile({ accountIdFilter: [1, 2, 3] })}
      />,
    );
    expect(screen.getAllByText(/Filtrado por contas/).length).toBeGreaterThan(
      0,
    );
  });

  it("mostra texto sem filtros quando ambos accountIdFilter e teamIdFilter são null", () => {
    render(<ProfileWhitelistCard profile={buildProfile()} />);
    expect(
      screen.getByText(/sem filtros \(todas as contas\)/),
    ).toBeInTheDocument();
  });
});
