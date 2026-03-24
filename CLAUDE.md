# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 커밋 메시지

커밋 메시지는 항상 **한국어**로 작성할 것.

---

## 협업 노트 — DEV_NOTES.md 기록 규칙

**작업 시작 전 `DEV_NOTES.md`를 반드시 읽을 것.**

작업 중 아래 상황이 생기면 `DEV_NOTES.md`를 직접 업데이트할 것:

- **버그를 발견하거나 수정했을 때** → `🐛 오류/이슈` 섹션 맨 위에 추가
- **새 작업을 시작했을 때** → `🚧 작업` 섹션에 추가. 번호는 기존 마지막 번호 +1. 완료해도 삭제하지 말고 상태를 ✅ 완료로 변경
- **새로운 패턴/규칙이 생겼을 때** → `📐 컨벤션` 섹션에 추가
- **중요한 설계 결정을 내렸을 때** → `💬 결정 사항` 섹션에 추가

사용자에게 먼저 물어보지 말고, 해당 상황이 생기면 바로 기록할 것.

---

## Project Overview

HI Health — 모바일 우선 건강 챌린지 PWA. 운동 기록, 혈당 추적(Dexcom CGM), 커뮤니티 피드, 자선 달리기 챌린지(HI RUN DAY)를 제공하는 한국어 서비스.

## Deployment

빌드 과정 없음. 정적 파일을 GitHub에 push하면 GitHub Pages로 자동 배포됨.

```bash
git push origin main   # → https://hi-fertility-health.com 에 자동 배포
```

Supabase Edge Functions 배포:
```bash
supabase functions deploy dexcom-proxy
supabase functions deploy send-push
```

Supabase 마이그레이션:
```bash
supabase db push
```

## Architecture

### 파일 구조

| 파일 | 역할 |
|------|------|
| `index.html` | 메인 PWA 앱 (UI + 전체 앱 로직 인라인, ~14,000줄 JS) |
| `user-admin.html` | 어드민 대시보드 (유저/운동/주문 데이터 관리) |
| `runday.html` | HI RUN DAY 자선 달리기 랜딩 페이지 |
| `Code.gs` | Google Apps Script 백엔드 (Google Sheets DB) |
| `sw.js` / `sw-1.js` | 서비스 워커 (오프라인 캐싱, 푸시 알림 수신) |
| `widget-run.js` | iOS Scriptable 홈 화면 위젯 |
| `supabase/functions/dexcom-proxy/` | Dexcom CGM API 프록시 (Deno) |
| `supabase/functions/send-push/` | Web Push 브로드캐스트 (Deno) |
| `supabase/migrations/` | Supabase DB 스키마 마이그레이션 SQL |

### 백엔드 이중 구조

- **Supabase** (PostgreSQL): 운동 기록(`workouts`), 푸시 구독(`push_subscriptions`), 앱 설정(`app_config`), 푸시 로그(`push_logs`) 등 신규 데이터
- **Google Apps Script** (`Code.gs`): 레거시 백엔드. Google Sheets를 DB로 사용. 유저, 포스트, 주문, 혈당, 등록 데이터 일부를 담당. `doGet()`/`doPost()`로 REST API 제공

두 시스템이 병행 운용 중. 새 기능은 Supabase 기준으로 작성.

### index.html 내부 구조

단일 파일에 CSS + HTML + JS 전부 인라인. JS는 크게 다음 영역으로 구성:
- **Auth**: device ID, emp ID, registration ID 기반 로그인
- **Tab 네비게이션**: 홈 / 운동 / 혈당 / 챌린지 / 커뮤니티
- **운동 기록**: 종목별 시간/포인트 기록 및 히스토리
- **챌린지 시스템**: 리더보드, 라이브 카운트, 기부금 추적, 인라인 챌린지 뷰어
- **커뮤니티 피드**: 포스트 작성/조회/태그
- **Dexcom 연동**: Supabase Edge Function 통해 혈당 데이터 수신
- **푸시 알림**: Service Worker + Supabase `push_subscriptions` 테이블

### 인라인 챌린지 뷰어

챌린지 상세는 서버에서 raw HTML을 받아 sanitize 후 모달 안에 렌더링. XSS 방지를 위해 허용 태그/속성 화이트리스트 적용.

### 서비스 워커 캐시 전략

- HTML/API 요청: Network-first
- 정적 에셋(이미지, 아이콘): Cache-first
- 캐시 버전: `hi-health-v{N}` (sw.js 상단에서 버전 번호 관리)

## 데이터 모델 (Supabase)

```sql
workouts      (id, deviceId, userName, date, exId, exName, duration, points, memo, ts)
push_subscriptions (id, endpoint, device_id, emp_id, subscription JSONB, enabled, ...)
app_config    (key, value)
push_logs     (id, title, body, sent_at, recipient_count)
```

## 주요 패턴

- **ID 타입**: `workouts.id`는 문자열일 수 있음. 삭제/비교 시 `==` 또는 명시적 형변환 사용
- **알림 필터**: `push_subscriptions` 조회 시 `enabled = true OR permission = 'granted'` OR 조건 사용
- **챌린지 인원**: 클라이언트 캐시 대신 서버 응답을 권위적 소스로 사용
- **어드민 인증**: `Code.gs`의 핀코드 방식
# HI Health — Claude 작업 컨텍스트

