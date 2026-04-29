import { redis } from "./redis";

export const REALTIME_CHANNEL = "nexus-insights:realtime";

export type RealtimeEvent =
  | { type: "settings:updated"; key: string }
  | { type: "report:invalidated"; key: string }
  | { type: "notification:new"; userId: string };

export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error("[realtime] Falha ao publicar evento:", (err as Error).message);
  }
}

export { REALTIME_CHANNEL as CHANNEL };
