const { matchedData } = require("express-validator");
const socialService = require("../services/socialService");
const profileService = require("../services/publicProfileService");
const moderationService = require("../services/moderationService");
const { parsePagination } = require("../utils/pagination");
const { ok, created } = require("../utils/response");
const handle = require("../utils/handle");

const input = (req) => matchedData(req);
const viewerOf = (req) => req.user || null;

// Profiles -----------------------------------------------------------------------------------

const getProfile = handle(async (req, res) => {
    ok(res, await profileService.getProfile(input(req).username, viewerOf(req)));
});

const profileList = (fetch, defaultLimit = 24) => handle(async (req, res) => {
    const data = input(req);
    ok(res, await fetch(data.username, data, parsePagination(data, defaultLimit), viewerOf(req)));
});

const getProfileLibrary = profileList(profileService.getLibrary);
const getProfileDiary = profileList(profileService.getDiary, 30);
const getProfileFavorites = profileList(profileService.getFavorites);
const getProfileRatings = profileList(profileService.getRatings);
const getProfileReviews = profileList(profileService.getReviews, 10);

const getProfileActivity = handle(async (req, res) => {
    const data = input(req);
    ok(res, await socialService.getUserActivity(data.username, parsePagination(data, 20)));
});

// Follows ------------------------------------------------------------------------------------

const follow = handle(async (req, res) => {
    ok(res, await socialService.follow(req.user.id, input(req).username), "Following");
});

const unfollow = handle(async (req, res) => {
    ok(res, await socialService.unfollow(req.user.id, input(req).username), "Unfollowed");
});

const getFollowers = handle(async (req, res) => {
    const data = input(req);
    ok(res, await socialService.listConnections(data.username, "followers", parsePagination(data, 30), viewerOf(req)));
});

const getFollowing = handle(async (req, res) => {
    const data = input(req);
    ok(res, await socialService.listConnections(data.username, "following", parsePagination(data, 30), viewerOf(req)));
});

// Feed and notifications ---------------------------------------------------------------------

const getFeed = handle(async (req, res) => {
    ok(res, await socialService.getFeed(req.user.id, parsePagination(input(req), 20)));
});

const getNotifications = handle(async (req, res) => {
    const data = input(req);
    ok(res, await socialService.getNotifications(req.user.id, data, parsePagination(data, 20)));
});

const getUnreadCount = handle(async (req, res) => {
    ok(res, await socialService.getUnreadCount(req.user.id));
});

const markNotificationsRead = handle(async (req, res) => {
    ok(res, await socialService.markNotificationsRead(req.user.id, input(req).ids));
});

// Reports and moderation ---------------------------------------------------------------------

const report = handle(async (req, res) => {
    created(res, await moderationService.report(req.user.id, input(req)), "Thanks, a moderator will take a look");
});

const listReports = handle(async (req, res) => {
    const data = input(req);
    ok(res, await moderationService.listReports({ status: data.status || "OPEN" }, parsePagination(data)));
});

const getReportDetails = handle(async (req, res) => {
    const { targetType, targetId } = input(req);
    ok(res, await moderationService.getReportDetails(targetType, targetId));
});

const moderate = handle(async (req, res) => {
    ok(res, await moderationService.act(req.user.id, input(req)), "Done");
});

const setUserStatus = handle(async (req, res) => {
    const { username, status } = input(req);
    ok(res, await moderationService.setUserStatus(req.user, username, status), "User updated");
});

module.exports = {
    getProfile,
    getProfileLibrary,
    getProfileDiary,
    getProfileFavorites,
    getProfileRatings,
    getProfileReviews,
    getProfileActivity,
    follow,
    unfollow,
    getFollowers,
    getFollowing,
    getFeed,
    getNotifications,
    getUnreadCount,
    markNotificationsRead,
    report,
    listReports,
    getReportDetails,
    moderate,
    setUserStatus
};
