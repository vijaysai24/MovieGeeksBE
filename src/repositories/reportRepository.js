const db = require("../config/db");

const create = async ({ reporterId, targetType, targetId, reason, details }) => {
    const [result] = await db.execute(
        `INSERT IGNORE INTO reports (reporter_id, target_type, target_id, reason, details)
         VALUES (?, ?, ?, ?, ?)`,
        [reporterId, targetType, targetId, reason, details || null]
    );
    return result.affectedRows === 1;
};

const openCountForTarget = async (targetType, targetId) => {
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM reports WHERE target_type = ? AND target_id = ? AND status = 'OPEN'",
        [targetType, targetId]
    );
    return total;
};

// One row per reported item, newest report first, with what was reported.
const listGrouped = async ({ status, limit, offset }) => {
    const [rows] = await db.execute(
        `SELECT g.target_type, g.target_id, g.report_count, g.reasons, g.last_reported_at,
                COALESCE(rv.body, c.body) AS content,
                COALESCE(rv.status, c.status) AS content_status,
                COALESCE(rv.has_spoilers, FALSE) AS has_spoilers,
                au.id AS author_id, au.name AS author_name, au.username AS author_username, au.avatar_url AS author_avatar_url,
                COALESCE(rv.title_id, crv.title_id) AS content_title_id,
                t.tmdb_id, t.media_type, t.title
         FROM (
            SELECT target_type, target_id, COUNT(*) AS report_count,
                   GROUP_CONCAT(DISTINCT reason ORDER BY reason) AS reasons,
                   MAX(created_at) AS last_reported_at
            FROM reports WHERE status = ?
            GROUP BY target_type, target_id
         ) g
         LEFT JOIN reviews rv ON g.target_type = 'REVIEW' AND rv.id = g.target_id
         LEFT JOIN review_comments c ON g.target_type = 'COMMENT' AND c.id = g.target_id
         LEFT JOIN reviews crv ON crv.id = c.review_id
         LEFT JOIN users au ON au.id = COALESCE(rv.user_id, c.user_id)
         LEFT JOIN titles t ON t.id = COALESCE(rv.title_id, crv.title_id)
         ORDER BY g.report_count DESC, g.last_reported_at DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [status]
    );
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(DISTINCT target_type, target_id) AS total FROM reports WHERE status = ?",
        [status]
    );
    return { rows, total };
};

const listDetails = async (targetType, targetId) => {
    const [rows] = await db.execute(
        `SELECT r.id, r.reason, r.details, r.status, r.created_at,
                u.username AS reporter_username
         FROM reports r JOIN users u ON u.id = r.reporter_id
         WHERE r.target_type = ? AND r.target_id = ?
         ORDER BY r.created_at DESC`,
        [targetType, targetId]
    );
    return rows;
};

const resolveTarget = async (targetType, targetId, status, moderatorId) => {
    const [result] = await db.execute(
        `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP()
         WHERE target_type = ? AND target_id = ? AND status = 'OPEN'`,
        [status, moderatorId, targetType, targetId]
    );
    return result.affectedRows;
};

module.exports = {
    create,
    openCountForTarget,
    listGrouped,
    listDetails,
    resolveTarget
};
