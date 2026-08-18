ALTER TABLE "tracks" ADD COLUMN "mbid" text;--> statement-breakpoint
CREATE INDEX "tracks_mbid_idx" ON "tracks" USING btree ("mbid");