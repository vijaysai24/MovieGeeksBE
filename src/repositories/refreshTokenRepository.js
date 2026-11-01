const db = require("../config/db");

const create = async ({ userId, tokenHash, familyId, expiresAt, userAgent }) => {
    await db.execute(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, tokenHash, familyId, expiresAt, userAgent]
    );
};

const findByHash = async (tokenHash) => {
    const [rows] = await db.execute(
        "SELECT * FROM refresh_tokens WHERE token_hash = ?",
        [tokenHash]
    );
    return rows[0];
};

// Returns true only for the caller that actually revoked it, so two concurrent refreshes with
// the same token cannot both succeed.
const revoke = async (id) => {
    const [result] = await db.execute(
        "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL",
        [id]
    );
    return result.affectedRows === 1;
};

const hasActiveInFamily = async (familyId) => {
    const [rows] = await db.execute(
        "SELECT 1 FROM refresh_tokens WHERE family_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1",
        [familyId]
    );
    return rows.length > 0;
};

const revokeFamily = async (familyId) => {
    await db.execute(
        "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE family_id = ? AND revoked_at IS NULL",
        [familyId]
    );
};

const revokeAllForUser = async (userId) => {
    await db.execute(
        "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL",
        [userId]
    );
};

const deleteExpired = async () => {
    const [result] = await db.execute(
        "DELETE FROM refresh_tokens WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 7 DAY"
    );
    return result.affectedRows;
};

module.exports = {
    create,
    findByHash,
    revoke,
    hasActiveInFamily,
    revokeFamily,
    revokeAllForUser,
    deleteExpired
};
