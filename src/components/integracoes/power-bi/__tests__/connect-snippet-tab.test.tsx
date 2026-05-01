/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

const toastMock = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({ toast: toastMock }));

import { ConnectSnippetTab } from "../connect-snippet-tab";

const sampleViews = [
  {
    table: "chatwoot_facts_daily_by_account",
    label: "Diário por conta",
    viewName: "pbi_abcd1234_v_chatwoot_facts_daily_by_account",
  },
  {
    table: "dim_accounts",
    label: "Contas",
    viewName: "pbi_abcd1234_v_dim_accounts",
  },
];

describe("ConnectSnippetTab", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it("renderiza header explicativo", () => {
    render(
      <ConnectSnippetTab
        host="db.example.com"
        port={5432}
        database="nexus_insights"
        views={sampleViews}
      />,
    );
    expect(screen.getByText("Snippets Power Query M")).toBeInTheDocument();
    expect(
      screen.getByText(/Cole no Power Query Editor/i),
    ).toBeInTheDocument();
  });

  it("renderiza 1 accordion item por view derivada", () => {
    render(
      <ConnectSnippetTab
        host="db.example.com"
        port={5432}
        database="nexus_insights"
        views={sampleViews}
      />,
    );
    const list = screen.getByTestId("connect-snippet-list");
    expect(list).toBeInTheDocument();
    expect(screen.getByText("Diário por conta")).toBeInTheDocument();
    expect(screen.getByText("Contas")).toBeInTheDocument();
    // viewName mono — primeiro view aberto (defaultOpen idx===0)
    expect(
      screen.getByTestId(
        "connect-snippet-viewname-pbi_abcd1234_v_chatwoot_facts_daily_by_account",
      ),
    ).toBeInTheDocument();
  });

  it("renderiza empty state quando views.length === 0", () => {
    render(
      <ConnectSnippetTab
        host="db.example.com"
        port={5432}
        database="nexus_insights"
        views={[]}
      />,
    );
    expect(screen.getByTestId("connect-snippet-empty")).toBeInTheDocument();
    expect(
      screen.getByText("Sem views liberadas neste perfil"),
    ).toBeInTheDocument();
  });
});
