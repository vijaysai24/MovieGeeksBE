const { body, param, query } = require("express-validator");
const { titleRefBody, paginationQuery } = require("./libraryValidation");
const { usernameParam } = require("./userValidation");

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer").toInt();

const itemParams = [
    idParam,
    param("mediaType").isIn(["movie", "tv"]).withMessage("mediaType must be movie or tv"),
    param("tmdbId").isInt({ min: 1 }).toInt()
];

const nameRule = (optional) => {
    const rule = body("name");
    return (optional ? rule.optional() : rule)
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage("Give the list a name of up to 100 characters");
};

const descriptionRule = body("description")
    .optional()
    .custom((value) => value === null || (typeof value === "string" && value.trim().length <= 1000))
    .withMessage("description must be at most 1000 characters")
    .customSanitizer((value) => (value === null ? null : value.trim() || null));

const noteRule = body("note")
    .optional()
    .custom((value) => value === null || (typeof value === "string" && value.trim().length <= 300))
    .withMessage("note must be at most 300 characters")
    .customSanitizer((value) => (value === null ? null : value.trim() || null));

const createValidation = [
    nameRule(false),
    descriptionRule,
    body("isPublic").optional().isBoolean().toBoolean(),
    body("isRanked").optional().isBoolean().toBoolean()
];

const updateValidation = [
    idParam,
    nameRule(true),
    descriptionRule,
    body("isPublic").optional().isBoolean().toBoolean(),
    body("isRanked").optional().isBoolean().toBoolean()
];

const idValidation = [idParam];

const getValidation = [idParam, ...paginationQuery];

// "containing=movie:603" marks which of my lists already hold that title.
const mineValidation = [
    query("containing")
        .optional()
        .matches(/^(movie|tv):\d+$/)
        .withMessage("containing must look like movie:603")
        .customSanitizer((value) => {
            const [mediaType, tmdbId] = value.split(":");
            return { mediaType, tmdbId: Number(tmdbId) };
        }),
    ...paginationQuery
];

const userListsValidation = [...usernameParam, ...paginationQuery];

const addItemValidation = [idParam, ...titleRefBody(), noteRule];

const updateItemValidation = [...itemParams, noteRule];

const removeItemValidation = itemParams;

const reorderValidation = [
    idParam,
    body("items").isArray({ min: 1, max: 500 }).withMessage("items must list every title on the list"),
    ...titleRefBody("items.*.")
];

module.exports = {
    createValidation,
    updateValidation,
    idValidation,
    getValidation,
    mineValidation,
    userListsValidation,
    addItemValidation,
    updateItemValidation,
    removeItemValidation,
    reorderValidation
};
