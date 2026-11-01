// Title snapshot rows are shaped like catalogue summaries, so the client renders a title the
// same way whether it came from TMDB or from a user's library.
const TITLE_COLUMNS = `
    t.id AS title_id, t.tmdb_id, t.media_type, t.title, t.original_title, t.poster_path,
    t.backdrop_path, t.release_date, t.runtime, t.original_language, t.tmdb_rating
`;

const toTitleCard = (row) => ({
    id: row.tmdb_id,
    mediaType: row.media_type,
    title: row.title,
    originalTitle: row.original_title || null,
    posterPath: row.poster_path || null,
    backdropPath: row.backdrop_path || null,
    releaseDate: row.release_date || null,
    year: row.release_date ? Number(String(row.release_date).slice(0, 4)) : null,
    runtime: row.runtime || null,
    originalLanguage: row.original_language || null,
    rating: row.tmdb_rating !== null && row.tmdb_rating !== undefined ? Number(row.tmdb_rating) : null
});

module.exports = {
    TITLE_COLUMNS,
    toTitleCard
};
