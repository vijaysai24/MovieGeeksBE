const db = require("../config/db");

const record = async ({ userId, type, titleId = null, targetId = null, rating = null }) => {
    await db.execute(
        "INSERT INTO activities (user_id, type, title_id, target_id, rating) VALUES (?, ?, ?, ?, ?)",
        [userId, type, titleId, targetId, rating]
    );
};

// Re-rating a film five times in a row should not post five feed items.
const replaceRecent = async ({ userId, type, titleId, rating = null, targetId = null }) => {
    await db.execute(
        `DELETE FROM activities
         WHERE user_id = ? AND type = ? AND title_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY`,
        [userId, type, titleId]
    );
    await record({ userId, type, titleId, rating, targetId });
};

const removeForTitle = async (userId, type, titleId) => {
    await db.execute(
        "DELETE FROM activities WHERE user_id = ? AND type = ? AND title_id = ?",
        [userId, type, titleId]
    );
};

const removeForTarget = async (userId, type, targetId) => {
    await db.execute(
        "DELETE FROM activities WHERE user_id = ? AND type = ? AND target_id = ?",
        [userId, type, targetId]
    );
};

module.exports = {
    record,
    replaceRecent,
    removeForTitle,
    removeForTarget
};
