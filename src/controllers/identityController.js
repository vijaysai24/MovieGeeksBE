const { matchedData } = require("express-validator");
const statsService = require("../services/statsService");
const recommendationService = require("../services/recommendationService");
const socialService = require("../services/socialService");
const libraryRepository = require("../repositories/libraryRepository");
const AppError = require("../utils/AppError");
const { toTitleCard } = require("../utils/titlePresenter");
const { ok } = require("../utils/response");
const handle = require("../utils/handle");

const input = (req) => matchedData(req);

const getMyStats = handle(async (req, res) => {
    ok(res, await statsService.getStats(req.user.id, input(req).year));
});

const getUserStats = handle(async (req, res) => {
    const { username, year } = input(req);
    const user = await socialService.findUser(username);
    ok(res, await statsService.getStats(user.id, year));
});

const getTasteMatch = handle(async (req, res) => {
    const user = await socialService.findUser(input(req).username);
    if (user.id === req.user.id) throw AppError.badRequest("That's you. Your taste matches perfectly.", "SELF_MATCH");
    ok(res, await statsService.getTasteMatch(req.user.id, user.id));
});

const getPreferences = handle(async (req, res) => {
    ok(res, await statsService.getPreferences(req.user.id));
});

const setPreferences = handle(async (req, res) => {
    ok(res, await statsService.setPreferences(req.user.id, input(req).genres), "Preferences saved");
});

const getRecommendations = handle(async (req, res) => {
    ok(res, await recommendationService.getRecommendations(req.user.id));
});

const randomFromQueue = handle(async (req, res) => {
    const { mediaType, genre } = input(req);
    const row = await libraryRepository.randomFromQueue(req.user.id, { mediaType, genreId: genre });
    ok(res, row ? { ...toTitleCard(row), queueSize: Number(row.queue_size) } : null);
});

module.exports = {
    getMyStats,
    getUserStats,
    getTasteMatch,
    getPreferences,
    setPreferences,
    getRecommendations,
    randomFromQueue
};
