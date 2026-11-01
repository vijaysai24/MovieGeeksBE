const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

// A list row with its owner, size and its posters in order (the service keeps the first four for
// the cover; GROUP_CONCAT truncates long lists at the end, which only ever drops later posters).
const COLLECTION_SELECT = `
    SELECT c.id, c.user_id, c.name, c.description, c.is_public, c.is_ranked, c.created_at, c.updated_at,
           u.id AS author_id, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
           (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count,
           (SELECT GROUP_CONCAT(t.poster_path ORDER BY ci.position SEPARATOR '|')
            FROM collection_items ci JOIN titles t ON t.id = ci.title_id
            WHERE ci.collection_id = c.id AND t.poster_path IS NOT NULL) AS cover_posters
    FROM collections c
    JOIN users u ON u.id = c.user_id
`;

const create = async ({ userId, name, description, isPublic, isRanked }) => {
    const [result] = await db.execute(
        "INSERT INTO collections (user_id, name, description, is_public, is_ranked) VALUES (?, ?, ?, ?, ?)",
        [userId, name, description || null, isPublic, isRanked]
    );
    return result.insertId;
};

const COLUMNS = {
    name: "name",
    description: "description",
    isPublic: "is_public",
    isRanked: "is_ranked"
};

const update = async (collectionId, changes) => {
    const entries = Object.entries(changes).filter(([key, value]) => COLUMNS[key] && value !== undefined);
    if (!entries.length) return;
    await db.execute(
        `UPDATE collections SET ${entries.map(([key]) => `${COLUMNS[key]} = ?`).join(", ")} WHERE id = ?`,
        [...entries.map(([, value]) => value), collectionId]
    );
};

const remove = async (collectionId) => {
    await db.execute("DELETE FROM collections WHERE id = ?", [collectionId]);
};

const findById = async (collectionId) => {
    const [rows] = await db.execute(`${COLLECTION_SELECT} WHERE c.id = ?`, [collectionId]);
    return rows[0];
};

const countForUser = async (userId) => {
    const [[{ total }]] = await db.execute("SELECT COUNT(*) AS total FROM collections WHERE user_id = ?", [userId]);
    return total;
};

const listForUser = async (userId, { includePrivate, containingTitleId, limit, offset }) => {
    const containing = containingTitleId
        ? ", EXISTS (SELECT 1 FROM collection_items x WHERE x.collection_id = c.id AND x.title_id = ?) AS contains_title"
        : "";
    const visibility = includePrivate ? "" : "AND c.is_public = TRUE";
    const params = containingTitleId ? [containingTitleId, userId] : [userId];

    const [rows] = await db.execute(
        `SELECT * FROM (${COLLECTION_SELECT.replace("FROM collections c", `${containing} FROM collections c`)}
         WHERE c.user_id = ? ${visibility}) listed
         ORDER BY updated_at DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM collections c WHERE c.user_id = ? ${visibility}`,
        [userId]
    );
    return { rows, total };
};

// Public lists with at least one title, newest activity first.
const listPublic = async ({ limit, offset }) => {
    const [rows] = await db.execute(
        `${COLLECTION_SELECT}
         WHERE c.is_public = TRUE AND u.status = 'ACTIVE'
           AND EXISTS (SELECT 1 FROM collection_items ci WHERE ci.collection_id = c.id)
         ORDER BY c.updated_at DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM collections c JOIN users u ON u.id = c.user_id
         WHERE c.is_public = TRUE AND u.status = 'ACTIVE'
           AND EXISTS (SELECT 1 FROM collection_items ci WHERE ci.collection_id = c.id)`
    );
    return { rows, total };
};

const listItems = async (collectionId, { limit, offset }) => {
    const [rows] = await db.execute(
        `SELECT ci.position, ci.note, ci.added_at, ${TITLE_COLUMNS}
         FROM collection_items ci JOIN titles t ON t.id = ci.title_id
         WHERE ci.collection_id = ?
         ORDER BY ci.position, ci.added_at
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [collectionId]
    );
    return rows;
};

const addItem = async (collectionId, titleId, note) => {
    const [result] = await db.execute(
        `INSERT IGNORE INTO collection_items (collection_id, title_id, position, note)
         SELECT ?, ?, COALESCE(MAX(position), 0) + 1, ? FROM collection_items WHERE collection_id = ?`,
        [collectionId, titleId, note || null, collectionId]
    );
    await touch(collectionId);
    return result.affectedRows === 1;
};

const updateItemNote = async (collectionId, titleId, note) => {
    const [result] = await db.execute(
        "UPDATE collection_items SET note = ? WHERE collection_id = ? AND title_id = ?",
        [note || null, collectionId, titleId]
    );
    return result.affectedRows === 1;
};

const removeItem = async (collectionId, titleId) => {
    const [result] = await db.execute(
        "DELETE FROM collection_items WHERE collection_id = ? AND title_id = ?",
        [collectionId, titleId]
    );
    await touch(collectionId);
    return result.affectedRows === 1;
};

// Positions are rewritten in one transaction so a ranked list is never half reordered.
const reorder = async (collectionId, titleIds) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const [index, titleId] of titleIds.entries()) {
            await connection.execute(
                "UPDATE collection_items SET position = ? WHERE collection_id = ? AND title_id = ?",
                [index + 1, collectionId, titleId]
            );
        }
        await connection.execute("UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [collectionId]);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const itemTitleIds = async (collectionId) => {
    const [rows] = await db.execute("SELECT title_id FROM collection_items WHERE collection_id = ?", [collectionId]);
    return rows.map((row) => row.title_id);
};

const touch = async (collectionId) => {
    await db.execute("UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [collectionId]);
};

module.exports = {
    create,
    update,
    remove,
    findById,
    countForUser,
    listForUser,
    listPublic,
    listItems,
    addItem,
    updateItemNote,
    removeItem,
    reorder,
    itemTitleIds
};
