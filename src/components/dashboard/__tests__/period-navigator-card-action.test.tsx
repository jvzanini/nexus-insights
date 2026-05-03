/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
/**
 * v0.36 B1 regression guard: <PeriodNavigator> dentro do <ConversationsLineChart>
 * deve estar envelopado em <CardAction> (data-slot="card-action") para que o
 * CardHeader vire grid-cols-[1fr_auto] e o navegador fique fit-content à
 * direita do título (não esticado full-width).
 */
import { render } from "@testing-library/react";
import { ConversationsLineChart } from "../conversations-line-chart";

describe("ConversationsLineChart — B1 PeriodNavigator wrapped in <CardAction> (v0.36)", () => {
  it("DOM contém [data-slot='card-action'] envolvendo <PeriodNavigator>", () => {
    const { container } = render(
      <ConversationsLineChart
        data={[]}
        granularity="hour"
        tz="America/Sao_Paulo"
        range={{
          start: "2026-05-03T03:00:00.000Z",
          end: "2026-05-04T02:59:59.999Z",
        }}
        period="dia"
        weekStartsOn={1}
        referenceDate={null}
        nextAvailable={false}
        onReferenceDateChange={() => {}}
      />,
    );
    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toBeNull();
    const navInsideAction = action!.querySelector(
      '[role="group"][aria-label^="Navegação"]',
    );
    expect(navInsideAction).not.toBeNull();
    expect(navInsideAction!.className).toMatch(/inline-flex/);
  });
});
