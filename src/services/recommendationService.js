const statsRepository = require("../repositories/statsRepository");
const catalog = require("./catalogService");
const cache = require("./cacheService");

const RECS_TTL = 30 * 60;
const RESULT_LIMIT = 30;

// TMDB's own recommendations for each seed are the evidence; the member's history decides how
// much each seed counts and which genres get a nudge. TMDB's "similar" list is keyword matching
// and noisy, so it only breaks ties and never counts as agreement between seeds.
const SOURCE_WEIGHT = { recommendations: 1, similar: 0.2 };

// Too few votes or a poor score means TMDB is guessing; don't pass the guess on.
const MIN_VOTES = 150;
const MIN_SCORE = 6.3;

const credible = (item) => (item.voteCount || 0) >= MIN_VOTES && (!item.rating || item.rating >= MIN_SCORE);

const keyOf = (mediaType, id) => `${mediaType}:${id}`;

const coldStart = async (known, preferredGenres) => {
    const exclude = (items) => items.filter((item) => !known.has(keyOf(item.mediaType, item.id)) && item.posterPath);

    if (preferredGenres.length) {
        const page = await catalog.discover("movie", { genres: preferredGenres.map((genre) => genre.id), sort: "rating" }, null);
        return {
            basis: "preferences",
            items: exclude(page.items).slice(0, RESULT_LIMIT).map((item) => ({
                ...item,
                reason: { type: "GENRES", genres: preferredGenres.map((genre) => genre.name) }
            }))
        };
    }

    const page = await catalog.getList("trending", "all", 1, null);
    return {
        basis: "trending",
        items: exclude(page.items).slice(0, RESULT_LIMIT).map((item) => ({ ...item, reason: { type: "TRENDING" } }))
    };
};

const compute = async (userId) => {
    const [seeds, knownRows, preferredGenres, topGenres] = await Promise.all([
        statsRepository.recommendationSeeds(userId),
        statsRepository.knownTitleRefs(userId),
        statsRepository.genrePreferences(userId),
        statsRepository.topGenres(userId, 8)
    ]);

    const known = new Set(knownRows.map((row) => keyOf(row.media_type, row.tmdb_id)));

    if (!seeds.length) return coldStart(known, preferredGenres);

    const seedDetails = await Promise.allSettled(
        seeds.map((seed) => catalog.getCachedDetails(seed.media_type, seed.tmdb_id))
    );

    // How much of what they watch falls in each genre, plus anything they told us they like.
    const totalSeen = topGenres.reduce((sum, genre) => sum + Number(genre.titles), 0) || 1;
    const genreAffinity = new Map(topGenres.map((genre) => [genre.id, Number(genre.titles) / totalSeen]));
    preferredGenres.forEach((genre) => genreAffinity.set(genre.id, (genreAffinity.get(genre.id) || 0) + 0.15));

    const candidates = new Map();

    seedDetails.forEach((result, seedIndex) => {
        if (result.status !== "fulfilled") return;
        const seed = seeds[seedIndex];
        const details = result.value;

        for (const source of ["recommendations", "similar"]) {
            details[source].forEach((item, position) => {
                const key = keyOf(item.mediaType, item.id);
                if (known.has(key) || !item.posterPath || !credible(item)) return;

                // Earlier positions in TMDB's list are stronger matches.
                const contribution = seed.weight * SOURCE_WEIGHT[source] * (1 - position / 40);
                const entry = candidates.get(key) || { item, score: 0, seeds: new Map(), backers: new Set() };
                const seedKey = keyOf(details.mediaType, details.id);
                const previous = entry.seeds.get(seedKey);
                // The strongest single reason counts; agreement between seeds is added once below,
                // so a blockbuster on two lists can't outscore a great match on one.
                entry.score = Math.max(entry.score, contribution);
                entry.seeds.set(seedKey, {
                    score: (previous?.score || 0) + contribution,
                    ref: { title: details.title, mediaType: details.mediaType, id: details.id }
                });
                if (source === "recommendations") entry.backers.add(seedKey);
                candidates.set(key, entry);
            });
        }
    });

    const scored = [...candidates.values()].map((entry) => {
        const genreBonus = (entry.item.genreIds || []).reduce((sum, id) => sum + (genreAffinity.get(id) || 0), 0);
        // Recommended by several of their favourites at once is the strongest signal of all.
        const agreement = Math.min(0.5, 0.2 * (entry.backers.size - 1));
        const quality = entry.item.rating ? (entry.item.rating - 7) * 0.25 : 0;
        return { ...entry, total: entry.score + genreBonus * 0.6 + agreement + quality };
    });

    scored.sort((a, b) => b.total - a.total || (b.item.voteCount || 0) - (a.item.voteCount || 0));

    return {
        basis: "history",
        items: scored.slice(0, RESULT_LIMIT).map((entry) => {
            const strongest = [...entry.seeds.values()].sort((a, b) => b.score - a.score)[0];
            return {
                ...entry.item,
                reason: {
                    type: entry.backers.size > 1 ? "SEVERAL" : "BECAUSE",
                    because: strongest.ref,
                    seedCount: Math.max(entry.backers.size, 1)
                }
            };
        })
    };
};

const getRecommendations = (userId) => cache.wrap(`user:${userId}:recs`, RECS_TTL, () => compute(userId), { staleTtl: RECS_TTL });

module.exports = {
    getRecommendations
};
