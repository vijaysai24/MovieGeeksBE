const repository = require("../repositories/communityRepository");
const titleService = require("./titleService");
const cache = require("./cacheService");
const { toTitleCard } = require("../utils/titlePresenter");
const { toPublicUser } = require("../utils/userPresenter");

const EMPTY_COMMUNITY = {
    ratingCount: 0,
    averageRating: null,
    distribution: Array.from({ length: 10 }, (_, index) => ({ rating: index + 1, count: 0 })),
    reviewCount: 0,
    watchedCount: 0,
    watchingCount: 0,
    plannedCount: 0,
    wishlistCount: 0,
    favoriteCount: 0
};

// Movie Geeks' own numbers for a title, kept separate from TMDB/IMDb scores on purpose.
const getTitleCommunity = async (mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (!titleId) return EMPTY_COMMUNITY;

    return cache.wrap(`title:${titleId}:community`, 300, async () => {
        const { ratings, counts } = await repository.titleStats(titleId);
        return {
            ratingCount: ratings.rating_count,
            averageRating: ratings.average === null ? null : Math.round(Number(ratings.average) * 10) / 10,
            distribution: Array.from({ length: 10 }, (_, index) => ({
                rating: index + 1,
                count: Number(ratings[`r${index + 1}`] || 0)
            })),
            reviewCount: counts.reviews,
            watchedCount: counts.watched,
            watchingCount: counts.watching,
            plannedCount: counts.planned,
            wishlistCount: counts.wishlisted,
            favoriteCount: counts.favorites
        };
    });
};

const getTrending = (days = 7) => cache.wrap(`community:trending:${days}`, 600, async () => {
    const rows = await repository.trendingTitles({ days, limit: 20 });
    return rows.map((row) => ({
        ...toTitleCard(row),
        reviews: Number(row.reviews),
        comments: Number(row.comments),
        ratings: Number(row.ratings)
    }));
});

const getMembers = async (viewer) => {
    const rows = await repository.activeMembers({ days: 90, limit: 12, excludeUserId: viewer?.id });
    return rows.map((row) => ({
        ...toPublicUser(row),
        reviewCount: Number(row.review_count),
        likesReceived: Number(row.likes_received)
    }));
};

module.exports = {
    getTitleCommunity,
    getTrending,
    getMembers
};
