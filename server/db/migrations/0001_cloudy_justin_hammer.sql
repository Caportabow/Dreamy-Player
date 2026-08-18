CREATE TABLE "user_tracks" (
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tracks_user_id_track_id_pk" PRIMARY KEY("user_id","track_id")
);
--> statement-breakpoint
ALTER TABLE "user_tracks" ADD CONSTRAINT "user_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tracks" ADD CONSTRAINT "user_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_tracks_user_added_idx" ON "user_tracks" USING btree ("user_id","added_at");
--> statement-breakpoint
-- Backfill: give every user the songs they already own, favourited, played,
-- or have in a playlist, so nothing they could already see disappears.
INSERT INTO "user_tracks" ("user_id", "track_id", "added_at")
SELECT DISTINCT t."added_by", t."id", t."created_at"
FROM "tracks" t
WHERE t."added_by" IS NOT NULL
ON CONFLICT ("user_id", "track_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_tracks" ("user_id", "track_id", "added_at")
SELECT DISTINCT f."user_id", f."track_id", t."created_at"
FROM "favourites" f
JOIN "tracks" t ON t."id" = f."track_id"
ON CONFLICT ("user_id", "track_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_tracks" ("user_id", "track_id", "added_at")
SELECT DISTINCT h."user_id", h."track_id", t."created_at"
FROM "play_history" h
JOIN "tracks" t ON t."id" = h."track_id"
ON CONFLICT ("user_id", "track_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_tracks" ("user_id", "track_id", "added_at")
SELECT DISTINCT p."user_id", pt."track_id", t."created_at"
FROM "playlist_tracks" pt
JOIN "playlists" p ON p."id" = pt."playlist_id"
JOIN "tracks" t ON t."id" = pt."track_id"
ON CONFLICT ("user_id", "track_id") DO NOTHING;