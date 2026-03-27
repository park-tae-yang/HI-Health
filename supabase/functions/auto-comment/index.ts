import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ── 하이로라 (운동 응원 봇) ──
const ROLA_DEVICE_ID = "hi_ai_bot";
const ROLA_NAME = "Hi-Rola";
const ROLA_ALIASES = new Set(["hi-rola", "하이로라"]);

// ── 하이블라 (영양 코치 봇) ──
const BLA_DEVICE_ID = "hi_ai_bot_bla";
const BLA_NAME = "Hi-Bla";
const BLA_ALIASES = new Set(["hi-bla", "하이블라"]);

// 식단 관련 키워드 (하이블라가 반응)
const DIET_KEYWORDS = [
  "식사", "식단", "음식", "밥", "점심", "저녁", "아침", "먹었", "먹은", "먹고",
  "칼로리", "단백질", "탄수화물", "지방", "영양", "다이어트", "체중", "체지방",
  "샐러드", "닭가슴살", "채소", "과일", "간식", "야식", "배고", "배불",
  "뭐 먹", "뭐먹", "메뉴", "카페", "커피", "프로틴", "보충제",
];

function detectPostType(body: string): "diet" | "exercise" | "both" | "general" {
  const hasDiet = DIET_KEYWORDS.some(k => body.includes(k));
  const hasExercise = ["운동", "달리기", "걷기", "수영", "요가", "헬스", "자전거", "스트레칭", "근력"].some(k => body.includes(k));
  if (hasDiet && hasExercise) return "both";
  if (hasDiet) return "diet";
  if (hasExercise) return "exercise";
  return "general";
}

// ── Fallback 댓글 ──
const ROLA_FALLBACKS = [
  "오늘도 운동 완료! 정말 대단해요 💪 꾸준함이 최고예요!",
  "건강을 위해 오늘도 열심히 하셨군요 😊 수고 많으셨어요!",
  "하루하루 이렇게 쌓여가는 게 진짜 건강이죠 🌟 잘하셨어요!",
  "오늘도 멋지게 해내셨네요 👏 이 기세로 계속 화이팅!",
  "꾸준히 하시는 모습이 정말 멋져요 ✨ 응원합니다!",
];
const BLA_FALLBACKS = [
  "균형 잡힌 식사가 건강의 기본이에요 🥗 잘 챙겨드셨군요!",
  "영양소 골고루 드시는 모습이 보기 좋아요 😊 계속 유지해 보세요!",
  "건강한 식습관이 쌓이면 몸이 달라져요 🌿 응원합니다!",
  "식사 기록하는 습관, 정말 대단해요 ✨ 좋은 선택이에요!",
  "맛있고 건강하게 드셨군요 💚 몸이 행복하겠어요!",
];

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
function normalizeAuthorName(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}
function isBotAuthor(record: { deviceId?: unknown; userName?: unknown; username?: unknown } | null | undefined) {
  const deviceId = String(record?.deviceId || "").trim();
  const userName = normalizeAuthorName(record?.userName || record?.username || "");
  return deviceId === ROLA_DEVICE_ID || deviceId === BLA_DEVICE_ID
    || ROLA_ALIASES.has(userName) || BLA_ALIASES.has(userName);
}

// ── 하이로라 댓글 생성 ──
async function generateRolaComment(apiKey: string, postBody: string, exTag: string): Promise<string> {
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
  return text || ROLA_FALLBACKS[Math.floor(Math.random() * ROLA_FALLBACKS.length)];
}

