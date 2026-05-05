// Testes parametrizados de getCanonicalPeriod (Task 11 — v0.42).
//
// Regra canônica (REGRA SUPREMA do usuário):
//   "começa na segunda e termina no domingo, sempre"
//
// → semana ISO (segunda 00:00 BRT a próxima segunda 00:00 BRT, end-exclusive).
// → mês civil (dia 1 00:00 BRT a dia 1 do mês seguinte 00:00 BRT, end-exclusive).
// → dia inteiro no tz (00:00 BRT a próximo 00:00 BRT, end-exclusive).
// → "todos" = epoch..now.
// → "custom" = startOfDay(customStart)..startOfDay(customEnd + 1d), end-exclusive.

import { getCanonicalPeriod } from "@/lib/datetime-core";

const TZ = "America/Sao_Paulo";

const PIVOTS = [
  { name: "virada de ano", ref: "2026-01-01T05:00:00Z" }, // 02:00 BRT do dia 1
  { name: "virada de mes", ref: "2026-03-01T05:00:00Z" }, // 02:00 BRT do dia 1
  { name: "segunda 00:00 BRT", ref: "2026-04-27T03:00:00Z" }, // segunda
  { name: "domingo 23:59 BRT", ref: "2026-05-04T02:59:59Z" }, // domingo (na verdade 03/05 23:59 BRT)
  { name: "atual", ref: "2026-05-04T14:00:00Z" },
  { name: "fim de ano", ref: "2026-12-31T23:00:00Z" },
] as const;

/**
 * Helper: retorna { year, month, day, hour, minute } do Date no tz informado.
 * Usa Intl.DateTimeFormat com formatToParts (mais robusto que toLocaleString).
 */
function partsInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    // "24" no formato 24h vira "00" no padrão Intl quando hour cycle é correto;
    // alguns runtimes retornam "24" para meia-noite.
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

