const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

const REVIEW_COLUMNS = `
    rv.id, rv.user_id, rv.title_id, rv.body, rv.has_spoilers, rv.status, rv.like_count,
    rv.dislike_count, rv.comment_count, rv.created_at, rv.updated_at,
    u.id AS author_id, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
    r.rating AS author_rating
`;

const REVIEW_JOINS = `
    JOIN users u ON u.id = rv.user_id
    LEFT JOIN ratings r ON r.user_id = rv.user_id AND r.title_id = rv.title_id
`;

// Popular blends approval with conversation, newest first among equals.
const REVIEW_SORTS = {
    popular: "(rv.like_count - rv.dislike_count) DESC, rv.comment_count DESC, rv.created_at DESC",
    recent: "rv.created_at DESC",
    highest: "r.rating DESC, rv.created_at DESC",
    lowest: "r.rating ASC, rv.created_at DESC"
};

const viewerReactionColumn = (viewerId) => (viewerId
    ? ", (SELECT reaction FROM review_reactions rr WHERE rr.review_id = rv.id AND rr.user_id = ?) AS viewer_reaction"
    : ", NULL AS viewer_reaction");

const findOwn = async (userId, titleId) => {
    const [rows] = await db.execute("SELECT * FROM reviews WHERE user_id = ? AND title_id = ?", [userId, titleId]);
    return rows[0];
};

const findById = async (reviewId, viewerId = null) => {
    const [rows] = await db.execute(
        `SELECT ${REVIEW_COLUMNS}, ${TITLE_COLUMNS} ${viewerReactionColumn(viewerId)}
         FROM reviews rv ${REVIEW_JOINS} JOIN titles t ON t.id = rv.title_id
         WHERE rv.id = ?`,
        viewerId ? [viewerId, reviewId] : [reviewId]
    );
    return rows[0];
};

const upsert = async ({ userId, titleId, body, hasSpoilers }) => {
    const [result] = await db.execute(
        `INSERT INTO reviews (user_id, title_id, body, has_spoilers) VALUES (?, ?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(reviews.id), body = new.body,
            has_spoilers = new.has_spoilers,
            status = IF(reviews.status = 'REMOVED', 'PUBLISHED', reviews.status)`,
        [userId, titleId, body, hasSpoilers]
    );
    return { id: result.insertId, isNew: result.affectedRows === 1 };
};

const remove = async (reviewId) => {
    await db.execute("DELETE FROM reviews WHERE id = ?", [reviewId]);
};

const setStatus = async (reviewId, status) => {
    await db.execute("UPDATE reviews SET status = ? WHERE id = ?", [status, reviewId]);
};

const listForTitle = async (titleId, { sort, viewerId, limit, offset }) => {
    const params = viewerId ? [viewerId, titleId, viewerId] : [titleId];
    const [rows] = await db.execute(
        `SELECT ${REVIEW_COLUMNS} ${viewerReactionColumn(viewerId)}
         FROM reviews rv ${REVIEW_JOINS}
         WHERE rv.title_id = ? AND u.status = 'ACTIVE'
           AND (rv.status = 'PUBLISHED' ${viewerId ? "OR (rv.user_id = ? AND rv.status = 'HIDDEN')" : ""})
         ORDER BY ${REVIEW_SORTS[sort] || REVIEW_SORTS.popular}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM reviews rv JOIN users u ON u.id = rv.user_id
         WHERE rv.title_id = ? AND rv.status = 'PUBLISHED' AND u.status = 'ACTIVE'`,
        [titleId]
    );
    return { rows, total };
};

