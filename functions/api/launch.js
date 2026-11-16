// Sim launch counter.
// POST: a sim page on the live site sends its name once when it opens; we add 1 to that
//       sim's tally for today (Singapore date). Nothing about the visitor is stored:
//       no IP address, no cookie, only the sim name, the date and a count.
// GET:  totals per sim (last 7 days, last 30 days, all time) for /stats.

const CREATE = `CREATE TABLE IF NOT EXISTS launches (
  sim TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sim, day)
)`;
const ADD = `INSERT INTO launches (sim, day, n) VALUES (?, date('now', '+8 hours'), 1)
  ON CONFLICT (sim, day) DO UPDATE SET n = n + 1`;
const TOTALS = `SELECT sim,
    SUM(CASE WHEN day > date('now', '+8 hours', '-7 days') THEN n ELSE 0 END) AS week,
    SUM(CASE WHEN day > date('now', '+8 hours', '-30 days') THEN n ELSE 0 END) AS month,
    SUM(n) AS total,
    MAX(day) AS last
  FROM launches GROUP BY sim ORDER BY month DESC, total DESC`;

// Run a query; if the table is not there yet (first use), make it and try once more.
async function withTable(env, run) {
  try { return await run(); }
  catch (e) { await env.DB.prepare(CREATE).run(); return await run(); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json().catch(() => null);
  const sim = ((data && data.sim) || "").toString().trim().slice(0, 120);
  if (!sim) return new Response("Sim required", { status: 400 });
  await withTable(env, () => env.DB.prepare(ADD).bind(sim).run());
  return Response.json({ ok: true });
}

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await withTable(env, () => env.DB.prepare(TOTALS).all());
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
