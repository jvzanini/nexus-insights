import { buildFullPeriodRows } from "../conversations-line-chart";

// ChartRow inline para não depender do export do tipo (que é interface interna)
type ChartRow = {
  label: string;
  windowLabel?: string;
  bucketIso: string;
  isFuture?: boolean;
  received: number | null;
  open: number | null;
  resolved: number | null;
  pending: number | null;
};

function makeRow(bucketIso: string, received: number): ChartRow {
  return {
    label: "test",
    bucketIso,
    received,
    open: 0,
    resolved: 0,
    pending: 0,
  };
}

describe("buildFullPeriodRows", () => {
  it("buckets passados vêm dos pastRows com isFuture undefined", () => {
    const past = [makeRow("2026-05-06T10:00:00.000Z", 5)];
    const all = [makeRow("2026-05-06T10:00:00.000Z", 3), makeRow("2026-05-06T11:00:00.000Z", 0)];
    const result = buildFullPeriodRows(past, all);
    expect(result[0].received).toBe(5);
    expect(result[0].isFuture).toBeFalsy();
  });

  it("buckets futuros têm isFuture=true e séries null", () => {
    const past = [makeRow("2026-05-06T10:00:00.000Z", 5)];
    const all = [makeRow("2026-05-06T10:00:00.000Z", 5), makeRow("2026-05-06T15:00:00.000Z", 0)];
    const result = buildFullPeriodRows(past, all);
    expect(result[1].isFuture).toBe(true);
    expect(result[1].received).toBeNull();
    expect(result[1].open).toBeNull();
    expect(result[1].resolved).toBeNull();
    expect(result[1].pending).toBeNull();
  });

  it("retorna todos os buckets do allRawBuckets", () => {
    const past = [makeRow("2026-05-06T10:00:00.000Z", 1)];
    const all = Array.from({ length: 24 }, (_, i) =>
      makeRow(`2026-05-06T${String(i).padStart(2, "0")}:00:00.000Z`, 0),
    );
    const result = buildFullPeriodRows(past, all);
    expect(result).toHaveLength(24);
  });

  it("preserva label e windowLabel do bucket original para buckets futuros", () => {
    const past: ChartRow[] = [];
    const all: ChartRow[] = [
      { label: "15h", windowLabel: "Janela: 15:00 – 15:59", bucketIso: "2026-05-06T18:00:00.000Z", received: 0, open: 0, resolved: 0, pending: 0 },
    ];
    const result = buildFullPeriodRows(past, all);
    expect(result[0].label).toBe("15h");
    expect(result[0].windowLabel).toBe("Janela: 15:00 – 15:59");
    expect(result[0].isFuture).toBe(true);
  });

  it("quando todos os buckets estão em pastRows, nenhum é marcado como futuro", () => {
    const all = [
      makeRow("2026-05-06T08:00:00.000Z", 2),
      makeRow("2026-05-06T09:00:00.000Z", 3),
    ];
    const past = [...all];
    const result = buildFullPeriodRows(past, all);
    expect(result.every((r) => !r.isFuture)).toBe(true);
  });

  it("ordem do resultado segue allRawBuckets, não pastRows", () => {
    const past = [
      makeRow("2026-05-06T09:00:00.000Z", 10),
      makeRow("2026-05-06T08:00:00.000Z", 5),
    ];
    const all = [
      makeRow("2026-05-06T08:00:00.000Z", 0),
      makeRow("2026-05-06T09:00:00.000Z", 0),
      makeRow("2026-05-06T10:00:00.000Z", 0),
    ];
    const result = buildFullPeriodRows(past, all);
    expect(result[0].bucketIso).toBe("2026-05-06T08:00:00.000Z");
    expect(result[0].received).toBe(5);
    expect(result[1].bucketIso).toBe("2026-05-06T09:00:00.000Z");
    expect(result[1].received).toBe(10);
    expect(result[2].isFuture).toBe(true);
  });
});
