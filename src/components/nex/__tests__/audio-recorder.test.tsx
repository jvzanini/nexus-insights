/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { installMediaRecorderMock } from "@/test-utils/media-recorder-mock";

// Instala o mock global ANTES do import do componente.
installMediaRecorderMock();

// eslint-disable-next-line import/first
import { AudioRecorder } from "@/components/nex/audio-recorder";

describe("AudioRecorder", () => {
  it("começa em estado idle (botão mic)", () => {
    render(<AudioRecorder onSend={() => {}} />);
    expect(screen.getByLabelText(/gravar áudio/i)).toBeInTheDocument();
  });

  it("clicar em gravar move para estado recording (mostra Gravando + timer)", async () => {
    render(<AudioRecorder onSend={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/gravar áudio/i));
    });

    expect(screen.getByText("Gravando")).toBeInTheDocument();
    expect(screen.getByLabelText(/pausar gravação/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cancelar gravação/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enviar áudio/i)).toBeInTheDocument();
  });

  it("permite pausar e retomar a gravação", async () => {
    render(<AudioRecorder onSend={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/gravar áudio/i));
    });

    // Pausa.
    fireEvent.click(screen.getByLabelText(/pausar gravação/i));
    expect(screen.getByText("Pausado")).toBeInTheDocument();
    expect(screen.getByLabelText(/retomar gravação/i)).toBeInTheDocument();

    // Retoma.
    fireEvent.click(screen.getByLabelText(/retomar gravação/i));
    expect(screen.getByText("Gravando")).toBeInTheDocument();
    expect(screen.getByLabelText(/pausar gravação/i)).toBeInTheDocument();
  });

  it("dispara onRecordingStateChange ao entrar/sair do estado ativo (v0.15.2)", async () => {
    const onRecordingStateChange = jest.fn();
    render(
      <AudioRecorder
        onSend={() => {}}
        onRecordingStateChange={onRecordingStateChange}
      />,
    );

    // Mount inicial em idle → callback é chamado com false.
    expect(onRecordingStateChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/gravar áudio/i));
    });

    // Entrou em recording → true.
    expect(onRecordingStateChange).toHaveBeenLastCalledWith(true);

    // Pausa permanece "ativo" (não é idle).
    fireEvent.click(screen.getByLabelText(/pausar gravação/i));
    expect(onRecordingStateChange).toHaveBeenLastCalledWith(true);

    // Cancelar volta a idle → false.
    fireEvent.click(screen.getByLabelText(/cancelar gravação/i));
    expect(onRecordingStateChange).toHaveBeenLastCalledWith(false);
  });

  it("timer congela ao pausar e retoma de onde parou (v0.15.2 BUG 2)", async () => {
    jest.useFakeTimers();
    try {
      render(<AudioRecorder onSend={() => {}} />);

      await act(async () => {
        fireEvent.click(screen.getByLabelText(/gravar áudio/i));
      });

      // Avança 3s reais — timer deve mostrar ~0:03.
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText(/0:03/)).toBeInTheDocument();

      // Pausa.
      act(() => {
        fireEvent.click(screen.getByLabelText(/pausar gravação/i));
      });

      // Avança 5s — timer deve PERMANECER em 0:03 (BUG fix).
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.getByText(/0:03/)).toBeInTheDocument();

      // Retoma.
      act(() => {
        fireEvent.click(screen.getByLabelText(/retomar gravação/i));
      });

      // Avança mais 2s — timer deve ir para ~0:05 (3s antes + 2s agora).
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByText(/0:05/)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
