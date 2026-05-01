// Mock dns module ANTES de qualquer import que use kb-url.
jest.mock("dns", () => ({
  __esModule: true,
  lookup: jest.fn(),
}));

import { lookup as dnsLookupCb } from "dns";
import { assertPublicUrl, fetchKbUrl } from "../kb-url";

const dnsLookupMock = dnsLookupCb as unknown as jest.Mock;

/**
 * Helper para mockar `dns.lookup` (callback style; será passado para
 * `util.promisify`). Suporta a forma de uma overload com 1 ou 2 args.
 */
function mockDnsLookup(address: string, family: 4 | 6 = 4) {
  dnsLookupMock.mockImplementation(
    (
      _hostname: string,
      optionsOrCb:
        | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void)
        | number
        | Record<string, unknown>,
      maybeCb?: (
        err: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void,
    ) => {
      const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb!;
      cb(null, address, family);
    },
  );
}

beforeEach(() => {
  dnsLookupMock.mockReset();
});

describe("assertPublicUrl", () => {
  it("rejeita HTTP plain", async () => {
    await expect(assertPublicUrl("http://example.com")).rejects.toThrow(
      "URL inválida — use HTTPS.",
    );
  });

  it("rejeita URL malformada", async () => {
    await expect(assertPublicUrl("not-a-url")).rejects.toThrow(
      "URL inválida — use HTTPS.",
    );
  });

  it("rejeita hostname literal localhost", async () => {
    await expect(assertPublicUrl("https://localhost")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita hostname literal 0.0.0.0", async () => {
    await expect(assertPublicUrl("https://0.0.0.0")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita IP de metadata cloud (link-local 169.254.x)", async () => {
    mockDnsLookup("169.254.169.254");
    await expect(
      assertPublicUrl("https://metadata.example.com"),
    ).rejects.toThrow("URL aponta para endereço privado/local — não permitida.");
  });

  it("aceita host público que resolve para IP público", async () => {
    mockDnsLookup("1.2.3.4");
    const url = await assertPublicUrl("https://example.com");
    expect(url.hostname).toBe("example.com");
  });

  it("rejeita host que resolve para 10.0.0.1 (RFC1918)", async () => {
    mockDnsLookup("10.0.0.1");
    await expect(assertPublicUrl("https://server.local")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita host que resolve para 192.168.x", async () => {
    mockDnsLookup("192.168.1.1");
    await expect(assertPublicUrl("https://router.lan")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita host que resolve para 172.16.x (RFC1918)", async () => {
    mockDnsLookup("172.16.10.10");
    await expect(assertPublicUrl("https://internal.corp")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita host que resolve para 127.x (loopback)", async () => {
    mockDnsLookup("127.0.0.1");
    await expect(assertPublicUrl("https://lo.example")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });

  it("rejeita IPv6 loopback ::1", async () => {
    mockDnsLookup("::1", 6);
    await expect(assertPublicUrl("https://v6.example")).rejects.toThrow(
      "URL aponta para endereço privado/local — não permitida.",
    );
  });
});

describe("fetchKbUrl", () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
    jest.useRealTimers();
  });

  it("extrai texto de HTML simples", async () => {
    const html =
      "<!DOCTYPE html><html><head><title>x</title><style>.a{}</style></head>" +
      "<body><nav>NAV</nav><main><article><h1>Olá</h1>" +
      "<p>Mundo do KB</p><script>bad()</script></article></main>" +
      "<footer>FOOT</footer></body></html>";
    const buf = new TextEncoder().encode(html).buffer;
    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => buf,
    })) as unknown as typeof fetch;

    const url = new URL("https://example.com/page");
    const result = await fetchKbUrl(url);
    expect(result.mimeType).toBe("text/html");
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("Olá");
    expect(result.text).toContain("Mundo do KB");
    expect(result.text).not.toContain("NAV");
    expect(result.text).not.toContain("FOOT");
    expect(result.text).not.toContain("bad()");
  });

  it("aceita text/plain e devolve raw", async () => {
    const txt = "linha 1\nlinha 2";
    const buf = new TextEncoder().encode(txt).buffer;
    const headers = new Headers({ "content-type": "text/plain" });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => buf,
    })) as unknown as typeof fetch;

    const result = await fetchKbUrl(new URL("https://example.com/file.txt"));
    expect(result.mimeType).toBe("text/plain");
    expect(result.text).toBe(txt);
  });

  it("rejeita Content-Length acima de 5MB", async () => {
    const headers = new Headers({
      "content-type": "text/html",
      "content-length": String(6 * 1024 * 1024),
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/big"))).rejects.toThrow(
      /muito grande/,
    );
  });

  it("rejeita body acima de 5MB mesmo sem content-length", async () => {
    const big = new ArrayBuffer(6 * 1024 * 1024);
    const headers = new Headers({ "content-type": "text/html" });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => big,
    })) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/big"))).rejects.toThrow(
      /muito grande/,
    );
  });

  it("converte AbortError em mensagem de timeout", async () => {
    global.fetch = jest.fn(async () => {
      const err: Error & { name: string } = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/slow"))).rejects.toThrow(
      /demorou demais/,
    );
  });

  it("tratamento de 401 → mensagem de autenticação", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/auth"))).rejects.toThrow(
      /autenticação/,
    );
  });

  it("tratamento de 500 → mensagem de erro do servidor", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/down"))).rejects.toThrow(
      /servidor da página retornou erro/,
    );
  });

  it("rejeita content-type não suportado", async () => {
    const headers = new Headers({ "content-type": "image/png" });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    await expect(fetchKbUrl(new URL("https://example.com/img.png"))).rejects.toThrow(
      /não é HTML\/TXT/,
    );
  });

  it("trunca texto > 100k chars e marca truncated=true", async () => {
    const big = "a".repeat(120_000);
    const html = `<html><body><main>${big}</main></body></html>`;
    const buf = new TextEncoder().encode(html).buffer;
    const headers = new Headers({ "content-type": "text/html" });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => buf,
    })) as unknown as typeof fetch;
    const result = await fetchKbUrl(new URL("https://example.com/long"));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(100_000);
  });
});
