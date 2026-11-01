const repository = require("../repositories/libraryRepository");
const activities = require("../repositories/activityRepository");
const titleService = require("./titleService");
const cache = require("./cacheService");
const AppError = require("../utils/AppError");
const { toTitleCard } = require("../utils/titlePresenter");
const { paginated } = require("../utils/pagination");

const WISHLIST_SYNC_LIMIT = 100;

// Stats, recommendations and a title's community numbers are derived from library data.
const invalidate = (userId, titleId) => cache.del(
    `user:${userId}:stats`,
    `user:${userId}:recs`,
    ...(titleId ? [`title:${titleId}:community`] : [])
);

const toLibraryItem = (row) => ({
    ...toTitleCard(row),
    userRating: row.user_rating ?? null,
    ...(row.status && { status: row.status }),
    ...(row.updated_at && { updatedAt: row.updated_at }),
    ...(row.added_at && { addedAt: row.added_at })
});

const toDiaryEntry = (row) => ({
    id: row.entry_id ?? row.id,
    watchedOn: row.watched_on,
    rating: row.entry_rating ?? row.rating ?? null,
    isRewatch: Boolean(row.is_rewatch),
    note: row.note || null,
    loggedAt: row.logged_at ?? row.created_at,
    title: toTitleCard(row)
});

const EMPTY_STATE = {
    status: null,
    rating: null,
    wishlisted: false,
    favorite: false,
    topFivePosition: null,
    diaryCount: 0,
    lastWatchedOn: null,
    reviewId: null,
    alerts: []
};

const stateForTitleId = async (userId, titleId) => {
    if (!titleId) return EMPTY_STATE;
    const [row, alerts] = await Promise.all([
        repository.getState(userId, titleId),
        repository.getAlertTypes(userId, titleId)
    ]);
    return {
        status: row.status,
        rating: row.rating,
        wishlisted: Boolean(row.wishlisted),
        favorite: Boolean(row.favorite),
        topFivePosition: row.top_five_position,
        diaryCount: Number(row.diary_count),
        lastWatchedOn: row.last_watched_on,
        reviewId: row.review_id,
        alerts
    };
};

const getState = async (userId, mediaType, tmdbId) => stateForTitleId(
    userId,
    await titleService.findTitleId(mediaType, tmdbId)
);

// Marking something watched, by any route, takes it off the wishlist and posts to the feed once.
const markWatched = async (userId, titleId, { rating = null, targetId = null, keepWatching = false } = {}) => {
    const previous = await repository.getStatus(userId, titleId);
    if (!(keepWatching && previous === "WATCHING")) {
        await repository.setStatus(userId, titleId, "WATCHED");
    }
    await repository.removeFromWishlist(userId, titleId);
    return previous;
};

// For other modules that imply a viewing (reviews): same side effects, no feed item of its own.
const markWatchedForTitle = async (userId, titleId, { rating } = {}) => {
    if (rating) {
        await repository.setRating(userId, titleId, rating);
    }
    await markWatched(userId, titleId, { keepWatching: true });
    await invalidate(userId, titleId);
};

const setStatus = async (userId, mediaType, tmdbId, status) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);

    if (status === "WATCHED") {
        const previous = await markWatched(userId, titleId);
        if (previous !== "WATCHED") {
            await activities.replaceRecent({ userId, type: "WATCHED", titleId });
        }
    } else {
        await repository.setStatus(userId, titleId, status);
    }

    await invalidate(userId, titleId);
    return stateForTitleId(userId, titleId);
};

const clearStatus = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (titleId) {
        await repository.clearStatus(userId, titleId);
        await invalidate(userId, titleId);
    }
    return stateForTitleId(userId, titleId);
};

// Rating something means you have seen it, unless it is a series you are still part-way through.
const rate = async (userId, mediaType, tmdbId, rating) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    await repository.setRating(userId, titleId, rating);
    await markWatched(userId, titleId, { keepWatching: true });
    await activities.replaceRecent({ userId, type: "RATED", titleId, rating });
    await invalidate(userId, titleId);
    return stateForTitleId(userId, titleId);
};

const unrate = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (titleId) {
        await repository.clearRating(userId, titleId);
        await activities.removeForTitle(userId, "RATED", titleId);
        await invalidate(userId, titleId);
    }
    return stateForTitleId(userId, titleId);
};

const addToWishlist = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    await repository.addToWishlist(userId, titleId);
    await invalidate(userId, titleId);
    return stateForTitleId(userId, titleId);
};

const removeFromWishlist = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (titleId) {
        await repository.removeFromWishlist(userId, titleId);
        await invalidate(userId, titleId);
    }
    return stateForTitleId(userId, titleId);
};

// Merges a guest's locally stored wishlist into the account after sign-in. Titles TMDB no longer
// knows are skipped rather than failing the whole merge.
const syncWishlist = async (userId, items) => {
    const unique = [...new Map(items.map((item) => [`${item.mediaType}:${item.tmdbId}`, item])).values()]
        .slice(0, WISHLIST_SYNC_LIMIT);

    const results = await Promise.allSettled(
        unique.map((item) => titleService.ensureTitle(item.mediaType, item.tmdbId))
    );
    const titleIds = results.filter((result) => result.status === "fulfilled").map((result) => result.value);

    const added = await repository.addManyToWishlist(userId, titleIds);
    await invalidate(userId);

    return {
        received: items.length,
        added,
        skipped: unique.length - titleIds.length
    };
};

