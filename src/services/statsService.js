const repository = require("../repositories/statsRepository");
const catalog = require("./catalogService");
const cache = require("./cacheService");
const identity = require("./identityService");
const { toTitleCard } = require("../utils/titlePresenter");

const STATS_TTL = 30 * 60;
const MATCH_TTL = 60 * 60;

const round1 = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10);

const languageNames = async () => {
    try {
        return new Map((await catalog.getLanguages()).map((language) => [language.code, language.name]));
    } catch {
        return new Map();
    }
};

const toPerson = (row) => ({
    id: row.id,
    name: row.name,
    profilePath: row.profile_path || null,
    titles: Number(row.titles),
    averageRating: round1(row.average_rating)
});

const computeStats = async (userId) => {
    const [totals, ratings, genres, directors, actors, languages, years, byYear, rewatched, names] = await Promise.all([
        repository.totals(userId),
        repository.ratingSummary(userId),
        repository.topGenres(userId),
        repository.topPeople(userId, "directors"),
        repository.topPeople(userId, "cast"),
        repository.languages(userId),
        repository.releaseYears(userId),
        repository.diaryByYear(userId),
        repository.mostRewatched(userId),
        languageNames()
    ]);

    const seen = Number(totals.movies || 0) + Number(totals.series || 0);
    const ratingCount = Number(ratings.count || 0);
    const versusTmdb = ratings.versus_tmdb === null ? null : Number(ratings.versus_tmdb);
    const lesserKnownShare = totals.lesser_known_share === null ? null : Number(totals.lesser_known_share);
    const languageRows = languages.map((row) => ({ code: row.code, name: names.get(row.code) || row.code, titles: Number(row.titles) }));

    const decadeCounts = {};
    for (const year of years) {
        const decade = Math.floor(year / 10) * 10;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
    }
    const medianYear = identity.median(years);

    return {
        totals: {
            movies: Number(totals.movies || 0),
            series: Number(totals.series || 0),
            hoursOfFilm: Math.round(Number(totals.movie_minutes || 0) / 60),
            ratings: ratingCount,
            averageRating: round1(ratings.average),
            versusTmdb: round1(versusTmdb),
            lesserKnownShare: lesserKnownShare === null ? null : Math.round(lesserKnownShare * 100) / 100,
            medianReleaseYear: medianYear
        },
        ratingDistribution: Array.from({ length: 10 }, (_, index) => ({
            rating: index + 1,
            count: Number(ratings[`r${index + 1}`] || 0)
        })),
        genres: genres.map((row) => ({
            id: row.id,
            name: row.name,
            titles: Number(row.titles),
            share: seen ? Math.round((Number(row.titles) / seen) * 100) / 100 : 0,
            averageRating: round1(row.average_rating)
        })),
        directors: directors.map(toPerson),
        actors: actors.map(toPerson),
        languages: languageRows,
        decades: Object.keys(decadeCounts).sort().map((decade) => ({ decade: Number(decade), titles: decadeCounts[decade] })),
        diaryByYear: byYear.map((row) => ({ year: row.year, entries: Number(row.entries) })),
        mostRewatched: rewatched.map((row) => ({ ...toTitleCard(row), viewings: Number(row.viewings) })),
        identity: identity.buildIdentity({
            seen,
            ratingCount,
            versusTmdb,
            lesserKnownShare,
            languages: languageRows,
            medianYear,
            topGenre: genres[0] || null
        })
    };
};

const getStats = async (userId, year = new Date().getUTCFullYear()) => {
    const [stats, months] = await Promise.all([
        cache.wrap(`user:${userId}:stats`, STATS_TTL, () => computeStats(userId), { staleTtl: STATS_TTL }),
        repository.diaryByMonth(userId, year)
    ]);

    const byMonth = new Map(months.map((row) => [row.month, row]));
    return {
        ...stats,
        year,
        monthlyActivity: Array.from({ length: 12 }, (_, index) => ({
            month: index + 1,
            entries: Number(byMonth.get(index + 1)?.entries || 0),
            rewatches: Number(byMonth.get(index + 1)?.rewatches || 0)
        }))
    };
};

