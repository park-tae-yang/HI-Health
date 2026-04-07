-- 배지왕 리그 표시용: 획득 배지 수 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_count integer NOT NULL DEFAULT 0;
