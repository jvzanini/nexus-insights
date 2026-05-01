/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { AudioPlayer, SPEEDS } from "@/components/nex/audio-player";

// jsdom não implementa play/pause/load — stubs no-op evitam "Not implemented".
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn(async () => {});
  window.HTMLMediaElement.prototype.pause = jest.fn(() => {});
  window.HTMLMediaElement.prototype.load = jest.fn(() => {});
});

describe("AudioPlayer", () => {
  it("renderiza com botão Tocar (estado inicial pausado)", () => {
    render(<AudioPlayer src="blob:fake" durationSeconds={12} />);
    expect(screen.getByLabelText("Tocar")).toBeInTheDocument();
    expect(screen.getByLabelText("Progresso")).toBeInTheDocument();
    expect(screen.getByLabelText("Velocidade")).toBeInTheDocument();
  });

  it("dropdown de velocidade mostra exatamente 5 opções (1×, 1.25×, 1.5×, 1.75×, 2×)", () => {
    render(<AudioPlayer src="blob:fake" />);
    const select = screen.getByLabelText("Velocidade") as HTMLSelectElement;
    expect(select.options).toHaveLength(SPEEDS.length);
    expect(SPEEDS).toHaveLength(5);
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(["1×", "1.25×", "1.5×", "1.75×", "2×"]);
  });

  it("trocar speed altera audio.playbackRate", () => {
    const { container } = render(<AudioPlayer src="blob:fake" />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    const select = screen.getByLabelText("Velocidade") as HTMLSelectElement;

    expect(audio.playbackRate).toBe(1);

    fireEvent.change(select, { target: { value: "1.75" } });
    expect(audio.playbackRate).toBeCloseTo(1.75);

    fireEvent.change(select, { target: { value: "2" } });
    expect(audio.playbackRate).toBeCloseTo(2);
  });
});