const favorite = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    await repository.addFavorite(userId, titleId);
    await markWatched(userId, titleId, { keepWatching: true });
    await activities.replaceRecent({ userId, type: "FAVORITED", titleId });
    await invalidate(userId, titleId);
    return stateForTitleId(userId, titleId);
};

const unfavorite = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (titleId) {
        await repository.removeFavorite(userId, titleId);
        await activities.removeForTitle(userId, "FAVORITED", titleId);
        await invalidate(userId, titleId);
    }
    return stateForTitleId(userId, titleId);
};

// Lists --------------------------------------------------------------------------------------

const listPage = async (fetch, pagination) => {
    const { rows, total } = await fetch;
    return paginated(rows.map(toLibraryItem), total, pagination);
};

const getLibrary = (userId, { status, mediaType, sort }, pagination) => listPage(
    repository.listByStatus(userId, { status, mediaType, sort, ...pagination }),
    pagination
);

const getWishlist = (userId, { mediaType, sort }, pagination) => listPage(
    repository.listWishlist(userId, { mediaType, sort, ...pagination }),
    pagination
);

const getFavorites = (userId, { mediaType, sort }, pagination) => listPage(
    repository.listFavorites(userId, { mediaType, sort, ...pagination }),
    pagination
);

const getRatings = (userId, { rating, sort }, pagination) => listPage(
    repository.listRatings(userId, { rating, sort, ...pagination }),
    pagination
);

const getCounts = async (userId) => {
    const row = await repository.getCounts(userId);
    return {
        wishlist: row.wishlist,
        planToWatch: row.plan_to_watch,
        watching: row.watching,
        watched: row.watched,
        favorites: row.favorites,
        ratings: row.ratings,
        diary: row.diary
    };
};

// Diary --------------------------------------------------------------------------------------

const logWatch = async (userId, { mediaType, tmdbId, watchedOn, rating, isRewatch, note }) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    const previousViewings = await repository.countDiaryEntriesForTitle(userId, titleId);

    const entryId = await repository.createDiaryEntry({
        userId,
        titleId,
        watchedOn,
        rating,
        isRewatch: isRewatch ?? previousViewings > 0,
        note
    });

    await markWatched(userId, titleId, { keepWatching: mediaType === "tv" });
    if (rating) {
        await repository.setRating(userId, titleId, rating);
    }
    await activities.record({ userId, type: "WATCHED", titleId, targetId: entryId, rating: rating ?? null });
    await invalidate(userId, titleId);

    return toDiaryEntry(await repository.findDiaryEntry(userId, entryId));
};

const updateDiaryEntry = async (userId, entryId, changes) => {
    const existing = await repository.findDiaryEntry(userId, entryId);
    if (!existing) throw AppError.notFound("Diary entry not found");

    await repository.updateDiaryEntry(userId, entryId, changes);
    await invalidate(userId, existing.title_id);
    return toDiaryEntry(await repository.findDiaryEntry(userId, entryId));
};

const deleteDiaryEntry = async (userId, entryId) => {
    const existing = await repository.findDiaryEntry(userId, entryId);
    if (!existing) throw AppError.notFound("Diary entry not found");

    await repository.deleteDiaryEntry(userId, entryId);
    await activities.removeForTarget(userId, "WATCHED", entryId);
    await invalidate(userId, existing.title_id);
};

const getDiary = async (userId, { year }, pagination) => {
    const { rows, total } = await repository.listDiary(userId, { year, ...pagination });
    return paginated(rows.map(toDiaryEntry), total, pagination);
};

const getDiaryYears = (userId) => repository.diaryYears(userId);

// Top five -----------------------------------------------------------------------------------

const toTopFive = (rows) => rows.map((row) => ({ position: row.position, ...toTitleCard(row) }));

const getTopFive = async (userId) => toTopFive(await repository.getTopFive(userId));

// The five films that define you are, by definition, favourites you have seen.
const setTopFive = async (userId, items) => {
    const titleIds = [];
    for (const item of items) {
        titleIds.push(await titleService.ensureTitle(item.mediaType, item.tmdbId));
    }

    await repository.replaceTopFive(userId, titleIds);
    for (const titleId of titleIds) {
        await repository.addFavorite(userId, titleId);
        await markWatched(userId, titleId, { keepWatching: true });
    }

    await invalidate(userId);
    return getTopFive(userId);
};

module.exports = {
    invalidate,
    markWatchedForTitle,
    getState,
    setStatus,
    clearStatus,
    rate,
    unrate,
    addToWishlist,
    removeFromWishlist,
    syncWishlist,
    favorite,
    unfavorite,
    getLibrary,
    getWishlist,
    getFavorites,
    getRatings,
    getCounts,
    logWatch,
    updateDiaryEntry,
    deleteDiaryEntry,
    getDiary,
    getDiaryYears,
    getTopFive,
    setTopFive,
    toLibraryItem,
    toDiaryEntry,
    toTopFive
};
