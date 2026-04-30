import { formatBucketLabel } from "@/lib/utils/format-bucket";

describe("formatBucketLabel", () => {
  it("formata hora em America/Sao_Paulo independente da TZ do runtime", () => {
    // 2026-04-30T16:00:00Z = 13:00 BRT (UTC-3)
    const iso = "2026-04-30T16:00:00.000Z";
    expect(formatBucketLabel(iso, "hour", "America/Sao_Paulo")).toBe("13:00");
  });

  it("formata dia em America/Sao_Paulo", () => {
    // 2026-04-30T03:00:00Z = 00:00 BRT do dia 30
    const iso = "2026-04-30T03:00:00.000Z";
    expect(formatBucketLabel(iso, "day", "America/Sao_Paulo")).toBe("30/04");
  });

  it("usa fallback America/Sao_Paulo quando tz vazio", () => {
    const iso = "2026-04-30T16:00:00.000Z";
    expect(formatBucketLabel(iso, "hour", "")).toBe("13:00");
  });

  it("respeita timezone alternativa quando fornecida", () => {
    // 2026-04-30T16:00:00Z = 13:00 NY EDT (UTC-3 daylight) → na verdade NY = UTC-4
    // Usa Asia/Tokyo (UTC+9) → 16:00 + 9h = 01:00 do dia seguinte
    const iso = "2026-04-30T16:00:00.000Z";
    expect(formatBucketLabel(iso, "hour", "Asia/Tokyo")).toBe("01:00");
  });
});
