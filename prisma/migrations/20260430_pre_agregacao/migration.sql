-- CreateTable
CREATE TABLE "chatwoot_facts_daily_by_account" (
    "account_id" INTEGER NOT NULL,
    "bucket_date" DATE NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "open_at_eod" INTEGER NOT NULL DEFAULT 0,
    "pending_at_eod" INTEGER NOT NULL DEFAULT 0,
    "messages_in" INTEGER NOT NULL DEFAULT 0,
    "messages_out" INTEGER NOT NULL DEFAULT 0,
    "unique_contacts" INTEGER NOT NULL DEFAULT 0,
    "frt_p50_seconds" INTEGER,
    "frt_p90_seconds" INTEGER,
    "rt_p50_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_daily_by_account_pkey" PRIMARY KEY ("account_id","bucket_date")
);

-- CreateTable
CREATE TABLE "chatwoot_facts_daily_by_inbox" (
    "account_id" INTEGER NOT NULL,
    "bucket_date" DATE NOT NULL,
    "inbox_id" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "open_at_eod" INTEGER NOT NULL DEFAULT 0,
    "pending_at_eod" INTEGER NOT NULL DEFAULT 0,
    "messages_in" INTEGER NOT NULL DEFAULT 0,
    "messages_out" INTEGER NOT NULL DEFAULT 0,
    "unique_contacts" INTEGER NOT NULL DEFAULT 0,
    "frt_p50_seconds" INTEGER,
    "frt_p90_seconds" INTEGER,
    "rt_p50_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_daily_by_inbox_pkey" PRIMARY KEY ("account_id","bucket_date","inbox_id")
);

-- CreateTable
CREATE TABLE "chatwoot_facts_daily_by_agent" (
    "account_id" INTEGER NOT NULL,
    "bucket_date" DATE NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "open_at_eod" INTEGER NOT NULL DEFAULT 0,
    "pending_at_eod" INTEGER NOT NULL DEFAULT 0,
    "messages_in" INTEGER NOT NULL DEFAULT 0,
    "messages_out" INTEGER NOT NULL DEFAULT 0,
    "unique_contacts" INTEGER NOT NULL DEFAULT 0,
    "frt_p50_seconds" INTEGER,
    "frt_p90_seconds" INTEGER,
    "rt_p50_seconds" INTEGER,
    "is_active_at_eod" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_daily_by_agent_pkey" PRIMARY KEY ("account_id","bucket_date","agent_id")
);

-- CreateTable
CREATE TABLE "chatwoot_facts_daily_by_team" (
    "account_id" INTEGER NOT NULL,
    "bucket_date" DATE NOT NULL,
    "team_id" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "open_at_eod" INTEGER NOT NULL DEFAULT 0,
    "pending_at_eod" INTEGER NOT NULL DEFAULT 0,
    "messages_in" INTEGER NOT NULL DEFAULT 0,
    "messages_out" INTEGER NOT NULL DEFAULT 0,
    "unique_contacts" INTEGER NOT NULL DEFAULT 0,
    "frt_p50_seconds" INTEGER,
    "frt_p90_seconds" INTEGER,
    "rt_p50_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_daily_by_team_pkey" PRIMARY KEY ("account_id","bucket_date","team_id")
);

-- CreateTable
CREATE TABLE "chatwoot_facts_hourly_by_account" (
    "account_id" INTEGER NOT NULL,
    "bucket_date" DATE NOT NULL,
    "bucket_hour" SMALLINT NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "messages_in" INTEGER NOT NULL DEFAULT 0,
    "messages_out" INTEGER NOT NULL DEFAULT 0,
    "unique_contacts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_hourly_by_account_pkey" PRIMARY KEY ("account_id","bucket_date","bucket_hour")
);

-- CreateTable
CREATE TABLE "chatwoot_facts_meta" (
    "dimension" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "last_refresh_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "oldest_bucket_date" DATE,
    "newest_bucket_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_facts_meta_pkey" PRIMARY KEY ("dimension","account_id")
);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_account_account_id_bucket_date_idx" ON "chatwoot_facts_daily_by_account"("account_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_inbox_account_id_bucket_date_idx" ON "chatwoot_facts_daily_by_inbox"("account_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_inbox_account_id_inbox_id_bucket_date_idx" ON "chatwoot_facts_daily_by_inbox"("account_id", "inbox_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_agent_account_id_bucket_date_idx" ON "chatwoot_facts_daily_by_agent"("account_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_agent_account_id_agent_id_bucket_date_idx" ON "chatwoot_facts_daily_by_agent"("account_id", "agent_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_team_account_id_bucket_date_idx" ON "chatwoot_facts_daily_by_team"("account_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_daily_by_team_account_id_team_id_bucket_date_idx" ON "chatwoot_facts_daily_by_team"("account_id", "team_id", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "chatwoot_facts_hourly_by_account_account_id_bucket_date_bucket_hour_idx" ON "chatwoot_facts_hourly_by_account"("account_id", "bucket_date" DESC, "bucket_hour");
