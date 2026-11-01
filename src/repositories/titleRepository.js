const db = require("../config/db");

const CAST_LIMIT = 8;

const findByTmdb = async (mediaType, tmdbId) => {
    const [rows] = await db.execute(
        "SELECT id, synced_at FROM titles WHERE media_type = ? AND tmdb_id = ?",
        [mediaType, tmdbId]
    );
    return rows[0];
};

const findIdsByTmdb = async (refs) => {
    if (!refs.length) return [];
    const [rows] = await db.query(
        "SELECT id, tmdb_id, media_type FROM titles WHERE (media_type, tmdb_id) IN (?)",
        [refs.map((ref) => [ref.mediaType, ref.tmdbId])]
    );
    return rows;
};

const validDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : null);

// Upserts the snapshot of one title with its genres and key credits, atomically.
const upsertSnapshot = async (details) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.execute(
            `INSERT INTO titles
                (tmdb_id, media_type, title, original_title, poster_path, backdrop_path, release_date,
                 runtime, original_language, popularity, tmdb_rating, tmdb_vote_count, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP()) AS new
             ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(titles.id),
                title = new.title, original_title = new.original_title, poster_path = new.poster_path,
                backdrop_path = new.backdrop_path, release_date = new.release_date, runtime = new.runtime,
                original_language = new.original_language, popularity = new.popularity,
                tmdb_rating = new.tmdb_rating, tmdb_vote_count = new.tmdb_vote_count, synced_at = new.synced_at`,
            [
                details.id,
                details.mediaType,
                details.title.slice(0, 255),
                details.originalTitle ? details.originalTitle.slice(0, 255) : null,
                details.posterPath,
                details.backdropPath,
                validDate(details.releaseDate),
                details.runtime || null,
                details.originalLanguage,
                details.popularity || null,
                details.rating,
                details.voteCount || 0
            ]
        );
        const titleId = result.insertId;

        if (details.genres.length) {
            await connection.query(
                "INSERT INTO genres (id, name) VALUES ? AS new ON DUPLICATE KEY UPDATE name = new.name",
                [details.genres.map((genre) => [genre.id, genre.name])]
            );
        }
        await connection.execute("DELETE FROM title_genres WHERE title_id = ?", [titleId]);
        if (details.genres.length) {
            await connection.query(
                "INSERT INTO title_genres (title_id, genre_id) VALUES ?",
                [details.genres.map((genre) => [titleId, genre.id])]
            );
        }

        const credits = [
            ...details.crew.directors.map((person, index) => ({ person, type: "DIRECTOR", order: index })),
            ...details.crew.creators.map((person, index) => ({ person, type: "CREATOR", order: index })),
            ...details.cast.slice(0, CAST_LIMIT).map((person, index) => ({ person, type: "CAST", order: index }))
        ];

        await connection.execute("DELETE FROM title_credits WHERE title_id = ?", [titleId]);
        if (credits.length) {
            const people = [...new Map(credits.map(({ person }) => [person.id, person])).values()];
            await connection.query(
                `INSERT INTO people (id, name, profile_path) VALUES ? AS new
                 ON DUPLICATE KEY UPDATE name = new.name, profile_path = new.profile_path`,
                [people.map((person) => [person.id, person.name.slice(0, 150), person.profilePath])]
            );
            await connection.query(
                "INSERT IGNORE INTO title_credits (title_id, person_id, credit_type, sort_order) VALUES ?",
                [credits.map(({ person, type, order }) => [titleId, person.id, type, order])]
            );
        }

        await connection.commit();
        return titleId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

module.exports = {
    findByTmdb,
    findIdsByTmdb,
    upsertSnapshot
};
