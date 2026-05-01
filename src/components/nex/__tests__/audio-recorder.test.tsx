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
});
