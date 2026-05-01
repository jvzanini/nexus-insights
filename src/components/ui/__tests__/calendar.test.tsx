/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { ptBR } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";

describe("Calendar (defaults globais — T5d)", () => {
  describe("weekStartsOn=1 (segunda-feira)", () => {
    it("renderiza segunda-feira como primeira coluna do header de semana", () => {
      const { container } = render(
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 4, 1)}
          locale={ptBR}
        />,
      );

      // Pega <th scope="col"> do thead/tr de weekdays.
      const headers = Array.from(
        container.querySelectorAll<HTMLTableCellElement>("th[scope='col']"),
      );
      expect(headers.length).toBeGreaterThanOrEqual(7);
      expect(headers[0]).toHaveAttribute("aria-label", "segunda-feira");
      expect(headers[6]).toHaveAttribute("aria-label", "domingo");
    });

    it("override: weekStartsOn=0 mantém domingo na primeira coluna", () => {
      const { container } = render(
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 4, 1)}
          locale={ptBR}
          weekStartsOn={0}
        />,
      );

      const headers = Array.from(
        container.querySelectorAll<HTMLTableCellElement>("th[scope='col']"),
      );
      expect(headers[0]).toHaveAttribute("aria-label", "domingo");
    });
  });

  describe("showOutsideDays=false (default novo)", () => {
    it("não renderiza dia 30/04 no grid de maio/2026", () => {
      // 1/5/2026 é uma sexta-feira; com weekStartsOn=1, a primeira semana
      // começaria em segunda 27/04. Com showOutsideDays=false, esses dias
      // não devem aparecer como botões interativos.
      render(
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 4, 1)}
          locale={ptBR}
        />,
      );

      // O dia 30 de abril não deve ter botão clicável visível.
      // react-day-picker v9 marca days fora como `aria-hidden` ou os omite.
      // Buscamos via name acessível: botão "30 de abril de 2026" não existe.
      const aprilDayButton = screen.queryByRole("button", {
        name: /30 de abril de 2026/i,
      });
      expect(aprilDayButton).toBeNull();
    });

    it("não renderiza dia 1/06 no grid de maio/2026", () => {
      render(
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 4, 1)}
          locale={ptBR}
        />,
      );

      const juneDayButton = screen.queryByRole("button", {
        name: /1 de junho de 2026/i,
      });
      expect(juneDayButton).toBeNull();
    });

    it("override: showOutsideDays=true exibe dias do mês anterior/próximo", () => {
      render(
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 4, 1)}
          locale={ptBR}
          showOutsideDays
        />,
      );

      // Com override true, dias outside aparecem (mesmo que com classe `outside`).
      // 30 de abril deve estar no DOM como botão.
      const aprilDayButton = screen.queryByRole("button", {
        name: /30 de abril de 2026/i,
      });
      expect(aprilDayButton).not.toBeNull();
    });
  });
});
