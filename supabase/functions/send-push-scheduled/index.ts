import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type PushRow = {
  id: string;
  endpoint: string;
  device_id?: string | null;
  emp_id?: string | null;
  subscription?: Record<string, unknown> | null;
  updated_at?: string | null;
  last_seen_at?: string | null;
};

function getPushRowSeenTs(row: PushRow) {
  return Date.parse(String(row.last_seen_at || row.updated_at || "")) || 0;
}

function getPushRowTargetKey(row: PushRow) {
  const empId = String(row.emp_id || "").trim().toUpperCase();
  if (empId) return `emp:${empId}`;
  const deviceId = String(row.device_id || "").trim();
  if (deviceId) return `device:${deviceId}`;
  return `endpoint:${String(row.endpoint || "").trim()}`;
}

function pickLatestPushRows(rows: PushRow[]) {
  const latestByTarget = new Map<string, PushRow>();
  for (const row of rows || []) {
    const key = getPushRowTargetKey(row);
    const prev = latestByTarget.get(key);
    if (!prev || getPushRowSeenTs(row) >= getPushRowSeenTs(prev)) {
      latestByTarget.set(key, row);
    }
  }
  return [...latestByTarget.values()];
}

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

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date().toISOString();

    // 현재 시각 이전에 예약된 pending 항목 조회 (최대 10건 동시 처리)
    const { data: jobs, error: jobsError } = await db
      .from("push_scheduled")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (jobsError) return json({ error: jobsError.message }, 500);
    if (!jobs || jobs.length === 0) return json({ processed: 0 });

    const results = [];

    for (const job of jobs) {
      // 중복 처리 방지: 먼저 상태를 sent로 변경
      const { data: claimed, error: claimError } = await db
        .from("push_scheduled")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "pending") // 경쟁 조건 방지
        .select("id")
        .maybeSingle();

      if (claimError || !claimed) {
        // 이미 다른 인스턴스에서 처리됨
        continue;
      }

      try {
        // 구독자 조회
        let query = db
          .from("push_subscriptions")
          .select("id,endpoint,device_id,emp_id,subscription,updated_at,last_seen_at")
          .eq("enabled", true);

        // 미운동자 대상: 오늘 운동 기록 없는 사람
        let targetDeviceIds: string[] | null = null;
        if (job.target_type === "no_workout") {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { data: todayWorkouts } = await db
            .from("workouts")
            .select("deviceId")
            .gte("ts", String(todayStart.getTime()));

          const workedDeviceIds = new Set(
            (todayWorkouts || []).map((w: any) => String(w.deviceId || "").trim()).filter(Boolean)
          );

          const { data: allUsers } = await db
            .from("push_subscriptions")
            .select("device_id")
            .eq("enabled", true);

          targetDeviceIds = (allUsers || [])
            .map((r: any) => String(r.device_id || "").trim())
            .filter((d: string) => d && !workedDeviceIds.has(d));

          if (!targetDeviceIds.length) {
            await db.from("push_scheduled").update({ sent_count: 0, failed_count: 0 }).eq("id", job.id);
            results.push({ id: job.id, sent: 0, reason: "no_targets" });
            continue;
          }
          query = query.in("device_id", targetDeviceIds);
        }

        const { data, error: subError } = await query;
        if (subError) throw new Error(subError.message);

        const rows = pickLatestPushRows((data || []) as PushRow[]);
        if (!rows.length) {
          await db.from("push_scheduled").update({ sent_count: 0, failed_count: 0 }).eq("id", job.id);
          results.push({ id: job.id, sent: 0, reason: "no_subscribers" });
          continue;
        }

        const pushPayload = JSON.stringify({
          title: String(job.title),
          body: String(job.body),
          url: String(job.url || "./index.html#community"),
          tag: `hi-scheduled-${job.id}`,
          sentAt: new Date().toISOString(),
        });

        let sent = 0, failed = 0, invalid = 0;
        const invalidEndpoints: string[] = [];

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
            if (status === 404 || status === 410) {
              invalid++; invalidEndpoints.push(sub.endpoint);
            } else {
              failed++;
            }
          }
        }

        if (invalidEndpoints.length) {
          await db.from("push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .in("endpoint", invalidEndpoints);
        }

        // 발송 결과 업데이트
        await db.from("push_scheduled")
          .update({ sent_count: sent, failed_count: failed })
          .eq("id", job.id);

        // push_logs에도 기록
        await db.from("push_logs").insert({
          title: String(job.title),
          body: String(job.body),
          url: String(job.url || "./index.html#community"),
          tag: `hi-scheduled-${job.id}`,
          sent_at: new Date().toISOString(),
          total_count: rows.length,
          sent_count: sent,
          failed_count: failed,
          invalid_count: invalid,
          target_type: job.target_type === "no_workout" ? "targeted" : "all",
        });

        results.push({ id: job.id, sent, failed, invalid, total: rows.length });
      } catch (e: any) {
        await db.from("push_scheduled")
          .update({ status: "pending", sent_at: null })
          .eq("id", job.id);
        results.push({ id: job.id, error: e.message });
      }
    }

    return json({ processed: results.length, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
