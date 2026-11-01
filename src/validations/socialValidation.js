const { body, param, query } = require("express-validator");
const { titleParams, paginationQuery } = require("./libraryValidation");
const { usernameParam } = require("./userValidation");

const idParam = (name = "id") => param(name).isInt({ min: 1 }).withMessage(`${name} must be a positive integer`).toInt();

const reviewListValidation = [
    ...titleParams,
    query("sort").optional().isIn(["popular", "recent", "highest", "lowest"]),
    ...paginationQuery
];

const saveReviewValidation = [
    ...titleParams,
    body("body")
        .trim()
        .isLength({ min: 3, max: 8000 })
        .withMessage("Reviews must be 3-8000 characters"),
    body("hasSpoilers").optional().isBoolean().toBoolean(),
    body("rating").optional({ values: "null" }).isInt({ min: 1, max: 10 }).withMessage("rating must be a whole number from 1 to 10").toInt()
];

const reviewIdValidation = [idParam()];

const reactionValidation = [
    idParam(),
    body("reaction").isIn(["LIKE", "DISLIKE"]).withMessage("reaction must be LIKE or DISLIKE")
];

const commentListValidation = [idParam(), ...paginationQuery];

const commentValidation = [
    idParam(),
    body("body").trim().isLength({ min: 1, max: 1000 }).withMessage("Comments must be 1-1000 characters")
];

const popularReviewsValidation = [
    query("period").optional().isIn(["week", "month", "year", "all"]),
    ...paginationQuery
];

const trendingValidation = [query("days").optional().isInt({ min: 1, max: 90 }).toInt()];

const reportValidation = [
    body("targetType").isIn(["REVIEW", "COMMENT"]).withMessage("targetType must be REVIEW or COMMENT"),
    body("targetId").isInt({ min: 1 }).toInt(),
    body("reason").isIn(["SPAM", "HARASSMENT", "HATE", "SPOILERS", "OTHER"]).withMessage("Choose a reason"),
    body("details").optional({ values: "null" }).trim().isLength({ max: 500 }).withMessage("details must be at most 500 characters")
];

const moderationListValidation = [
    query("status").optional().isIn(["OPEN", "RESOLVED", "DISMISSED"]),
    ...paginationQuery
];

const moderationTargetValidation = [
    param("targetType").isIn(["REVIEW", "COMMENT"]),
    idParam("targetId")
];

const moderationActionValidation = [
    body("targetType").isIn(["REVIEW", "COMMENT"]).withMessage("targetType must be REVIEW or COMMENT"),
    body("targetId").isInt({ min: 1 }).toInt(),
    body("action").isIn(["DISMISS", "HIDE", "REMOVE", "RESTORE"]).withMessage("action must be DISMISS, HIDE, REMOVE or RESTORE")
];

const userStatusValidation = [
    ...usernameParam,
    body("status").isIn(["ACTIVE", "INACTIVE", "BANNED"]).withMessage("status must be ACTIVE, INACTIVE or BANNED")
];

const profileListValidation = [...usernameParam, ...paginationQuery];

const profileLibraryValidation = [
    ...usernameParam,
    query("status").isIn(["PLAN_TO_WATCH", "WATCHING", "WATCHED"]),
    query("mediaType").optional().isIn(["movie", "tv"]),
    query("sort").optional().isIn(["recent", "title", "release", "rating"]),
    ...paginationQuery
];

const profileDiaryValidation = [
    ...usernameParam,
    query("year").optional().isInt({ min: 1900, max: 2100 }).toInt(),
    ...paginationQuery
];

const profileSetValidation = [
    ...usernameParam,
    query("mediaType").optional().isIn(["movie", "tv"]),
    query("sort").optional().isIn(["recent", "title", "release"]),
    ...paginationQuery
];

const profileRatingsValidation = [
    ...usernameParam,
    query("rating").optional().isInt({ min: 1, max: 10 }).toInt(),
    query("sort").optional().isIn(["recent", "highest", "lowest", "title"]),
    ...paginationQuery
];

const profileReviewsValidation = [
    ...usernameParam,
    query("sort").optional().isIn(["recent", "popular", "highest", "lowest"]),
    ...paginationQuery
];

const notificationListValidation = [
    query("unreadOnly").optional().isBoolean().toBoolean(),
    ...paginationQuery
];

const markReadValidation = [
    body("ids").optional().isArray({ max: 100 }),
    body("ids.*").isInt({ min: 1 }).toInt()
];

module.exports = {
    reviewListValidation,
    saveReviewValidation,
    reviewIdValidation,
    reactionValidation,
    commentListValidation,
    commentValidation,
    popularReviewsValidation,
    trendingValidation,
    reportValidation,
    moderationListValidation,
    moderationTargetValidation,
    moderationActionValidation,
    userStatusValidation,
    profileListValidation,
    profileLibraryValidation,
    profileDiaryValidation,
    profileSetValidation,
    profileRatingsValidation,
    profileReviewsValidation,
    notificationListValidation,
    markReadValidation
};