const listByUser = async (userId, { viewerId, sort = "recent", limit, offset }) => {
    const params = viewerId ? [viewerId, userId] : [userId];
    const [rows] = await db.execute(
        `SELECT ${REVIEW_COLUMNS}, ${TITLE_COLUMNS} ${viewerReactionColumn(viewerId)}
         FROM reviews rv ${REVIEW_JOINS} JOIN titles t ON t.id = rv.title_id
         WHERE rv.user_id = ? AND rv.status = 'PUBLISHED'
         ORDER BY ${REVIEW_SORTS[sort] || REVIEW_SORTS.recent}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM reviews WHERE user_id = ? AND status = 'PUBLISHED'",
        [userId]
    );
    return { rows, total };
};

const countPublishedByUser = async (userId) => {
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM reviews WHERE user_id = ? AND status = 'PUBLISHED'",
        [userId]
    );
    return total;
};

const PERIOD_DAYS = { week: 7, month: 30, year: 365 };

const listPopular = async ({ period, viewerId, limit, offset }) => {
    const since = PERIOD_DAYS[period] ? `AND rv.created_at > UTC_TIMESTAMP() - INTERVAL ${PERIOD_DAYS[period]} DAY` : "";
    const params = viewerId ? [viewerId] : [];
    const [rows] = await db.execute(
        `SELECT ${REVIEW_COLUMNS}, ${TITLE_COLUMNS} ${viewerReactionColumn(viewerId)}
         FROM reviews rv ${REVIEW_JOINS} JOIN titles t ON t.id = rv.title_id
         WHERE rv.status = 'PUBLISHED' AND u.status = 'ACTIVE' ${since}
         ORDER BY ${REVIEW_SORTS.popular}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM reviews rv JOIN users u ON u.id = rv.user_id
         WHERE rv.status = 'PUBLISHED' AND u.status = 'ACTIVE' ${since}`
    );
    return { rows, total };
};

// Reactions ----------------------------------------------------------------------------------

// Locks the review row so the counters stay exact under concurrent reactions. Returns the
// reaction that was replaced (or null) so the caller knows whether to notify.
const setReaction = async (reviewId, userId, reaction) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute("SELECT id FROM reviews WHERE id = ? FOR UPDATE", [reviewId]);

        const [[existing]] = await connection.execute(
            "SELECT reaction FROM review_reactions WHERE review_id = ? AND user_id = ?",
            [reviewId, userId]
        );
        const previous = existing?.reaction || null;

        if (previous !== reaction) {
            await connection.execute(
                `INSERT INTO review_reactions (user_id, review_id, reaction) VALUES (?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE reaction = new.reaction, created_at = CURRENT_TIMESTAMP`,
                [userId, reviewId, reaction]
            );
            await connection.execute(
                `UPDATE reviews SET
                    like_count = like_count + ? , dislike_count = dislike_count + ?
                 WHERE id = ?`,
                [
                    (reaction === "LIKE" ? 1 : 0) - (previous === "LIKE" ? 1 : 0),
                    (reaction === "DISLIKE" ? 1 : 0) - (previous === "DISLIKE" ? 1 : 0),
                    reviewId
                ]
            );
        }

        await connection.commit();
        return previous;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const clearReaction = async (reviewId, userId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute("SELECT id FROM reviews WHERE id = ? FOR UPDATE", [reviewId]);
        const [[existing]] = await connection.execute(
            "SELECT reaction FROM review_reactions WHERE review_id = ? AND user_id = ?",
            [reviewId, userId]
        );
        if (existing) {
            await connection.execute("DELETE FROM review_reactions WHERE review_id = ? AND user_id = ?", [reviewId, userId]);
            await connection.execute(
                `UPDATE reviews SET ${existing.reaction === "LIKE" ? "like_count = like_count - 1" : "dislike_count = dislike_count - 1"}
                 WHERE id = ?`,
                [reviewId]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

// Comments -----------------------------------------------------------------------------------

const COMMENT_COLUMNS = `
    c.id, c.review_id, c.user_id, c.body, c.status, c.created_at, c.updated_at,
    u.id AS author_id, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url
`;

const createComment = async ({ reviewId, userId, body }) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
            "INSERT INTO review_comments (review_id, user_id, body) VALUES (?, ?, ?)",
            [reviewId, userId, body]
        );
        await connection.execute("UPDATE reviews SET comment_count = comment_count + 1 WHERE id = ?", [reviewId]);
        await connection.commit();
        return result.insertId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const findComment = async (commentId) => {
    const [rows] = await db.execute(
        `SELECT ${COMMENT_COLUMNS} FROM review_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
        [commentId]
    );
    return rows[0];
};

// Visible comment counts only include published comments, so the counter moves with status.
const setCommentStatus = async (commentId, status) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[comment]] = await connection.execute(
            "SELECT review_id, status FROM review_comments WHERE id = ? FOR UPDATE",
            [commentId]
        );
        if (comment && comment.status !== status) {
            await connection.execute("UPDATE review_comments SET status = ? WHERE id = ?", [status, commentId]);
            const delta = (status === "PUBLISHED" ? 1 : 0) - (comment.status === "PUBLISHED" ? 1 : 0);
            if (delta) {
                await connection.execute(
                    "UPDATE reviews SET comment_count = GREATEST(CAST(comment_count AS SIGNED) + ?, 0) WHERE id = ?",
                    [delta, comment.review_id]
                );
            }
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const listComments = async (reviewId, { limit, offset }) => {
    const [rows] = await db.execute(
        `SELECT ${COMMENT_COLUMNS} FROM review_comments c JOIN users u ON u.id = c.user_id
         WHERE c.review_id = ? AND c.status = 'PUBLISHED' AND u.status = 'ACTIVE'
         ORDER BY c.created_at ASC, c.id ASC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [reviewId]
    );
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM review_comments WHERE review_id = ? AND status = 'PUBLISHED'",
        [reviewId]
    );
    return { rows, total };
};

module.exports = {
    findOwn,
    findById,
    upsert,
    remove,
    setStatus,
    listForTitle,
    listByUser,
    countPublishedByUser,
    listPopular,
    setReaction,
    clearReaction,
    createComment,
    findComment,
    setCommentStatus,
    listComments
};
