/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type {
  UsageDetailsResult,
  UsageSummary,
} from "@/lib/llm/queries/usage-stats";

// ----- Mocks ---------------------------------------------------------------

const fetchUsageStatsMock = jest.fn();
const fetchUsageDetailsMock = jest.fn();
const fetchDistinctProvidersInRangeMock = jest.fn();
const fetchDistinctModelsInRangeMock = jest.fn();

jest.mock("@/lib/actions/llm-usage", () => ({
  fetchUsageStats: (...args: unknown[]) => fetchUsageStatsMock(...args),
  fetchUsageDetails: (...args: unknown[]) => fetchUsageDetailsMock(...args),
  fetchDistinctProvidersInRange: (...args: unknown[]) =>
    fetchDistinctProvidersInRangeMock(...args),
  fetchDistinctModelsInRange: (...args: unknown[]) =>
    fetchDistinctModelsInRangeMock(...args),
}));

// Recharts requer medidas reais; injeta container fixo.
jest.mock("recharts", () => {
  const actual = jest.requireActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="rc-container" style={{ width: 400, height: 300 }}>
        {children}
      </div>
    ),
  };
});

// Sonner toast (usado por filhos)
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// PeriodPills puxa server action getMinReportDate (que importa auth/next-auth
// e quebra com ESM no Jest). Stub leve com as 5 pills canonicas.
jest.mock("@/components/reports/period-pills", () => ({
  PeriodPills: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }) => (
    <div role="tablist" aria-label="Periodo">
      {[
        { key: "hoje", label: "Hoje" },
        { key: "semana_atual", label: "Esta semana" },
        { key: "mes_atual", label: "Este mes" },
        { key: "todos", label: "Todos" },
        { key: "custom", label: "Personalizado" },
      ].map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="tab"
          aria-selected={value === opt.key}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

// matchMedia (usado por useIsMobile dentro do PeriodPills e outros).
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

import { ConsumoContent } from "../consumo-content";

// ----- Fixtures ------------------------------------------------------------

function makeStats(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    totalCost: 0.012345,
    totalCostBrl: 0.067891,
    totalTokensInput: 1500,
    totalTokensOutput: 3200,
    totalCalls: 12,
    byModel: [
      {
        provider: "openai",
        model: "gpt-5.4",
        cost: 0.01,
        costBrl: 0.05,
        tokensInput: 1000,
        tokensOutput: 2000,
        calls: 8,
      },
    ],
    byDay: [
      {
        day: "2026-04-29",
        cost: 0.007,
        costBrl: 0.042,
        tokens: 3500,
        calls: 8,
      },
    ],
    byProvider: [{ provider: "openai", cost: 0.01, costBrl: 0.05, calls: 8 }],
    ...overrides,
  };
}

function makeDetails(overrides: Partial<UsageDetailsResult> = {}): UsageDetailsResult {
  return {
    rows: [
      {
        id: "row-1",
        provider: "openai",
        model: "gpt-5.4",
        tokensInput: 100,
        tokensOutput: 200,
        costUsd: 0.001234,
        costBrl: 0.006789,
        usdToBrlRate: 5.5,
        durationMs: 1500,
        createdAt: "2026-04-29T12:34:56Z",
        promptChars: 800,
        responseChars: 1600,
        userId: "user-1",
        errorMessage: null,
        isPlayground: false,
      },
      {
        id: "row-2",
        provider: "openai",
        model: "whisper-1",
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0.0006,
        costBrl: 0.0033,
        usdToBrlRate: 5.5,
        durationMs: 800,
        createdAt: "2026-04-29T12:00:00Z",
        promptChars: null,
        responseChars: null,
        userId: null,
        errorMessage: null,
        isPlayground: false,
      },
    ],
    total: 2,
    totals: {
      costUsd: 0.001834,
      costBrl: 0.010089,
      tokensInput: 100,
      tokensOutput: 200,
      durationMsTotal: 2300,
      count: 2,
    },
    ...overrides,
  };
}

// Normalizador para comparar strings com NBSP / espacos variados.
function norm(s: string): string {
  return s.replace(/\s+/gu, " ");
}

function hasNormText(needle: string) {
  return (_: string, node: Element | null) => {
    const text = node?.textContent ?? "";
    return norm(text).includes(needle);
  };
}

// ----- Tests ---------------------------------------------------------------

describe("ConsumoContent — refactor T6d v0.16.0", () => {
  beforeEach(() => {
    fetchUsageStatsMock.mockReset();
    fetchUsageDetailsMock.mockReset();
    fetchDistinctProvidersInRangeMock.mockReset();
    fetchDistinctModelsInRangeMock.mockReset();

    fetchUsageStatsMock.mockResolvedValue(makeStats());
    fetchUsageDetailsMock.mockResolvedValue(makeDetails());
    fetchDistinctProvidersInRangeMock.mockResolvedValue(["openai", "anthropic"]);
    fetchDistinctModelsInRangeMock.mockResolvedValue([
      "gpt-5.4",
      "claude-opus-4.7",
      "whisper-1",
    ]);
  });

  it("renderiza Custo total com 4 casas (BRL e USD)", async () => {
    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());

    // Aguarda render efetivo dos KPIs.
    await screen.findAllByText(/Custo total/i);

    // formatBrl4(0.067891) = "R$ 0,0679"; formatUsd4(0.012345) = "$0.0123".
    // Buscamos no innerText normalizado para tolerar NBSP do Intl.
    await waitFor(() => {
      const text = norm(container.textContent ?? "");
      expect(text).toMatch(/R\$ 0,0679/);
      expect(text).toMatch(/\$0\.0123/);
    });

    const allText = norm(container.textContent ?? "");
    expect(allText).toMatch(/Total de chamadas/i);
    expect(allText).toMatch(/Tokens de entrada/i);
    expect(allText).toMatch(/Tokens de sa[ií]da/i);
  });

  it("renderiza header da tabela como 'Histórico de chamadas' e colunas renomeadas", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());
    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());

    expect(
      await screen.findByText(/Hist[oó]rico de chamadas/i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("columnheader", { name: /Tokens de entrada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Tokens de sa[ií]da/i }),
    ).toBeInTheDocument();
  });

  it("renderiza linhas do Whisper com '—' nas colunas de tokens", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    const whisperCell = await screen.findByText("whisper-1");
    expect(whisperCell).toBeInTheDocument();

    // Pelo menos 2 ocorrencias de "—" (em / out das chamadas Whisper).
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renderiza pills compartilhadas com 5 chaves canonicas", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());

    expect(screen.getByRole("tab", { name: /^Hoje$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Esta semana/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Este m[eê]s/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Todos$/ })).toBeInTheDocument();
  });

  it("renderiza paginacao com 3 zonas quando ha mais de uma pagina", async () => {
    fetchUsageDetailsMock.mockResolvedValue(makeDetails({ total: 120 }));

    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    // Zona 1: "Mostrando X-Y de N"
    expect(await screen.findByText(/Mostrando/i)).toBeInTheDocument();
    // Zona 2: "Pagina X de Y"
    expect(screen.getByText(/P[aá]gina \d+ de \d+/i)).toBeInTheDocument();
    // Zona 3: dropdown {n} por pagina
    expect(screen.getByText(/por p[aá]gina/i)).toBeInTheDocument();
  });

  // ----- T2-CONSUMO v0.20.0 ----------------------------------------------

  // ----- T1+T4 v0.24.0 ---------------------------------------------------

  it("T1: dashboard zerado (totalCalls=0) NÃO renderiza EmptyConsumoState", async () => {
    fetchUsageStatsMock.mockResolvedValue(
      makeStats({
        totalCalls: 0,
        totalCost: 0,
        totalCostBrl: 0,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        byModel: [],
        byDay: [],
        byProvider: [],
      }),
    );
    fetchUsageDetailsMock.mockResolvedValue(
      makeDetails({
        rows: [],
        total: 0,
        totals: {
          costUsd: 0,
          costBrl: 0,
          tokensInput: 0,
          tokensOutput: 0,
          durationMsTotal: 0,
          count: 0,
        },
      }),
    );

    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());
    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());

    // Empty state full-page foi removido.
    await waitFor(() => {
      expect(
        screen.queryByText(
          /Nenhuma chamada ao Agente Nex registrada ainda/i,
        ),
      ).not.toBeInTheDocument();
    });

    // Mas o dashboard deve estar visível com KPIs zerados + tabela vazia.
    expect(await screen.findByText(/Total de chamadas/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Hist[oó]rico de chamadas/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Nenhuma chamada no per[ií]odo/i),
    ).toBeInTheDocument();
  });

  it("T4 v0.26: linha total destaque (bg-violet-500/5 dark:/10 + font-bold + text-sm + sem Sigma + sem N)", async () => {
    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    const totalLabel = await screen.findByText(/Total no filtro/i);
    const totalRow = totalLabel.closest("tr");
    expect(totalRow).not.toBeNull();

    // v0.26: Total destaque com bg violet sutil + font-bold + text-sm + border-border/60.
    expect(totalRow!.className).toMatch(/bg-violet-500\/5/);
    expect(totalRow!.className).toMatch(/dark:bg-violet-500\/10/);
    expect(totalRow!.className).toMatch(/font-bold/);
    expect(totalRow!.className).toMatch(/text-sm/);
    expect(totalRow!.className).toMatch(/border-border\/60/);

    // Não deve mais ter uppercase/font-semibold (era v0.24, agora v0.26 destaque).
    expect(totalRow!.className).not.toMatch(/uppercase/);
    expect(totalRow!.className).not.toMatch(/font-semibold/);

    // Sigma removido da linha total (mantém de v0.24).
    expect(container.querySelector(".lucide-sigma")).toBeNull();

    // Label sem "(N)" — só "Total no filtro" puro.
    expect(totalLabel.textContent ?? "").not.toMatch(/\(/);
  });

  it("T4: linhas clicáveis têm class 'group' + ChevronRight com opacity-0 group-hover:opacity-60", async () => {
    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    // Aguarda render das rows clicáveis (modelo gpt-5.4).
    const modelCell = await screen.findByText("gpt-5.4");
    const dataRow = modelCell.closest("tr");
    expect(dataRow).not.toBeNull();
    expect(dataRow!.className).toMatch(/\bgroup\b/);
    expect(dataRow!.className).toMatch(/cursor-pointer/);

    // Primeira célula (data/hora) tem ChevronRight absolute.
    const firstCell = dataRow!.querySelector("td");
    expect(firstCell).not.toBeNull();
    expect(firstCell!.className).toMatch(/relative/);
    expect(firstCell!.className).toMatch(/pl-7/);

    // ChevronRight com opacity-0 + group-hover:opacity-60.
    const chevron = firstCell!.querySelector(".lucide-chevron-right");
    expect(chevron).toBeInTheDocument();
    expect(chevron!.getAttribute("class") ?? "").toMatch(/opacity-0/);
    expect(chevron!.getAttribute("class") ?? "").toMatch(
      /group-hover:opacity-60/,
    );
    // sanity: container existe para evitar lint unused.
    expect(container).toBeTruthy();
  });

  it("3.G: pageSize usa CustomSelect (não <select> HTML nativo)", async () => {
    fetchUsageDetailsMock.mockResolvedValue(makeDetails({ total: 120 }));

    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);
    await screen.findByText(/por p[aá]gina/i);

    // Não deve haver mais o <select> HTML nativo na zona de paginação.
    const nativeSelects = container.querySelectorAll("select");
    expect(nativeSelects.length).toBe(0);

    // CustomSelect renderiza <button> com aria-label "Itens por página".
    expect(
      screen.getByRole("button", { name: /Itens por p[aá]gina/i }),
    ).toBeInTheDocument();
  });

  it("3.F: filtro global de Provider visível com 'Todos os providers' como default", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fetchDistinctProvidersInRangeMock).toHaveBeenCalled(),
    );

    // Há um botão CustomSelect com aria-label de filtro global.
    const trigger = await screen.findByRole("button", {
      name: /Filtrar por provider \(global\)/i,
    });
    expect(trigger).toBeInTheDocument();
    // Default mostra "Todos os providers".
    expect(trigger.textContent).toMatch(/Todos os providers/i);
  });

  // ----- T-E2 v0.31.0 ----------------------------------------------------

  it("T-E2: Card title 'Custo por hora' quando pill='hoje' e byHour disponível", async () => {
    // Mocka stats com byHour de 24 buckets (1 bucket com calls > 0).
    fetchUsageStatsMock.mockResolvedValue(
      makeStats({
        byHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          cost: hour === 10 ? 0.01 : 0,
          costBrl: hour === 10 ? 0.05 : 0,
          calls: hour === 10 ? 3 : 0,
        })),
      }),
    );

    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());

    // Default pill é "mes_atual" → mostra "Custo por dia". Troca pra "Hoje".
    fireEvent.click(screen.getByRole("tab", { name: /^Hoje$/ }));

    await waitFor(() =>
      expect(screen.getByText(/Custo por hora/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Custo por dia/i)).not.toBeInTheDocument();
  });

  it("T-E2: Card title 'Custo por dia' quando pill='mes_atual' (não hourly)", async () => {
    fetchUsageStatsMock.mockResolvedValue(makeStats());

    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());

    // Default pill é "mes_atual" → "Custo por dia".
    expect(await screen.findByText(/Custo por dia/i)).toBeInTheDocument();
    expect(screen.queryByText(/Custo por hora/i)).not.toBeInTheDocument();
  });

  // ----- T-E3 v0.31.0 — Coluna Origem + filtro Ambiente -----------------

  it("T-E3: renderiza coluna 'Origem' na tabela", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    expect(
      await screen.findByRole("columnheader", { name: /Origem/i }),
    ).toBeInTheDocument();
  });

  it("T-E3: renderiza filtro 'Ambiente' (CustomSelect) ao lado do Provider", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());

    expect(
      await screen.findByRole("button", {
        name: /Filtrar por ambiente/i,
      }),
    ).toBeInTheDocument();
  });

  it("T-E3: badge 'Agente Nex' violet quando row.isPlayground=false", async () => {
    fetchUsageDetailsMock.mockResolvedValue(
      makeDetails({
        rows: [
          {
            id: "row-bb",
            provider: "openai",
            model: "gpt-5.4",
            tokensInput: 100,
            tokensOutput: 200,
            costUsd: 0.001,
            costBrl: 0.005,
            usdToBrlRate: 5.5,
            durationMs: 1500,
            createdAt: "2026-04-29T12:34:56Z",
            promptChars: null,
            responseChars: null,
            userId: null,
            errorMessage: null,
            isPlayground: false,
          },
        ],
        total: 1,
      }),
    );

    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    // Badge "Agente Nex" presente em ALGUMA célula da tabela.
    const cells = container.querySelectorAll("tbody td");
    const found = Array.from(cells).some((c) =>
      /Agente Nex/i.test(c.textContent ?? ""),
    );
    expect(found).toBe(true);

    // Tom violet aplicado.
    const badge = Array.from(
      container.querySelectorAll("tbody td span"),
    ).find((el) => /Agente Nex/i.test(el.textContent ?? ""));
    expect(badge).toBeTruthy();
    expect(badge!.className).toMatch(/violet/);
  });

  it("T-E3: badge 'Playground' amber quando row.isPlayground=true", async () => {
    fetchUsageDetailsMock.mockResolvedValue(
      makeDetails({
        rows: [
          {
            id: "row-pg",
            provider: "openai",
            model: "gpt-5.4",
            tokensInput: 100,
            tokensOutput: 200,
            costUsd: 0.001,
            costBrl: 0.005,
            usdToBrlRate: 5.5,
            durationMs: 1500,
            createdAt: "2026-04-29T12:34:56Z",
            promptChars: null,
            responseChars: null,
            userId: null,
            errorMessage: null,
            isPlayground: true,
          },
        ],
        total: 1,
      }),
    );

    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    const badge = Array.from(
      container.querySelectorAll("tbody td span"),
    ).find((el) => /Playground/i.test(el.textContent ?? ""));
    expect(badge).toBeTruthy();
    expect(badge!.className).toMatch(/amber/);
  });

  it("T-E3: filtro Ambiente=Playground propaga isPlayground=true ao fetch", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());

    const trigger = await screen.findByRole("button", {
      name: /Filtrar por ambiente/i,
    });
    fetchUsageDetailsMock.mockClear();

    fireEvent.click(trigger);
    const opt = await screen.findByRole("option", { name: /^Playground$/i });
    fireEvent.click(opt);

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    const lastCall =
      fetchUsageDetailsMock.mock.calls[
        fetchUsageDetailsMock.mock.calls.length - 1
      ]?.[0];
    expect(lastCall?.isPlayground).toBe(true);
  });

  it("T-E3: linha Total tem colSpan=4 (Data + Origem + Provider + Modelo)", async () => {
    const { container } = render(
      <ConsumoContent minDate="2026-01-01T00:00:00.000Z" />,
    );

    await waitFor(() => expect(fetchUsageDetailsMock).toHaveBeenCalled());
    await screen.findByText(/Hist[oó]rico de chamadas/i);

    const totalLabel = await screen.findByText(/Total no filtro/i);
    const totalCell = totalLabel.closest("td");
    expect(totalCell).not.toBeNull();
    expect(totalCell!.getAttribute("colspan")).toBe("4");
    // Sanity: container existe.
    expect(container).toBeTruthy();
  });

  it("3.F: stats é refeito com provider quando filtro global muda", async () => {
    render(<ConsumoContent minDate="2026-01-01T00:00:00.000Z" />);

    await waitFor(() => expect(fetchUsageStatsMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fetchDistinctProvidersInRangeMock).toHaveBeenCalled(),
    );

    // Espera o popover hidratar com a lista de providers.
    const trigger = await screen.findByRole("button", {
      name: /Filtrar por provider \(global\)/i,
    });
    fetchUsageStatsMock.mockClear();

    // Abre o popover.
    fireEvent.click(trigger);

    // Escolhe "OpenAI" no listbox.
    const opt = await screen.findByRole("option", { name: /^OpenAI$/i });
    fireEvent.click(opt);

    await waitFor(() => {
      expect(fetchUsageStatsMock).toHaveBeenCalled();
    });
    const lastCall =
      fetchUsageStatsMock.mock.calls[
        fetchUsageStatsMock.mock.calls.length - 1
      ]?.[0];
    expect(lastCall?.provider).toBe("openai");
  });
});
