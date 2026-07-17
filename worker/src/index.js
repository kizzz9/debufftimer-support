// DebuffTimer お問い合わせフォーム受け口
// GitHub Pages (kizzz9.github.io) のフォーム → Turnstile 検証 → Resend でメール転送

const ALLOWED_ORIGIN = "https://kizzz9.github.io";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    // Origin 厳格化: 一致しないもの & ヘッダ無しの直接 POST を拒否
    // (ブラウザの fetch は必ず Origin を送るので正規フォームは通る)
    const origin = request.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "bad_request" }, 400);
    }

    const name = (payload.name ?? "").toString().trim().slice(0, 100);
    const email = (payload.email ?? "").toString().trim().slice(0, 200);
    const message = (payload.message ?? "").toString().trim();
    const token = (payload.token ?? "").toString();
    const honeypot = (payload._gotcha ?? "").toString();

    // ボットは隠しフィールドを埋める。埋まっていたら成功を装って捨てる。
    if (honeypot) return json({ ok: true });

    if (!message || message.length > 5000) {
      return json({ ok: false, error: "message_required" }, 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }

    // Turnstile はシークレットが設定されている時だけ検証する（後付け可能にするため任意）。
    if (env.TURNSTILE_SECRET) {
      if (!token) {
        return json({ ok: false, error: "turnstile_required" }, 400);
      }
      // siteverify の接続失敗・非JSON応答で裸の 500（CORSなし）にしない
      let verdict;
      try {
        const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: new URLSearchParams({
            secret: env.TURNSTILE_SECRET,
            response: token,
            remoteip: request.headers.get("CF-Connecting-IP") ?? "",
          }),
        });
        verdict = await verify.json();
      } catch (err) {
        console.log(`turnstile siteverify failed: ${err}`);
        return json({ ok: false, error: "turnstile_unavailable" }, 502);
      }
      if (!verdict.success) {
        return json({ ok: false, error: "turnstile_failed" }, 403);
      }
    }

    const lines = [
      "DebuffTimer サポートフォームからの問い合わせ",
      "",
      `お名前: ${name || "(未記入)"}`,
      `返信先: ${email || "(未記入)"}`,
      "",
      message,
    ];

    // Resend の接続失敗・タイムアウトでも CORS 付き JSON で返す
    try {
      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "DebuffTimer Support <onboarding@resend.dev>",
          to: [env.CONTACT_TO],
          subject: `[DebuffTimer] お問い合わせ${name ? ` - ${name}` : ""}`,
          text: lines.join("\n"),
          ...(email ? { reply_to: email } : {}),
        }),
      });
      if (!send.ok) {
        const detail = await send.text();
        console.log(`resend error ${send.status}: ${detail.slice(0, 300)}`);
        return json({ ok: false, error: "send_failed" }, 502);
      }
    } catch (err) {
      console.log(`resend fetch failed: ${err}`);
      return json({ ok: false, error: "send_failed" }, 502);
    }

    return json({ ok: true });
  },
};
