export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith("/api/")) {
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response("No encontrado.", { status: 404 });
    }
    if (!env.ALRAZZ || typeof env.ALRAZZ.fetch !== "function") {
      return new Response("Servicio temporalmente no disponible.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    // Preserve the public URL, Origin, body and cookies for backend checks.
    // The destination is a fixed Service binding, never a user-provided URL.
    return await env.ALRAZZ.fetch(request);
  },
};
