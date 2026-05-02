/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { WaitingBucketsDonut } from "../waiting-buckets-donut";

const HOUR = 3600;
const DAY = 24 * HOUR;

describe("WaitingBucketsDonut", () => {
  it("bucketiza items em 4 faixas (0-4h, 4-24h, 1-3d, >3d)", () => {
    const items = [
      {
        id: 1,
        displayId: 1,
        contactName: "A",
        inboxName: "X",
        teamName: null,
        assigneeName: null,
        waitingSeconds: HOUR,
        lastIncomingAt: "2026-05-02T00:00:00Z",
        snippet: null,
      },
      {
        id: 2,
        displayId: 2,
        contactName: "B",
        inboxName: "X",
        teamName: null,
        assigneeName: null,
        waitingSeconds: 5 * HOUR,
        lastIncomingAt: "2026-05-02T00:00:00Z",
        snippet: null,
      },
      {
        id: 3,
        displayId: 3,
        contactName: "C",
        inboxName: "X",
        teamName: null,
        assigneeName: null,
        waitingSeconds: 2 * DAY,
        lastIncomingAt: "2026-05-02T00:00:00Z",
        snippet: null,
      },
      {
        id: 4,
        displayId: 4,
        contactName: "D",
        inboxName: "X",
        teamName: null,
        assigneeName: null,
        waitingSeconds: 5 * DAY,
        lastIncomingAt: "2026-05-02T00:00:00Z",
        snippet: null,
      },
    ];
    render(
      <WaitingBucketsDonut items={items} total={4} oldestSeconds={5 * DAY} />,
    );
    expect(screen.getByText("0–4h")).toBeInTheDocument();
    expect(screen.getByText("4–24h")).toBeInTheDocument();
    expect(screen.getByText("1–3 dias")).toBeInTheDocument();
    expect(screen.getByText("Mais de 3 dias")).toBeInTheDocument();
  });

  it("mostra total no centro do donut", () => {
    render(
      <WaitingBucketsDonut items={[]} total={31} oldestSeconds={4 * DAY} />,
    );
    // O DonutWithCenter mostra centerValue mesmo sem items via prop
    expect(screen.getByText("31")).toBeInTheDocument();
  });

  it("mostra 'Mais antiga há …' quando oldestSeconds > 0", () => {
    render(
      <WaitingBucketsDonut items={[]} total={5} oldestSeconds={3 * DAY} />,
    );
    expect(screen.getByText(/Mais antiga há/i)).toBeInTheDocument();
  });

  it("não mostra 'Mais antiga' quando oldestSeconds = 0", () => {
    render(<WaitingBucketsDonut items={[]} total={0} oldestSeconds={0} />);
    expect(screen.queryByText(/Mais antiga há/i)).not.toBeInTheDocument();
  });
});
