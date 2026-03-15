import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type PushRow = {
  id: string;
  endpoint: string;
  device_id?: string | null;
  emp_id?: string | null;
  subscription?: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@hihealth.app";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "Push secret is not configured." }, 500);
    }

    const { title, body, url, deviceId, empId, tag } = await req.json();
    if (!title || !body) return json({ error: "title and body are required." }, 400);

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = db
      .from("push_subscriptions")
      .select("id, endpoint, device_id, emp_id, subscription")
      .eq("enabled", true);

    if (deviceId) {
      query = query.eq("device_id", String(deviceId));
    } else if (empId) {
      query = query.eq("emp_id", String(empId).toUpperCase());
    }

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const rows = (data || []) as PushRow[];
    if (!rows.length) {
      return json({ sent: 0, failed: 0, invalid: 0, total: 0 });
    }

    const payload = JSON.stringify({
      title: String(title),
      body: String(body),
      url: String(url || "./index.html#community"),
      tag: String(tag || `hi-health-${Date.now()}`),
      sentAt: new Date().toISOString(),
    });

    let sent = 0;
    let failed = 0;
    let invalid = 0;
    const invalidEndpoints: string[] = [];

    for (const row of rows) {
      try {
        if (!row.subscription || typeof row.subscription !== "object") {
          invalid++;
          invalidEndpoints.push(row.endpoint);
          continue;
        }
        await webpush.sendNotification(row.subscription as any, payload, { TTL: 60 });
        sent++;
      } catch (err) {
        const statusCode = Number((err as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          invalid++;
          invalidEndpoints.push(row.endpoint);
        } else {
          failed++;
          console.error("push send failed", row.endpoint, err);
        }
      }
    }

    if (invalidEndpoints.length) {
      const { error: disableError } = await db
        .from("push_subscriptions")
        .update({
          enabled: false,
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .in("endpoint", invalidEndpoints);
      if (disableError) console.error("disable invalid subscription failed", disableError);
    }

    return json({ sent, failed, invalid, total: rows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
