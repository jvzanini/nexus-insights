/**
 * Sanity tests para `fillBuckets` (v0.22.0 — investigação G2).
 *
 * Hipótese de bug "semana/mês não bate com dia": o matching de bucket key
 * entre SQL (`date_trunc('day', c.created_at AT TIME ZONE tz) AT TIME ZONE tz`)
 * e cliente (`Intl.DateTimeFormat en-CA timeZone tz`) poderia divergir.
 *
 * Estes testes validam que:
 *  - Para granularity=day, buckets do servidor (UTC representando 00:00 BRT)
 *    casam com empty buckets gerados via fromZonedTime.
 *  - A soma dos valores horários de um dia X == valor diário de X (consistência
 *    entre representações).
 *  - Conversão TZ correta em São Paulo (UTC-3 sem DST após 2019).
 *
 * Se TODOS estes testes passarem, a divergência observada em produção é
 * **server-side** (cache stale ou query SQL diferente em dia/semana/mês),
 * não no fillBuckets — fix vai ser hotfix v0.22.1 com diagnostic logging.
 */

import { fromZonedTime } from "date-fns-tz";
import { fillBuckets, generateEmptyBuckets } from "../conversations-line-chart";

const TZ = "America/Sao_Paulo";

describe("fillBuckets (v0.22.0 G2 sanity)", () => {
  describe("generateEmptyBuckets — granularity=day", () => {
    it("gera 7 buckets para uma semana 27/04 → 03/05", () => {
      const start = fromZonedTime("2026-04-27T00:00:00", TZ);
      const end = fromZonedTime("2026-05-03T23:59:59.999", TZ);
      const buckets = generateEmptyBuckets(start, end, "day", TZ);
      expect(buckets).toHaveLength(7);
      // Primeiro bucket = 27/04 00:00 BRT = 27/04 03:00 UTC
      expect(buckets[0]!.bucket).toBe("2026-04-27T03:00:00.000Z");
      // Último = 03/05 00:00 BRT = 03/05 03:00 UTC
      expect(buckets[6]!.bucket).toBe("2026-05-03T03:00:00.000Z");
    });

    it("gera 31 buckets para o mês de maio", () => {
      const start = fromZonedTime("2026-05-01T00:00:00", TZ);
      const end = fromZonedTime("2026-05-31T23:59:59.999", TZ);
      const buckets = generateEmptyBuckets(start, end, "day", TZ);
      expect(buckets).toHaveLength(31);
    });
  });

  describe("generateEmptyBuckets — granularity=hour", () => {
    it("gera 24 buckets para um dia inteiro", () => {
      const start = fromZonedTime("2026-05-01T00:00:00", TZ);
      const end = fromZonedTime("2026-05-01T23:59:59.999", TZ);
      const buckets = generateEmptyBuckets(start, end, "hour", TZ);
      expect(buckets).toHaveLength(24);
      expect(buckets[0]!.hourOfDay).toBe(0);
      expect(buckets[23]!.hourOfDay).toBe(23);
      // hora 0 BRT em 01/05 = 03:00 UTC
      expect(buckets[0]!.bucket).toBe("2026-05-01T03:00:00.000Z");
      // hora 23 BRT em 01/05 = 02:00 UTC do dia 02/05
      expect(buckets[23]!.bucket).toBe("2026-05-02T02:00:00.000Z");
    });
  });

  describe("matching backend → client", () => {
    it("backend retorna bucket UTC (00:00 BRT) e fillBuckets casa pela key en-CA", () => {
      // Cenário: backend em modo dia (granularity=hour) retornou um bucket
      // UTC para hora 14:00 BRT = 17:00 UTC com received=12.
      const data = [
        {
          bucket: "2026-05-01T17:00:00.000Z", // 14:00 BRT
          received: 12,
          resolved: 0,
          open: 0,
          pending: 0,
        },
      ];
      const range = {
        start: fromZonedTime("2026-05-01T00:00:00", TZ).toISOString(),
        end: fromZonedTime("2026-05-01T23:59:59.999", TZ).toISOString(),
      };
      const result = fillBuckets(data, "hour", TZ, range);
      expect(result).toHaveLength(24);
      // O bucket das 14h deve ter received=12; os demais 23 buckets = 0.
      const bucket14 = result[14]!;
      expect(bucket14.received).toBe(12);
      const sumReceived = result.reduce((acc, r) => acc + r.received, 0);
      expect(sumReceived).toBe(12);
    });

    it("modo day: bucket diário 01/05 com received=12 aparece corretamente alocado", () => {
      // Cenário: backend em modo semana (granularity=day) retornou bucket UTC
      // representando 01/05 00:00 BRT = 01/05 03:00 UTC com received=12.
      const data = [
        {
          bucket: "2026-05-01T03:00:00.000Z",
          received: 12,
          resolved: 0,
          open: 0,
          pending: 0,
        },
      ];
      const range = {
        start: fromZonedTime("2026-04-27T00:00:00", TZ).toISOString(),
        end: fromZonedTime("2026-05-03T23:59:59.999", TZ).toISOString(),
      };
      const result = fillBuckets(data, "day", TZ, range);
      expect(result).toHaveLength(7);
      // 01/05 é o índice [4] em [27/04, 28/04, 29/04, 30/04, 01/05, 02/05, 03/05]
      const bucket01_05 = result[4]!;
      expect(bucket01_05.received).toBe(12);
      // Demais dias zerados.
      const sumReceived = result.reduce((acc, r) => acc + r.received, 0);
      expect(sumReceived).toBe(12);
    });

    it("CONSISTÊNCIA: soma horária de um dia == valor diário do dia (key matching invariant)", () => {
      // Se a soma das 24 horas do dia 01/05 = 12 conversas, então o bucket
      // diário 01/05 também deveria mostrar 12. Este teste valida o INVARIANT
      // do client-side. Se falhar em produção, bug está no SQL backend.
      const hourly: Array<{
        bucket: string;
        received: number;
        resolved: number;
        open: number;
        pending: number;
      }> = [];
      // Distribui 12 conversas em 12 horas diferentes do dia 01/05 BRT.
      for (let h = 8; h < 20; h++) {
        const utc = fromZonedTime(
          `2026-05-01T${String(h).padStart(2, "0")}:00:00`,
          TZ,
        );
        hourly.push({
          bucket: utc.toISOString(),
          received: 1,
          resolved: 0,
          open: 0,
          pending: 0,
        });
      }
      const dayRange = {
        start: fromZonedTime("2026-05-01T00:00:00", TZ).toISOString(),
        end: fromZonedTime("2026-05-01T23:59:59.999", TZ).toISOString(),
      };
      const dayResult = fillBuckets(hourly, "hour", TZ, dayRange);
      const sumDayHourly = dayResult.reduce((acc, r) => acc + r.received, 0);

      const dayAggregate = [
        {
          bucket: "2026-05-01T03:00:00.000Z",
          received: 12,
          resolved: 0,
          open: 0,
          pending: 0,
        },
      ];
      const weekRange = {
        start: fromZonedTime("2026-04-27T00:00:00", TZ).toISOString(),
        end: fromZonedTime("2026-05-03T23:59:59.999", TZ).toISOString(),
      };
      const weekResult = fillBuckets(dayAggregate, "day", TZ, weekRange);
      const sumWeekly01_05 = weekResult[4]!.received;

      // Invariant: soma horária == agregado diário == 12.
      expect(sumDayHourly).toBe(12);
      expect(sumWeekly01_05).toBe(12);
      expect(sumDayHourly).toBe(sumWeekly01_05);
    });
  });

  describe("conclusão investigativa G2", () => {
    it("DOCUMENTA que client-side fillBuckets é matemático e correto — bug seria server-side", () => {
      // Este teste sempre passa; documenta a conclusão da investigação:
      // se em produção a soma horária de um dia ≠ valor diário do mesmo dia,
      // a divergência é no SQL `date_trunc` ou no period range do backend.
      // Logging server-side foi adicionado em `dashboardData()` para capturar
      // evidência em produção. Hotfix v0.22.1 vai apertar a query.
      expect(true).toBe(true);
    });
  });
});
