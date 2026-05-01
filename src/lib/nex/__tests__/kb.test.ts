jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));
jest.mock("../ensure-tables", () => ({
  ensureNexTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  listKbDocuments,
  getKbDocsForPrompt,
  createKbDocument,
  deleteKbDocument,
  MAX_DOC_CHARS,
  MAX_DOC_FILE_BYTES,
} from "../kb";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  q.mockReset();
});

describe("listKbDocuments", () => {
  it("retorna lista sem extracted_text, ordenada DESC por created_at", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "manual.pdf",
          mime_type: "application/pdf",
          file_size: 12345,
          char_count: 678,
          created_at: new Date("2026-04-30T12:00:00Z"),
          updated_at: new Date("2026-04-30T12:00:00Z"),
          uploaded_by_id: null,
        },
      ],
      rowCount: 1,
    } as never);

    const out = await listKbDocuments();

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      name: "manual.pdf",
      mimeType: "application/pdf",
      fileSize: 12345,
      charCount: 678,
    });
    // Não pode vazar extractedText:
    expect((out[0] as unknown as Record<string, unknown>).extractedText).toBeUndefined();

    const sql = String(q.mock.calls[0][0]);
    expect(sql).not.toContain("extracted_text");
    expect(sql).toContain("FROM nex_kb_documents");
    expect(sql).toMatch(/ORDER BY\s+created_at\s+DESC/i);
  });
});

describe("getKbDocsForPrompt", () => {
  it("retorna name + extractedText em ordem ASC por created_at", async () => {
    q.mockResolvedValueOnce({
      rows: [
        { name: "primeiro.txt", extracted_text: "alpha" },
        { name: "segundo.txt", extracted_text: "beta" },
      ],
      rowCount: 2,
    } as never);

    const out = await getKbDocsForPrompt();

    expect(out).toEqual([
      { name: "primeiro.txt", extractedText: "alpha" },
      { name: "segundo.txt", extractedText: "beta" },
    ]);

    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain("name");
    expect(sql).toContain("extracted_text");
    expect(sql).toMatch(/ORDER BY\s+created_at\s+ASC/i);
  });
});

describe("createKbDocument", () => {
  it("rejeita arquivo > MAX_DOC_FILE_BYTES", async () => {
    await expect(
      createKbDocument({
        name: "grande.pdf",
        mimeType: "application/pdf",
        fileSize: MAX_DOC_FILE_BYTES + 1,
        extractedText: "tudo certo aqui",
      }),
    ).rejects.toThrow(/5\s*MB|tamanho|máximo/i);
    expect(q).not.toHaveBeenCalled();
  });

  it("trunca em MAX_DOC_CHARS e grava charCount truncado", async () => {
    q.mockResolvedValueOnce({
      rows: [{ id: "22222222-2222-2222-2222-222222222222" }],
      rowCount: 1,
    } as never);

    const huge = "a".repeat(MAX_DOC_CHARS + 5_000);
    const id = await createKbDocument({
      name: "huge.txt",
      mimeType: "text/plain",
      fileSize: 1024,
      extractedText: huge,
    });

    expect(id).toBe("22222222-2222-2222-2222-222222222222");
    const params = q.mock.calls[0][1] as unknown[];
    // Encontra o param que é o texto extraído (string longa)
    const texto = params.find(
      (p): p is string => typeof p === "string" && p.length >= MAX_DOC_CHARS,
    );
    expect(texto).toBeDefined();
    expect(texto!.length).toBe(MAX_DOC_CHARS);
    // charCount = length truncada
    expect(params).toContain(MAX_DOC_CHARS);
  });

  it("sanitize NUL: 'abc\\x00def' vira 'abcdef'", async () => {
    q.mockResolvedValueOnce({
      rows: [{ id: "33333333-3333-3333-3333-333333333333" }],
      rowCount: 1,
    } as never);

    await createKbDocument({
      name: "nul.txt",
      mimeType: "text/plain",
      fileSize: 7,
      extractedText: "abc\x00def",
    });

    const params = q.mock.calls[0][1] as unknown[];
    const texto = params.find(
      (p): p is string => typeof p === "string" && /abc/.test(p) && /def/.test(p),
    );
    expect(texto).toBe("abcdef");
    expect(texto).not.toContain("\x00");
  });

  it("INSERT RETURNING id", async () => {
    q.mockResolvedValueOnce({
      rows: [{ id: "44444444-4444-4444-4444-444444444444" }],
      rowCount: 1,
    } as never);

    await createKbDocument({
      name: "ok.txt",
      mimeType: "text/plain",
      fileSize: 100,
      extractedText: "ok",
    });

    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/INSERT INTO\s+nex_kb_documents/i);
    expect(sql).toMatch(/RETURNING\s+id/i);
  });
});

describe("deleteKbDocument", () => {
  it("dispara DELETE FROM nex_kb_documents com id", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await deleteKbDocument("55555555-5555-5555-5555-555555555555");

    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/DELETE FROM\s+nex_kb_documents/i);
    const params = q.mock.calls[0][1] as unknown[];
    expect(params).toContain("55555555-5555-5555-5555-555555555555");
  });
});
