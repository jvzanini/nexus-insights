/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock all power-bi server actions usado pelas row actions.
jest.mock("@/lib/actions/integrations-power-bi", () => ({
  disableProfileAction: jest.fn(async () => ({ ok: true })),
  reactivateProfileAction: jest.fn(async () => ({ ok: true })),
  deleteProfileAction: jest.fn(async () => ({ ok: true })),
  rotatePasswordAction: jest.fn(async () => ({
    ok: true,
    data: { password: "newp" },
  })),
  getProfileByIdAction: jest.fn(async () => ({
    ok: true,
    data: { allowedColumns: {} },
  })),
  revealPasswordAction: jest.fn(async () => ({
    ok: true,
    data: { password: "p" },
  })),
  createProfileAction: jest.fn(),
  updateProfileAction: jest.fn(),
}));

// Mock action options pra evitar fetch no teamtoggle (não relevante aqui).
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

import type { ProfileListItem } from "@/lib/actions/integrations-power-bi";
import { ProfileList } from "../profile-list";

const sampleProfiles: ProfileListItem[] = [
  {
    id: "p-1",
    name: "Diretoria",
    description: "Acesso total para liderança",
    status: "active",
    pgUsername: "pbi_diretoria_a3f8c2",
    passwordLast4: "x123",
    allowedTables: [
      "chatwoot_facts_daily_by_account",
      "dim_accounts",
      "dim_dates",
    ],
    accountIdFilter: null,
    teamIdFilter: null,
    lastProvisionedAt: new Date("2026-04-15"),
    lastProvisionError: null,
    createdAt: new Date("2026-04-10T10:00:00Z"),
    updatedAt: new Date("2026-04-12T11:00:00Z"),
    disabledAt: null,
    createdBy: { id: "u-1", name: "Admin", email: "a@a.com" },
  },
  {
    id: "p-2",
    name: "Operacao",
    description: null,
    status: "disabled",
    pgUsername: "pbi_operacao_b1c2d3",
    passwordLast4: "abcd",
    allowedTables: ["chatwoot_facts_daily_by_team"],
    accountIdFilter: [1, 2, 3],
    teamIdFilter: null,
    lastProvisionedAt: null,
    lastProvisionError: null,
    createdAt: new Date("2026-03-20T08:00:00Z"),
    updatedAt: new Date("2026-04-01T09:00:00Z"),
    disabledAt: new Date("2026-04-05"),
    createdBy: null,
  },
  {
    id: "p-3",
    name: "ErroPerfil",
    description: null,
    status: "error",
    pgUsername: "pbi_erro_xyz",
    passwordLast4: "fail",
    allowedTables: ["dim_accounts"],
    accountIdFilter: null,
    teamIdFilter: null,
    lastProvisionedAt: null,
    lastProvisionError: "DDL falhou: permission denied",
    createdAt: new Date("2026-02-15"),
    updatedAt: new Date("2026-02-15"),
    disabledAt: null,
    createdBy: null,
  },
];

describe("ProfileList", () => {
  it("renderiza linha por perfil com nome e status", () => {
    render(<ProfileList profiles={sampleProfiles} />);

    expect(
      screen.getByTestId("profile-row-p-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile-row-p-2"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile-row-p-3"),
    ).toBeInTheDocument();

    expect(screen.getByText("Diretoria")).toBeInTheDocument();
    expect(screen.getByText("Operacao")).toBeInTheDocument();
    expect(screen.getByText("ErroPerfil")).toBeInTheDocument();
  });

  it("renderiza chip status correto por linha", () => {
    render(<ProfileList profiles={sampleProfiles} />);
    const chips = screen.getAllByTestId("status-chip");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveAttribute("data-status", "active");
    expect(chips[1]).toHaveAttribute("data-status", "disabled");
    expect(chips[2]).toHaveAttribute("data-status", "error");
  });

  it("mostra mensagem de erro inline quando status=error", () => {
    render(<ProfileList profiles={sampleProfiles} />);
    expect(
      screen.getByText(/DDL falhou: permission denied/),
    ).toBeInTheDocument();
  });

  it("mostra dropdown de ações por linha", () => {
    render(<ProfileList profiles={sampleProfiles} />);
    expect(screen.getByTestId("row-actions-p-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-actions-p-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-actions-p-3")).toBeInTheDocument();
  });
});
