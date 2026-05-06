/**
 * Script de validação das queries do Agente Nex.
 * Conecta diretamente ao banco Chatwoot (read-only) e executa as mesmas
 * queries que as tools do agente fariam, para validar resultados reais.
 *
 * Uso: node scripts/test-nex-queries.mjs
 */

import pg from "pg";

const { Client } = pg;

const CHATWOOT_DB_URL =
  "postgresql://chatwoot_leitura:CW_leitura1212@82.112.245.232:5432/chatwoot";

const ACCOUNT_ID = 9; // Matrix Fitness Group
const MATRIX_IA_INBOX_ID = 31;

// Helpers de período (BRT = UTC-3)
function today() {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + brtOffset * 60 * 1000);
  const y = brtNow.getUTCFullYear();
  const m = brtNow.getUTCMonth();
  const d = brtNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 3, 0, 0)); // 00:00 BRT = 03:00 UTC
  const end = new Date(Date.UTC(y, m, d + 1, 3, 0, 0));
  return { start, end };
}

function thisWeek() {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + brtOffset * 60 * 1000);
  const day = brtNow.getUTCDay(); // 0=Dom, 1=Seg
  const daysFromMon = (day === 0 ? 6 : day - 1);
  const monBrt = new Date(brtNow);
  monBrt.setUTCDate(brtNow.getUTCDate() - daysFromMon);
  const start = new Date(Date.UTC(monBrt.getUTCFullYear(), monBrt.getUTCMonth(), monBrt.getUTCDate(), 3, 0, 0));
  const sunBrt = new Date(start);
  sunBrt.setUTCDate(start.getUTCDate() + 7);
  return { start, end: sunBrt };
}

function last7d() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

