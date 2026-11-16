// "Notify me" sign-ups for coming-soon sims.
// Write-only: there is no GET here, so emails are never shown on the site.
// Read them with:
//   npx wrangler d1 execute curiominds-board --remote --command="SELECT sim, email, created_at FROM notify ORDER BY created_at DESC"

const CREATE = `CREATE TABLE IF NOT EXISTS notify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (sim, email)
)`;

export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json().catch(() => null);
  if (!data) return new Response("Bad request", { status: 400 });

  // honeypot — bots fill hidden fields, humans never see this one
  if (data.website) return Response.json({ ok: true });

  const sim = (data.sim || "").toString().trim().slice(0, 120);
  const email = (data.email || "").toString().trim().toLowerCase().slice(0, 254);
  if (!sim) return new Response("Sim required", { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return new Response("Valid email required", { status: 400 });

  // The table is made on first use, so no manual database step is needed.
  await env.DB.prepare(CREATE).run();
  await env.DB.prepare("INSERT OR IGNORE INTO notify (sim, email) VALUES (?, ?)").bind(sim, email).run();

  return Response.json({ ok: true });
}
