/** Verify the setup-page password without exposing any stored data. */
export async function onRequestGet({ env }) {
  return Response.json({ configured: Boolean(env.ADMIN_PASSWORD) });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  if (!env.ADMIN_PASSWORD) {
    return Response.json(
      {
        ok: false,
        error:
          "ADMIN_PASSWORD is not set on this deployment. In Cloudflare: Workers & Pages → your project → Settings → Variables and Secrets — add ADMIN_PASSWORD for Production (and Preview if using preview URLs). Redeploy after saving.",
      },
      { status: 503 },
    );
  }

  const ok = typeof body.password === "string" && body.password === env.ADMIN_PASSWORD;
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
