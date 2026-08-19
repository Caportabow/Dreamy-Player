ALTER TABLE "tracks" ADD COLUMN "itunes_id" text;--> statement-breakpoint
CREATE INDEX "tracks_itunes_id_idx" ON "tracks" USING btree ("itunes_id");