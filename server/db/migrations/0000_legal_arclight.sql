CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text DEFAULT 'Unknown artist' NOT NULL,
	"album" text,
	"duration" integer NOT NULL,
	"audio_key" text NOT NULL,
	"artwork_key" text,
	"source_url" text NOT NULL,
	"source_id" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"artwork_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"playlist_id" text NOT NULL,
	"track_id" text NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_tracks_playlist_id_track_id_pk" PRIMARY KEY("playlist_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "favourites" (
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourites_user_id_track_id_pk" PRIMARY KEY("user_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "play_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"listened_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_index" integer DEFAULT -1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"volume" real DEFAULT 0.8 NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"shuffle" boolean DEFAULT false NOT NULL,
	"repeat_mode" text DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"error_code" text,
	"query" text,
	"source_url" text,
	"source_id" text,
	"title" text,
	"artist" text,
	"duration" integer,
	"artwork_url" text,
	"track_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_state" ADD CONSTRAINT "player_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_jobs" ADD CONSTRAINT "download_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_jobs" ADD CONSTRAINT "download_jobs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tracks_title_idx" ON "tracks" USING btree ("title");--> statement-breakpoint
CREATE INDEX "tracks_artist_idx" ON "tracks" USING btree ("artist");--> statement-breakpoint
CREATE INDEX "tracks_created_at_idx" ON "tracks" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_source_id_unique" ON "tracks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "playlists_user_id_idx" ON "playlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlists_created_at_idx" ON "playlists" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "playlist_tracks_order_idx" ON "playlist_tracks" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "favourites_track_id_idx" ON "favourites" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "favourites_created_at_idx" ON "favourites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "play_history_user_played_idx" ON "play_history" USING btree ("user_id","played_at");--> statement-breakpoint
CREATE INDEX "play_history_track_id_idx" ON "play_history" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "download_jobs_user_created_idx" ON "download_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "download_jobs_status_idx" ON "download_jobs" USING btree ("status");