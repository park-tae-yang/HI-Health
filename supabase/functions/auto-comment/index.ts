import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BOT_DEVICE_ID = "hi_ai_bot";
const BOT_NAME = "Hi-Rola";

const FALLBACK_COMMENTS = [
  "오늘도 운동 완료! 정말 대단해요 💪 꾸준함이 최고예요!",
  "건강을 위해 오늘도 열심히 하셨군요 😊 수고 많으셨어요!",
  "하루하루 이렇게 쌓여가는 게 진짜 건강이죠 🌟 잘하셨어요!",
  "오늘도 멋지게 해내셨네요 👏 이 기세로 계속 화이팅!",
  "꾸준히 하시는 모습이 정말 멋져요 ✨ 응원합니다!",
];

function fallbackComment(): string {
  return FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)];
}

async function generateComment(apiKey: string, postBody: string, exTag: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const exLabel: Record<string, string> = {
    walking: "걷기", running: "달리기", cycling: "자전거", swimming: "수영",
    yoga: "요가", strength: "근력운동",
  };
  const exName = exLabel[(exTag || "").toLowerCase()] || "운동";

  const prompt = `당신은 건강 챌린지 앱의 응원 봇 Hi-Rola입니다.
아래 사용자가 ${exName} 기록을 공유한 게시글에 달 짧은 응원 댓글을 작성해주세요.

규칙:
- 한국어로 작성
- 1~2문장, 50자 이내
- 따뜻하고 진심 어린 톤
- 이모지 1~2개 포함
- 게시글 내용을 반영해서 개인화할 것
- 마케팅성 표현 금지

게시글: "${postBody}"

댓글만 출력하세요. 다른 설명 없이.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  return text || fallbackComment();
}

async function generatePost(apiKey: string, draft: string, exTag: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const exLabel: Record<string, string> = {
    walking: "걷기", running: "달리기", cycling: "자전거", swimming: "수영",
    yoga: "요가", strength: "근력운동",
  };
  const exName = exTag ? (exLabel[(exTag || "").toLowerCase()] || exTag) : "";

  const prompt = draft
    ? `당신은 건강 챌린지 앱의 응원 봇 Hi-Rola입니다.
아래 초안을 Hi-Rola의 따뜻하고 자연스러운 말투로 다듬어 커뮤니티 게시글로 작성해주세요.

규칙:
- 한국어로 작성
- 2~4문장, 100자 내외
- 친근하고 따뜻한 톤, 응원하는 느낌
- 이모지 1~3개 포함
- 마케팅성 표현 금지
- 초안의 핵심 메시지는 살릴 것${exName ? `\n- 운동 종목: ${exName}` : ""}

초안: "${draft}"

게시글 본문만 출력하세요. 다른 설명 없이.`
    : `당신은 건강 챌린지 앱의 응원 봇 Hi-Rola입니다.
임직원들을 위한 건강 응원 게시글을 작성해주세요.${exName ? ` 주제: ${exName}` : ""}

규칙:
- 한국어로 작성
- 2~4문장, 100자 내외
- 친근하고 따뜻한 톤, 동기부여가 되는 내용
- 이모지 1~3개 포함
- 마케팅성 표현 금지
- 매번 다른 내용으로 (날씨, 요일, 계절 등 다양하게)

게시글 본문만 출력하세요. 다른 설명 없이.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  return text || "오늘도 건강한 하루 보내세요! 여러분의 노력이 쌓여 큰 변화를 만들어요 💪";
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return json({ error: "Supabase env not configured" }, 500);

    const payload = await req.json();
    console.log("[auto-comment] type:", payload?.type, "id:", payload?.record?.id);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Hi-Rola 게시글 작성 모드 ──
    if (payload?.type === "CREATE_POST") {
      const draft = String(payload?.draft || "").trim();
      const exTag = String(payload?.exTag || "").trim();

      let body: string;
      if (ANTHROPIC_API_KEY) {
        try {
          body = await generatePost(ANTHROPIC_API_KEY, draft, exTag);
        } catch (e) {
          console.warn("[auto-comment] 게시글 생성 실패:", e);
          body = draft || "오늘도 건강한 하루 보내세요! 💪";
        }
      } else {
        body = draft || "오늘도 건강한 하루 보내세요! 💪";
      }

      const postId = String(Date.now());
      const { error: insertErr } = await db.from("posts").insert({
        id: postId,
        deviceId: BOT_DEVICE_ID,
        userName: BOT_NAME,
        body,
        exTag: exTag || null,
        userTags: "",
        ts: postId,
      });

      if (insertErr) throw insertErr;
      console.log("[auto-comment] Hi-Rola posted:", postId, "→", body);
      return json({ ok: true, postId, body });
    }

    // ── 댓글 자동 작성 모드 ──
    const record = payload?.record;
    if (!record) return json({ ok: true, skipped: "no record" });
    if (payload?.type !== "INSERT" && payload?.type !== "DIRECT") return json({ ok: true, skipped: "not insert" });

    const postId = String(record.id || "").trim();
    const postBody = String(record.body || "").trim();
    const exTag = String(record.exTag || record.extag || "").trim();

    if (!postId || !postBody) return json({ ok: true, skipped: "empty post" });

    // 웹훅(INSERT)일 때만 딜레이, 직접 호출(DIRECT)은 즉시 처리
    if (payload?.type === "INSERT") {
      await delay(10000 + Math.random() * 10000);
    }

    // 글이 삭제됐는지 확인
    const { data: existing } = await db.from("posts").select("id").eq("id", postId).single();
    if (!existing) return json({ ok: true, skipped: "post deleted" });

    // AI 댓글 생성 (API 키 없으면 fallback)
    let commentBody: string;
    if (ANTHROPIC_API_KEY) {
      try {
        commentBody = await generateComment(ANTHROPIC_API_KEY, postBody, exTag);
      } catch (e) {
        console.warn("[auto-comment] AI 생성 실패, fallback 사용:", e);
        commentBody = fallbackComment();
      }
    } else {
      commentBody = fallbackComment();
    }

    const commentId = String(Date.now());
    const { error: insertErr } = await db.from("post_comments").insert({
      id: commentId,
      postId,
      deviceId: BOT_DEVICE_ID,
      userName: BOT_NAME,
      body: commentBody,
      ts: commentId,
    });

    if (insertErr) throw insertErr;
    console.log("[auto-comment] commented on post:", postId, "→", commentBody);
    return json({ ok: true, commentId });
  } catch (e) {
    console.error("[auto-comment] error:", e);
    return json({ error: String(e) }, 500);
  }
});
