const DEXCOM_SERVERS = [
  { base: 'https://shareous1.dexcom.com/ShareWebServices/Services', appId: 'd8665ade-9673-4e27-9ff6-92db4ce13d13', name: 'us' },
  { base: 'https://shareasia1.dexcom.com/ShareWebServices/Services', appId: 'd89443d2-327c-4a6f-89e5-496bbb0317db', name: 'asia' },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function tryLogin(base: string, appId: string, username: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/General/LoginPublisherAccountByName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ accountName: username, password, applicationId: appId }),
    });
    const text = await res.text();
    if (!text || text.trim() === '') return null;
    const sessionId = JSON.parse(text);
    // UUID 형식 검증 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    if (sessionId && typeof sessionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return sessionId;
    }
  } catch (_) { /* 다음 서버 시도 */ }
  return null;
}

async function fetchGlucose(base: string, sessionId: string): Promise<{ data: unknown[] | null; debug: string }> {
  const url = `${base}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${encodeURIComponent(sessionId)}&minutes=1440&maxCount=3`;
  // POST 시도
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ sessionId, minutes: 1440, maxCount: 3 }),
    });
    const text = await res.text();
    const ct = res.headers.get('content-type') ?? '';
    const cl = res.headers.get('content-length') ?? '';
    const debug = `POST status:${res.status} ct:${ct} cl:${cl} body:${text.substring(0, 200)}`;
    if (text && text.trim() !== '') {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return { data, debug };
    }
    // POST가 빈 응답이면 GET 시도
    const res2 = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const text2 = await res2.text();
    const debug2 = `${debug} | GET status:${res2.status} body:${text2.substring(0, 200)}`;
    if (text2 && text2.trim() !== '') {
      const data2 = JSON.parse(text2);
      if (Array.isArray(data2)) return { data: data2, debug: debug2 };
    }
    return { data: null, debug: debug2 };
  } catch (e) {
    return { data: null, debug: String(e) };
  }
}

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const bodyText = await req.text();
    if (!bodyText || bodyText.trim() === '') {
      return json({ error: '요청 본문이 비어있어요.' }, 400);
    }
    const { username, password } = JSON.parse(bodyText);
    if (!username || !password) return json({ error: '아이디와 비밀번호를 입력해주세요.' }, 400);

    // 모든 서버에서 로그인 후 혈당 데이터가 있는 서버 사용
    let finalResult: { readings: unknown[]; server: string } | null = null;
    let lastDebug = '';
    let anyLogin = false;

    for (const server of DEXCOM_SERVERS) {
      const sessionId = await tryLogin(server.base, server.appId, username, password);
      if (!sessionId) continue;
      anyLogin = true;
      const { data: readings, debug } = await fetchGlucose(server.base, sessionId);
      lastDebug += `[${server.name}] ${debug} `;
      if (readings && readings.length > 0) {
        const result = (readings as Record<string, unknown>[]).map((r) => ({
          value: r.Value,
          trend: r.Trend,
          trendArrow: trendArrow(r.Trend as number),
          time: r.ST,
        }));
        finalResult = { readings: result, server: server.name };
        break;
      }
    }

    if (!anyLogin) {
      return json({ error: '로그인 실패. 덱스콤 아이디/비밀번호를 확인해주세요. (계정이 없거나 공유 기능이 비활성화됐을 수 있어요)' }, 401);
    }
    if (!finalResult) {
      return json({ readings: [], debug: lastDebug.trim() });
    }
    return json(finalResult);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function trendArrow(code: number): string {
  const map: Record<number, string> = {
    1: '⇈', 2: '↑', 3: '↗', 4: '→', 5: '↘', 6: '↓', 7: '⇊',
  };
  return map[code] ?? '—';
}
