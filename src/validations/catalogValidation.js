const { query, param } = require("express-validator");

const toIntList = (value) => String(value)
    .split(",")
    .map((item) => Number.parseInt(item, 10))
    .filter(Number.isInteger);

const intList = (field) => query(field)
    .optional()
    .matches(/^\d+(,\d+)*$/)
    .withMessage(`${field} must be a comma-separated list of ids`)
    .customSanitizer(toIntList);

const region = query("region")
    .optional()
    .isISO31661Alpha2()
    .withMessage("region must be a two-letter country code")
    .toUpperCase();

const page = query("page")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("page must be between 1 and 500")
    .toInt();

const mediaTypeParam = param("mediaType")
    .isIn(["movie", "tv"])
    .withMessage("mediaType must be movie or tv");

const discoverFilters = [
    query("mediaType").optional().isIn(["movie", "tv"]).withMessage("mediaType must be movie or tv"),
    intList("genres"),
    intList("providers"),
    query("language").optional().isLength({ min: 2, max: 3 }).isAlpha().toLowerCase(),
    query("yearFrom").optional().isInt({ min: 1874, max: 2100 }).toInt(),
    query("yearTo").optional().isInt({ min: 1874, max: 2100 }).toInt(),
    query("ratingMin").optional().isFloat({ min: 0, max: 10 }).toFloat(),
    query("availability").optional().isIn(["theatres", "streaming", "rent", "upcoming"]),
    query("sort").optional().isIn(["popularity", "rating", "newest", "oldest", "title", "votes"]),
    query("withPeople").optional().isInt({ min: 1 }).toInt(),
    region,
    page
];

const homeValidation = [region];

const listValidation = [
    param("list").isString(),
    query("mediaType").optional().isIn(["movie", "tv", "all"]),
    region,
    page
];

const discoverValidation = discoverFilters;

const randomValidation = [
    ...discoverFilters,
    query("source").optional().isIn(["discover", "watchlist"])
];

const searchValidation = [
    query("q").trim().isLength({ min: 1, max: 100 }).withMessage("q must be 1-100 characters"),
    query("type").optional().isIn(["all", "movie", "tv", "person"]),
    page
];

const autocompleteValidation = [
    query("q").trim().isLength({ min: 1, max: 100 }).withMessage("q must be 1-100 characters")
];

const detailsValidation = [
    mediaTypeParam,
    param("id").isInt({ min: 1 }).toInt(),
    region
];

const personValidation = [
    param("id").isInt({ min: 1 }).toInt()
];

const providersValidation = [
    query("mediaType").optional().isIn(["movie", "tv"]),
    region
];

const calendarValidation = [
    query("month").matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage("month must look like 2026-11"),
    query("type").optional().isIn(["theatrical", "digital"]),
    query("mediaType").optional().isIn(["movie", "tv"]),
    region
];

module.exports = {
    homeValidation,
    listValidation,
    discoverValidation,
    randomValidation,
    searchValidation,
    autocompleteValidation,
    detailsValidation,
    personValidation,
    providersValidation,
    calendarValidation
};