// Taste match ---------------------------------------------------------------------------------

const MIN_SHARED_RATINGS = 3;

const genreVector = (genres) => new Map(genres.map((genre) => [genre.id, genre.titles]));

const cosine = (a, b) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [key, value] of a) {
        normA += value * value;
        if (b.has(key)) dot += value * b.get(key);
    }
    for (const value of b.values()) normB += value * value;
    return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
};

// Agreement on titles both rated (a 9-point gap is total disagreement) blended with how alike
// their genre diets are. With too few shared ratings, only the genre overlap speaks.
const computeMatch = async (userId, otherId) => {
    const [ratingsA, ratingsB, genresA, genresB] = await Promise.all([
        repository.ratingsForComparison(userId),
        repository.ratingsForComparison(otherId),
        repository.topGenres(userId, 30),
        repository.topGenres(otherId, 30)
    ]);

    const ratedByB = new Map(ratingsB.map((row) => [row.title_id, row]));
    const shared = ratingsA
        .filter((row) => ratedByB.has(row.title_id))
        .map((row) => ({ row, mine: row.rating, theirs: ratedByB.get(row.title_id).rating }));

    const genreSimilarity = cosine(
        genreVector(genresA.map((g) => ({ id: g.id, titles: Number(g.titles) }))),
        genreVector(genresB.map((g) => ({ id: g.id, titles: Number(g.titles) })))
    );

    const ratingAgreement = shared.length >= MIN_SHARED_RATINGS
        ? 1 - shared.reduce((sum, item) => sum + Math.abs(item.mine - item.theirs), 0) / shared.length / 9
        : null;

    const hasSignal = ratingAgreement !== null || (genresA.length && genresB.length);
    const score = !hasSignal
        ? null
        : Math.round(100 * (ratingAgreement === null ? genreSimilarity : 0.65 * ratingAgreement + 0.35 * genreSimilarity));

    const loveTogether = shared
        .filter((item) => item.mine >= 8 && item.theirs >= 8)
        .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))
        .slice(0, 6)
        .map((item) => ({ ...toTitleCard(item.row), yourRating: item.mine, theirRating: item.theirs }));

    const [disagreement] = [...shared].sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs));

    const theirTopGenreIds = new Set(genresB.slice(0, 5).map((genre) => genre.id));

    return {
        score,
        sharedRatings: shared.length,
        basis: ratingAgreement === null ? "genres" : "ratings_and_genres",
        loveTogether,
        biggestDisagreement: disagreement && Math.abs(disagreement.mine - disagreement.theirs) >= 3
            ? { ...toTitleCard(disagreement.row), yourRating: disagreement.mine, theirRating: disagreement.theirs }
            : null,
        sharedGenres: genresA.slice(0, 5).filter((genre) => theirTopGenreIds.has(genre.id)).map((genre) => genre.name)
    };
};

const getTasteMatch = (userId, otherId) => {
    const [low, high] = userId < otherId ? [userId, otherId] : [otherId, userId];
    // Cached per pair; the perspective-specific fields (your/their rating) are recomputed when the
    // order differs, which is cheap compared with the queries.
    return cache.wrap(`match:${low}:${high}:${userId}`, MATCH_TTL, () => computeMatch(userId, otherId));
};

// Preferences --------------------------------------------------------------------------------

const getPreferences = async (userId) => ({ genres: await repository.genrePreferences(userId) });

const setPreferences = async (userId, genreIds) => {
    const known = new Map((await catalog.getGenres()).map((genre) => [genre.id, genre]));
    const genres = [...new Set(genreIds)].filter((id) => known.has(id)).map((id) => ({ id, name: known.get(id).name }));
    await repository.replaceGenrePreferences(userId, genres);
    await cache.del(`user:${userId}:recs`);
    return getPreferences(userId);
};

module.exports = {
    getStats,
    getTasteMatch,
    getPreferences,
    setPreferences
};
