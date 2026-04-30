import {
  ALL_REPORT_KEYS,
  REPORTS_CATALOG,
  getReportByKey,
} from "@/lib/reports/catalog";

describe("REPORTS_CATALOG", () => {
  it("contém exatamente 12 entries", () => {
    expect(REPORTS_CATALOG).toHaveLength(12);
  });

  it("cada entry tem key, label, href, icon e description", () => {
    for (const entry of REPORTS_CATALOG) {
      expect(typeof entry.key).toBe("string");
      expect(entry.key.length).toBeGreaterThan(0);

      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);

      expect(typeof entry.href).toBe("string");
      expect(entry.href.startsWith("/relatorios/")).toBe(true);

      expect(entry.icon).toBeDefined();

      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("href é coerente com a key", () => {
    for (const entry of REPORTS_CATALOG) {
      expect(entry.href).toBe(`/relatorios/${entry.key}`);
    }
  });
});

describe("ALL_REPORT_KEYS", () => {
  it("é um array de 12 strings", () => {
    expect(Array.isArray(ALL_REPORT_KEYS)).toBe(true);
    expect(ALL_REPORT_KEYS).toHaveLength(12);
    for (const k of ALL_REPORT_KEYS) {
      expect(typeof k).toBe("string");
    }
  });

  it("não tem keys duplicadas", () => {
    const set = new Set(ALL_REPORT_KEYS);
    expect(set.size).toBe(ALL_REPORT_KEYS.length);
  });

  it("reflete na mesma ordem do catálogo", () => {
    expect(ALL_REPORT_KEYS).toEqual(REPORTS_CATALOG.map((r) => r.key));
  });
});

describe("getReportByKey", () => {
  it("retorna a entry correspondente quando a key existe", () => {
    const entry = getReportByKey("conversas");
    expect(entry).not.toBeNull();
    expect(entry?.key).toBe("conversas");
    expect(entry?.href).toBe("/relatorios/conversas");
  });

  it("retorna null para key inexistente", () => {
    expect(getReportByKey("inexistente")).toBeNull();
    expect(getReportByKey("")).toBeNull();
  });

  it("encontra todas as keys do catálogo", () => {
    for (const k of ALL_REPORT_KEYS) {
      const entry = getReportByKey(k);
      expect(entry).not.toBeNull();
      expect(entry?.key).toBe(k);
    }
  });
});
