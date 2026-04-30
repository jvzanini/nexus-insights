/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useFilterPresets } from "../use-filter-presets";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

describe("useFilterPresets", () => {
  beforeEach(() => localStorage.clear());

  test("vazio inicialmente", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });

  test("create válido cria preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.create("VIP", EMPTY_FILTER_STATE, []);
    });
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]!.name).toBe("VIP");
  });

  test("nome vazio falha validação", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.validateName("")).toMatch(/obrigat/i);
    expect(result.current.validateName("   ")).toMatch(/obrigat/i);
  });

  test("nome duplicado falha (case-insensitive)", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.create("VIP", EMPTY_FILTER_STATE, []);
    });
    expect(result.current.validateName("VIP")).toMatch(/já existe/i);
    expect(result.current.validateName("vip")).toMatch(/já existe/i);
  });

  test("rename atualiza nome", () => {
    const { result } = renderHook(() => useFilterPresets());
    let id = "";
    act(() => {
      const p = result.current.create("VIP", EMPTY_FILTER_STATE, []);
      id = p!.id;
    });
    act(() => {
      result.current.rename(id, "Atendimentos urgentes");
    });
    expect(result.current.presets[0]!.name).toBe("Atendimentos urgentes");
  });

  test("remove deleta preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    let id = "";
    act(() => {
      const p = result.current.create("VIP", EMPTY_FILTER_STATE, []);
      id = p!.id;
    });
    act(() => {
      result.current.remove(id);
    });
    expect(result.current.presets).toEqual([]);
  });
});
