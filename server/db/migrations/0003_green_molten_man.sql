-- Backfill usernames from existing emails before dropping the column.
-- Colliding local parts get a short id suffix so the unique constraint holds.
UPDATE "users" u
SET "username" = base.username
FROM (
	SELECT id,
	       local_part || CASE WHEN row_number() OVER (PARTITION BY local_part ORDER BY created_at) > 1
	                           THEN '-' || substr(replace(id, '-', ''), 1, 6)
	                           ELSE '' END AS username
	FROM (
		SELECT id, created_at, COALESCE(NULLIF(lower(split_part(email, '@', 1)), ''), 'user') AS local_part
		FROM "users"
	) t
) base
WHERE u.id = base.id;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";