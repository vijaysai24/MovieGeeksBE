const { body, param, query } = require("express-validator");
const { daysFromToday } = require("../utils/dates");

const STATUSES = ["PLAN_TO_WATCH", "WATCHING", "WATCHED"];

const titleParams = [
    param("mediaType").isIn(["movie", "tv"]).withMessage("mediaType must be movie or tv"),
    param("tmdbId").isInt({ min: 1 }).withMessage("tmdbId must be a positive integer").toInt()
];

const titleRefBody = (prefix = "") => [
    body(`${prefix}mediaType`).isIn(["movie", "tv"]).withMessage("mediaType must be movie or tv"),
    body(`${prefix}tmdbId`).isInt({ min: 1 }).withMessage("tmdbId must be a positive integer").toInt()
];

const paginationQuery = [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 50 }).toInt()
];

const mediaTypeQuery = query("mediaType").optional().isIn(["movie", "tv"]);

const ratingRule = (field, location = body) => location(field)
    .isInt({ min: 1, max: 10 })
    .withMessage("rating must be a whole number from 1 to 10")
    .toInt();

// Allow one day ahead so a viewer ahead of UTC can log tonight's film.
const watchedOnRule = (optional) => {
    const rule = body("watchedOn");
    return (optional ? rule.optional() : rule)
        .isISO8601({ strict: true })
        .withMessage("watchedOn must be a date like 2026-11-01")
        .bail()
        .custom((value) => value.slice(0, 10) <= daysFromToday(1))
        .withMessage("watchedOn cannot be in the future")
        .customSanitizer((value) => value.slice(0, 10));
};

const statusValidation = [
    ...titleParams,
    body("status").isIn(STATUSES).withMessage(`status must be one of ${STATUSES.join(", ")}`)
];

const ratingValidation = [...titleParams, ratingRule("rating")];

const librarySortValidation = [
    query("status").isIn(STATUSES).withMessage(`status must be one of ${STATUSES.join(", ")}`),
    mediaTypeQuery,
    query("sort").optional().isIn(["recent", "title", "release", "rating"]),
    ...paginationQuery
];

const setListValidation = [
    mediaTypeQuery,
    query("sort").optional().isIn(["recent", "title", "release"]),
    ...paginationQuery
];

const ratingsListValidation = [
    query("rating").optional().isInt({ min: 1, max: 10 }).toInt(),
    query("sort").optional().isIn(["recent", "highest", "lowest", "title"]),
    ...paginationQuery
];

const wishlistSyncValidation = [
    body("items").isArray({ max: 100 }).withMessage("items must be an array of at most 100 titles"),
    ...titleRefBody("items.*.")
];

const createDiaryValidation = [
    ...titleRefBody(),
    watchedOnRule(false),
    ratingRule("rating").optional({ values: "null" }),
    body("isRewatch").optional().isBoolean().toBoolean(),
    body("note").optional({ values: "null" }).trim().isLength({ max: 500 }).withMessage("note must be at most 500 characters")
];

// On edit, null clears the entry's rating or note, so null must reach matchedData.
const updateDiaryValidation = [
    param("id").isInt({ min: 1 }).toInt(),
    watchedOnRule(true),
    body("rating")
        .optional()
        .custom((value) => value === null || /^(10|[1-9])$/.test(String(value)))
        .withMessage("rating must be a whole number from 1 to 10")
        .customSanitizer((value) => (value === null ? null : Number(value))),
    body("isRewatch").optional().isBoolean().toBoolean(),
    body("note")
        .optional()
        .custom((value) => value === null || (typeof value === "string" && value.trim().length <= 500))
        .withMessage("note must be at most 500 characters")
        .customSanitizer((value) => (value === null ? null : value.trim() || null))
];

const diaryIdValidation = [param("id").isInt({ min: 1 }).toInt()];

const diaryListValidation = [
    query("year").optional().isInt({ min: 1900, max: 2100 }).toInt(),
    ...paginationQuery
];

const topFiveValidation = [
    body("items")
        .isArray({ max: 5 })
        .withMessage("Pick at most five titles")
        .bail()
        .custom((items) => new Set(items.map((item) => `${item?.mediaType}:${item?.tmdbId}`)).size === items.length)
        .withMessage("Each title can appear only once"),
    ...titleRefBody("items.*.")
];

module.exports = {
    STATUSES,
    titleParams,
    titleRefBody,
    paginationQuery,
    statusValidation,
    ratingValidation,
    librarySortValidation,
    setListValidation,
    ratingsListValidation,
    wishlistSyncValidation,
    createDiaryValidation,
    updateDiaryValidation,
    diaryIdValidation,
    diaryListValidation,
    topFiveValidation
};
