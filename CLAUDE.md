# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
