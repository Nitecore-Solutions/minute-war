-- ===========================================================================
-- MINUTE WAR - INITIAL SCHEMA (MySQL 8.0)
--
--   mysql -u root -p < db/migrations/0001_init.sql
-- or: node scripts/migrate.mjs
--
-- Auth model: email + name + password at signup. A 6-digit player_id is
-- assigned by a trigger and is the public handle shown on leaderboards and
-- in challenge links. Passwords are bcrypt hashes stored here.
--
-- Every balance change goes through the stored procedures in section 11 so
-- the wallet ledger stays append-only and idempotent.
-- ===========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `minute_war`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `minute_war`;

-- ---------------------------------------------------------------------------
-- 0. TABLES  (dropped in reverse-dependency order so this file is re-runnable)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `admin_audit_log`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `battle_events`;
DROP TABLE IF EXISTS `battle_participants`;
DROP TABLE IF EXISTS `battle_rooms`;
DROP TABLE IF EXISTS `challenge_results`;
DROP TABLE IF EXISTS `challenges`;
DROP TABLE IF EXISTS `streaks`;
DROP TABLE IF EXISTS `user_badges`;
DROP TABLE IF EXISTS `badges`;
DROP TABLE IF EXISTS `game_sessions`;
DROP TABLE IF EXISTS `run_scores`;
DROP TABLE IF EXISTS `daily_runs`;
DROP TABLE IF EXISTS `leaderboard_snapshots`;
DROP TABLE IF EXISTS `questions`;
DROP TABLE IF EXISTS `mini_games`;
DROP TABLE IF EXISTS `ad_config`;
DROP TABLE IF EXISTS `sponsors`;
DROP TABLE IF EXISTS `wallet_ledger`;
DROP TABLE IF EXISTS `wallets`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `settings`;

