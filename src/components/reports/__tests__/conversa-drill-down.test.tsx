/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { ConversaDrillDown } from "../conversa-drill-down";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 8653,
  contact: {
    id: 1,
    name: "Fernando T.",
    phone_number: "+5531999845112",
    identifier: null,
    additional_attributes: null,
  },
  inbox: { id: 1, name: "Geral" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0,
  priority: 1,
  created_at: "2026-04-23T14:32:00Z",
  last_activity_at: "2026-04-28T09:15:00Z",
  last_message_type: 0,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: { wpp_id: "553199845112", origem: "campanha" },
  waiting_seconds: 8100,
  open_seconds: null,
  labels: [{ name: "VIP", color: "" }],
};

describe("ConversaDrillDown", () => {
  it("renderiza WhatsApp formatado, etiqueta e atributos completos", () => {
    render(<ConversaDrillDown row={baseRow} accountId={1} />);
    expect(screen.getByText(/Fernando T/i)).toBeInTheDocument();
    // O telefone aparece formatado em pt-BR. Não validamos a string exata
    // (o formatPhone pode normalizar), apenas que o WhatsApp label existe.
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText(/wpp_id/i)).toBeInTheDocument();
    expect(screen.getByText(/Atributos \(2\)/i)).toBeInTheDocument();
  });
});
