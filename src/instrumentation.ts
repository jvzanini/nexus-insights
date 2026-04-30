/**
 * Instrumentation hook do Next.js — executado uma vez no startup do servidor.
 *
 * Defense-in-depth contra crashes não-críticos (incidente 2026-04-30):
 * erros em background do Next 16 (cache de imagem/prerender) viravam
 * unhandledRejection e matavam o processo, derrubando o container e
 * disparando Bad Gateway no Traefik. O fix de permissão no Dockerfile
 * resolve a causa raiz; este handler é a rede de segurança caso surja
 * outro caminho equivalente no futuro.
 *
 * Política:
 *   - SEMPRE logar (console.error com prefixo identificável).
 *   - NUNCA chamar process.exit.
 *   - NÃO suprimir errors síncronos do código da aplicação — esses ainda
 *     são tratados por error boundaries do Next.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("unhandledRejection", (reason) => {
    const err = reason as { code?: string; message?: string; stack?: string };
    console.error(
      "[instrumentation] unhandledRejection:",
      err?.code ?? "no-code",
      err?.message ?? String(reason),
    );
    if (err?.stack) console.error(err.stack);
  });

  process.on("uncaughtException", (err) => {
    console.error(
      "[instrumentation] uncaughtException:",
      err?.message ?? String(err),
    );
    if (err?.stack) console.error(err.stack);
  });
}
