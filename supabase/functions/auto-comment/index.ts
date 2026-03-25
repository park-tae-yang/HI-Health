import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BOT_DEVICE_ID = "hi_ai_bot";
const BOT_NAME = "HI AI";

// 20~40초 사이 랜덤 딜레이 (자연스럽게)
function randomDelay() {
  return new Promise(r => setTimeout(r, 20000 + Math.random() * 20000));
}

async function generateComment(postBody: string, exTag: string, userTags: string, userName: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const tagInfo = [exTag, ...((userTags || "").split(",").filter(Boolean))].filter(Boolean).join(", ");
  const prompt = `당신은 HI Health 앱의 건강 커뮤니티 AI 매니저입니다. 이름은 "HI AI"입니다.
임직원들이 건강 챌린지에 참여하면서 운동 기록, 일상, 응원 메시지 등을 올리는 커뮤니티입니다.

아래 게시글에 자연스럽고 따뜻한 댓글 하나를 달아주세요.

규칙:
- 반드시 한국어로
- 1~2문장, 간결하게
- 너무 공식적이지 않게, 친근하고 따뜻한 톤
- 이모지 1~2개 자연스럽게 포함
- 칭찬, 응원, 공감 중심
- 매번 다른 표현 사용 (판에 박힌 문구 금지)
- 댓글 텍스트만 출력 (다른 설명 없이)

작성자: ${userName}
${tagInfo ? `태그: ${tagInfo}` : ""}
글 내용: ${postBody}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return String(data?.content?.[0]?.text || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return json({ error: "Supabase env not configured" }, 500);

    const payload = await req.json();

    // Supabase DB 웹훅 형식: { type, table, record, old_record }
    const record = payload?.record;
    if (!record) return json({ ok: true, skipped: "no record" });

    // INSERT 이벤트만 처리 (수정/삭제 제외)
    if (payload?.type !== "INSERT") return json({ ok: true, skipped: "not insert" });

    const postId = String(record.id || "").trim();
    const postBody = String(record.body || "").trim();
    const userName = String(record.userName || record.username || "").trim();
    const exTag = String(record.exTag || record.extag || "").trim();
    const userTags = String(record.userTags || record.usertags || "").trim();

    if (!postId || !postBody) return json({ ok: true, skipped: "empty post" });

    // 딜레이 + 댓글 생성 + 삽입을 백그라운드로 실행 (웹훅 타임아웃 방지)
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    EdgeRuntime.waitUntil((async () => {
      try {
        await randomDelay();

        // 글이 삭제됐는지 확인
        const { data: existing } = await db.from("posts").select("id").eq("id", postId).single();
        if (!existing) return;

        const commentBody = await generateComment(postBody, exTag, userTags, userName);
        if (!commentBody) return;

        const commentId = String(Date.now());
        await db.from("post_comments").insert({
          id: commentId,
          postId,
          deviceId: BOT_DEVICE_ID,
          userName: BOT_NAME,
          body: commentBody,
          ts: commentId,
        });
      } catch (e) {
        console.error("[auto-comment] background error:", e);
      }
    })());

    return json({ ok: true });
  } catch (e) {
    console.error("[auto-comment] error:", e);
    return json({ error: String(e) }, 500);
  }
});
