import { formatBucketLabel } from "@/lib/utils/format-bucket";

describe("formatBucketLabel — TZ correctness", () => {
  it("bucket UTC 17:00 → 14:00 BRT", () => {
    expect(
      formatBucketLabel("2026-04-30T17:00:00.000Z", "hour", "America/Sao_Paulo"),
    ).toBe("14:00");
  });

  it("bucket UTC 03:00 → 00:00 BRT (meia-noite local)", () => {
    expect(
      formatBucketLabel("2026-04-30T03:00:00.000Z", "hour", "America/Sao_Paulo"),
    ).toBe("00:00");
  });

  it("granularity=day usa formato dd/MM", () => {
    expect(
      formatBucketLabel("2026-04-30T03:00:00.000Z", "day", "America/Sao_Paulo"),
    ).toBe("30/04");
  });
});
