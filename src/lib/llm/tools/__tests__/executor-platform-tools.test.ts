/**
 * Tests para as tools introspectivas (BUNDLE C — T8/T9/T10):
 *  - get_active_company       → identidade da empresa + role
 *  - get_integrations_status  → integrações configuradas (gating super_admin p/ lastSyncAt)
 *  - get_nex_config_summary   → modelo de IA, KB, áudio, visibilidades (sem secrets)
 */

import { executeTool } from "../executor";
import * as tenant from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getKbDocsForPrompt } from "@/lib/nex/kb";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import { getVisibleReportKeys } from "@/lib/reports/visibility";

jest.mock("@/lib/tenant");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    integrationProfile: {
      findMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/llm/get-active-config");
jest.mock("@/lib/nex/prompt");
jest.mock("@/lib/nex/kb");
jest.mock("@/lib/llm/get-nex-bubble-enabled");
jest.mock("@/lib/reports/visibility");

const mockedGetKnownAccounts = tenant.getKnownAccounts as jest.MockedFunction<
  typeof tenant.getKnownAccounts
>;
const mockedFindMany = prisma.integrationProfile
  .findMany as unknown as jest.Mock;

describe("get_active_company (T8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetKnownAccounts.mockResolvedValue([
      { id: 9, name: "Matrix Fitness Group" },
    ]);
  });

  it("retorna shape correto para super_admin", async () => {
    const r = await executeTool(
      "get_active_company",
      {},
      9,
      true,
      "super_admin",
    );
    expect(r.error).toBeUndefined();
    expect(r.result).toMatchObject({
      id: 9,
      name: "Matrix Fitness Group",
      platformRole: "super_admin",
      companyRole: null,
      isOwner: false,
    });
  });

  it("fallback para Empresa #X quando getKnownAccounts não conhece o accountId", async () => {
    mockedGetKnownAccounts.mockResolvedValue([]);
    const r = await executeTool("get_active_company", {}, 99, true, "viewer");
    expect((r.result as { name: string }).name).toBe("Empresa #99");
    expect((r.result as { platformRole: string }).platformRole).toBe("viewer");
  });
});

describe("get_integrations_status (T9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filtra IntegrationProfile pelo accountIdFilter (inclui null = cobre todas)", async () => {
    mockedFindMany.mockResolvedValue([
      {
        kind: "power_bi",
        status: "active",
        accountIdFilter: [9],
        lastProvisionedAt: new Date("2026-05-01T00:00Z"),
      },
      {
        kind: "power_bi",
        status: "active",
        accountIdFilter: [2],
        lastProvisionedAt: new Date("2026-05-01T00:00Z"),
      },
      {
        kind: "power_bi",
        status: "errored",
        accountIdFilter: null,
        lastProvisionedAt: null,
      },
    ]);
    const r = await executeTool(
      "get_integrations_status",
      {},
      9,
      true,
      "super_admin",
    );
    const power = (
      r.result as {
        kindCounts: {
          power_bi: { total: number; active: number; errored: number };
        };
      }
    ).kindCounts.power_bi;
    expect(power.total).toBe(2); // 1 acc=9 + 1 null (cobre todas)
    expect(power.active).toBe(1);
    expect(power.errored).toBe(1);
  });

  it("viewer não vê lastSyncAt (gating super_admin)", async () => {
    mockedFindMany.mockResolvedValue([
      {
        kind: "power_bi",
        status: "active",
        accountIdFilter: [9],
        lastProvisionedAt: new Date(),
      },
    ]);
    const r = await executeTool(
      "get_integrations_status",
      {},
      9,
      true,
      "viewer",
    );
    const power = (
      r.result as { kindCounts: { power_bi: { lastSyncAt?: string } } }
    ).kindCounts.power_bi;
    expect(power.lastSyncAt).toBeUndefined();
  });
});

describe("get_nex_config_summary (T10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveLlmConfig as jest.Mock).mockResolvedValue({
      provider: "openai",
      model: "gpt-5-mini",
    });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({
      kbEnabled: true,
      audioInputEnabled: true,
    });
    (getKbDocsForPrompt as jest.Mock).mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);
    (isNexBubbleEnabled as jest.Mock).mockResolvedValue(true);
    (getVisibleReportKeys as jest.Mock).mockResolvedValue(
      new Set<string>(["dashboard", "conversas"]),
    );
  });

  it("retorna shape completo sem secrets", async () => {
    const r = await executeTool(
      "get_nex_config_summary",
      {},
      9,
      true,
      "super_admin",
    );
    const json = JSON.stringify(r.result);
    expect(json).not.toMatch(/sk-|api[_-]?key|secret/i);
    expect(r.result).toMatchObject({
      provider: "openai",
      model: "gpt-5-mini",
      kbEnabled: true,
      kbDocsCount: 2,
      audioInputEnabled: true,
      audioEffectivelyEnabled: true,
      bubbleEnabled: true,
    });
  });

  it("audioEffectivelyEnabled=false quando provider != openai", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValue({
      provider: "anthropic",
      model: "claude",
    });
    const r = await executeTool(
      "get_nex_config_summary",
      {},
      9,
      true,
      "super_admin",
    );
    expect(
      (r.result as { audioEffectivelyEnabled: boolean })
        .audioEffectivelyEnabled,
    ).toBe(false);
  });
});
