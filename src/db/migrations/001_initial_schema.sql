-- Movie Geeks initial schema.
-- External catalogue data (TMDB) is never mirrored wholesale: `titles`, `genres` and `people`
-- hold a small snapshot of only the titles users have interacted with, so libraries, profiles,
-- feeds and statistics can be rendered without one TMDB call per row.

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    username VARCHAR(30) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio VARCHAR(300) NULL,
    avatar_url VARCHAR(500) NULL,
    banner_path VARCHAR(100) NULL,
    region CHAR(2) NOT NULL DEFAULT 'IN',
    role ENUM('USER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'USER',
    status ENUM('ACTIVE', 'INACTIVE', 'BANNED') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username)
);

CREATE TABLE refresh_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    family_id CHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refresh_tokens_hash (token_hash),
    KEY idx_refresh_tokens_user (user_id),
    KEY idx_refresh_tokens_family (family_id),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Catalogue snapshot -------------------------------------------------------------------------

CREATE TABLE titles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tmdb_id INT UNSIGNED NOT NULL,
    media_type ENUM('movie', 'tv') NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_title VARCHAR(255) NULL,
    poster_path VARCHAR(100) NULL,
    backdrop_path VARCHAR(100) NULL,
    release_date DATE NULL,
    runtime SMALLINT UNSIGNED NULL,
    original_language VARCHAR(10) NULL,
    popularity DECIMAL(10, 3) NULL,
    tmdb_rating DECIMAL(3, 1) NULL,
    tmdb_vote_count INT UNSIGNED NULL,
    synced_at DATETIME NOT NULL,
    UNIQUE KEY uq_titles_tmdb (media_type, tmdb_id),
    KEY idx_titles_release_date (release_date)
);

CREATE TABLE genres (
    id SMALLINT UNSIGNED PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

CREATE TABLE title_genres (
    title_id INT UNSIGNED NOT NULL,
    genre_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (title_id, genre_id),
    KEY idx_title_genres_genre (genre_id),
    CONSTRAINT fk_title_genres_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
    CONSTRAINT fk_title_genres_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
);

CREATE TABLE people (
    id INT UNSIGNED PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    profile_path VARCHAR(100) NULL
);

CREATE TABLE title_credits (
    title_id INT UNSIGNED NOT NULL,
    person_id INT UNSIGNED NOT NULL,
    credit_type ENUM('DIRECTOR', 'CREATOR', 'CAST') NOT NULL,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (title_id, person_id, credit_type),
    KEY idx_title_credits_person (person_id, credit_type),
    CONSTRAINT fk_title_credits_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
    CONSTRAINT fk_title_credits_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
);

-- Personal library ---------------------------------------------------------------------------

CREATE TABLE wishlist_items (
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, title_id),
    KEY idx_wishlist_items_title (title_id),
    CONSTRAINT fk_wishlist_items_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlist_items_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE watch_statuses (
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    status ENUM('PLAN_TO_WATCH', 'WATCHING', 'WATCHED') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, title_id),
    KEY idx_watch_statuses_user_status (user_id, status, updated_at),
    KEY idx_watch_statuses_title (title_id),
    CONSTRAINT fk_watch_statuses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_statuses_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE ratings (
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, title_id),
    KEY idx_ratings_title (title_id, rating),
    CONSTRAINT chk_ratings_range CHECK (rating BETWEEN 1 AND 10),
    CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ratings_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE diary_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    watched_on DATE NOT NULL,
    rating TINYINT UNSIGNED NULL,
    is_rewatch BOOLEAN NOT NULL DEFAULT FALSE,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_diary_entries_user_date (user_id, watched_on),
    KEY idx_diary_entries_title (title_id),
    CONSTRAINT chk_diary_entries_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
    CONSTRAINT fk_diary_entries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_diary_entries_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE favorite_titles (
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, title_id),
    KEY idx_favorite_titles_title (title_id),
    CONSTRAINT fk_favorite_titles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_favorite_titles_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE top_titles (
    user_id INT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, position),
    UNIQUE KEY uq_top_titles_user_title (user_id, title_id),
    CONSTRAINT chk_top_titles_position CHECK (position BETWEEN 1 AND 5),
    CONSTRAINT fk_top_titles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_top_titles_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE user_genre_preferences (
    user_id INT UNSIGNED NOT NULL,
    genre_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, genre_id),
    CONSTRAINT fk_user_genre_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_genre_preferences_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
);

-- Community ----------------------------------------------------------------------------------