// ── 하이블라 댓글 생성 ──
async function generateBlaComment(apiKey: string, postBody: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const prompt = `당신은 건강 챌린지 앱의 영양 멘토 Hi-Bla입니다.
아래 사용자의 식사·식단 관련 게시글에 달 짧은 댓글을 작성해주세요.

규칙:
- 한국어로 작성
- 1~2문장, 60자 이내
- 먼저 공감하고, 그다음 실용적인 조언을 자연스럽게 이어갈 것
- 조언은 구체적이고 현실적으로 (실제로 따라 할 수 있는 것)
- 이모지는 0~1개만 (없어도 됨)
- 게시글 내용을 반영해서 개인화할 것
- 과도한 다이어트나 결식은 권장하지 말 것
- 마케팅성 표현, 과장된 칭찬 금지
- 친근하되 가볍지 않은 톤

게시글: "${postBody}"

댓글만 출력하세요. 다른 설명 없이.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  return text || BLA_FALLBACKS[Math.floor(Math.random() * BLA_FALLBACKS.length)];
}

// ── 게시글 생성 (하이로라) ──
async function generateRolaPost(apiKey: string, draft: string, exTag: string): Promise<string> {
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

// ── 게시글 생성 (하이블라) ──
async function generateBlaPost(apiKey: string, draft: string, topic: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const prompt = draft
    ? `당신은 건강 챌린지 앱의 영양 코치 Hi-Bla입니다.
아래 초안을 Hi-Bla의 친근하고 전문적인 영양 코치 말투로 다듬어 커뮤니티 게시글로 작성해주세요.

규칙:
- 한국어로 작성
- 2~4문장, 100자 내외
- 친근하고 전문적인 영양 코치 톤
- 이모지 1~3개 포함
- 실용적이고 균형 잡힌 영양 정보
- 마케팅성 표현 금지
- 초안의 핵심 메시지는 살릴 것${topic ? `\n- 주제: ${topic}` : ""}

초안: "${draft}"

게시글 본문만 출력하세요. 다른 설명 없이.`
    : `당신은 건강 챌린지 앱의 영양 코치 Hi-Bla입니다.
임직원들을 위한 영양·식단 관련 게시글을 작성해주세요.${topic ? ` 주제: ${topic}` : ""}

규칙:
- 한국어로 작성
- 2~4문장, 100자 내외
- 친근하고 전문적인 영양 코치 톤
- 이모지 1~3개 포함
- 실용적이고 균형 잡힌 영양 정보 (칼로리, 단백질, 식습관 팁 등)
- 마케팅성 표현 금지
- 매번 다른 내용으로 (계절 식재료, 간식 팁, 수분 섭취 등 다양하게)

게시글 본문만 출력하세요. 다른 설명 없이.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  return text || "균형 잡힌 식사가 건강한 삶의 시작이에요 🥗 오늘도 몸에 좋은 것들로 채워보세요!";
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
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 하이로라 게시글 미리보기 ──
    if (payload?.type === "PREVIEW_POST") {
      const draft = String(payload?.draft || "").trim();
      const exTag = String(payload?.exTag || "").trim();
      let body: string;
      try { body = ANTHROPIC_API_KEY ? await generateRolaPost(ANTHROPIC_API_KEY, draft, exTag) : (draft || "오늘도 건강한 하루 보내세요! 💪"); }
      catch { body = draft || "오늘도 건강한 하루 보내세요! 💪"; }
      return json({ ok: true, body });
    }

    // ── 하이로라 게시글 확정 게시 ──
    if (payload?.type === "CREATE_POST") {
      const body = String(payload?.body || "").trim();
      const exTag = String(payload?.exTag || "").trim();
      if (!body) return json({ error: "body required" }, 400);
      const postId = String(Date.now());
      const { error: insertErr } = await db.from("posts").insert({ id: postId, deviceId: ROLA_DEVICE_ID, userName: ROLA_NAME, body, exTag: exTag || null, userTags: "", ts: postId });
      if (insertErr) throw insertErr;
      return json({ ok: true, postId, body });
    }

    // ── 하이블라 게시글 미리보기 ──
    if (payload?.type === "PREVIEW_POST_BLA") {
      const draft = String(payload?.draft || "").trim();
      const topic = String(payload?.topic || "").trim();
      let body: string;
      try { body = ANTHROPIC_API_KEY ? await generateBlaPost(ANTHROPIC_API_KEY, draft, topic) : (draft || "균형 잡힌 식사가 건강의 기본이에요 🥗"); }
      catch { body = draft || "균형 잡힌 식사가 건강의 기본이에요 🥗"; }
      return json({ ok: true, body });
    }

    // ── 하이블라 게시글 확정 게시 ──
    if (payload?.type === "CREATE_POST_BLA") {
      const body = String(payload?.body || "").trim();
      const topic = String(payload?.topic || "").trim();
      if (!body) return json({ error: "body required" }, 400);
      const postId = String(Date.now());
      const { error: insertErr } = await db.from("posts").insert({ id: postId, deviceId: BLA_DEVICE_ID, userName: BLA_NAME, body, exTag: topic || null, userTags: "", ts: postId });
      if (insertErr) throw insertErr;
      return json({ ok: true, postId, body });
    }

    // ── 자동 댓글 ──
    const record = payload?.record;
    if (!record) return json({ ok: true, skipped: "no record" });
    if (payload?.type !== "INSERT" && payload?.type !== "DIRECT") return json({ ok: true, skipped: "not insert" });

    const postId = String(record.id || "").trim();
    const postBody = String(record.body || "").trim();
    const exTag = String(record.exTag || record.extag || "").trim();

    if (!postId || !postBody) return json({ ok: true, skipped: "empty post" });
    if (isBotAuthor(record)) return json({ ok: true, skipped: "bot post" });

    if (payload?.type === "INSERT") {
      await delay(10000 + Math.random() * 10000);
    }

    const { data: existing } = await db.from("posts").select("id,deviceId,userName").eq("id", postId).single();
    if (!existing) return json({ ok: true, skipped: "post deleted" });
    if (isBotAuthor(existing)) return json({ ok: true, skipped: "bot post" });

    const postType = detectPostType(postBody);
    const results: { bot: string; commentId: string }[] = [];

    // 하이로라: 운동 글, 일반 글, 또는 둘 다
    if (postType === "exercise" || postType === "general" || postType === "both") {
      let commentBody: string;
      try { commentBody = ANTHROPIC_API_KEY ? await generateRolaComment(ANTHROPIC_API_KEY, postBody, exTag) : ROLA_FALLBACKS[Math.floor(Math.random() * ROLA_FALLBACKS.length)]; }
      catch { commentBody = ROLA_FALLBACKS[Math.floor(Math.random() * ROLA_FALLBACKS.length)]; }
      const commentId = String(Date.now());
      const { error } = await db.from("post_comments").insert({ id: commentId, postId, deviceId: ROLA_DEVICE_ID, userName: ROLA_NAME, body: commentBody, ts: commentId });
      if (!error) results.push({ bot: "rola", commentId });
    }

    // 하이블라: 식단 글 또는 둘 다
    if (postType === "diet" || postType === "both") {
      await delay(3000 + Math.random() * 3000); // 하이로라와 시차를 두고 댓글
      let commentBody: string;
      try { commentBody = ANTHROPIC_API_KEY ? await generateBlaComment(ANTHROPIC_API_KEY, postBody) : BLA_FALLBACKS[Math.floor(Math.random() * BLA_FALLBACKS.length)]; }
      catch { commentBody = BLA_FALLBACKS[Math.floor(Math.random() * BLA_FALLBACKS.length)]; }
      const commentId = String(Date.now() + 1);
      const { error } = await db.from("post_comments").insert({ id: commentId, postId, deviceId: BLA_DEVICE_ID, userName: BLA_NAME, body: commentBody, ts: commentId });
      if (!error) results.push({ bot: "bla", commentId });
    }

    console.log("[auto-comment] postType:", postType, "results:", results);
    return json({ ok: true, results });
  } catch (e) {
    console.error("[auto-comment] error:", e);
    return json({ error: String(e) }, 500);
  }
});
