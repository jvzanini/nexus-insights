import { getPeriodInTz } from "@/lib/datetime-core";

// Reproduz o pipeline real de `resolvePeriod`:
// usuário envia ?custom_start=2025-03-21&custom_end=2025-03-21,
// o resolver faz `new Date(input.customStart)` e chama getPeriodInTz.
//
// SP é UTC-3 (sem DST desde 2019).
// Esperado: o range cobre o dia 21/03 EM SP, ou seja:
//   start = 21/03 00:00 BRT = 21/03 03:00 UTC
//   end   = 21/03 23:59:59.999 BRT = 22/03 02:59:59.999 UTC
//   (ou 22/03 00:00 BRT = 22/03 03:00 UTC se a impl optar por exclusivo)

describe("getPeriodInTz custom — single day SP", () => {
  it("21/03/2025 → 21/03/2025 retorna range cobrindo o dia 21 em SP", () => {
    const r = getPeriodInTz(
      "custom",
      "America/Sao_Paulo",
      {
        start: new Date("2025-03-21"),
        end: new Date("2025-03-21"),
      },
    );
    expect(r.start.toISOString()).toBe("2025-03-21T03:00:00.000Z");
    expect(r.end.toISOString()).toMatch(
      /^2025-03-22T(02:59:59\.999|03:00:00\.000)Z$/,
    );
  });

  it("21/03/2025 → 22/03/2025 retorna range 48h em SP", () => {
    const r = getPeriodInTz(
      "custom",
      "America/Sao_Paulo",
      {
        start: new Date("2025-03-21"),
        end: new Date("2025-03-22"),
      },
    );
    expect(r.start.toISOString()).toBe("2025-03-21T03:00:00.000Z");
    expect(r.end.toISOString()).toMatch(
      /^2025-03-23T(02:59:59\.999|03:00:00\.000)Z$/,
    );
  });
});