describe("getCanonicalPeriod", () => {
  describe.each(PIVOTS)("$name (ref=$ref)", ({ ref }) => {
    it("hoje: start é 00:00 BRT do dia, span = 24h (end-exclusive)", () => {
      const r = getCanonicalPeriod({ label: "hoje", tz: TZ, refIso: ref });
      const startBrt = partsInTz(r.start, TZ);
      expect(startBrt.hour).toBe(0);
      expect(startBrt.minute).toBe(0);
      expect(startBrt.second).toBe(0);
      expect(r.end.getTime() - r.start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it("semana: start é segunda-feira 00:00 BRT, span = 7 dias", () => {
      const r = getCanonicalPeriod({ label: "semana", tz: TZ, refIso: ref });
      const startBrt = partsInTz(r.start, TZ);
      // Segunda-feira em pt-BR: getDay() === 1 (em UTC ou local).
      // Usando weekday format:
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        weekday: "short",
      }).format(r.start);
      expect(weekday).toBe("Mon");
      expect(startBrt.hour).toBe(0);
      expect(startBrt.minute).toBe(0);
      expect(r.end.getTime() - r.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("mes: start é dia 1 00:00 BRT, end é dia 1 do mês seguinte 00:00 BRT", () => {
      const r = getCanonicalPeriod({ label: "mes", tz: TZ, refIso: ref });
      const startBrt = partsInTz(r.start, TZ);
      const endBrt = partsInTz(r.end, TZ);
      expect(startBrt.day).toBe(1);
      expect(startBrt.hour).toBe(0);
      expect(startBrt.minute).toBe(0);
      expect(endBrt.day).toBe(1);
      expect(endBrt.hour).toBe(0);
      // próximo mês (mod 12)
      const expectedNextMonth = (startBrt.month % 12) + 1;
      expect(endBrt.month).toBe(expectedNextMonth);
    });
  });

  it("todos: start = epoch, end ≈ now", () => {
    const r = getCanonicalPeriod({ label: "todos", tz: TZ });
    expect(r.start.getTime()).toBe(0);
    expect(r.end.getTime()).toBeGreaterThan(Date.now() - 5_000);
    expect(r.end.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it("custom: range YYYY-MM-DD vira startOfDay BRT a startOfDay BRT do (end + 1d)", () => {
    const r = getCanonicalPeriod({
      label: "custom",
      tz: TZ,
      customStart: "2026-04-15",
      customEnd: "2026-04-20",
    });
    const startBrt = partsInTz(r.start, TZ);
    const endBrt = partsInTz(r.end, TZ);
    // start = 15/04 00:00 BRT
    expect(startBrt.day).toBe(15);
    expect(startBrt.month).toBe(4);
    expect(startBrt.hour).toBe(0);
    // end = 21/04 00:00 BRT (end-exclusive de 20/04 inclusive)
    expect(endBrt.day).toBe(21);
    expect(endBrt.month).toBe(4);
    expect(endBrt.hour).toBe(0);
    // span = 6 dias (15..20 inclusive = 6 dias)
    expect(r.end.getTime() - r.start.getTime()).toBe(6 * 24 * 60 * 60 * 1000);
  });

  it("custom: lança quando customStart/customEnd ausentes", () => {
    expect(() =>
      getCanonicalPeriod({ label: "custom", tz: TZ }),
    ).toThrow(/custom/i);
  });

  it("custom: single-day range = 1 dia (start=end mesmo dia)", () => {
    const r = getCanonicalPeriod({
      label: "custom",
      tz: TZ,
      customStart: "2026-04-15",
      customEnd: "2026-04-15",
    });
    expect(r.end.getTime() - r.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  describe("prev period", () => {
    it("hoje: prev mesma duração imediatamente antes de start", () => {
      const r = getCanonicalPeriod({
        label: "hoje",
        tz: TZ,
        refIso: "2026-05-04T14:00:00Z",
      });
      const span = r.end.getTime() - r.start.getTime();
      expect(r.prev.end.getTime()).toBe(r.start.getTime());
      expect(r.prev.end.getTime() - r.prev.start.getTime()).toBe(span);
    });

    it("semana: prev = segunda anterior a essa segunda, span 7d", () => {
      const r = getCanonicalPeriod({
        label: "semana",
        tz: TZ,
        refIso: "2026-05-04T14:00:00Z",
      });
      expect(r.prev.end.getTime()).toBe(r.start.getTime());
      expect(r.prev.end.getTime() - r.prev.start.getTime()).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
    });

    it("mes: prev = mesma duração do mês imediatamente antes", () => {
      const r = getCanonicalPeriod({
        label: "mes",
        tz: TZ,
        refIso: "2026-05-04T14:00:00Z",
      });
      const span = r.end.getTime() - r.start.getTime();
      expect(r.prev.end.getTime()).toBe(r.start.getTime());
      expect(r.prev.end.getTime() - r.prev.start.getTime()).toBe(span);
    });
  });

  describe("regra canônica de semana (sempre segunda → próxima segunda)", () => {
    it("ref = domingo 23:59 BRT → start é segunda da MESMA semana ISO (não próxima)", () => {
      // 03/05/2026 23:59 BRT = domingo. Semana ISO: 27/04 a 04/05.
      // refIso = 2026-05-04T02:59:59Z → 03/05 23:59:59 BRT (domingo)
      const r = getCanonicalPeriod({
        label: "semana",
        tz: TZ,
        refIso: "2026-05-04T02:59:59Z",
      });
      const startBrt = partsInTz(r.start, TZ);
      expect(startBrt.day).toBe(27); // segunda 27/04
      expect(startBrt.month).toBe(4);
    });

    it("ref = segunda 00:00 BRT → start é a própria segunda", () => {
      const r = getCanonicalPeriod({
        label: "semana",
        tz: TZ,
        refIso: "2026-04-27T03:00:00Z", // 27/04 00:00 BRT
      });
      const startBrt = partsInTz(r.start, TZ);
      expect(startBrt.day).toBe(27);
      expect(startBrt.month).toBe(4);
      expect(startBrt.hour).toBe(0);
    });
  });
});
