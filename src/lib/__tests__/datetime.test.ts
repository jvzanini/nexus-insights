import { getPeriodInTz } from "@/lib/datetime";

// São Paulo é UTC-3 ano inteiro (sem horário de verão desde 2019).
// Logo, 00:00 BRT == 03:00 UTC e 23:59:59.999 BRT == 02:59:59.999 UTC do
// dia seguinte.

describe("getPeriodInTz", () => {
  // Quarta-feira 29/04/2026 às 18:00 UTC == 15:00 BRT.
  const FIXED_NOW = new Date("2026-04-29T18:00:00.000Z");

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('hoje em "America/Sao_Paulo" cobre o dia inteiro em BRT', () => {
    const { start, end } = getPeriodInTz("hoje", "America/Sao_Paulo");
    expect(start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
  });

  it('semana_atual em "America/Sao_Paulo" cobre seg→próxima seg (ISO week)', () => {
    // 29/04/2026 é quarta-feira → semana começa em 27/04 (segunda-feira)
    // → próxima segunda é 04/05/2026.
    const { start, end } = getPeriodInTz("semana_atual", "America/Sao_Paulo");
    expect(start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-04T03:00:00.000Z");
  });

  it('mes_atual em "America/Sao_Paulo" cobre dia 1 do mês até dia 1 do próximo', () => {
    const { start, end } = getPeriodInTz("mes_atual", "America/Sao_Paulo");
    expect(start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-01T03:00:00.000Z");
  });

  it('custom em "America/Sao_Paulo" ajusta para startOfDay/endOfDay no tz', () => {
    // Usuário pede "10/04 12:30 BRT" até "12/04 09:15 BRT".
    // Esperado: [10/04 00:00 BRT, 12/04 23:59:59.999 BRT]
    //         = [10/04 03:00 UTC, 13/04 02:59:59.999 UTC]
    const customStart = new Date("2026-04-10T15:30:00.000Z"); // 12:30 BRT
    const customEnd = new Date("2026-04-12T12:15:00.000Z"); // 09:15 BRT
    const { start, end } = getPeriodInTz(
      "custom",
      "America/Sao_Paulo",
      { start: customStart, end: customEnd },
    );
    expect(start.toISOString()).toBe("2026-04-10T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-13T02:59:59.999Z");
  });

  it("custom sem range fornecido lança erro", () => {
    expect(() => getPeriodInTz("custom", "America/Sao_Paulo")).toThrow(
      /customRange/,
    );
  });
});
