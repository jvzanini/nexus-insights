import { formatRelativeShort } from "@/lib/format/relative-time";

describe("formatRelativeShort", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T18:00:00Z"));
  });
  afterAll(() => jest.useRealTimers());

  it("agora (< 60s)", () => {
    expect(formatRelativeShort(new Date("2026-04-30T17:59:30Z"))).toBe("agora");
  });
  it("há Xmin", () => {
    expect(formatRelativeShort(new Date("2026-04-30T17:55:00Z"))).toBe("há 5min");
  });
  it("há Xh", () => {
    expect(formatRelativeShort(new Date("2026-04-30T16:00:00Z"))).toBe("há 2h");
  });
  it("há Xd", () => {
    expect(formatRelativeShort(new Date("2026-04-27T18:00:00Z"))).toBe("há 3d");
  });
  it("há Xm (meses, abreviado)", () => {
    expect(formatRelativeShort(new Date("2026-02-28T18:00:00Z"))).toBe("há 2m");
  });
  it("há Xa (anos, abreviado)", () => {
    expect(formatRelativeShort(new Date("2024-04-30T18:00:00Z"))).toBe("há 2a");
  });
});