CREATE TABLE reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    has_spoilers BOOLEAN NOT NULL DEFAULT FALSE,
    status ENUM('PUBLISHED', 'HIDDEN', 'REMOVED') NOT NULL DEFAULT 'PUBLISHED',
    like_count INT UNSIGNED NOT NULL DEFAULT 0,
    dislike_count INT UNSIGNED NOT NULL DEFAULT 0,
    comment_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reviews_user_title (user_id, title_id),
    KEY idx_reviews_title_popular (title_id, status, like_count),
    KEY idx_reviews_title_recent (title_id, status, created_at),
    KEY idx_reviews_user_recent (user_id, created_at),
    KEY idx_reviews_status_recent (status, created_at),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE review_reactions (
    user_id INT UNSIGNED NOT NULL,
    review_id INT UNSIGNED NOT NULL,
    reaction ENUM('LIKE', 'DISLIKE') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, review_id),
    KEY idx_review_reactions_review (review_id),
    CONSTRAINT fk_review_reactions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_reactions_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE
);

CREATE TABLE review_comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    body VARCHAR(1000) NOT NULL,
    status ENUM('PUBLISHED', 'HIDDEN', 'REMOVED') NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_review_comments_review (review_id, created_at),
    KEY idx_review_comments_user (user_id),
    CONSTRAINT fk_review_comments_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- follower_id <> following_id is enforced in the service: MySQL rejects CHECK constraints on
-- columns that carry a cascading foreign key.
CREATE TABLE follows (
    follower_id INT UNSIGNED NOT NULL,
    following_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    KEY idx_follows_following (following_id),
    CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_follows_following FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE collections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000) NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    is_ranked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_collections_user (user_id, updated_at),
    KEY idx_collections_public (is_public, updated_at),
    CONSTRAINT fk_collections_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE collection_items (
    collection_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,
    note VARCHAR(300) NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, title_id),
    KEY idx_collection_items_position (collection_id, position),
    KEY idx_collection_items_title (title_id),
    CONSTRAINT fk_collection_items_collection FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
    CONSTRAINT fk_collection_items_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE watch_parties (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id INT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,
    invite_code CHAR(10) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_watch_parties_invite (invite_code),
    KEY idx_watch_parties_owner (owner_id),
    CONSTRAINT fk_watch_parties_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE watch_party_members (
    party_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, user_id),
    KEY idx_watch_party_members_user (user_id),
    CONSTRAINT fk_watch_party_members_party FOREIGN KEY (party_id) REFERENCES watch_parties (id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_party_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE watch_party_items (
    party_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    added_by INT UNSIGNED NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, title_id),
    KEY idx_watch_party_items_title (title_id),
    CONSTRAINT fk_watch_party_items_party FOREIGN KEY (party_id) REFERENCES watch_parties (id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_party_items_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_party_items_added_by FOREIGN KEY (added_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE watch_party_votes (
    party_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, title_id, user_id),
    KEY idx_watch_party_votes_user (user_id),
    CONSTRAINT fk_watch_party_votes_item FOREIGN KEY (party_id, title_id) REFERENCES watch_party_items (party_id, title_id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_party_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Activity, notifications, moderation --------------------------------------------------------

CREATE TABLE activities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('RATED', 'REVIEWED', 'WATCHED', 'FAVORITED', 'LISTED', 'FOLLOWED') NOT NULL,
    title_id INT UNSIGNED NULL,
    target_id INT UNSIGNED NULL,
    rating TINYINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_activities_user_recent (user_id, created_at),
    KEY idx_activities_title_recent (title_id, created_at),
    CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_activities_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('FOLLOW', 'REVIEW_LIKE', 'REVIEW_COMMENT', 'RELEASE', 'STREAMING', 'PARTY_JOIN', 'PARTY_ITEM') NOT NULL,
    actor_id INT UNSIGNED NULL,
    title_id INT UNSIGNED NULL,
    entity_id INT UNSIGNED NULL,
    message VARCHAR(255) NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notifications_user_recent (user_id, created_at),
    KEY idx_notifications_user_unread (user_id, read_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_notifications_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

CREATE TABLE title_alerts (
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    alert_type ENUM('RELEASE', 'STREAMING') NOT NULL,
    region CHAR(2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notified_at DATETIME NULL,
    PRIMARY KEY (user_id, title_id, alert_type),
    KEY idx_title_alerts_pending (notified_at, alert_type),
    KEY idx_title_alerts_title (title_id),
    CONSTRAINT fk_title_alerts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_title_alerts_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
);

-- target_id points at reviews.id or review_comments.id depending on target_type.
CREATE TABLE reports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT UNSIGNED NOT NULL,
    target_type ENUM('REVIEW', 'COMMENT') NOT NULL,
    target_id INT UNSIGNED NOT NULL,
    reason ENUM('SPAM', 'HARASSMENT', 'HATE', 'SPOILERS', 'OTHER') NOT NULL,
    details VARCHAR(500) NULL,
    status ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    resolved_by INT UNSIGNED NULL,
    resolved_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reports_reporter_target (reporter_id, target_type, target_id),
    KEY idx_reports_status (status, created_at),
    KEY idx_reports_target (target_type, target_id),
    CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_reports_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
);
