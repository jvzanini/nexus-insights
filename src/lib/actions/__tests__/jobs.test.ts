jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

// E4 v0.41: jobs.ts agora importa prisma para mapear connectionId → accountIds.
// Mock evita carregar src/generated/prisma/client.ts (ESM import.meta) em jest.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    companyChatBinding: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock("@/lib/queue", () => ({
  refreshByAccountQueue: { add: jest.fn() },
  refreshByInboxQueue: { add: jest.fn() },
  refreshByAgentQueue: { add: jest.fn() },
  refreshByTeamQueue: { add: jest.fn() },
  housekeepingQueue: { add: jest.fn() },
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

jest.mock("@/lib/chatwoot/facts", () => ({
  readFactsMeta: jest.fn(),
}));

jest.mock("@/worker/jobs/pre-agregacao/shared", () => ({
  getAccountsToRefresh: jest.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import {
  refreshByAccountQueue,
  refreshByInboxQueue,
  refreshByAgentQueue,
  refreshByTeamQueue,
} from "@/lib/queue";
import { logAudit } from "@/lib/audit";
import { readFactsMeta } from "@/lib/chatwoot/facts";
import { getAccountsToRefresh } from "@/worker/jobs/pre-agregacao/shared";
import {
  getJobsStatus,
  triggerRefresh,
  triggerBackfill,
} from "@/lib/actions/jobs";

const mockedGetCurrentUser = getCurrentUser as unknown as jest.Mock;
const mockedAccountAdd = refreshByAccountQueue.add as unknown as jest.Mock;
const mockedInboxAdd = refreshByInboxQueue.add as unknown as jest.Mock;
const mockedAgentAdd = refreshByAgentQueue.add as unknown as jest.Mock;
const mockedTeamAdd = refreshByTeamQueue.add as unknown as jest.Mock;
const mockedLogAudit = logAudit as unknown as jest.Mock;
const mockedReadFactsMeta = readFactsMeta as unknown as jest.Mock;
const mockedGetAccountsToRefresh = getAccountsToRefresh as unknown as jest.Mock;

const SUPER_ADMIN = {
  id: "user-1",
  name: "Super",
  email: "super@example.com",
  platformRole: "super_admin",
  isOwner: true,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "dark",
  accountIds: [],
  teamIds: [],
};

const VIEWER = { ...SUPER_ADMIN, platformRole: "viewer", isOwner: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccountAdd.mockResolvedValue({ id: "job-account" });
  mockedInboxAdd.mockResolvedValue({ id: "job-inbox" });
  mockedAgentAdd.mockResolvedValue({ id: "job-agent" });
  mockedTeamAdd.mockResolvedValue({ id: "job-team" });
});

describe("getJobsStatus", () => {
  it("retorna erro quando usuário não está autenticado", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const r = await getJobsStatus();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/autentic/i);
  });

  it("retorna erro quando usuário não é super_admin", async () => {
    mockedGetCurrentUser.mockResolvedValue(VIEWER);
    const r = await getJobsStatus();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/super admin/i);
  });

  it("agrega rows de readFactsMeta para cada account ativa", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    mockedGetAccountsToRefresh.mockResolvedValue([9, 2]);
    mockedReadFactsMeta.mockImplementation(async ({ accountId }) => [
      {
        dimension: "by_account",
        accountId,
        lastRefreshAt: new Date(),
        lastAttemptAt: null,
        lastError: null,
        oldestBucketDate: null,
        newestBucketDate: null,
        lagSeconds: 60,
        status: "fresh",
      },
    ]);

    const r = await getJobsStatus();
    expect(r.success).toBe(true);
    expect(r.data?.rows.length).toBe(2);
    expect(mockedReadFactsMeta).toHaveBeenCalledTimes(2);
    expect(mockedReadFactsMeta).toHaveBeenCalledWith({ accountId: 9 });
    expect(mockedReadFactsMeta).toHaveBeenCalledWith({ accountId: 2 });
  });
});

describe("triggerRefresh", () => {
  it("recusa não autenticado", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const r = await triggerRefresh({ dimension: "by_account" });
    expect(r.success).toBe(false);
  });

  it("recusa não super_admin", async () => {
    mockedGetCurrentUser.mockResolvedValue(VIEWER);
    const r = await triggerRefresh({ dimension: "by_account" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/super admin/i);
    expect(mockedAccountAdd).not.toHaveBeenCalled();
  });

  it("valida dimension via Zod (rejeita valor inválido)", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await triggerRefresh({ dimension: "by_invalid" });
    expect(r.success).toBe(false);
    expect(mockedAccountAdd).not.toHaveBeenCalled();
  });

  it("enfileira refresh para super_admin com jobId/name corretos", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await triggerRefresh({ dimension: "by_inbox" });
    expect(r.success).toBe(true);
    expect(mockedInboxAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockedInboxAdd.mock.calls[0];
    expect(name).toBe("manual-refresh-by_inbox");
    expect(data).toEqual({});
    expect(opts.jobId).toMatch(/^manual-by_inbox-\d+$/);
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    expect(mockedLogAudit.mock.calls[0][0]).toMatchObject({
      action: "setting_updated",
      details: expect.objectContaining({
        action: "manual_refresh",
        dimension: "by_inbox",
      }),
    });
  });

  it("hourly_by_account vai para a queue refresh-by-account", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await triggerRefresh({ dimension: "hourly_by_account" });
    expect(r.success).toBe(true);
    expect(mockedAccountAdd).toHaveBeenCalledTimes(1);
    expect(mockedInboxAdd).not.toHaveBeenCalled();
  });
});

describe("triggerBackfill", () => {
  it("recusa não super_admin", async () => {
    mockedGetCurrentUser.mockResolvedValue(VIEWER);
    const r = await triggerBackfill({ dimension: "by_team", days: 30 });
    expect(r.success).toBe(false);
    expect(mockedTeamAdd).not.toHaveBeenCalled();
  });

  it("rejeita days > 365", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await triggerBackfill({ dimension: "by_team", days: 400 });
    expect(r.success).toBe(false);
    expect(mockedTeamAdd).not.toHaveBeenCalled();
  });

  it("usa 90 dias por padrão quando days não é fornecido", async () => {
    mockedGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await triggerBackfill({ dimension: "by_agent" });
    expect(r.success).toBe(true);
    expect(r.data?.days).toBe(90);
    expect(mockedAgentAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockedAgentAdd.mock.calls[0];
    expect(name).toBe("backfill-by_agent");
    expect(data).toEqual({ days: 90 });
    expect(opts.jobId).toMatch(/^backfill-by_agent-\d+$/);
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "setting_updated",
        details: expect.objectContaining({
          action: "manual_backfill",
          dimension: "by_agent",
          days: 90,
        }),
      }),
    );
  });
});
