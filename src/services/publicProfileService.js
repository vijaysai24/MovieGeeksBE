const libraryService = require("./libraryService");
const reviewService = require("./reviewService");
const socialService = require("./socialService");
const follows = require("../repositories/followRepository");
const reviews = require("../repositories/reviewRepository");
const { toPublicUser } = require("../utils/userPresenter");

// A member's movie identity as anyone sees it. Profiles are public; the account owner sees the
// same page plus edit controls on the client.
const getProfile = async (username, viewer) => {
    const user = await socialService.findUser(username);
    const isSelf = Boolean(viewer && viewer.id === user.id);

    const [counts, connections, topFive, reviewCount, viewerFollows] = await Promise.all([
        libraryService.getCounts(user.id),
        follows.counts(user.id),
        libraryService.getTopFive(user.id),
        reviews.countPublishedByUser(user.id),
        viewer && !isSelf ? follows.isFollowing(viewer.id, user.id) : false
    ]);

    return {
        user: toPublicUser(user),
        isSelf,
        viewerFollows,
        followers: connections.followers,
        following: connections.following,
        counts: { ...counts, reviews: reviewCount },
        topFive
    };
};

const forUser = (fetch) => async (username, filters, pagination, viewer) => {
    const user = await socialService.findUser(username);
    return fetch(user.id, filters, pagination, viewer);
};

module.exports = {
    getProfile,
    getLibrary: forUser((userId, filters, pagination) => libraryService.getLibrary(userId, filters, pagination)),
    getDiary: forUser((userId, filters, pagination) => libraryService.getDiary(userId, filters, pagination)),
    getFavorites: forUser((userId, filters, pagination) => libraryService.getFavorites(userId, filters, pagination)),
    getRatings: forUser((userId, filters, pagination) => libraryService.getRatings(userId, filters, pagination)),
    getReviews: forUser((userId, filters, pagination, viewer) => reviewService.listByUser(userId, filters, pagination, viewer))
};