-- ---------------------------------------------------------------------------
-- 1. USERS
--    player_id is the 6-digit public handle. It is NOT the login credential -
--    login is email + password. It appears on leaderboards and share cards.
-- ---------------------------------------------------------------------------
CREATE TABLE `users` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id`          INT UNSIGNED     NOT NULL,
  `email`              VARCHAR(190)    NOT NULL,
  `name`               VARCHAR(80)     NOT NULL,
  `password_hash`      VARCHAR(60)     NOT NULL,
  `role`               ENUM('admin','player') NOT NULL DEFAULT 'player',
  `city`               VARCHAR(80)     NULL,
  `state`              VARCHAR(80)     NULL,
  `avatar_seed`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `active`             TINYINT(1)      NOT NULL DEFAULT 1,
  `must_change_password` TINYINT(1)    NOT NULL DEFAULT 0,
  `is_premium`         TINYINT(1)      NOT NULL DEFAULT 0,
  `premium_until`      DATETIME        NULL,
  `referral_code`      VARCHAR(12)     NOT NULL,
  `referred_by`        BIGINT UNSIGNED NULL,
  `last_login_at`      DATETIME        NULL,
  `last_seen_at`       DATETIME        NULL,
  `created_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_player_id` (`player_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_referral` (`referral_code`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_referred_by` (`referred_by`),
  KEY `idx_users_active_created` (`active`, `created_at`),
  CONSTRAINT `fk_users_referred_by` FOREIGN KEY (`referred_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE ON player_id / referral_code
--   There is deliberately NO BEFORE INSERT trigger here. With binary logging
--   enabled (the default on MySQL 8) creating a trigger needs the SUPER
--   privilege, which a least-privilege app user must not have. Both values are
--   assigned by the application inside a retry loop instead -- see
--   backend/src/lib/ids.ts. This keeps the app user scoped to its own schema
--   and works unchanged on managed MySQL (PlanetScale, Aiven, TiDB).

-- ---------------------------------------------------------------------------
-- 2. WALLET + LEDGER
--    balance >= 0 is enforced by a CHECK, and every mutation is a procedure.
-- ---------------------------------------------------------------------------
CREATE TABLE `wallets` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `balance`    BIGINT          NOT NULL DEFAULT 0,
  `lifetime_earned` BIGINT     NOT NULL DEFAULT 0,
  `frozen`     TINYINT(1)      NOT NULL DEFAULT 0,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallets_user` (`user_id`),
  CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_wallet_non_negative` CHECK (`balance` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only. Never UPDATE or DELETE a row here.
CREATE TABLE `wallet_ledger` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wallet_id`       BIGINT UNSIGNED NOT NULL,
  `user_id`         BIGINT UNSIGNED NOT NULL,
  `delta`           BIGINT          NOT NULL,
  `balance_after`   BIGINT          NOT NULL,
  `kind`            ENUM(
    'signup_bonus','daily_reward','streak_bonus','game_score',
    'friend_win','friend_loss','invite_bonus','referral_bonus',
    'premium_purchase','tournament_prize','ad_reward','sponsor_reward',
    'admin_credit','admin_debit','account_close'
  ) NOT NULL,
  `ref_type`        VARCHAR(40)     NULL,
  `ref_id`          VARCHAR(64)     NULL,
  `note`            VARCHAR(255)    NULL,
  `idempotency_key` VARCHAR(120)    NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ledger_idem` (`idempotency_key`),
  KEY `idx_ledger_user` (`user_id`, `created_at` DESC),
  KEY `idx_ledger_wallet` (`wallet_id`, `created_at` DESC),
  KEY `idx_ledger_kind` (`kind`, `created_at` DESC),
  KEY `idx_ledger_ref` (`ref_type`, `ref_id`),
  KEY `idx_ledger_created` (`created_at` DESC),
  CONSTRAINT `fk_ledger_wallet` FOREIGN KEY (`wallet_id`)
    REFERENCES `wallets` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_ledger_delta_nonzero` CHECK (`delta` <> 0),
  CONSTRAINT `chk_ledger_balance_non_negative` CHECK (`balance_after` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. MINI GAMES
--    `config` is a JSON blob the client reads to render the game, so most
--    tuning (round count, colours, time limits) needs no app release.
-- ---------------------------------------------------------------------------
CREATE TABLE `mini_games` (
  `id`               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`             VARCHAR(32)     NOT NULL,
  `name`             VARCHAR(60)     NOT NULL,
  `emoji`            VARCHAR(16)     NOT NULL DEFAULT '🎮',
  `tagline`          VARCHAR(120)    NULL,
  `category`         ENUM('fast','india','word','memory') NOT NULL DEFAULT 'fast',
  `duration_seconds` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `max_score`        INT UNSIGNED    NOT NULL DEFAULT 10000,
  `coins_per_1000`   INT UNSIGNED    NOT NULL DEFAULT 10,
  `config`           JSON            NULL,
  `color_from`       VARCHAR(9)      NOT NULL DEFAULT '#6d5efc',
  `color_to`         VARCHAR(9)      NOT NULL DEFAULT '#8b5cf6',
  `active`           TINYINT(1)      NOT NULL DEFAULT 1,
  `is_premium`       TINYINT(1)      NOT NULL DEFAULT 0,
  `sort_order`       SMALLINT        NOT NULL DEFAULT 0,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_games_code` (`code`),
  KEY `idx_games_active_sort` (`active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. QUESTION BANK  (India Quiz, Bollywood Guess, Cricket Quiz, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE `questions` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id`        SMALLINT UNSIGNED NOT NULL,
  `prompt`         VARCHAR(500)    NOT NULL,
  `options`        JSON            NOT NULL,
  `correct_index`  TINYINT UNSIGNED NOT NULL,
  `explanation`    VARCHAR(500)    NULL,
  `difficulty`     ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
  `points`         SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `active`         TINYINT(1)      NOT NULL DEFAULT 1,
  `usage_count`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_by`     BIGINT UNSIGNED NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_q_game_active` (`game_id`, `active`, `difficulty`),
  KEY `idx_q_usage` (`game_id`, `usage_count`),
  CONSTRAINT `fk_q_game` FOREIGN KEY (`game_id`)
    REFERENCES `mini_games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_q_options` CHECK (JSON_LENGTH(`options`) = 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. DAILY RUNS  (one row per user per day - the daily challenge)
-- ---------------------------------------------------------------------------
CREATE TABLE `daily_runs` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `run_date`       DATE            NOT NULL,
  `seed`           VARCHAR(24)     NOT NULL,
  `game_ids`       JSON            NOT NULL,
  `total_score`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `games_played`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `best_game_score` INT UNSIGNED   NOT NULL DEFAULT 0,
  `coins_earned`   INT UNSIGNED    NOT NULL DEFAULT 0,
  `percentile`     DECIMAL(5,2)    NULL,
  `india_rank`     INT UNSIGNED    NULL,
  `completed`      TINYINT(1)      NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_runs_user_date` (`user_id`, `run_date`),
  KEY `idx_runs_date_score` (`run_date`, `total_score` DESC),
  KEY `idx_runs_date_completed` (`run_date`, `completed`),
  KEY `idx_runs_user` (`user_id`, `created_at` DESC),
  CONSTRAINT `fk_runs_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-game breakdown of a run.
CREATE TABLE `run_scores` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id`         BIGINT UNSIGNED NOT NULL,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `game_id`        SMALLINT UNSIGNED NOT NULL,
  `score`          INT UNSIGNED    NOT NULL DEFAULT 0,
  `duration_ms`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `detail`         JSON            NULL,
  `played_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_game` (`run_id`, `game_id`),
  KEY `idx_rs_user` (`user_id`, `played_at` DESC),
  KEY `idx_rs_game` (`game_id`, `played_at` DESC),
  CONSTRAINT `fk_rs_run` FOREIGN KEY (`run_id`)
    REFERENCES `daily_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rs_game` FOREIGN KEY (`game_id`)
    REFERENCES `mini_games` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fast daily leaderboard reads without scanning daily_runs every time.
CREATE TABLE `leaderboard_snapshots` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope`          ENUM('daily','weekly','alltime') NOT NULL,
  `scope_date`     DATE            NOT NULL,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `player_id`      INT UNSIGNED    NOT NULL,
  `name`           VARCHAR(80)     NOT NULL,
  `score`          BIGINT          NOT NULL DEFAULT 0,
  `rank_position`  INT UNSIGNED    NOT NULL,
  `city`           VARCHAR(80)     NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lb` (`scope`, `scope_date`, `user_id`),
  KEY `idx_lb_rank` (`scope`, `scope_date`, `rank_position`),
  CONSTRAINT `fk_lb_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Standalone (non-daily) play, e.g. free play or a tournament entry.
CREATE TABLE `game_sessions` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `game_id`        SMALLINT UNSIGNED NOT NULL,
  `mode`           ENUM('daily','free','tournament') NOT NULL DEFAULT 'free',
  `score`          INT UNSIGNED    NOT NULL DEFAULT 0,
  `duration_ms`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `coins_earned`   INT UNSIGNED    NOT NULL DEFAULT 0,
  `played_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gs_user` (`user_id`, `played_at` DESC),
  KEY `idx_gs_game` (`game_id`, `played_at` DESC),
  CONSTRAINT `fk_gs_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gs_game` FOREIGN KEY (`game_id`)
    REFERENCES `mini_games` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. CHALLENGES  (the viral engine: "I scored 9820. Can you beat me?")
-- ---------------------------------------------------------------------------
CREATE TABLE `challenges` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`            VARCHAR(16)     NOT NULL,
  `challenger_id`   BIGINT UNSIGNED NOT NULL,
  `challenger_name` VARCHAR(80)     NOT NULL,
  `challenger_score` INT UNSIGNED   NOT NULL,
  `challenger_run`  BIGINT UNSIGNED NULL,
  `challenee_id`    BIGINT UNSIGNED NULL,
  `challenee_score` INT UNSIGNED    NULL,
  `challenee_run`   BIGINT UNSIGNED NULL,
  `game_ids`        JSON            NULL,
  `status`          ENUM('pending','accepted','won','lost','expired')
                    NOT NULL DEFAULT 'pending',
  `expires_at`      DATETIME        NOT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at`    DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ch_code` (`code`),
  KEY `idx_ch_challenger` (`challenger_id`, `created_at` DESC),
  KEY `idx_ch_challenee` (`challenee_id`, `status`),
  KEY `idx_ch_status_exp` (`status`, `expires_at`),
  CONSTRAINT `fk_ch_challenger` FOREIGN KEY (`challenger_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ch_challenee` FOREIGN KEY (`challenee_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every accept/attempt, so "head to head" history is auditable.
-- The unique idempotency_key is what stops sp_resolve_challenge from paying
-- the same win bonus twice if the client retries.
CREATE TABLE `challenge_results` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `challenge_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `score`          INT UNSIGNED    NOT NULL,
  `won`            TINYINT(1)      NOT NULL DEFAULT 0,
  `idempotency_key` VARCHAR(120)   NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cr_idem` (`idempotency_key`),
  KEY `idx_cr_challenge` (`challenge_id`, `created_at` DESC),
  KEY `idx_cr_user` (`user_id`, `created_at` DESC),
  CONSTRAINT `fk_cr_challenge` FOREIGN KEY (`challenge_id`)
    REFERENCES `challenges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. REAL-TIME BATTLES  (1v1, driven by the WebSocket server)
-- ---------------------------------------------------------------------------
CREATE TABLE `battle_rooms` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`           VARCHAR(16)     NOT NULL,
  `game_id`        SMALLINT UNSIGNED NULL,
  `mode`           ENUM('challenge','tournament','ranked','private') NOT NULL DEFAULT 'challenge',
  `status`         ENUM('waiting','countdown','active','finished','cancelled')
                   NOT NULL DEFAULT 'waiting',
  `host_id`        BIGINT UNSIGNED NULL,
  `guest_id`       BIGINT UNSIGNED NULL,
  `seed`           VARCHAR(24)     NULL,
  `question_ids`   JSON            NULL,
  `duration_seconds` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `host_score`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `guest_score`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `winner_id`      BIGINT UNSIGNED NULL,
  `started_at`     DATETIME        NULL,
  `finished_at`    DATETIME        NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_room_code` (`code`),
  KEY `idx_room_status` (`status`, `created_at` DESC),
  KEY `idx_room_host` (`host_id`, `created_at` DESC),
  CONSTRAINT `fk_room_game` FOREIGN KEY (`game_id`)
    REFERENCES `mini_games` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `battle_participants` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`        BIGINT UNSIGNED NOT NULL,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `player_id`      INT UNSIGNED    NOT NULL,
  `score`          INT UNSIGNED    NOT NULL DEFAULT 0,
  `correct_count`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `avg_ms`         INT UNSIGNED    NOT NULL DEFAULT 0,
  `finished`       TINYINT(1)      NOT NULL DEFAULT 0,
  `joined_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bp_room_user` (`room_id`, `user_id`),
  KEY `idx_bp_user` (`user_id`, `joined_at` DESC),
  CONSTRAINT `fk_bp_room` FOREIGN KEY (`room_id`)
    REFERENCES `battle_rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bp_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only replay log, useful for anti-cheat review.
CREATE TABLE `battle_events` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`        BIGINT UNSIGNED NOT NULL,
  `user_id`        BIGINT UNSIGNED NULL,
  `event_type`     VARCHAR(32)     NOT NULL,
  `payload`        JSON            NULL,
  `created_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_be_room` (`room_id`, `id`),
  CONSTRAINT `fk_be_room` FOREIGN KEY (`room_id`)
    REFERENCES `battle_rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. STREAKS + BADGES
-- ---------------------------------------------------------------------------
CREATE TABLE `streaks` (
  `user_id`         BIGINT UNSIGNED NOT NULL,
  `current_streak`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `longest_streak`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `last_played_date` DATE           NULL,
  `total_days`      INT UNSIGNED    NOT NULL DEFAULT 0,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_streak_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `badges` (
  `id`           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`         VARCHAR(40)     NOT NULL,
  `name`         VARCHAR(60)     NOT NULL,
  `icon`         VARCHAR(16)     NOT NULL DEFAULT '🏅',
  `description`  VARCHAR(200)    NOT NULL,
  `criteria`     VARCHAR(60)     NOT NULL DEFAULT 'score_total >= 0',
  `tier`         ENUM('bronze','silver','gold') NOT NULL DEFAULT 'bronze',
  `active`       TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_badge_code` (`code`),
  KEY `idx_badge_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_badges` (
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `badge_id`   SMALLINT UNSIGNED NOT NULL,
  `earned_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `badge_id`),
  KEY `idx_ub_badge` (`badge_id`, `earned_at` DESC),
  CONSTRAINT `fk_ub_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ub_badge` FOREIGN KEY (`badge_id`)
    REFERENCES `badges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. SPONSORS + ADS  ("Cricket Challenge powered by XYZ")
-- ---------------------------------------------------------------------------
CREATE TABLE `sponsors` (
  `id`           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(80)     NOT NULL,
  `slug`         VARCHAR(40)     NOT NULL,
  `logo_url`     VARCHAR(255)    NULL,
  `tagline`      VARCHAR(160)    NULL,
  `game_id`      SMALLINT UNSIGNED NULL,
  `starts_at`    DATETIME        NOT NULL,
  `ends_at`      DATETIME        NULL,
  `reward_coins` INT UNSIGNED    NOT NULL DEFAULT 0,
  `active`       TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sponsor_slug` (`slug`),
  KEY `idx_sponsor_active` (`active`, `starts_at`, `ends_at`),
  CONSTRAINT `fk_sponsor_game` FOREIGN KEY (`game_id`)
    REFERENCES `mini_games` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ad_config` (
  `id`         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `placement`  VARCHAR(40)     NOT NULL,
  `provider`   ENUM('admob','none') NOT NULL DEFAULT 'none',
  `unit_id`    VARCHAR(80)     NULL,
  `enabled`    TINYINT(1)      NOT NULL DEFAULT 0,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ad_placement` (`placement`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. SETTINGS + AUDIT
-- ---------------------------------------------------------------------------
CREATE TABLE `settings` (
  `key`        VARCHAR(64)     NOT NULL,
  `value`      JSON            NOT NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `admin_audit_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`    BIGINT UNSIGNED NULL,
  `action`      VARCHAR(64)     NOT NULL,
  `target_type` VARCHAR(40)     NULL,
  `target_id`   VARCHAR(64)     NULL,
  `meta`        JSON            NULL,
  `ip`          VARCHAR(64)     NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_admin` (`admin_id`, `created_at` DESC),
  KEY `idx_audit_action` (`action`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Issued JWT ids, so an admin can revoke a session before its token expires.
CREATE TABLE `user_sessions` (
  `jti`        VARCHAR(64)     NOT NULL,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME        NOT NULL,
  `revoked_at` DATETIME        NULL,
  `user_agent` VARCHAR(255)    NULL,
  PRIMARY KEY (`jti`),
  KEY `idx_session_user` (`user_id`, `created_at` DESC),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 11. WALLET PROCEDURES
--     All money movement goes through these. Never UPDATE wallets directly.
-- ===========================================================================

DELIMITER $$

-- Credit: add coins and append a ledger row. Returns the new balance.
CREATE PROCEDURE `sp_credit_wallet`(
  IN  p_wallet_id BIGINT UNSIGNED,
  IN  p_user_id   BIGINT UNSIGNED,
  IN  p_amount    BIGINT,
  IN  p_kind      VARCHAR(32),
  IN  p_ref_type  VARCHAR(40),
  IN  p_ref_id    VARCHAR(64),
  IN  p_note      VARCHAR(255),
  IN  p_idem_key  VARCHAR(120),
  OUT p_balance   BIGINT
)
BEGIN
  DECLARE v_balance BIGINT DEFAULT 0;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit amount must be positive';
  END IF;

  -- Idempotent: a repeated key is a no-op and returns the current balance.
  IF p_idem_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM wallet_ledger WHERE idempotency_key = p_idem_key
  ) THEN
    SELECT balance INTO v_balance FROM wallets WHERE id = p_wallet_id;
    SET p_balance = v_balance;
  ELSE
    -- Lock the wallet row so concurrent credits cannot interleave.
    UPDATE wallets
       SET balance = balance + p_amount,
           lifetime_earned = lifetime_earned + p_amount
     WHERE id = p_wallet_id AND frozen = 0;

    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'wallet_not_found_or_frozen';
    END IF;

    SELECT balance INTO v_balance FROM wallets WHERE id = p_wallet_id;

    INSERT INTO wallet_ledger
      (wallet_id, user_id, delta, balance_after, kind, ref_type, ref_id, note, idempotency_key)
    VALUES
      (p_wallet_id, p_user_id, p_amount, v_balance, p_kind, p_ref_type, p_ref_id, p_note, p_idem_key);

    SET p_balance = v_balance;
  END IF;
END$$

-- Debit: subtract ONLY if the balance covers it. Returns the new balance.
CREATE PROCEDURE `sp_debit_wallet`(
  IN  p_wallet_id BIGINT UNSIGNED,
  IN  p_user_id   BIGINT UNSIGNED,
  IN  p_amount    BIGINT,
  IN  p_kind      VARCHAR(32),
  IN  p_ref_type  VARCHAR(40),
  IN  p_ref_id    VARCHAR(64),
  IN  p_note      VARCHAR(255),
  IN  p_idem_key  VARCHAR(120),
  OUT p_balance   BIGINT
)
BEGIN
  DECLARE v_balance BIGINT DEFAULT 0;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit amount must be positive';
  END IF;

  IF p_idem_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM wallet_ledger WHERE idempotency_key = p_idem_key
  ) THEN
    SELECT balance INTO v_balance FROM wallets WHERE id = p_wallet_id;
    SET p_balance = v_balance;
  ELSE
    -- The `balance >= p_amount` guard in the WHERE clause is what makes a
    -- double-spend impossible; a zero ROW_COUNT means we refused.
    UPDATE wallets
       SET balance = balance - p_amount
     WHERE id = p_wallet_id AND balance >= p_amount AND frozen = 0;

    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient_balance_or_frozen';
    END IF;

    SELECT balance INTO v_balance FROM wallets WHERE id = p_wallet_id;

    INSERT INTO wallet_ledger
      (wallet_id, user_id, delta, balance_after, kind, ref_type, ref_id, note, idempotency_key)
    VALUES
      (p_wallet_id, p_user_id, -p_amount, v_balance, p_kind, p_ref_type, p_ref_id, p_note, p_idem_key);

    SET p_balance = v_balance;
  END IF;
END$$

-- Submit a daily run: lock the run row, set the score if it improved, update
-- the streak, and pay the coins. One transaction, one idempotency key.
CREATE PROCEDURE `sp_submit_daily_run`(
  IN  p_user_id      BIGINT UNSIGNED,
  IN  p_run_date     DATE,
  IN  p_total_score  INT UNSIGNED,
  IN  p_games_played TINYINT UNSIGNED,
  IN  p_best_game    INT UNSIGNED,
  IN  p_coins        INT UNSIGNED,
  IN  p_idem_key     VARCHAR(120),
  OUT p_run_id       BIGINT UNSIGNED,
  OUT p_new_best     TINYINT(1)
)
BEGIN
  DECLARE v_run_id  BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_prev    INT UNSIGNED DEFAULT 0;
  DECLARE v_wallet  BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_balance BIGINT DEFAULT 0;
  DECLARE v_streak  SMALLINT UNSIGNED DEFAULT 0;
  DECLARE v_last    DATE DEFAULT NULL;
  DECLARE v_streak_bonus INT DEFAULT 0;

  SELECT id, total_score INTO v_run_id, v_prev
    FROM daily_runs
   WHERE user_id = p_user_id AND run_date = p_run_date
     FOR UPDATE;

  IF v_run_id IS NULL THEN
    INSERT INTO daily_runs
      (user_id, run_date, seed, game_ids, total_score, games_played,
       best_game_score, coins_earned, completed)
    VALUES
      (p_user_id, p_run_date, '', JSON_ARRAY(), p_total_score, p_games_played,
       p_best_game, 0, 1);
    SET v_run_id = LAST_INSERT_ID();
    SET v_prev = 0;
  END IF;

  -- Only a strictly better score replaces the day's total.
  IF p_total_score <= v_prev THEN
    SET p_new_best = 0;
    SET p_run_id = v_run_id;
  ELSE
    UPDATE daily_runs
       SET total_score = GREATEST(p_total_score, total_score),
           games_played = GREATEST(p_games_played, games_played),
           best_game_score = GREATEST(p_best_game, best_game_score),
           completed = 1
     WHERE id = v_run_id;
    SET p_new_best = 1;
  END IF;

  -- --- streak ------------------------------------------------------------
  SELECT current_streak, last_played_date INTO v_streak, v_last
    FROM streaks WHERE user_id = p_user_id FOR UPDATE;

  IF v_last IS NULL THEN
    SET v_streak = 1;
  ELSEIF v_last = p_run_date THEN
    SET v_streak = v_streak;              -- already counted today
  ELSEIF v_last = DATE_SUB(p_run_date, INTERVAL 1 DAY) THEN
    SET v_streak = v_streak + 1;          -- consecutive day
  ELSE
    SET v_streak = 1;                     -- broken
  END IF;

  INSERT INTO streaks (user_id, current_streak, longest_streak, last_played_date, total_days)
  VALUES (p_user_id, v_streak, v_streak, p_run_date, 1)
  ON DUPLICATE KEY UPDATE
    current_streak   = v_streak,
    longest_streak   = GREATEST(longest_streak, v_streak),
    last_played_date = p_run_date,
    total_days       = total_days + IF(last_played_date = p_run_date, 0, 1);

  -- 7-day milestones pay a bonus. Calculated from the new streak value.
  IF MOD(v_streak, 7) = 0 THEN
    SET v_streak_bonus = 100 * (v_streak / 7);
  END IF;

  -- --- pay out -----------------------------------------------------------
  SELECT id INTO v_wallet FROM wallets WHERE user_id = p_user_id LIMIT 1;

  IF v_wallet IS NOT NULL AND p_coins > 0 THEN
    CALL sp_credit_wallet(
      v_wallet, p_user_id, p_coins,
      'game_score', 'daily_run', CAST(v_run_id AS CHAR),
      'Daily challenge score', CONCAT(p_idem_key, ':score'), v_balance);

    UPDATE daily_runs SET coins_earned = coins_earned + p_coins WHERE id = v_run_id;
  END IF;

  IF v_wallet IS NOT NULL AND v_streak_bonus > 0 THEN
    CALL sp_credit_wallet(
      v_wallet, p_user_id, v_streak_bonus,
      'streak_bonus', 'streak', CAST(v_streak AS CHAR),
      CONCAT(v_streak, '-day streak bonus'),
      CONCAT('streak:', p_user_id, ':', p_run_date), v_balance);
  END IF;

  SET p_run_id = v_run_id;
END$$

-- Close an account without destroying its financial history.
--
-- wallet_ledger is ON DELETE RESTRICT on purpose: the coin ledger is the
-- audit trail and must outlive the account. A plain DELETE FROM users
-- therefore fails for anyone who has ever earned coins.
--
-- This scrubs the personally identifiable fields, frees the unique email for
-- reuse, and zeroes the wallet, while keeping every ledger row and its
-- balance_after history intact. This is what "delete my account" should mean
-- in a wallet-based game.
CREATE PROCEDURE `sp_close_account`(
  IN  p_user_id BIGINT UNSIGNED,
  IN  p_reason  VARCHAR(255)
)
BEGIN
  DECLARE v_wallet BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_stamp  VARCHAR(120) DEFAULT NULL;

  SET v_stamp = CONCAT('deleted:', p_user_id, ':', UNIX_TIMESTAMP());

  SELECT id INTO v_wallet FROM wallets WHERE user_id = p_user_id LIMIT 1;

  -- Park the balance in the ledger, then zero the wallet. The ledger row is
  -- keyed on the ORIGINAL user id, so the history stays attributable.
  IF v_wallet IS NOT NULL AND (SELECT balance FROM wallets WHERE id = v_wallet) > 0 THEN
    INSERT INTO wallet_ledger
      (wallet_id, user_id, delta, balance_after, kind, ref_type, ref_id, note, idempotency_key)
    VALUES
      (v_wallet, p_user_id,
       -(SELECT balance FROM wallets WHERE id = v_wallet), 0,
       'admin_debit', 'account_close', CAST(p_user_id AS CHAR),
       COALESCE(p_reason, 'Account closed'),
       CONCAT('close:', p_user_id));
  END IF;

  UPDATE wallets
     SET balance = 0, frozen = 1
   WHERE user_id = p_user_id;

  -- Personal data is overwritten, not just flagged, so a re-registered user
  -- cannot be linked back to the old account by email.
  UPDATE users
     SET email         = CONCAT('closed_', p_user_id, '_', UNIX_TIMESTAMP(), '@deleted.local'),
       name           = 'Deleted User',
       password_hash  = CONCAT('!closed!', p_user_id),
       city           = NULL,
       state          = NULL,
       referral_code  = CONCAT('CLOSED', LPAD(p_user_id, 6, '0')),
       active         = 0,
       updated_at     = NOW()
   WHERE id = p_user_id;

  -- Sessions and challenges referencing the account are voided.
  UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = p_user_id AND revoked_at IS NULL;

  UPDATE challenges
     SET status = 'expired'
   WHERE (challenger_id = p_user_id OR challenee_id = p_user_id)
     AND status IN ('pending', 'accepted');
END$$

-- Recompute the India-wide percentile for a run: what share of players
-- finished today with a lower score. "You're better than 87% of players."
CREATE PROCEDURE `sp_calculate_percentile`(
  IN  p_user_id  BIGINT UNSIGNED,
  IN  p_run_date DATE,
  OUT p_percentile  DECIMAL(5,2),
  OUT p_rank        INT UNSIGNED
)
BEGIN
  DECLARE v_score  INT UNSIGNED DEFAULT 0;
  DECLARE v_lower  INT UNSIGNED DEFAULT 0;
  DECLARE v_total  INT UNSIGNED DEFAULT 0;

  SELECT total_score INTO v_score
    FROM daily_runs
   WHERE user_id = p_user_id AND run_date = p_run_date;

  IF v_score IS NULL THEN
    SET p_percentile = NULL;
    SET p_rank = NULL;
  ELSE
    SELECT COUNT(*) INTO v_total
      FROM daily_runs WHERE run_date = p_run_date AND completed = 1;

    SELECT COUNT(*) INTO v_lower
      FROM daily_runs WHERE run_date = p_run_date
       AND completed = 1 AND total_score < v_score;

    IF v_total > 0 THEN
      SET p_percentile = ROUND(v_lower * 100.0 / v_total, 2);
      SET p_rank = v_lower + 1;
    ELSE
      SET p_percentile = 100.00;
      SET p_rank = 1;
    END IF;

    UPDATE daily_runs
       SET percentile = p_percentile, india_rank = p_rank
     WHERE user_id = p_user_id AND run_date = p_run_date;
  END IF;
END$$

-- Accept a challenge: records the attempt, settles the winner, and pays the
-- winner a coin bonus. Whoever calls it twice does not double-pay.
CREATE PROCEDURE `sp_resolve_challenge`(
  IN  p_challenge_id BIGINT UNSIGNED,
  IN  p_user_id      BIGINT UNSIGNED,
  IN  p_score        INT UNSIGNED,
  IN  p_run_id       BIGINT UNSIGNED,
  IN  p_idem_key     VARCHAR(120),
  OUT p_status       VARCHAR(16),
  OUT p_won          TINYINT(1),
  OUT p_opponent     VARCHAR(80),
  OUT p_opp_score    INT UNSIGNED
)
BEGIN
  DECLARE v_challenger BIGINT UNSIGNED;
  DECLARE v_challenee  BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_score      INT UNSIGNED;
  DECLARE v_name       VARCHAR(80);
  DECLARE v_won        TINYINT(1) DEFAULT 0;
  DECLARE v_wallet     BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_balance    BIGINT DEFAULT 0;
  DECLARE v_already    TINYINT(1) DEFAULT 0;

  SELECT challenger_id, challenee_id, challenger_score, challenger_name
    INTO v_challenger, v_challenee, v_score, v_name
    FROM challenges
   WHERE id = p_challenge_id FOR UPDATE;

  IF v_challenger IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'challenge_not_found';
  END IF;

  -- Retry guard: the same idem key must not pay twice.
  SELECT EXISTS(SELECT 1 FROM challenge_results WHERE challenge_id = p_challenge_id
                 AND user_id = p_user_id AND idempotency_key = p_idem_key)
    INTO v_already;

  IF v_already = 0 THEN
    SET v_won = IF(p_score > v_score, 1, 0);

    INSERT INTO challenge_results
      (challenge_id, user_id, score, won, idempotency_key)
    VALUES
      (p_challenge_id, p_user_id, p_score, v_won, p_idem_key);

    UPDATE challenges
       SET challenee_id   = COALESCE(challenee_id, p_user_id),
           challenee_score = p_score,
           challenee_run  = p_run_id,
           status         = IF(v_won = 1, 'won', 'lost'),
           responded_at   = NOW()
     WHERE id = p_challenge_id;

    IF v_won = 1 THEN
      SELECT id INTO v_wallet FROM wallets WHERE user_id = p_user_id LIMIT 1;
      IF v_wallet IS NOT NULL THEN
        CALL sp_credit_wallet(
          v_wallet, p_user_id, 50, 'friend_win', 'challenge',
          CAST(p_challenge_id AS CHAR), 'Beat a friend challenge',
          CONCAT(p_idem_key, ':bonus'), v_balance);
      END IF;
    END IF;
  ELSE
    SET v_won = IF(p_score > v_score, 1, 0);
  END IF;

  SET p_status   = IF(v_won = 1, 'won', 'lost');
  SET p_won      = v_won;
  SET p_opponent = v_name;
  SET p_opp_score = v_score;
END$$

-- Finish a battle: persist the result, mark the winner, pay the winner.
CREATE PROCEDURE `sp_finish_battle`(
  IN  p_room_id   BIGINT UNSIGNED,
  IN  p_host_score  INT UNSIGNED,
  IN  p_guest_score INT UNSIGNED,
  IN  p_winner_id BIGINT UNSIGNED,
  IN  p_idem_key  VARCHAR(120)
)
BEGIN
  DECLARE v_wallet  BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_balance BIGINT DEFAULT 0;

  UPDATE battle_rooms
     SET host_score = p_host_score,
         guest_score = p_guest_score,
         winner_id = p_winner_id,
         status = 'finished',
         started_at = COALESCE(started_at, NOW()),
         finished_at = NOW()
   WHERE id = p_room_id AND status <> 'finished';

  IF p_winner_id IS NOT NULL THEN
    SELECT id INTO v_wallet FROM wallets WHERE user_id = p_winner_id LIMIT 1;
    IF v_wallet IS NOT NULL THEN
      CALL sp_credit_wallet(
        v_wallet, p_winner_id, 100, 'tournament_prize', 'battle',
        CAST(p_room_id AS CHAR), '1v1 battle win', p_idem_key, v_balance);
    END IF;
  END IF;
END$$

DELIMITER ;

-- ===========================================================================
-- 12. SEED DATA
-- ===========================================================================
INSERT INTO `mini_games`
  (code, name, emoji, tagline, category, duration_seconds, max_score,
   coins_per_1000, config, color_from, color_to, sort_order)
VALUES
  ('reaction-rush', 'Reaction Rush', '⚡',
   'Wait for green, tap as fast as you can', 'fast', 15, 6000, 12,
   JSON_OBJECT('rounds', 5, 'minMs', 1200, 'maxMs', 4000), '#f97316', '#ef4444', 1),

  ('tap-master', 'Tap Master', '👆',
   'Tap the target as many times as possible', 'fast', 30, 3000, 10,
   JSON_OBJECT('targetCount', 3, 'spawnMs', 900), '#22c55e', '#16a34a', 2),

  ('color-switch', 'Color Switch', '🎨',
   'Tap only when the colour matches the word', 'fast', 30, 4000, 10,
   JSON_OBJECT('options', JSON_ARRAY('RED','BLUE','GREEN','YELLOW')), '#3b82f6', '#06b6d4', 3),

  ('memory-master', 'Memory Master', '🧠',
   'Match the pairs before time runs out', 'memory', 30, 3000, 12,
   JSON_OBJECT('gridSize', 16, 'pairs', 8), '#8b5cf6', '#a855f7', 4),

  ('india-quiz', 'India Quiz', '🇮🇳',
   'Cricket, Bollywood, GK and Indian memes', 'india', 30, 3000, 10,
   JSON_OBJECT('questionCount', 10), '#f59e0b', '#d97706', 5)
ON DUPLICATE KEY UPDATE name = VALUES(name), tagline = VALUES(tagline);

INSERT INTO `badges` (code, name, icon, description, criteria, tier) VALUES
  ('first-blood',    'First Win',        '🎯', 'Finish your first daily challenge',  'runs_completed >= 1',       'bronze'),
  ('streak-3',       '3-Day Streak',     '🔥', 'Play three days in a row',            'streak >= 3',              'bronze'),
  ('streak-7',       '7-Day Streak',     '⚡', 'Play seven days in a row',            'streak >= 7',              'silver'),
  ('streak-30',      'Monthly Warrior',  '🏔️', 'Play thirty days in a row',           'streak >= 30',             'gold'),
  ('speed-demon',    'Speed Demon',      '💨', 'Score over 5000 in a single game',    'best_game >= 5000',        'silver'),
  ('top-10',         'Top 10 India',     '🏆', 'Finish a day in the India top 10',    'india_rank <= 10',         'gold'),
  ('challenger',     'Challenger',       '🤝', 'Beat a friend challenge',             'wins >= 1',                'bronze'),
  ('socialite',      'Socialite',        '📣', 'Invite ten friends',                  'referrals >= 10',          'silver'),
  ('quiz-master',    'Quiz Master',      '📚', 'Answer 100 questions correctly',      'correct >= 100',           'gold'),
  ('perfect-round',  'Perfect Round',    '💎', 'Score full marks in one game',        'perfect_games >= 1',       'gold')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO `ad_config` (placement, provider, unit_id, enabled) VALUES
  ('home_banner',        'admob', NULL, 0),
  ('result_banner',      'admob', NULL, 0),
  ('between_games',      'admob', NULL, 0),
  ('interstitial_result','admob', NULL, 0)
ON DUPLICATE KEY UPDATE placement = VALUES(placement);

-- JSON literals are cast directly. Wrapping in to_jsonb-style helpers breaks
-- MySQL's type inference on an untyped string.
INSERT INTO `settings` (`key`, `value`) VALUES
  ('app_name',          JSON_QUOTE('MINUTE WAR')),
  ('tagline',           JSON_QUOTE('60 Seconds. One Challenge. Can You Beat Me?')),
  ('daily_game_count',  '3'),
  ('coin_signup_bonus', '500'),
  ('coin_daily_login',  '50'),
  ('coin_invite',       '200'),
  ('premium_price_inr', '79'),
  ('share_text',        JSON_QUOTE('🔥 I scored {score} in MINUTE WAR! Can you beat me? {link}')),
  ('maintenance',       'false'),
  ('registrations_open','true'),
  ('ads_enabled',       'true')
ON DUPLICATE KEY UPDATE `key` = VALUES(`key`);

-- ===========================================================================
-- DONE.
--   Next:  node scripts/create-admin.mjs --email you@you.com --name Owner
-- ===========================================================================