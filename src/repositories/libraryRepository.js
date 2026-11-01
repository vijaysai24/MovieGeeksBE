const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

// State ----------------------------------------------------------------------------------------

const getState = async (userId, titleId) => {
    const [rows] = await db.execute(
        `SELECT
            (SELECT status FROM watch_statuses WHERE user_id = ? AND title_id = ?) AS status,
            (SELECT rating FROM ratings WHERE user_id = ? AND title_id = ?) AS rating,
            EXISTS (SELECT 1 FROM wishlist_items WHERE user_id = ? AND title_id = ?) AS wishlisted,
            EXISTS (SELECT 1 FROM favorite_titles WHERE user_id = ? AND title_id = ?) AS favorite,
            (SELECT position FROM top_titles WHERE user_id = ? AND title_id = ?) AS top_five_position,
            (SELECT COUNT(*) FROM diary_entries WHERE user_id = ? AND title_id = ?) AS diary_count,
            (SELECT MAX(watched_on) FROM diary_entries WHERE user_id = ? AND title_id = ?) AS last_watched_on,
            (SELECT id FROM reviews WHERE user_id = ? AND title_id = ? AND status <> 'REMOVED') AS review_id`,
        Array(8).fill([userId, titleId]).flat()
    );
    return rows[0];
};

const getAlertTypes = async (userId, titleId) => {
    const [rows] = await db.execute(
        "SELECT alert_type FROM title_alerts WHERE user_id = ? AND title_id = ? AND notified_at IS NULL",
        [userId, titleId]
    );
    return rows.map((row) => row.alert_type);
};

const getStatus = async (userId, titleId) => {
    const [rows] = await db.execute(
        "SELECT status FROM watch_statuses WHERE user_id = ? AND title_id = ?",
        [userId, titleId]
    );
    return rows[0]?.status || null;
};

// Watch status -----------------------------------------------------------------------------

const setStatus = async (userId, titleId, status) => {
    await db.execute(
        `INSERT INTO watch_statuses (user_id, title_id, status) VALUES (?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE status = new.status`,
        [userId, titleId, status]
    );
};

const clearStatus = async (userId, titleId) => {
    await db.execute("DELETE FROM watch_statuses WHERE user_id = ? AND title_id = ?", [userId, titleId]);
};

const LIBRARY_SORTS = {
    recent: "ws.updated_at DESC",
    title: "t.title ASC",
    release: "t.release_date DESC",
    rating: "r.rating DESC, ws.updated_at DESC"
};

const listByStatus = async (userId, { status, mediaType, sort = "recent", limit, offset }) => {
    const params = [userId, status];
    let filter = "";
    if (mediaType) {
        filter = "AND t.media_type = ?";
        params.push(mediaType);
    }

    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, ws.status, ws.updated_at, r.rating AS user_rating
         FROM watch_statuses ws
         JOIN titles t ON t.id = ws.title_id
         LEFT JOIN ratings r ON r.user_id = ws.user_id AND r.title_id = ws.title_id
         WHERE ws.user_id = ? AND ws.status = ? ${filter}
         ORDER BY ${LIBRARY_SORTS[sort] || LIBRARY_SORTS.recent}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );

    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM watch_statuses ws JOIN titles t ON t.id = ws.title_id
         WHERE ws.user_id = ? AND ws.status = ? ${filter}`,
        params
    );

    return { rows, total };
};

// Ratings ------------------------------------------------------------------------------------

const setRating = async (userId, titleId, rating) => {
    await db.execute(
        `INSERT INTO ratings (user_id, title_id, rating) VALUES (?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE rating = new.rating`,
        [userId, titleId, rating]
    );
};

const clearRating = async (userId, titleId) => {
    await db.execute("DELETE FROM ratings WHERE user_id = ? AND title_id = ?", [userId, titleId]);
};

const RATING_SORTS = {
    recent: "r.updated_at DESC",
    highest: "r.rating DESC, r.updated_at DESC",
    lowest: "r.rating ASC, r.updated_at DESC",
    title: "t.title ASC"
};

const listRatings = async (userId, { rating, sort = "recent", limit, offset }) => {
    const params = [userId];
    let filter = "";
    if (rating) {
        filter = "AND r.rating = ?";
        params.push(rating);
    }

    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, r.rating AS user_rating, r.updated_at
         FROM ratings r JOIN titles t ON t.id = r.title_id
         WHERE r.user_id = ? ${filter}
         ORDER BY ${RATING_SORTS[sort] || RATING_SORTS.recent}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM ratings r WHERE r.user_id = ? ${filter}`,
        params
    );
    return { rows, total };
};

