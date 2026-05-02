/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { ConversaDrillDown } from "../conversa-drill-down";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 1,
  contact: {
    id: 1,
    name: "X",
    phone_number: "+5511912345678",
    identifier: null,
    additional_attributes: null,
  },
  inbox: { id: 1, name: "WA" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0,
  priority: null,
  created_at: null,
  last_activity_at: null,
  last_message_type: null,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: { cpf: "123", plano: "gold" },
  waiting_seconds: null,
  open_seconds: null,
  labels: [
    { name: "VIP", color: "" },
    { name: "matriz", color: "" },
  ],
};

describe("ConversaDrillDown — 3 seções inline", () => {
  it("renderiza WhatsApp / Etiquetas / Atributos", () => {
    render(<ConversaDrillDown row={baseRow} accountId={9} />);
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByText(/Etiquetas/i)).toBeInTheDocument();
    expect(screen.getByText(/Atributos/i)).toBeInTheDocument();
  });

  it("contador (N) na MESMA linha do rótulo Atributos", () => {
    render(<ConversaDrillDown row={baseRow} accountId={9} />);
    const atrLabel = screen.getByText(/Atributos/i);
    // o rótulo + (2) estão no mesmo elemento ou irmão imediato
    expect(atrLabel.textContent || atrLabel.parentElement?.textContent).toMatch(
      /\(2\)/,
    );
  });

  it("etiquetas como chips visíveis", () => {
    render(<ConversaDrillDown row={baseRow} accountId={9} />);
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("matriz")).toBeInTheDocument();
  });

  it("não renderiza mais botão/link 'Abrir'", () => {
    render(<ConversaDrillDown row={baseRow} accountId={9} />);
    expect(
      screen.queryByRole("link", { name: /abrir/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /abrir/i }),
    ).not.toBeInTheDocument();
  });

  it("sem etiquetas → mostra '—' (empty visual)", () => {
    render(
      <ConversaDrillDown row={{ ...baseRow, labels: [] }} accountId={9} />,
    );
    // pega o container da seção Etiquetas
    const labelHeader = screen.getByText(/Etiquetas/i);
    const section = labelHeader.closest("div");
    expect(section?.textContent).toMatch(/—/);
  });

  it("sem atributos → mostra '— sem atributos'", () => {
    render(
      <ConversaDrillDown
        row={{ ...baseRow, custom_attributes: {} }}
        accountId={9}
      />,
    );
    expect(screen.getByText(/sem atributos/i)).toBeInTheDocument();
  });

  it("Mostra TODOS atributos quando entries.length <= 200", () => {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
    render(
      <ConversaDrillDown
        row={{ ...baseRow, custom_attributes: attrs } as ConversaRow}
        accountId={9}
      />,
    );
    for (let i = 0; i < 50; i++) {
      expect(screen.getByText(`k${i}:`)).toBeInTheDocument();
    }
  });

  it("Cap defensivo 200: mostra primeiros 200 + nota '+N atributos não exibidos'", () => {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < 250; i++) attrs[`k${i}`] = `v${i}`;
    render(
      <ConversaDrillDown
        row={{ ...baseRow, custom_attributes: attrs } as ConversaRow}
        accountId={9}
      />,
    );
    expect(screen.getByText(/\+50 atributos não exibidos/)).toBeInTheDocument();
  });

  it("não renderiza botão 'Ver mais' nem 'Recolher'", () => {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
    render(
      <ConversaDrillDown
        row={{ ...baseRow, custom_attributes: attrs } as ConversaRow}
        accountId={9}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /ver mais/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /recolher/i }),
    ).not.toBeInTheDocument();
  });

  it("container tem border-l violet sutil + animação fade-in", () => {
    const { container } = render(
      <ConversaDrillDown row={baseRow} accountId={9} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toHaveClass(/border-l/);
    expect(region?.className).toMatch(/violet/);
    expect(region?.className).toMatch(/fade-in/);
  });
});
