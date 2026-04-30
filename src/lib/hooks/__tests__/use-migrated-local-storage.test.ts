/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useMigratedLocalStorageSet } from "../use-migrated-local-storage";

describe("useMigratedLocalStorageSet", () => {
  beforeEach(() => localStorage.clear());

  test("v2 vazio + v1 vazio → default", () => {
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set(["a"])),
    );
    expect(Array.from(result.current[0]).sort()).toEqual(["a"]);
  });

  test("v1 existe + v2 vazio → migrate (filtra) e limpa v1", () => {
    localStorage.setItem("k-v1", JSON.stringify(["a", "b", "c"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet(
        "k-v2",
        "k-v1",
        (s) => new Set([...s].filter((k) => k !== "b")),
        new Set(),
      ),
    );
    expect(Array.from(result.current[0]).sort()).toEqual(["a", "c"]);
    expect(localStorage.getItem("k-v1")).toBeNull();
    expect(JSON.parse(localStorage.getItem("k-v2")!).sort()).toEqual(["a", "c"]);
  });

  test("v2 já existe + v1 existe → ignora v1, limpa v1", () => {
    localStorage.setItem("k-v1", JSON.stringify(["legacy"]));
    localStorage.setItem("k-v2", JSON.stringify(["new"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set()),
    );
    expect(Array.from(result.current[0])).toEqual(["new"]);
    expect(localStorage.getItem("k-v1")).toBeNull();
  });

  test("migration resulta em vazio → fallback default", () => {
    localStorage.setItem("k-v1", JSON.stringify(["x", "y"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet(
        "k-v2",
        "k-v1",
        () => new Set(),
        new Set(["fallback"]),
      ),
    );
    expect(Array.from(result.current[0])).toEqual(["fallback"]);
  });

  test("setter atualiza v2 só (não toca v1)", () => {
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set(["a"])),
    );
    act(() => result.current[1](new Set(["x", "y"])));
    expect(JSON.parse(localStorage.getItem("k-v2")!).sort()).toEqual(["x", "y"]);
  });
});
