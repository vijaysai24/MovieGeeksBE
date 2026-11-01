const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

const titleStats = async (titleId) => {
    const [[ratings]] = await db.execute(
        `SELECT COUNT(*) AS rating_count, AVG(rating) AS average,
            SUM(rating = 1) AS r1, SUM(rating = 2) AS r2, SUM(rating = 3) AS r3, SUM(rating = 4) AS r4,
            SUM(rating = 5) AS r5, SUM(rating = 6) AS r6, SUM(rating = 7) AS r7, SUM(rating = 8) AS r8,
            SUM(rating = 9) AS r9, SUM(rating = 10) AS r10
         FROM ratings WHERE title_id = ?`,
        [titleId]
    );
    const [[counts]] = await db.execute(
        `SELECT
            (SELECT COUNT(*) FROM reviews WHERE title_id = ? AND status = 'PUBLISHED') AS reviews,
            (SELECT COUNT(*) FROM watch_statuses WHERE title_id = ? AND status = 'WATCHED') AS watched,
            (SELECT COUNT(*) FROM watch_statuses WHERE title_id = ? AND status = 'WATCHING') AS watching,
            (SELECT COUNT(*) FROM watch_statuses WHERE title_id = ? AND status = 'PLAN_TO_WATCH') AS planned,
            (SELECT COUNT(*) FROM wishlist_items WHERE title_id = ?) AS wishlisted,
            (SELECT COUNT(*) FROM favorite_titles WHERE title_id = ?) AS favorites`,
        Array(6).fill(titleId)
    );
    return { ratings, counts };
};

// What the community is talking about: weighted recent reviews, comments and ratings.
const trendingTitles = async ({ days, limit }) => {
    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, activity.reviews, activity.comments, activity.ratings,
                (activity.reviews * 3 + activity.comments * 2 + activity.ratings) AS score
         FROM (
            SELECT title_id, SUM(reviews) AS reviews, SUM(comments) AS comments, SUM(ratings) AS ratings
            FROM (
                SELECT title_id, COUNT(*) AS reviews, 0 AS comments, 0 AS ratings
                FROM reviews WHERE status = 'PUBLISHED' AND created_at > UTC_TIMESTAMP() - INTERVAL ? DAY
                GROUP BY title_id
                UNION ALL
                SELECT rv.title_id, 0, COUNT(*), 0
                FROM review_comments c JOIN reviews rv ON rv.id = c.review_id
                WHERE c.status = 'PUBLISHED' AND c.created_at > UTC_TIMESTAMP() - INTERVAL ? DAY
                GROUP BY rv.title_id
                UNION ALL
                SELECT title_id, 0, 0, COUNT(*)
                FROM ratings WHERE updated_at > UTC_TIMESTAMP() - INTERVAL ? DAY
                GROUP BY title_id
            ) recent
            GROUP BY title_id
         ) activity
         JOIN titles t ON t.id = activity.title_id
         ORDER BY score DESC, t.popularity DESC
         LIMIT ${Number(limit)}`,
        [days, days, days]
    );
    return rows;
};

// Members worth following: most reviews and likes received recently.
const activeMembers = async ({ days, limit, excludeUserId }) => {
    const [rows] = await db.execute(
        `SELECT u.id, u.name, u.username, u.avatar_url, u.bio,
                COUNT(rv.id) AS review_count, COALESCE(SUM(rv.like_count), 0) AS likes_received
         FROM users u
         JOIN reviews rv ON rv.user_id = u.id AND rv.status = 'PUBLISHED'
              AND rv.created_at > UTC_TIMESTAMP() - INTERVAL ? DAY
         WHERE u.status = 'ACTIVE' AND u.id <> ?
           AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id)
         GROUP BY u.id, u.name, u.username, u.avatar_url, u.bio
         ORDER BY likes_received DESC, review_count DESC
         LIMIT ${Number(limit)}`,
        [days, excludeUserId || 0, excludeUserId || 0]
    );
    return rows;
};

module.exports = {
    titleStats,
    trendingTitles,
    activeMembers
};
