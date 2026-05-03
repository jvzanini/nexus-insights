jest.mock("@/lib/redis", () => ({
  redis: { publish: jest.fn().mockResolvedValue(1) },
}));

import { redis } from "@/lib/redis";
import {
  CHANNEL,
  publishRealtimeEvent,
  type RealtimeEvent,
} from "../realtime";

const publishMock = redis.publish as jest.MockedFunction<typeof redis.publish>;

beforeEach(() => {
  publishMock.mockClear();
});

describe("RealtimeEvent — discriminated union", () => {
  it("aceita facts:refreshed com connectionId obrigatório", () => {
    const ev: RealtimeEvent = {
      type: "facts:refreshed",
      dimension: "by_account",
      connectionId: "uuid-1",
      accountId: 1,
    };
    expect(ev.connectionId).toBe("uuid-1");
    expect(ev.dimension).toBe("by_account");
  });

  it("aceita connection:updated com connectionId", () => {
    const ev: RealtimeEvent = {
      type: "connection:updated",
      connectionId: "uuid-1",
    };
    expect(ev.type).toBe("connection:updated");
    expect(ev.connectionId).toBe("uuid-1");
  });

  it("aceita connection:deleted com connectionId", () => {
    const ev: RealtimeEvent = {
      type: "connection:deleted",
      connectionId: "uuid-1",
    };
    expect(ev.type).toBe("connection:deleted");
  });

  it("preserva eventos legados (settings:updated, report:invalidated, notification:new)", () => {
    const events: RealtimeEvent[] = [
      { type: "settings:updated", key: "theme" },
      { type: "report:invalidated", key: "dashboard" },
      { type: "notification:new", userId: "u1" },
    ];
    expect(events).toHaveLength(3);
  });
});

describe("publishRealtimeEvent", () => {
  it("publica payload JSON no canal Redis correto", async () => {
    await publishRealtimeEvent({
      type: "connection:updated",
      connectionId: "uuid-x",
    });
    expect(publishMock).toHaveBeenCalledWith(
      CHANNEL,
      expect.stringContaining('"connection:updated"'),
    );
    const sent = publishMock.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(sent);
    expect(parsed).toEqual({
      type: "connection:updated",
      connectionId: "uuid-x",
    });
  });

  it("não propaga erro se redis.publish falha (best-effort log)", async () => {
    publishMock.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      publishRealtimeEvent({ type: "connection:deleted", connectionId: "u" }),
    ).resolves.toBeUndefined();
  });
});