// Wishlist and favourites ------------------------------------------------------------------

const addToSet = (table) => async (userId, titleId) => {
    await db.execute(`INSERT IGNORE INTO ${table} (user_id, title_id) VALUES (?, ?)`, [userId, titleId]);
};

const removeFromSet = (table) => async (userId, titleId) => {
    await db.execute(`DELETE FROM ${table} WHERE user_id = ? AND title_id = ?`, [userId, titleId]);
};

const SET_SORTS = {
    recent: "s.created_at DESC",
    title: "t.title ASC",
    release: "t.release_date IS NULL, t.release_date ASC"
};

const listSet = (table) => async (userId, { mediaType, sort = "recent", limit, offset }) => {
    const params = [userId];
    let filter = "";
    if (mediaType) {
        filter = "AND t.media_type = ?";
        params.push(mediaType);
    }

    const [rows] = await db.execute(
        `SELECT ${TITLE_COLUMNS}, s.created_at AS added_at, r.rating AS user_rating
         FROM ${table} s
         JOIN titles t ON t.id = s.title_id
         LEFT JOIN ratings r ON r.user_id = s.user_id AND r.title_id = s.title_id
         WHERE s.user_id = ? ${filter}
         ORDER BY ${SET_SORTS[sort] || SET_SORTS.recent}
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM ${table} s JOIN titles t ON t.id = s.title_id WHERE s.user_id = ? ${filter}`,
        params
    );
    return { rows, total };
};

const addManyToWishlist = async (userId, titleIds) => {
    if (!titleIds.length) return 0;
    const [result] = await db.query(
        "INSERT IGNORE INTO wishlist_items (user_id, title_id) VALUES ?",
        [titleIds.map((titleId) => [userId, titleId])]
    );
    return result.affectedRows;
};

// Diary --------------------------------------------------------------------------------------

