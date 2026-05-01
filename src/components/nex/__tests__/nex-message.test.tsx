/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { NexMessage } from "@/components/nex/nex-message";

// jsdom não implementa play/pause/load — stubs no-op evitam "Not implemented".
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn(async () => {});
  window.HTMLMediaElement.prototype.pause = jest.fn(() => {});
  window.HTMLMediaElement.prototype.load = jest.fn(() => {});
});

describe("NexMessage", () => {
  it("copy button visível em user e assistant", () => {
    const { rerender } = render(<NexMessage role="user" content="hello" />);
    expect(screen.getByLabelText(/copiar/i)).toBeInTheDocument();

    rerender(<NexMessage role="assistant" content="hi" />);
    expect(screen.getByLabelText(/copiar/i)).toBeInTheDocument();
  });

  it("kind='audio' sem audioBlobUrl mostra '(áudio expirado)'", () => {
    render(
      <NexMessage
        role="user"
        kind="audio"
        content="oi mundo"
        audioBlobUrl={null}
      />,
    );
    expect(screen.getByText(/áudio expirado/i)).toBeInTheDocument();
    expect(screen.getByText(/oi mundo/i)).toBeInTheDocument();
  });

  it("kind='audio' com audioBlobUrl renderiza AudioPlayer (botão Tocar)", () => {
    render(
      <NexMessage
        role="user"
        kind="audio"
        content="oi"
        audioBlobUrl="blob:fake-url"
        durationSeconds={5}
      />,
    );
    expect(screen.getByLabelText("Tocar")).toBeInTheDocument();
    expect(screen.getByLabelText("Velocidade")).toBeInTheDocument();
  });

  it("aria-label diz 'Copiar mensagem' (genérico, não 'resposta')", () => {
    render(<NexMessage role="user" content="x" />);
    expect(screen.getByLabelText("Copiar mensagem")).toBeInTheDocument();
  });
});
