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
 * Política dos handlers globais:
 *   - SEMPRE logar (console.error com prefixo identificável).
 *   - NUNCA chamar process.exit.
 *   - NÃO suprimir errors síncronos do código da aplicação — esses ainda
 *     são tratados por error boundaries do Next.
 *
 * Listener Pub/Sub (Fase 2 — Multi-tenant Realtime):
 *   Quando uma Server Action (ex.: editNexusChatConnection) publica
 *   `connection:updated` ou `connection:deleted` no Redis Pub/Sub, este
 *   listener ativo no App invalida o pool da connection — garantindo que
 *   a próxima query do App use a config nova (ou rejeite se foi deletada).
 *   Sem ele, o pool do App fica stale até ser reciclado pelo janitor
 *   (30 min). Com ele, invalidação é em ms. Padrão idêntico ao do worker
 *   (subscribe.then(on('message'))).
 *
 *   Hot reload safe: guarda em globalThis pra não duplicar listeners em dev.
 */

declare global {
  // eslint-disable-next-line no-var
  var __nexusAppPubsubSubscriber: import("ioredis").default | undefined;
}

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

  if (!process.env.REDIS_URL) {
    console.log("[app.pubsub] REDIS_URL não definido — skip listener");
    return;
  }
  if (globalThis.__nexusAppPubsubSubscriber) {
    // Já registrado (hot reload em dev) — não duplicar.
    return;
  }

  const { default: IORedis } = await import("ioredis");
  const { CHANNEL } = await import("@/lib/realtime");
  const { invalidateNexusChatPool } = await import("@/lib/nexus-chat/pool");

  const subscriber = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  globalThis.__nexusAppPubsubSubscriber = subscriber;

  subscriber
    .subscribe(CHANNEL)
    .then(() => {
      subscriber.on("message", (_channel, message) => {
        try {
          const ev = JSON.parse(message) as {
            type?: string;
            connectionId?: string;
          };
          if (
            (ev.type === "connection:updated" ||
              ev.type === "connection:deleted") &&
            ev.connectionId
          ) {
            invalidateNexusChatPool(ev.connectionId).catch((err) =>
              console.warn(
                "[app.pubsub] invalidateNexusChatPool falhou:",
                err.message,
              ),
            );
          }
        } catch {
          // payload malformado — ignorar
        }
      });
      console.log(
        `[app.pubsub] inscrito em ${CHANNEL} para invalidação de pools`,
      );
    })
    .catch((err) => {
      console.error("[app.pubsub] subscribe falhou:", err);
    });
}
