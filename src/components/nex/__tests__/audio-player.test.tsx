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
    // Botão de velocidade aparece com o speed atual no aria-label.
    expect(
      screen.getByLabelText(/velocidade 1× \(clique para próxima\)/i),
    ).toBeInTheDocument();
  });

  it("botão de velocidade renderiza com 1× inicial e expõe os 5 speeds canônicos (v0.15.2)", () => {
    render(<AudioPlayer src="blob:fake" />);
    const button = screen.getByLabelText(
      /velocidade 1× \(clique para próxima\)/i,
    );
    expect(button.textContent).toContain("1×");
    expect(SPEEDS).toEqual([1, 1.25, 1.5, 1.75, 2]);
  });

  it("botão de velocidade tem min-w-[44px] pra acomodar todos os labels sem stretch (v0.24.0)", () => {
    render(<AudioPlayer src="blob:fake" />);
    const button = screen.getByRole("button", {
      name: /velocidade .+ \(clique para próxima\)/i,
    });
    // min-w-[44px] garante largura uniforme entre "1×", "1.25×", "1.5×", "1.75×", "2×".
    // 44px também é hit target acessível (Apple HIG ≥44pt).
    expect(button.className).toContain("min-w-[44px]");
  });

  it("clicar no botão cicla 1× → 1.25× → 1.5× → 1.75× → 2× → 1× (v0.15.2)", () => {
    const { container } = render(<AudioPlayer src="blob:fake" />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    const getButton = () =>
      screen.getByRole("button", { name: /velocidade .+ \(clique para próxima\)/i });

    expect(audio.playbackRate).toBe(1);
    expect(getButton().textContent).toContain("1×");

    fireEvent.click(getButton());
    expect(getButton().textContent).toContain("1.25×");
    expect(audio.playbackRate).toBeCloseTo(1.25);

    fireEvent.click(getButton());
    expect(getButton().textContent).toContain("1.5×");

    fireEvent.click(getButton());
    expect(getButton().textContent).toContain("1.75×");

    fireEvent.click(getButton());
    expect(getButton().textContent).toContain("2×");
    expect(audio.playbackRate).toBeCloseTo(2);

    // Cicla — volta para 1×.
    fireEvent.click(getButton());
    expect(getButton().textContent).toContain("1×");
    expect(audio.playbackRate).toBeCloseTo(1);
  });
});
