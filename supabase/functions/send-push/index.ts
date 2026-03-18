import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type PushRow = { id: string; endpoint: string; device_id?: string | null; emp_id?: string | null; subscription?: Record<string, unknown> | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@hihealth.app";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
      return json({ error: "Push secret is not configured." }, 500);

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { title, body, url, deviceId, empId, empIds, deviceIds, tag } = await req.json();
    if (!title || !body) return json({ error: "title and body are required." }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    let query = db.from("push_subscriptions").select("id,endpoint,device_id,emp_id,subscription").eq("enabled", true);
    if (deviceId) query = query.eq("device_id", String(deviceId));
    else if (empId) query = query.eq("emp_id", String(empId).toUpperCase());
    else if (Array.isArray(empIds) && empIds.length) query = query.in("emp_id", empIds.map((e: string) => String(e).toUpperCase()));
    else if (Array.isArray(deviceIds) && deviceIds.length) query = query.in("device_id", deviceIds.map((d: string) => String(d)));

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    const rows = (data || []) as PushRow[];
    if (!rows.length) return json({ sent: 0, failed: 0, invalid: 0, total: 0 });

    const pushPayload = JSON.stringify({
      title: String(title), body: String(body),
      url: String(url || "./index.html#community"),
      tag: String(tag || `hi-health-${Date.now()}`),
      sentAt: new Date().toISOString(),
    });

    let sent = 0, failed = 0, invalid = 0;
    const invalidEndpoints: string[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const sub = row.subscription as any;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        invalid++; invalidEndpoints.push(row.endpoint); continue;
      }
      try {
        const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
        await webpush.sendNotification(pushSub, pushPayload, { TTL: 60 });
        sent++;
      } catch (err: any) {
        const status = err?.statusCode || 0;
        const errMsg = `${status}: ${err?.body || err?.message || String(err)}`;
        if (status === 404 || status === 410) {
          invalid++; invalidEndpoints.push(sub.endpoint);
        } else {
          errors.push(errMsg);
          failed++;
        }
      }
    }

    if (invalidEndpoints.length) {
      await db.from("push_subscriptions")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in("endpoint", invalidEndpoints);
    }

    // 발송 기록 저장
    const { error: logError } = await db.from("push_logs").insert({
      title: String(title),
      body: String(body),
      url: String(url || "./index.html#community"),
      tag: String(tag || `hi-health-${Date.now()}`),
      sent_at: new Date().toISOString(),
      total_count: rows.length,
      sent_count: sent,
      failed_count: failed,
      invalid_count: invalid,
      target_type: (deviceId || empId) ? "user" : (empIds?.length || deviceIds?.length) ? "targeted" : "all",
      target_device_id: deviceId ? String(deviceId) : null,
      target_emp_id: empId ? String(empId).toUpperCase() : null,
    });
    if (logError) console.error("[push_logs insert error]", logError.message);

    return json({ sent, failed, invalid, total: rows.length, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
