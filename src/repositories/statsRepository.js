const db = require("../config/db");

// "Seen" means finished, or a series currently being watched.
const SEEN = "ws.user_id = ? AND ws.status IN ('WATCHED', 'WATCHING')";

const totals = async (userId) => {
    const [[row]] = await db.execute(
        `SELECT
            SUM(t.media_type = 'movie') AS movies,
            SUM(t.media_type = 'tv') AS series,
            COALESCE(SUM(CASE WHEN t.media_type = 'movie' THEN t.runtime END), 0) AS movie_minutes,
            AVG(CASE WHEN t.media_type = 'movie' AND t.tmdb_vote_count IS NOT NULL THEN t.tmdb_vote_count < 2000 END) AS lesser_known_share
         FROM watch_statuses ws JOIN titles t ON t.id = ws.title_id
         WHERE ${SEEN}`,
        [userId]
    );
    return row;
};

const ratingSummary = async (userId) => {
    const [[row]] = await db.execute(
        `SELECT COUNT(*) AS count, AVG(r.rating) AS average,
                AVG(CASE WHEN t.tmdb_rating IS NOT NULL THEN r.rating - t.tmdb_rating END) AS versus_tmdb,
                SUM(r.rating = 1) AS r1, SUM(r.rating = 2) AS r2, SUM(r.rating = 3) AS r3, SUM(r.rating = 4) AS r4,
                SUM(r.rating = 5) AS r5, SUM(r.rating = 6) AS r6, SUM(r.rating = 7) AS r7, SUM(r.rating = 8) AS r8,
                SUM(r.rating = 9) AS r9, SUM(r.rating = 10) AS r10
         FROM ratings r JOIN titles t ON t.id = r.title_id
         WHERE r.user_id = ?`,
        [userId]
    );
    return row;
};

const topGenres = async (userId, limit = 10) => {
    const [rows] = await db.execute(
        `SELECT g.id, g.name, COUNT(*) AS titles, AVG(r.rating) AS average_rating
         FROM watch_statuses ws
         JOIN title_genres tg ON tg.title_id = ws.title_id
         JOIN genres g ON g.id = tg.genre_id
         LEFT JOIN ratings r ON r.user_id = ws.user_id AND r.title_id = ws.title_id
         WHERE ${SEEN}
         GROUP BY g.id, g.name
         ORDER BY titles DESC, average_rating DESC
         LIMIT ${Number(limit)}`,
        [userId]
    );
    return rows;
};

// Directors and series creators together, or the top-billed cast.
const topPeople = async (userId, kind, limit = 8) => {
    const creditFilter = kind === "cast"
        ? "tc.credit_type = 'CAST' AND tc.sort_order < 5"
        : "tc.credit_type IN ('DIRECTOR', 'CREATOR')";

    const [rows] = await db.execute(
        `SELECT p.id, p.name, p.profile_path, COUNT(DISTINCT ws.title_id) AS titles, AVG(r.rating) AS average_rating
         FROM watch_statuses ws
         JOIN title_credits tc ON tc.title_id = ws.title_id AND ${creditFilter}
         JOIN people p ON p.id = tc.person_id
         LEFT JOIN ratings r ON r.user_id = ws.user_id AND r.title_id = ws.title_id
         WHERE ${SEEN}
         GROUP BY p.id, p.name, p.profile_path
         HAVING titles >= 2 OR average_rating >= 9
         ORDER BY titles DESC, average_rating DESC
         LIMIT ${Number(limit)}`,
        [userId]
    );
    return rows;
};

const languages = async (userId) => {
    const [rows] = await db.execute(
        `SELECT t.original_language AS code, COUNT(*) AS titles
         FROM watch_statuses ws JOIN titles t ON t.id = ws.title_id
         WHERE ${SEEN} AND t.original_language IS NOT NULL
         GROUP BY t.original_language
         ORDER BY titles DESC`,
        [userId]
    );
    return rows;
};

const releaseYears = async (userId) => {
    const [rows] = await db.execute(
        `SELECT YEAR(t.release_date) AS year
         FROM watch_statuses ws JOIN titles t ON t.id = ws.title_id
         WHERE ${SEEN} AND t.release_date IS NOT NULL`,
        [userId]
    );
    return rows.map((row) => row.year);
};

const diaryByMonth = async (userId, year) => {
    const [rows] = await db.execute(
        `SELECT MONTH(watched_on) AS month, COUNT(*) AS entries, SUM(is_rewatch) AS rewatches
         FROM diary_entries
         WHERE user_id = ? AND watched_on BETWEEN ? AND ?
         GROUP BY MONTH(watched_on)`,
        [userId, `${year}-01-01`, `${year}-12-31`]
    );
    return rows;
};