const createDiaryEntry = async ({ userId, titleId, watchedOn, rating, isRewatch, note }) => {
    const [result] = await db.execute(
        `INSERT INTO diary_entries (user_id, title_id, watched_on, rating, is_rewatch, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, titleId, watchedOn, rating ?? null, Boolean(isRewatch), note || null]
    );
    return result.insertId;
};

const findDiaryEntry = async (userId, entryId) => {
    const [rows] = await db.execute(
        `SELECT d.*, ${TITLE_COLUMNS}
         FROM diary_entries d JOIN titles t ON t.id = d.title_id
         WHERE d.id = ? AND d.user_id = ?`,
        [entryId, userId]
    );
    return rows[0];
};

const DIARY_COLUMNS = {
    watchedOn: "watched_on",
    rating: "rating",
    isRewatch: "is_rewatch",
    note: "note"
};

const updateDiaryEntry = async (userId, entryId, changes) => {
    const entries = Object.entries(changes).filter(([key, value]) => DIARY_COLUMNS[key] && value !== undefined);
    if (!entries.length) return;
    await db.execute(
        `UPDATE diary_entries SET ${entries.map(([key]) => `${DIARY_COLUMNS[key]} = ?`).join(", ")}
         WHERE id = ? AND user_id = ?`,
        [...entries.map(([, value]) => value), entryId, userId]
    );
};

const deleteDiaryEntry = async (userId, entryId) => {
    const [result] = await db.execute("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", [entryId, userId]);
    return result.affectedRows === 1;
};

const countDiaryEntriesForTitle = async (userId, titleId) => {
    const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM diary_entries WHERE user_id = ? AND title_id = ?",
        [userId, titleId]
    );
    return total;
};

const listDiary = async (userId, { year, limit, offset }) => {
    const params = [userId];
    let filter = "";
    if (year) {
        filter = "AND d.watched_on BETWEEN ? AND ?";
        params.push(`${year}-01-01`, `${year}-12-31`);
    }

    const [rows] = await db.execute(
        `SELECT d.id AS entry_id, d.watched_on, d.rating AS entry_rating, d.is_rewatch, d.note,
                d.created_at AS logged_at, ${TITLE_COLUMNS}
         FROM diary_entries d JOIN titles t ON t.id = d.title_id
         WHERE d.user_id = ? ${filter}
         ORDER BY d.watched_on DESC, d.id DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM diary_entries d WHERE d.user_id = ? ${filter}`,
        params
    );
    return { rows, total };
};

const diaryYears = async (userId) => {
    const [rows] = await db.execute(
        `SELECT YEAR(watched_on) AS year, COUNT(*) AS entries
         FROM diary_entries WHERE user_id = ? GROUP BY YEAR(watched_on) ORDER BY year DESC`,
        [userId]
    );
    return rows;
};

// Top five -----------------------------------------------------------------------------------

const getTopFive = async (userId) => {
    const [rows] = await db.execute(
        `SELECT tt.position, ${TITLE_COLUMNS}
         FROM top_titles tt JOIN titles t ON t.id = tt.title_id
         WHERE tt.user_id = ? ORDER BY tt.position`,
        [userId]
    );
    return rows;
};

const replaceTopFive = async (userId, titleIds) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM top_titles WHERE user_id = ?", [userId]);
        if (titleIds.length) {
            await connection.query(
                "INSERT INTO top_titles (user_id, position, title_id) VALUES ?",
                [titleIds.map((titleId, index) => [userId, index + 1, titleId])]
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

// Counts -------------------------------------------------------------------------------------

const getCounts = async (userId) => {
    const [rows] = await db.execute(
        `SELECT
            (SELECT COUNT(*) FROM wishlist_items WHERE user_id = ?) AS wishlist,
            (SELECT COUNT(*) FROM watch_statuses WHERE user_id = ? AND status = 'PLAN_TO_WATCH') AS plan_to_watch,
            (SELECT COUNT(*) FROM watch_statuses WHERE user_id = ? AND status = 'WATCHING') AS watching,
            (SELECT COUNT(*) FROM watch_statuses WHERE user_id = ? AND status = 'WATCHED') AS watched,
            (SELECT COUNT(*) FROM favorite_titles WHERE user_id = ?) AS favorites,
            (SELECT COUNT(*) FROM ratings WHERE user_id = ?) AS ratings,
            (SELECT COUNT(*) FROM diary_entries WHERE user_id = ?) AS diary`,
        Array(7).fill(userId)
    );
    return rows[0];
};

module.exports = {
    getState,
    getAlertTypes,
    getStatus,
    setStatus,
    clearStatus,
    listByStatus,
    setRating,
    clearRating,
    listRatings,
    addToWishlist: addToSet("wishlist_items"),
    removeFromWishlist: removeFromSet("wishlist_items"),
    listWishlist: listSet("wishlist_items"),
    addManyToWishlist,
    addFavorite: addToSet("favorite_titles"),
    removeFavorite: removeFromSet("favorite_titles"),
    listFavorites: listSet("favorite_titles"),
    createDiaryEntry,
    findDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry,
    countDiaryEntriesForTitle,
    listDiary,
    diaryYears,
    getTopFive,
    replaceTopFive,
    getCounts
};
