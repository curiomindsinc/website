export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT id, name, message, created_at FROM messages ORDER BY created_at DESC LIMIT 100"
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json().catch(() => null);
  if (!data) return new Response("Bad request", { status: 400 });

  // honeypot — bots fill hidden fields, humans never see this one
  if (data.website) return Response.json({ ok: true });

  const name = (data.name || "").toString().trim().slice(0, 60) || "Anonymous";
  const message = (data.message || "").toString().trim().slice(0, 500);
  if (!message) return new Response("Message required", { status: 400 });

  await env.DB.prepare(
    "INSERT INTO messages (name, message) VALUES (?, ?)"
  ).bind(name, message).run();

  return Response.json({ ok: true });
}
