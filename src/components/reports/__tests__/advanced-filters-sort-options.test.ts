/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from "@jest/globals";

// AdvancedFilters importa ExportButton → conversas-export action → next-auth.
// Mockamos a cadeia para isolar a constante SORT_OPTIONS.
jest.mock("@/lib/actions/reports/conversas-export", () => ({
  exportConversasAction: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { SORT_OPTIONS } from "@/components/reports/advanced-filters";

describe("SORT_OPTIONS v0.25", () => {
  it("inclui chave 'document' com label 'Documento' após 'name'", () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    const idxName = keys.indexOf("name");
    const idxDoc = keys.indexOf("document");
    expect(idxDoc).toBeGreaterThan(idxName);
    const doc = SORT_OPTIONS.find((o) => o.key === "document");
    expect(doc?.label).toBe("Documento");
  });
});
