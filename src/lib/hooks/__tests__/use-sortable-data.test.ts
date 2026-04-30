/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import { useSortableData } from "@/lib/hooks/use-sortable-data";

interface Row {
  id: number;
  name: string;
  age: number;
}

const baseRows: Row[] = [
  { id: 1, name: "Carla", age: 32 },
  { id: 2, name: "Bruno", age: 27 },
  { id: 3, name: "Ana", age: 41 },
];

describe("useSortableData", () => {
  it("ordena ascendente quando toggleSort é chamado a primeira vez", () => {
    const { result } = renderHook(() => useSortableData<Row>(baseRows));

    act(() => result.current.toggleSort("name"));

    expect(result.current.sortConfig).toEqual({
      key: "name",
      direction: "asc",
      compareFn: undefined,
    });
    expect(result.current.sortedData.map((r) => r.name)).toEqual([
      "Ana",
      "Bruno",
      "Carla",
    ]);
  });

  it("alterna asc → desc → null no segundo e terceiro click", () => {
    const { result } = renderHook(() => useSortableData<Row>(baseRows));

    act(() => result.current.toggleSort("age"));
    expect(result.current.sortConfig?.direction).toBe("asc");
    expect(result.current.sortedData.map((r) => r.age)).toEqual([27, 32, 41]);

    act(() => result.current.toggleSort("age"));
    expect(result.current.sortConfig?.direction).toBe("desc");
    expect(result.current.sortedData.map((r) => r.age)).toEqual([41, 32, 27]);

    act(() => result.current.toggleSort("age"));
    expect(result.current.sortConfig).toBeNull();
    // Volta a ordem original.
    expect(result.current.sortedData.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("muda key quando toggleSort recebe key diferente da atual", () => {
    const { result } = renderHook(() => useSortableData<Row>(baseRows));

    act(() => result.current.toggleSort("age"));
    act(() => result.current.toggleSort("age"));
    // age = desc agora.
    expect(result.current.sortConfig?.direction).toBe("desc");

    act(() => result.current.toggleSort("name"));
    expect(result.current.sortConfig).toEqual({
      key: "name",
      direction: "asc",
      compareFn: undefined,
    });
  });

  it("aceita compareFn customizada", () => {
    const { result } = renderHook(() => useSortableData<Row>(baseRows));
    // Sort por length do name decrescente em uma única chamada não dá pra
    // expressar pelo cycle, então testamos só o caminho de compareFn.
    const compareByNameLen = (a: Row, b: Row) => a.name.length - b.name.length;
    act(() => result.current.toggleSort("name_len", compareByNameLen));

    // Carla(5), Bruno(5), Ana(3) → asc por length: Ana, Carla, Bruno
    const names = result.current.sortedData.map((r) => r.name);
    expect(names[0]).toBe("Ana");
    // Carla e Bruno empatam em 5; ordem entre si pode variar mas ambos depois.
    expect(names.slice(1).sort()).toEqual(["Bruno", "Carla"]);
  });

  it("aceita config inicial", () => {
    const { result } = renderHook(() =>
      useSortableData<Row>(baseRows, { key: "age", direction: "desc" }),
    );
    expect(result.current.sortedData.map((r) => r.age)).toEqual([41, 32, 27]);
  });

  it("mantém referência estável de sortedData quando data e config não mudam", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useSortableData<Row>(data),
      { initialProps: { data: baseRows } },
    );
    const firstRef = result.current.sortedData;
    rerender({ data: baseRows });
    expect(result.current.sortedData).toBe(firstRef);
  });
});
