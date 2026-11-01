const { matchedData } = require("express-validator");
const reviewService = require("../services/reviewService");
const communityService = require("../services/communityService");
const { parsePagination } = require("../utils/pagination");
const { ok, created } = require("../utils/response");
const handle = require("../utils/handle");

const input = (req) => matchedData(req);
const viewerOf = (req) => req.user || null;

const listForTitle = handle(async (req, res) => {
    const data = input(req);
    ok(res, await reviewService.listForTitle(data.mediaType, data.tmdbId, data, parsePagination(data, 10), viewerOf(req)));
});

const saveReview = handle(async (req, res) => {
    const { mediaType, tmdbId, ...review } = input(req);
    ok(res, await reviewService.saveReview(req.user.id, mediaType, tmdbId, review), "Review saved");
});

const deleteOwnReview = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    await reviewService.deleteOwnReview(req.user.id, mediaType, tmdbId);
    ok(res, null, "Review deleted");
});

const getReview = handle(async (req, res) => {
    ok(res, await reviewService.getReview(input(req).id, viewerOf(req)));
});

const react = handle(async (req, res) => {
    const { id, reaction } = input(req);
    ok(res, await reviewService.react(req.user, id, reaction));
});

const unreact = handle(async (req, res) => {
    ok(res, await reviewService.unreact(req.user, input(req).id));
});

const listComments = handle(async (req, res) => {
    const data = input(req);
    ok(res, await reviewService.listComments(data.id, parsePagination(data, 30), viewerOf(req)));
});

const addComment = handle(async (req, res) => {
    const { id, body } = input(req);
    created(res, await reviewService.addComment(req.user, id, body), "Comment posted");
});

const deleteComment = handle(async (req, res) => {
    await reviewService.deleteComment(req.user, input(req).id);
    ok(res, null, "Comment deleted");
});

const listPopular = handle(async (req, res) => {
    const data = input(req);
    ok(res, await reviewService.listPopular(data, parsePagination(data, 10), viewerOf(req)));
});

const getTitleCommunity = handle(async (req, res) => {
    const { mediaType, tmdbId } = input(req);
    ok(res, await communityService.getTitleCommunity(mediaType, tmdbId));
});

const getTrending = handle(async (req, res) => {
    ok(res, await communityService.getTrending(input(req).days || 7));
});

const getMembers = handle(async (req, res) => {
    ok(res, await communityService.getMembers(viewerOf(req)));
});

module.exports = {
    listForTitle,
    saveReview,
    deleteOwnReview,
    getReview,
    react,
    unreact,
    listComments,
    addComment,
    deleteComment,
    listPopular,
    getTitleCommunity,
    getTrending,
    getMembers
};
