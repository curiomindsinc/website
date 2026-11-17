// "Notify me" sign-ups for coming-soon sims.
// Write-only: there is no GET here, so emails are never shown on the site.
// List them with:
//   node tools/notify-list.js              (counts per sim)
//   node tools/notify-list.js "Sim title"  (emails for one sim, ready to paste into BCC)
//
// Alert email to the site owner on each NEW sign-up, sent through Resend (resend.com).
// Set these in Cloudflare Pages → Settings → Variables and Secrets (type: Secret):
//   RESEND_API_KEY  the Resend API key
//   NOTIFY_TO       where alerts go (kept out of this file because the repo is public)
// If either is missing, sign-ups are still saved; only the alert is skipped.

const CREATE = `CREATE TABLE IF NOT EXISTS notify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (sim, email)
)`;

async function sendAlert(env, sim, email) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "Curiominds <onboarding@resend.dev>",
        to: [env.NOTIFY_TO],
        subject: `New sign-up: ${sim}`,
        text: `${email} wants to hear when "${sim}" is ready.\n\n` +
          `See everyone waiting for this sim:\n  node tools/notify-list.js "${sim}"\n`
      })
    });
    if (!res.ok) console.log("notify alert failed:", res.status, await res.text());
  } catch (e) {
    console.log("notify alert error:", e.message);
  }
}

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
  const result = await env.DB.prepare("INSERT OR IGNORE INTO notify (sim, email) VALUES (?, ?)").bind(sim, email).run();

  // Alert only for a genuinely new sign-up (a repeat is ignored above), without making the visitor wait.
  if (result.meta && result.meta.changes > 0) context.waitUntil(sendAlert(env, sim, email));

  return Response.json({ ok: true });
}
