/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { sendNexMessage } from "@/lib/actions/nex-chat";

import { NexChatPanel } from "../nex-chat-panel";

// jsdom não implementa play/pause/load nem scrollTo — stubs no-op evitam "Not implemented".
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn(async () => {});
  window.HTMLMediaElement.prototype.pause = jest.fn(() => {});
  window.HTMLMediaElement.prototype.load = jest.fn(() => {});
  // scrollTo no Element para o auto-scroll do panel.
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = jest.fn() as unknown as typeof Element.prototype.scrollTo;
  } else {
    jest.spyOn(Element.prototype, "scrollTo").mockImplementation(() => {});
  }
});

// Server Action mock.
jest.mock("@/lib/actions/nex-chat", () => ({
  sendNexMessage: jest.fn(),
}));

// IndexedDB helper mocks (panel chama clearAllAudios em "limpar histórico" etc).
jest.mock("@/lib/nex/audio-storage", () => ({
  clearAllAudios: jest.fn(async () => {}),
  getAudio: jest.fn(async () => null),
  saveAudio: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("nex-chat-panel — SuggestionsBar (v0.31)", () => {
  it("renderiza SuggestionsBar na última assistant message quando suggestions != []", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas", "Ver por agente"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "x" } });
    fireEvent.submit(textbox.closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/12 resolvidas/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Ver as abertas/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ver por agente/i }),
    ).toBeInTheDocument();
  });

  it("click numa sugestão envia como nova msg + consome botões", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "x" } });
    fireEvent.submit(textbox.closest("form")!);
    await waitFor(() =>
      screen.getByRole("button", { name: /Ver as abertas/i }),
    );

    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "5 abertas",
      suggestions: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /Ver as abertas/i }));

    await waitFor(() =>
      expect(sendNexMessage).toHaveBeenCalledTimes(2),
    );
    expect((sendNexMessage as jest.Mock).mock.calls[1][0]).toEqual(
      expect.arrayContaining([{ role: "user", content: "Ver as abertas" }]),
    );
  });

  it("não renderiza SuggestionsBar enquanto pending=true (flicker prevention)", async () => {
    let resolveSend: (v: {
      ok: true;
      message: string;
      suggestions: string[];
    }) => void = () => {};
    (sendNexMessage as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    render(<NexChatPanel open onClose={jest.fn()} />);
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "x" } });
    fireEvent.submit(textbox.closest("form")!);

    // Enquanto pending: nada de SuggestionsBar.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /Sugestões clicáveis/i }))
        .not.toBeInTheDocument(),
    );

    // Resolve → SuggestionsBar aparece.
    resolveSend({
      ok: true,
      message: "ok",
      suggestions: ["Próxima"],
    });

    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: /Sugestões clicáveis/i }),
      ).toBeInTheDocument(),
    );
  });
});