async function run() {
  const client = new Client({ connectionString: CHATWOOT_DB_URL });
  await client.connect();
  console.log("✅ Conectado ao Chatwoot DB\n");

  const results = [];
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      const result = await fn(client);
      console.log(`✅ ${name}`);
      console.log(`   → ${JSON.stringify(result).slice(0, 200)}`);
      results.push({ name, ok: true, result });
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
      console.log(`   → ERROR: ${err.message}`);
      results.push({ name, ok: false, error: err.message });
      failed++;
    }
    console.log("");
  }

  // ────────────────────────────────────────────
  // GRUPO 1: Conversas em aberto (snapshot total)
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 1: Snapshot de conversas em aberto ═══\n");

  await test("Total conversas em aberto (status=0, sem período)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Total conversas pendentes (status=2, sem período)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 2`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return { total: Number(r.rows[0].total) };
  });

  // ────────────────────────────────────────────
  // GRUPO 2: Conversas criadas hoje
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 2: Conversas criadas hoje (period=hoje) ═══\n");

  const todayPeriod = today();
  console.log(`   Período hoje: ${todayPeriod.start.toISOString()} → ${todayPeriod.end.toISOString()}\n`);

  await test("Conversas criadas hoje (todos os status)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, todayPeriod.start, todayPeriod.end]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas abertas criadas hoje (status=0, period=hoje)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.status = 0
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, todayPeriod.start, todayPeriod.end]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas resolvidas criadas hoje (status=1, period=hoje)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.status = 1
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, todayPeriod.start, todayPeriod.end]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas pendentes criadas hoje (status=2, period=hoje)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.status = 2
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, todayPeriod.start, todayPeriod.end]
    );
    return { total: Number(r.rows[0].total) };
  });

  // ────────────────────────────────────────────
  // GRUPO 3: Dashboard summary (comportamento real)
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 3: Dashboard summary ═══\n");

  await test("get_dashboard_summary: em_aberto (SEMPRE total, sem período)", async (db) => {
    const open = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    const pending = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 2`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    const resolved = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 1
         AND c.last_activity_at >= $3 AND c.last_activity_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, todayPeriod.start, todayPeriod.end]
    );
    return {
      em_aberto_total: Number(open.rows[0].total),
      pendentes_total: Number(pending.rows[0].total),
      resolvidas_hoje: Number(resolved.rows[0].total),
      nota: "em_aberto e pendentes = TOTAL ATUAL (não filtrado por hoje)"
    };
  });

  // ────────────────────────────────────────────
  // GRUPO 4: Filtros por estado/inbox
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 4: Filtros por estado (inbox) ═══\n");

  await test("Conversas em aberto no SP-São Paulo", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       LEFT JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.status = 0 AND i.name ILIKE $3`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%São Paulo%"]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas em aberto em MG", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       LEFT JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.status = 0 AND i.name ILIKE $3`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%Minas Gerais%"]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Todas as inboxes com contagem de abertas", async (db) => {
    const r = await db.query(
      `SELECT i.name, COUNT(c.id)::bigint AS total
       FROM conversations c JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
       GROUP BY i.id, i.name ORDER BY total DESC LIMIT 5`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return r.rows.map(r => ({ inbox: r.name, abertas: Number(r.total) }));
  });

  // ────────────────────────────────────────────
  // GRUPO 5: Filtros por etiqueta (label)
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 5: Filtros por etiqueta (cached_label_list) ═══\n");

  await test("Conversas com etiqueta 'falhou'", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.cached_label_list ILIKE $3`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%falhou%"]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas com etiqueta 'concluído'", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.cached_label_list ILIKE $3`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%concluído%"]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Conversas com etiqueta 'emp' (lead empreendimento)", async (db) => {
    const r = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.cached_label_list ILIKE $3`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%emp%"]
    );
    return { total: Number(r.rows[0].total) };
  });

  await test("Verificar cached_label_list tem dados (sample)", async (db) => {
    const r = await db.query(
      `SELECT cached_label_list FROM conversations c
       WHERE c.account_id = $1 AND cached_label_list IS NOT NULL AND cached_label_list != ''
       LIMIT 5`,
      [ACCOUNT_ID]
    );
    return r.rows.map(r => r.cached_label_list);
  });

  // ────────────────────────────────────────────
  // GRUPO 6: Atendentes e tempos
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 6: Atendentes e tempos de resposta ═══\n");

  await test("Top 5 atendentes por volume de abertas (most_open)", async (db) => {
    const r = await db.query(
      `SELECT u.name, COUNT(c.id)::bigint AS total
       FROM conversations c JOIN users u ON u.id = c.assignee_id
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
       GROUP BY u.id, u.name ORDER BY total DESC LIMIT 5`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return r.rows.map(r => ({ atendente: r.name, abertas: Number(r.total) }));
  });

  await test("Top 5 mais rápidos na 1ª resposta (fastest, sem período)", async (db) => {
    const r = await db.query(
      `SELECT u.name, AVG(re.value)::float AS avg_seconds, COUNT(re.id)::bigint AS samples
       FROM reporting_events re
       JOIN conversations c ON c.id = re.conversation_id
       JOIN users u ON u.id = c.assignee_id
       WHERE re.account_id = $1 AND c.inbox_id <> $2
         AND re.name = 'first_response' AND re.value IS NOT NULL
       GROUP BY u.id, u.name HAVING COUNT(re.id) >= 3
       ORDER BY avg_seconds ASC LIMIT 5`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return r.rows.map(r => ({
      atendente: r.name,
      avg_minutos: (Number(r.avg_seconds) / 60).toFixed(1),
      amostras: Number(r.samples)
    }));
  });

  await test("Tempo médio de resposta por departamento (avg_reply_time)", async (db) => {
    const r = await db.query(
      `SELECT t.name AS team, AVG(re.value)::float AS avg_seconds
       FROM reporting_events re
       JOIN conversations c ON c.id = re.conversation_id
       JOIN teams t ON t.id = c.team_id
       WHERE re.account_id = $1 AND c.inbox_id <> $2
         AND re.name = 'reply_time' AND re.value IS NOT NULL
       GROUP BY t.id, t.name ORDER BY avg_seconds ASC`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return r.rows.map(r => ({
      departamento: r.team,
      avg_horas: (Number(r.avg_seconds) / 3600).toFixed(2)
    }));
  });

  await test("Tempo médio de resposta do atendente Arthur", async (db) => {
    const r = await db.query(
      `SELECT u.name, AVG(re.value)::float AS avg_seconds, COUNT(re.id)::bigint AS amostras
       FROM reporting_events re
       JOIN conversations c ON c.id = re.conversation_id
       JOIN users u ON u.id = c.assignee_id
       WHERE re.account_id = $1 AND c.inbox_id <> $2
         AND re.name = 'first_response' AND re.value IS NOT NULL
         AND u.name ILIKE $3
       GROUP BY u.id, u.name`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, "%Arthur%"]
    );
    return r.rows.map(r => ({
      atendente: r.name,
      avg_minutos: (Number(r.avg_seconds) / 60).toFixed(1),
      amostras: Number(r.amostras)
    }));
  });

  // ────────────────────────────────────────────
  // GRUPO 7: Semana atual
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 7: Semana atual ═══\n");

  const weekPeriod = thisWeek();
  console.log(`   Semana: ${weekPeriod.start.toISOString()} → ${weekPeriod.end.toISOString()}\n`);

  await test("Conversas criadas esta semana (todos os status)", async (db) => {
    const r = await db.query(
      `SELECT c.status, COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2
         AND c.created_at >= $3 AND c.created_at < $4
       GROUP BY c.status ORDER BY c.status`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, weekPeriod.start, weekPeriod.end]
    );
    const statusLabel = {0: "abertas", 1: "resolvidas", 2: "pendentes", 3: "adiadas"};
    return r.rows.map(r => ({ status: statusLabel[r.status] ?? r.status, total: Number(r.total) }));
  });

  await test("Abertas + pendentes criadas esta semana", async (db) => {
    const abertas = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, weekPeriod.start, weekPeriod.end]
    );
    const pendentes = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 2
         AND c.created_at >= $3 AND c.created_at < $4`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID, weekPeriod.start, weekPeriod.end]
    );
    return {
      abertas_criadas_semana: Number(abertas.rows[0].total),
      pendentes_criadas_semana: Number(pendentes.rows[0].total)
    };
  });

  // ────────────────────────────────────────────
  // GRUPO 8: Validação do isolamento Matrix IA
  // ────────────────────────────────────────────
  console.log("═══ GRUPO 8: Isolamento Matrix IA ═══\n");

  await test("Inbox Matrix IA está sendo excluída corretamente", async (db) => {
    const semIA = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id <> $2`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    const comIA = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1`,
      [ACCOUNT_ID]
    );
    const iaOnly = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM conversations c
       WHERE c.account_id = $1 AND c.inbox_id = $2`,
      [ACCOUNT_ID, MATRIX_IA_INBOX_ID]
    );
    return {
      total_sem_ia: Number(semIA.rows[0].total),
      total_com_ia: Number(comIA.rows[0].total),
      inbox_ia: Number(iaOnly.rows[0].total),
      diferenca_correta: Number(comIA.rows[0].total) - Number(semIA.rows[0].total) === Number(iaOnly.rows[0].total)
    };
  });

  // ────────────────────────────────────────────
  // RESUMO
  // ────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log(`RESUMO: ${passed} passou / ${failed} falhou de ${passed + failed} testes`);
  console.log("═══════════════════════════════════════════\n");

  if (failed > 0) {
    console.log("TESTES QUE FALHARAM:");
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  await client.end();
}

run().catch(err => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
