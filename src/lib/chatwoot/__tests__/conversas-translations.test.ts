import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  resolveStatusLabel,
  resolvePriorityLabel,
} from "@/lib/chatwoot/conversas-translations";

describe("conversas-translations", () => {
  it("STATUS_LABELS cobre 0..3 com nomes pt-BR", () => {
    expect(STATUS_LABELS).toEqual({
      0: "Aberta",
      1: "Resolvida",
      2: "Pendente",
      3: "Snoozed",
    });
  });

  it("PRIORITY_LABELS cobre 0..3 com nomes pt-BR", () => {
    expect(PRIORITY_LABELS).toEqual({
      0: "Baixa",
      1: "Media",
      2: "Alta",
      3: "Urgente",
    });
  });

  it("resolveStatusLabel retorna '—' para valores fora do range", () => {
    expect(resolveStatusLabel(0)).toBe("Aberta");
    expect(resolveStatusLabel(99)).toBe("—");
    expect(resolveStatusLabel(null)).toBe("—");
  });

  it("resolvePriorityLabel retorna '—' para null/undefined", () => {
    expect(resolvePriorityLabel(2)).toBe("Alta");
    expect(resolvePriorityLabel(null)).toBe("—");
    expect(resolvePriorityLabel(undefined)).toBe("—");
  });
});
