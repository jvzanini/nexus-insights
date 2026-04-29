import { calculateDelta } from "@/lib/reports/delta";

describe("calculateDelta", () => {
  it("previous=0 e current=0 → flat 0%", () => {
    expect(calculateDelta(0, 0)).toEqual({ percent: 0, direction: "flat" });
  });

  it("previous=0 e current>0 → up 100%", () => {
    expect(calculateDelta(10, 0)).toEqual({ percent: 100, direction: "up" });
  });

  it("previous=10 e current=12 → up 20%", () => {
    expect(calculateDelta(12, 10)).toEqual({ percent: 20, direction: "up" });
  });

  it("previous=10 e current=8 → down 20%", () => {
    expect(calculateDelta(8, 10)).toEqual({ percent: 20, direction: "down" });
  });

  it("variação muito pequena (<0.5%) é considerada flat", () => {
    const r = calculateDelta(10.04, 10);
    expect(r.direction).toBe("flat");
    expect(r.percent).toBeCloseTo(0.4, 5);
  });

  it("variação na fronteira de 0.5% conta como up", () => {
    const r = calculateDelta(10.05, 10);
    expect(r.direction).toBe("up");
    expect(r.percent).toBeCloseTo(0.5, 5);
  });

  it("retorna percentual absoluto mesmo em downs grandes", () => {
    const r = calculateDelta(50, 100);
    expect(r.direction).toBe("down");
    expect(r.percent).toBe(50);
  });
});
