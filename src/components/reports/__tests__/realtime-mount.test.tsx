/**
 * @jest-environment jsdom
 */

/**
 * Testes do wrapper `<RealtimeMount>`.
 *
 * Sanity tests mínimos:
 *  - monta `useFactsRealtime` com os args certos.
 *  - não renderiza nenhum DOM (retorna null).
 *
 * WHY: o wrapper existe pra ser usado em pages que NÃO renderizam
 * `<FactsFreshness>` (que já monta o hook). Garante que a chamada do hook é
 * idêntica e que não polui o DOM.
 */

import { render } from "@testing-library/react";

jest.mock("@/components/reports/use-facts-realtime", () => ({
  useFactsRealtime: jest.fn(),
}));

import { RealtimeMount } from "../realtime-mount";
import { useFactsRealtime } from "@/components/reports/use-facts-realtime";

describe("RealtimeMount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("monta useFactsRealtime com connectionId e accountId", () => {
    render(<RealtimeMount connectionId="conn-1" accountId={9} />);
    expect(useFactsRealtime).toHaveBeenCalledWith({
      connectionId: "conn-1",
      accountId: 9,
    });
  });

  it("não renderiza DOM", () => {
    const { container } = render(
      <RealtimeMount connectionId="conn-1" accountId={9} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
