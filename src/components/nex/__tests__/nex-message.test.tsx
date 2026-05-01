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
    // v0.15.2: dropdown de velocidade virou botão cíclico com aria-label
    // "Velocidade <X>× (clique para próxima)".
    expect(
      screen.getByLabelText(/velocidade 1× \(clique para próxima\)/i),
    ).toBeInTheDocument();
  });

  it("aria-label diz 'Copiar mensagem' (genérico, não 'resposta')", () => {
    render(<NexMessage role="user" content="x" />);
    expect(screen.getByLabelText("Copiar mensagem")).toBeInTheDocument();
  });

  it("kind='audio' sem blob mas com hasStoredAudio mostra skeleton 'carregando áudio…' (v0.15.4)", () => {
    render(
      <NexMessage
        role="user"
        kind="audio"
        content="transcricao salva"
        audioBlobUrl={null}
        hasStoredAudio
      />,
    );
    expect(screen.getByLabelText("Carregando áudio")).toBeInTheDocument();
    expect(screen.getByText(/carregando áudio/i)).toBeInTheDocument();
    // Não mostra fallback "expirado" enquanto está carregando.
    expect(screen.queryByText(/áudio expirado/i)).not.toBeInTheDocument();
  });

  it("kind='audio' com content vazio (player imediato pré-transcrição) não mostra a bubble de transcrição (v0.15.4)", () => {
    render(
      <NexMessage
        role="user"
        kind="audio"
        content=""
        audioBlobUrl="blob:fake"
        durationSeconds={3}
      />,
    );
    // Player presente.
    expect(screen.getByLabelText("Tocar")).toBeInTheDocument();
    // Não há bubble com 📝 enquanto não há transcrição.
    expect(screen.queryByText(/📝/)).not.toBeInTheDocument();
  });
});
