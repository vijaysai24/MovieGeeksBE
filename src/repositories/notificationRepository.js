const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

// Repeated likes from the same person on the same review should not stack up notifications.
const create = async ({ userId, type, actorId = null, titleId = null, entityId = null, message = null }) => {
    if (actorId && actorId === userId) return;

    const [existing] = await db.execute(
        `SELECT id FROM notifications
         WHERE user_id = ? AND type = ? AND actor_id <=> ? AND title_id <=> ? AND entity_id <=> ?
           AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
         LIMIT 1`,
        [userId, type, actorId, titleId, entityId]
    );
    if (existing.length) return;

    await db.execute(
        `INSERT INTO notifications (user_id, type, actor_id, title_id, entity_id, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, type, actorId, titleId, entityId, message ? message.slice(0, 255) : null]
    );
};

const createMany = async (rows) => {
    if (!rows.length) return;
    await db.query(
        "INSERT INTO notifications (user_id, type, actor_id, title_id, entity_id, message) VALUES ?",
        [rows.map((row) => [row.userId, row.type, row.actorId ?? null, row.titleId ?? null, row.entityId ?? null, row.message ?? null])]
    );
};

const list = async (userId, { unreadOnly, limit, offset }) => {
    const filter = unreadOnly ? "AND n.read_at IS NULL" : "";
    const [rows] = await db.execute(
        `SELECT n.id, n.type, n.entity_id, n.message, n.read_at, n.created_at,
                a.id AS author_id, a.name AS author_name, a.username AS author_username, a.avatar_url AS author_avatar_url,
                ${TITLE_COLUMNS}
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
         LEFT JOIN titles t ON t.id = n.title_id
         WHERE n.user_id = ? ${filter}
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [userId]
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM notifications n WHERE n.user_id = ? ${filter}`,
        [userId]
    );
    return { rows, total };
};

const unreadCount = async (userId) => {
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL",
        [userId]
    );
    return total;
};

const markRead = async (userId, ids) => {
    if (ids?.length) {
        await db.query(
            "UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND id IN (?) AND read_at IS NULL",
            [userId, ids]
        );
    } else {
        await db.execute(
            "UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL",
            [userId]
        );
    }
};

module.exports = {
    create,
    createMany,
    list,
    unreadCount,
    markRead
};
