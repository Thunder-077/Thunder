-- CreateTable
CREATE TABLE "app_modules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settingsJson" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "auth_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_salt" TEXT NOT NULL,
    "avatar_data_url" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "emby_playlist" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "tags_json" TEXT NOT NULL,
    "point" INTEGER NOT NULL,
    "is_public" BOOLEAN NOT NULL,
    "is_show_empty" BOOLEAN NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "limit" INTEGER NOT NULL,
    "release_window_days" INTEGER NOT NULL,
    "remote_watch_id" INTEGER,
    "last_emos_sync_signature" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "emby_watch_cache" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "feed_json" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "generated_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "emby_watch_refresh_task" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "state_json" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "emby_watch_refresh_item" (
    "slug" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "tmdb_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "poster_url" TEXT,
    "fetched_page" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    PRIMARY KEY ("slug", "run_id", "source_key", "tmdb_type", "tmdb_id")
);

-- CreateTable
CREATE TABLE "vault_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kdf_json" TEXT NOT NULL,
    "encrypted_data_key_json" TEXT NOT NULL,
    "password_hint" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "vault_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vault_id" TEXT NOT NULL,
    "encrypted_payload_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_username_key" ON "auth_user"("username");

-- CreateIndex
CREATE INDEX "emby_watch_refresh_item_slug_run_id_idx" ON "emby_watch_refresh_item"("slug", "run_id");

-- CreateIndex
CREATE INDEX "vault_items_vault_id_idx" ON "vault_items"("vault_id");
