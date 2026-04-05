-- 커뮤니티 스타 배지 및 선물 발송 상태 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS "communityStarBadge" boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "giftSent" boolean DEFAULT false;

-- 인덱스: 커뮤니티 스타 수상자 조회 성능
CREATE INDEX IF NOT EXISTS idx_users_community_star ON users ("communityStarBadge") WHERE "communityStarBadge" = true;