## 프로젝트 개요
- **서비스**: HI Health — 임직원 건강관리 PWA (Progressive Web App)
- **URL**: https://hi-fertility-health.com
- **GitHub**: https://github.com/Yunjin0825/HI-Health
- **주요 파일**:
  - `index.html` — 메인 앱 (로그인, 운동 기록, 혈당, 챌린지, 커뮤니티 등 전체 포함)
  - `user-admin.html` — 관리자 페이지
  - `sw.js` — Service Worker (캐시 버전 관리)
  - `runday.html` — 챌린지(Run Day) 전용 iframe
  - `widget-run.js` — Scriptable iOS 홈 화면 위젯
  - `supabase/functions/send-push/index.ts` — 푸시 알림 Edge Function

## 인프라
- **DB/Auth**: Supabase (`https://nbnmvvobehjitophkqmu.supabase.co`)
- **배포**: GitHub Pages (push → 자동 배포)
- **Edge Functions**: Supabase (Deno 런타임)
- **캐시**: sw.js `CACHE = 'hi-health-vXXX'` 버전 올리면 전체 캐시 갱신

## 주요 Supabase 테이블
| 테이블 | 용도 |
|--------|------|
| `users` | 사용자 정보 (deviceId, empId, name, points 등) |
| `workouts` | 운동 기록 (exId, duration, points, routepath jsonb) |
| `glucose` | 혈당 기록 |
| `push_subscriptions` | 푸시 알림 구독 정보 |
| `push_logs` | 푸시 발송 기록 |
| `posts` | 커뮤니티 게시물 |
| `registrations` | 챌린지 참가 신청 |
| `app_config` | 앱 전역 설정 (공지 배너 등) |

## 최근 완료된 작업

### 푸시 알림 시스템
- **InvalidEncoding 수정**: `npm:web-push@3.6.7` 라이브러리로 교체 (Apple 푸시 aes128gcm 인코딩 지원)
- **발송 기록 저장**: `push_logs` 테이블 생성 + edge function에서 발송 후 자동 insert
- **관리자 페이지 발송 기록**: `user-admin.html`에 발송 기록 테이블 추가
- **선택 사용자 테스트 버그 수정**: `deviceId` 대신 `empId` 우선 필터링 (push_subscriptions.device_id가 NULL인 경우 대비)
- **오늘 미운동자 발송**: `getNoWorkoutUsers()` → 오늘 운동 기록 없는 사람에게만 발송
- **앱 내 알림 목록**: 벨 아이콘 → `push_logs` 조회 (전체 발송 + 나에게 온 것 OR 필터)
  - OR 필터 버그 수정: 빈 값 제외하고 조건 동적 생성

### 달리기 측정 & 경로 지도
- **routePath Supabase 저장**: `apiSync('addWorkout')` 페이로드에 `routepath` 추가
  - Supabase SQL 필요: `ALTER TABLE workouts ADD COLUMN IF NOT EXISTS routepath jsonb;`
- **인라인 경로 지도**: 운동 기록 목록에서 달리기 항목 아래 SVG 경로 지도 자동 표시
  - `workoutItemHTML` → `.wo-item-wrap` + `.wo-inline-route` 구조
  - `renderInlineRouteMaps()` — innerHTML 설정 후 호출
- **게스트 샘플**: 여의도 한강공원 5km 타원형 코스 37개 GPS 좌표 추가

### iOS 위젯 (Scriptable)
- **파일**: `widget-run.js`
- **설정**: `APP_URL = "https://hi-fertility-health.com/index.html"`, `MY_EMP_ID` (선택)
- **디자인**: 앱 홈 버튼과 동일 (크림 배경 `#fdfcf0`, 캐릭터/로고 이미지, 파란 CTA `#1535c4`)
- **탭 동작**: `APP_URL?action=run` → 앱 로드 시 달리기 측정 화면 자동 오픈
- **이미지 로드**: `https://hi-fertility-health.com/images/4x/run_day_bla.png` 등 앱 서버에서 직접

### Apple Watch 연동
- `?action=run` URL 파라미터로 앱 로드 시 `openRunTracker()` 자동 실행 (600ms delay)
- Apple Shortcuts에서 앱 URL 열기로 Watch 탭에서 달리기 시작 가능

## 주요 코드 패턴

### 캐시 버전 올리는 법
```js
// sw.js 1번째 줄
const CACHE = 'hi-health-v556'; // 숫자 증가
```

### 운동 기록 저장 흐름
```
logExercise() → S.workouts.push({...}) → apiSync('addWorkout', payload) → Supabase workouts upsert
```

### 푸시 발송 흐름
```
sendPushNotice(mode) → fetch(SEND_PUSH_FN) → edge function → web-push → 기기 알림
                                                             → push_logs insert
```

### 알림 목록 조회 필터 (loadNotifList)
```js
const orParts = ['target_type.eq.all'];
if (identity.deviceId) orParts.push(`target_device_id.eq.${identity.deviceId}`);
if (identity.empId) orParts.push(`target_emp_id.eq.${identity.empId.toUpperCase()}`);
query = query.or(orParts.join(','));
```

## 미완료 / 주의사항
- `routepath` 컬럼 추가 SQL 실행 여부 확인 필요
  ```sql
  ALTER TABLE workouts ADD COLUMN IF NOT EXISTS routepath jsonb;
  ```
- `push_logs` 테이블 + RLS 정책 Supabase에 적용됐는지 확인 (알림 목록 표시 조건)
- `.tools/supabase/supabase` 파일(87MB)이 GitHub 경고 발생 중 → `.gitignore` 추가 권장
