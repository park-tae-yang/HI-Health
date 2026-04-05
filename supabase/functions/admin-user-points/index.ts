import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ADMIN_EMPIDS = new Set(["1111", "A1803"]);

function isAllowedAdminKey(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (ADMIN_EMPIDS.has(upper)) return true;
  const adminPassword = String(Deno.env.get("HI_ADMIN_PASSWORD") || "1111").trim();
  return raw === adminPassword;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Supabase env not configured" }, 500);
    }

    const { adminKey, deviceId, delta, touchedAt } = await req.json().catch(() => ({}));
    if (!isAllowedAdminKey(adminKey)) return json({ error: "Admin auth failed" }, 403);

    const normalizedDeviceId = String(deviceId || "").trim();
    if (!normalizedDeviceId) return json({ error: "deviceId is required" }, 400);

    const pointDelta = Number(delta);
    if (!Number.isFinite(pointDelta) || pointDelta === 0) {
      return json({ error: "delta must be a non-zero number" }, 400);
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: user, error: userError } = await db
      .from("users")
      .select("deviceId,points")
      .eq("deviceId", normalizedDeviceId)
      .maybeSingle();
    if (userError) return json({ error: userError.message }, 500);
    if (!user) return json({ error: "User not found" }, 404);

    const currentPoints = Number(user.points) || 0;
    const nextPoints = Math.max(0, currentPoints + pointDelta);
    const updatedAt = String(touchedAt || new Date().toISOString());

    const { error: pointsError } = await db
      .from("users")
      .update({ points: nextPoints, lastactiveat: updatedAt })
      .eq("deviceId", normalizedDeviceId);
    if (pointsError) return json({ error: pointsError.message }, 500);

    return json({
      ok: true,
      points: nextPoints,
      appliedTotalPoints: false,
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