const diaryByYear = async (userId) => {
    const [rows] = await db.execute(
        `SELECT YEAR(watched_on) AS year, COUNT(*) AS entries
         FROM diary_entries WHERE user_id = ?
         GROUP BY YEAR(watched_on) ORDER BY year`,
        [userId]
    );
    return rows;
};

const mostRewatched = async (userId, limit = 5) => {
    const [rows] = await db.execute(
        `SELECT t.tmdb_id, t.media_type, t.title, t.poster_path, t.backdrop_path, t.release_date, t.runtime,
                t.original_title, t.original_language, t.tmdb_rating, t.id AS title_id, COUNT(*) AS viewings
         FROM diary_entries d JOIN titles t ON t.id = d.title_id
         WHERE d.user_id = ?
         GROUP BY t.id
         HAVING viewings > 1
         ORDER BY viewings DESC, MAX(d.watched_on) DESC
         LIMIT ${Number(limit)}`,
        [userId]
    );
    return rows;
};

// Every title a user has any relationship with, for excluding from recommendations and picks.
const knownTitleRefs = async (userId) => {
    const [rows] = await db.execute(
        `SELECT t.media_type, t.tmdb_id FROM titles t
         WHERE t.id IN (
            SELECT title_id FROM watch_statuses WHERE user_id = ?
            UNION SELECT title_id FROM ratings WHERE user_id = ?
            UNION SELECT title_id FROM wishlist_items WHERE user_id = ?
         )`,
        [userId, userId, userId]
    );
    return rows;
};

// Seeds for recommendations: the user's top five, their highest ratings and recent viewings.
const recommendationSeeds = async (userId) => {
    const [rows] = await db.execute(
        `SELECT t.media_type, t.tmdb_id, t.title, MAX(seed.weight) AS weight
         FROM (
            SELECT title_id, 1.6 AS weight FROM top_titles WHERE user_id = ?
            UNION ALL
            SELECT title_id, (rating - 5) / 3.3 AS weight FROM ratings WHERE user_id = ? AND rating >= 7
            UNION ALL
            SELECT title_id, 0.8 AS weight FROM diary_entries
            WHERE user_id = ? AND watched_on > UTC_DATE() - INTERVAL 60 DAY
            UNION ALL
            SELECT title_id, 0.6 AS weight FROM favorite_titles WHERE user_id = ?
         ) seed
         JOIN titles t ON t.id = seed.title_id
         GROUP BY t.id, t.media_type, t.tmdb_id, t.title
         ORDER BY weight DESC
         LIMIT 10`,
        [userId, userId, userId, userId]
    );
    return rows.map((row) => ({ ...row, weight: Number(row.weight) }));
};

const ratingsForComparison = async (userId) => {
    const [rows] = await db.execute(
        `SELECT r.title_id, r.rating, t.tmdb_id, t.media_type, t.title, t.poster_path, t.backdrop_path,
                t.release_date, t.runtime, t.original_title, t.original_language, t.tmdb_rating
         FROM ratings r JOIN titles t ON t.id = r.title_id
         WHERE r.user_id = ?`,
        [userId]
    );
    return rows;
};

const genrePreferences = async (userId) => {
    const [rows] = await db.execute(
        `SELECT g.id, g.name FROM user_genre_preferences p JOIN genres g ON g.id = p.genre_id
         WHERE p.user_id = ? ORDER BY g.name`,
        [userId]
    );
    return rows;
};

const replaceGenrePreferences = async (userId, genres) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (genres.length) {
            await connection.query(
                "INSERT INTO genres (id, name) VALUES ? AS new ON DUPLICATE KEY UPDATE name = new.name",
                [genres.map((genre) => [genre.id, genre.name])]
            );
        }
        await connection.execute("DELETE FROM user_genre_preferences WHERE user_id = ?", [userId]);
        if (genres.length) {
            await connection.query(
                "INSERT INTO user_genre_preferences (user_id, genre_id) VALUES ?",
                [genres.map((genre) => [userId, genre.id])]
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

module.exports = {
    totals,
    ratingSummary,
    topGenres,
    topPeople,
    languages,
    releaseYears,
    diaryByMonth,
    diaryByYear,
    mostRewatched,
    knownTitleRefs,
    recommendationSeeds,
    ratingsForComparison,
    genrePreferences,
    replaceGenrePreferences
};
