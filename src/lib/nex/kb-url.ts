import "server-only";
import { lookup as dnsLookupCb } from "dns";
import { parse as parseHtml } from "node-html-parser";

/**
 * Wrapper manual em vez de `util.promisify(dns.lookup)`. Motivo:
 * `dns.lookup` chama o callback com `(err, address, family)`. `promisify`
 * usa a versão custom de `dns.lookup` (que devolve `{address, family}`)
 * apenas quando o símbolo `util.promisify.custom` está presente — e em
 * mocks de teste isso não está, então `promisify` cai no fallback que
 * retorna **apenas** o primeiro arg pós-`err` (a string `address`),
 * descartando `family`. Como queremos um shape estável (`{address}`)
 * tanto em prod quanto em testes, fazemos o wrap manual.
 */
function dnsLookup(hostname: string): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    dnsLookupCb(hostname, (err, address, family) => {
      if (err) reject(err);
      else resolve({ address, family });
    });
  });
}

/** Ranges privados / loopback / link-local (IPv4 + IPv6 essenciais). */
const PRIVATE_RANGES: RegExp[] = [
  /^10\./, // RFC1918 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 172.16.0.0/12
  /^192\.168\./, // RFC1918 192.168.0.0/16
  /^127\./, // loopback
  /^169\.254\./, // link-local (inclui metadata cloud)
  /^0\.0\.0\.0$/, // wildcard
  /^::1$/, // IPv6 loopback
  /^fc/i, // IPv6 unique local fc00::/7
  /^fd/i, // IPv6 unique local fd00::/8
  /^fe[89ab]/i, // IPv6 link-local fe80::/10
];

/** Hostnames literais que NUNCA devem ser resolvidos / acessados. */
const BLOCKED_HOSTS = new Set<string>([
  "localhost",
  "0.0.0.0",
  "metadata.google.internal",
  "169.254.169.254",
  "metadata", // alias comum
]);

/** Cap de bytes (5MB) — alinhado a kb.ts MAX_DOC_FILE_BYTES. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Timeout de fetch em ms. */
const TIMEOUT_MS = 10_000;
/** Cap de caracteres pós-extração — alinhado a kb.ts MAX_DOC_CHARS. */
const MAX_CHARS = 100_000;

/**
 * Valida e canonicaliza uma URL pública pra ingestão de KB.
 *
 * Garante:
 * - Protocolo HTTPS (HTTP plain rejeitado).
 * - Hostname não está na blocklist literal.
 * - DNS resolve para um endereço público (não RFC1918, loopback, link-local
 *   nem unique-local IPv6).
 *
 * Lança `Error` com mensagem amigável em PT-BR em qualquer falha. NÃO
 * vaza detalhes de DNS — a UI exibe o `message` direto.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida — use HTTPS.");
  }
  if (u.protocol !== "https:") {
    throw new Error("URL inválida — use HTTPS.");
  }
  if (BLOCKED_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error("URL aponta para endereço privado/local — não permitida.");
  }
  let address: string;
  try {
    const result = await dnsLookup(u.hostname);
    address = result.address;
  } catch {
    throw new Error("Não foi possível resolver o domínio. Verifique a URL.");
  }
  if (PRIVATE_RANGES.some((r) => r.test(address))) {
    throw new Error("URL aponta para endereço privado/local — não permitida.");
  }
  return u;
}

export interface FetchKbUrlResult {
  text: string;
  mimeType: string;
  truncated: boolean;
}

/**
 * Faz fetch de uma URL já validada por `assertPublicUrl`, com:
 * - AbortController de 10s.
 * - Cap de 5MB (Content-Length quando disponível, e re-checagem após download).
 * - Whitelist de content-types (HTML, TXT, JSON, XML).
 * - Extração de texto principal via node-html-parser para HTML
 *   (remove script/style/nav/footer/aside/form; prefere main/article).
 * - Truncamento em 100k chars.
 *
 * Mensagens de erro em PT-BR são lançadas para todas as falhas conhecidas
 * (timeout, 401/403, 5xx, payload muito grande, content-type inválido,
 * texto vazio).
 */
export async function fetchKbUrl(url: URL): Promise<FetchKbUrlResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "NexusInsights-KB/1.0",
        Accept: "text/html, text/plain, application/json, application/xml",
      },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Página exige autenticação. Use uma URL pública ou faça download e suba como TXT.",
        );
      }
      if (res.status >= 500) {
        throw new Error(
          `O servidor da página retornou erro (${res.status}). Tente novamente mais tarde.`,
        );
      }
      throw new Error(
        `Página inacessível (${res.status}). Confirme se a URL está correta e pública.`,
      );
    }
    const contentLengthRaw = res.headers.get("content-length");
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : 0;
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      throw new Error(
        "Página muito grande (>5MB). Use uma versão simplificada ou link específico.",
      );
    }
    const ctypeHeader = res.headers.get("content-type") ?? "text/html";
    const mimeType = ctypeHeader.split(";")[0].trim().toLowerCase();
    const allowed = ["text/html", "text/plain", "application/json", "application/xml"];
    if (!allowed.includes(mimeType)) {
      throw new Error("Conteúdo não é HTML/TXT. Tente outra fonte.");
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new Error(
        "Página muito grande (>5MB). Use uma versão simplificada ou link específico.",
      );
    }
    const raw = new TextDecoder("utf-8").decode(buf);
    let text = "";
    if (mimeType === "text/html") {
      const root = parseHtml(raw);
      const main = root.querySelector("main, article");
      const bodySource = main ?? root.querySelector("body") ?? root;
      bodySource
        .querySelectorAll("script, style, nav, footer, aside, form")
        .forEach((n) => n.remove());
      text = bodySource.text.replace(/\s+/g, " ").trim();
    } else {
      text = raw;
    }
    if (!text) {
      throw new Error(
        "Não foi possível extrair texto da página. Verifique se aponta para um artigo/documento.",
      );
    }
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }
    return { text, mimeType, truncated };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "A página demorou demais para responder. Tente outra fonte ou tente mais tarde.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
