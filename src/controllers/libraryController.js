const { matchedData } = require("express-validator");
const service = require("../services/libraryService");
const { parsePagination } = require("../utils/pagination");
const { ok, created } = require("../utils/response");

const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (err) {
        next(err);
    }
};

const input = (req) => matchedData(req);

const getState = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.getState(req.user.id, mediaType, tmdbId));
});

const setStatus = handle(async (req, res) => {
    const { mediaType, tmdbId, status } = input(req);
    ok(res, await service.setStatus(req.user.id, mediaType, tmdbId, status), "Status updated");
});

const clearStatus = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.clearStatus(req.user.id, mediaType, tmdbId), "Status cleared");
});

const rate = handle(async (req, res) => {
    const { mediaType, tmdbId, rating } = input(req);
    ok(res, await service.rate(req.user.id, mediaType, tmdbId, rating), "Rating saved");
});

const unrate = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.unrate(req.user.id, mediaType, tmdbId), "Rating removed");
});

const addToWishlist = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.addToWishlist(req.user.id, mediaType, tmdbId), "Added to wishlist");
});

const removeFromWishlist = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.removeFromWishlist(req.user.id, mediaType, tmdbId), "Removed from wishlist");
});

const syncWishlist = handle(async (req, res) => {
    ok(res, await service.syncWishlist(req.user.id, input(req).items), "Wishlist synced");
});

const favorite = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.favorite(req.user.id, mediaType, tmdbId), "Added to favourites");
});

const unfavorite = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await service.unfavorite(req.user.id, mediaType, tmdbId), "Removed from favourites");
});

const getLibrary = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.getLibrary(req.user.id, data, parsePagination(data)));
});

const getCounts = handle(async (req, res) => {
    ok(res, await service.getCounts(req.user.id));
});

const getWishlist = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.getWishlist(req.user.id, data, parsePagination(data)));
});

const getFavorites = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.getFavorites(req.user.id, data, parsePagination(data)));
});

const getRatings = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.getRatings(req.user.id, data, parsePagination(data)));
});

const getDiary = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.getDiary(req.user.id, data, parsePagination(data)));
});

const getDiaryYears = handle(async (req, res) => {
    ok(res, await service.getDiaryYears(req.user.id));
});

const logWatch = handle(async (req, res) => {
    created(res, await service.logWatch(req.user.id, input(req)), "Added to your diary");
});

const updateDiaryEntry = handle(async (req, res) => {
    const { id, ...changes } = input(req);
    ok(res, await service.updateDiaryEntry(req.user.id, id, changes), "Diary entry updated");
});

const deleteDiaryEntry = handle(async (req, res) => {
    await service.deleteDiaryEntry(req.user.id, input(req).id);
    ok(res, null, "Diary entry deleted");
});

const getTopFive = handle(async (req, res) => {
    ok(res, await service.getTopFive(req.user.id));
});

const setTopFive = handle(async (req, res) => {
    ok(res, await service.setTopFive(req.user.id, input(req).items), "Top five saved");
});

module.exports = {
    handle,
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
    getCounts,
    getWishlist,
    getFavorites,
    getRatings,
    getDiary,
    getDiaryYears,
    logWatch,
    updateDiaryEntry,
    deleteDiaryEntry,
    getTopFive,
    setTopFive
};
