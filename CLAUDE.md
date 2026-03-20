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
