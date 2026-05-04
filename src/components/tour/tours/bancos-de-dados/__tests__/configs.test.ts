import { listaTour } from "../lista";
import { conexaoTour } from "../conexao";
import { sincronizacaoTour } from "../sincronizacao";
import { jobsTour } from "../jobs";
import { saudeTour } from "../saude";
import { editConnectionTour } from "../edit-connection";

const ALL_TOURS = [
  listaTour,
  conexaoTour,
  sincronizacaoTour,
  jobsTour,
  saudeTour,
  editConnectionTour,
];

describe("Tour configs", () => {
  it.each(ALL_TOURS.map((t) => [t.id, t]))(
    "'%s' tem ID e ≥1 step",
    (_id, tour) => {
      expect(tour.id).toBeTruthy();
      expect(tour.steps.length).toBeGreaterThan(0);
    },
  );

  it.each(ALL_TOURS.map((t) => [t.id, t]))(
    "'%s' targetSelectors no formato [data-tour=...]",
    (_id, tour) => {
      for (const s of tour.steps) {
        expect(s.targetSelector).toMatch(/^\[data-tour=/);
      }
    },
  );

  it("não há IDs de tour duplicados", () => {
    const ids = ALL_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
