const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

const PARTY_SELECT = `
    SELECT p.id, p.name, p.invite_code, p.owner_id, p.created_at,
           o.id AS author_id, o.name AS author_name, o.username AS author_username, o.avatar_url AS author_avatar_url,
           (SELECT COUNT(*) FROM watch_party_members m WHERE m.party_id = p.id) AS member_count,
           (SELECT COUNT(*) FROM watch_party_items i WHERE i.party_id = p.id) AS item_count
    FROM watch_parties p
    JOIN users o ON o.id = p.owner_id
`;

const create = async ({ ownerId, name, inviteCode }) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
            "INSERT INTO watch_parties (owner_id, name, invite_code) VALUES (?, ?, ?)",
            [ownerId, name, inviteCode]
        );
        await connection.execute(
            "INSERT INTO watch_party_members (party_id, user_id) VALUES (?, ?)",
            [result.insertId, ownerId]
        );
        await connection.commit();
        return result.insertId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const findById = async (partyId) => {
    const [rows] = await db.execute(`${PARTY_SELECT} WHERE p.id = ?`, [partyId]);
    return rows[0];
};

const findByCode = async (inviteCode) => {
    const [rows] = await db.execute(`${PARTY_SELECT} WHERE p.invite_code = ?`, [inviteCode]);
    return rows[0];
};

const codeExists = async (inviteCode) => {
    const [rows] = await db.execute("SELECT 1 FROM watch_parties WHERE invite_code = ?", [inviteCode]);
    return rows.length > 0;
};

const countOwned = async (userId) => {
    const [[{ total }]] = await db.execute("SELECT COUNT(*) AS total FROM watch_parties WHERE owner_id = ?", [userId]);
    return total;
};

const isMember = async (partyId, userId) => {
    const [rows] = await db.execute(
        "SELECT 1 FROM watch_party_members WHERE party_id = ? AND user_id = ?",
        [partyId, userId]
    );
    return rows.length > 0;
};

// Each party the member belongs to, with the title currently leading the vote.
const listForUser = async (userId) => {
    const [rows] = await db.execute(
        `${PARTY_SELECT}
         JOIN watch_party_members me ON me.party_id = p.id AND me.user_id = ?
         ORDER BY p.created_at DESC`,
        [userId]
    );
    return rows;
};

const members = async (partyId) => {
    const [rows] = await db.execute(
        `SELECT u.id, u.name, u.username, u.avatar_url, m.joined_at
         FROM watch_party_members m JOIN users u ON u.id = m.user_id
         WHERE m.party_id = ?
         ORDER BY m.joined_at`,
        [partyId]
    );
    return rows;
};

const memberIds = async (partyId) => (await members(partyId)).map((member) => member.id);

const addMember = async (partyId, userId) => {
    const [result] = await db.execute(
        "INSERT IGNORE INTO watch_party_members (party_id, user_id) VALUES (?, ?)",
        [partyId, userId]
    );
    return result.affectedRows === 1;
};

// A member who leaves takes their votes with them; the titles they added stay for the others.
const removeMember = async (partyId, userId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM watch_party_votes WHERE party_id = ? AND user_id = ?", [partyId, userId]);
        const [result] = await connection.execute(
            "DELETE FROM watch_party_members WHERE party_id = ? AND user_id = ?",
            [partyId, userId]
        );
        await connection.commit();
        return result.affectedRows === 1;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

// Most votes first; among equals, whatever was suggested first.
const items = async (partyId, viewerId) => {
    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, i.added_at,
                a.id AS author_id, a.name AS author_name, a.username AS author_username, a.avatar_url AS author_avatar_url,
                (SELECT COUNT(*) FROM watch_party_votes v WHERE v.party_id = i.party_id AND v.title_id = i.title_id) AS votes,
                EXISTS (SELECT 1 FROM watch_party_votes v WHERE v.party_id = i.party_id AND v.title_id = i.title_id AND v.user_id = ?) AS viewer_voted,
                (SELECT GROUP_CONCAT(vu.username ORDER BY v.created_at SEPARATOR ',')
                 FROM watch_party_votes v JOIN users vu ON vu.id = v.user_id
                 WHERE v.party_id = i.party_id AND v.title_id = i.title_id) AS voters
         FROM watch_party_items i
         JOIN titles t ON t.id = i.title_id
         LEFT JOIN users a ON a.id = i.added_by
         WHERE i.party_id = ?
         ORDER BY votes DESC, i.added_at ASC`,
        [viewerId, partyId]
    );
    return rows;
};

const findItem = async (partyId, titleId) => {
    const [rows] = await db.execute(
        "SELECT added_by FROM watch_party_items WHERE party_id = ? AND title_id = ?",
        [partyId, titleId]
    );
    return rows[0];
};

const addItem = async (partyId, titleId, userId) => {
    const [result] = await db.execute(
        "INSERT IGNORE INTO watch_party_items (party_id, title_id, added_by) VALUES (?, ?, ?)",
        [partyId, titleId, userId]
    );
    return result.affectedRows === 1;
};

const removeItem = async (partyId, titleId) => {
    await db.execute("DELETE FROM watch_party_items WHERE party_id = ? AND title_id = ?", [partyId, titleId]);
};

const vote = async (partyId, titleId, userId) => {
    await db.execute(
        "INSERT IGNORE INTO watch_party_votes (party_id, title_id, user_id) VALUES (?, ?, ?)",
        [partyId, titleId, userId]
    );
};

const unvote = async (partyId, titleId, userId) => {
    await db.execute(
        "DELETE FROM watch_party_votes WHERE party_id = ? AND title_id = ? AND user_id = ?",
        [partyId, titleId, userId]
    );
};

const rename = async (partyId, name) => {
    await db.execute("UPDATE watch_parties SET name = ? WHERE id = ?", [name, partyId]);
};

const setInviteCode = async (partyId, inviteCode) => {
    await db.execute("UPDATE watch_parties SET invite_code = ? WHERE id = ?", [inviteCode, partyId]);
};

const remove = async (partyId) => {
    await db.execute("DELETE FROM watch_parties WHERE id = ?", [partyId]);
};

// Common ground: titles already waiting on several members' own wishlists or watchlists.
const suggestions = async (partyId, minInterested) => {
    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, COUNT(DISTINCT q.user_id) AS interested,
                GROUP_CONCAT(DISTINCT u.username ORDER BY u.username SEPARATOR ',') AS interested_usernames
         FROM (
            SELECT user_id, title_id FROM wishlist_items
            UNION
            SELECT user_id, title_id FROM watch_statuses WHERE status = 'PLAN_TO_WATCH'
         ) q
         JOIN watch_party_members m ON m.user_id = q.user_id AND m.party_id = ?
         JOIN users u ON u.id = q.user_id
         JOIN titles t ON t.id = q.title_id
         WHERE q.title_id NOT IN (SELECT title_id FROM watch_party_items WHERE party_id = ?)
         GROUP BY t.id
         HAVING interested >= ?
         ORDER BY interested DESC, t.popularity DESC
         LIMIT 20`,
        [partyId, partyId, minInterested]
    );
    return rows;
};

module.exports = {
    create,
    findById,
    findByCode,
    codeExists,
    countOwned,
    isMember,
    listForUser,
    members,
    memberIds,
    addMember,
    removeMember,
    items,
    findItem,
    addItem,
    removeItem,
    vote,
    unvote,
    rename,
    setInviteCode,
    remove,
    suggestions
};
