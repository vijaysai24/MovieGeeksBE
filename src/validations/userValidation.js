const { body, query, param } = require("express-validator");
const { USERNAME_PATTERN } = require("./authValidation");

const getUsersValidation = [

    body("page")
        .exists()
        .withMessage("page is required")
        .bail()
        .isInt({ min: 1 })
        .withMessage("page must be a positive integer"),

    body("limit")
        .exists()
        .withMessage("limit is required")
        .bail()
        .isInt({ min: 1 })
        .withMessage("limit must be a positive integer"),

    body("search")
        .optional({ nullable: true })
        .isString()
        .withMessage("search must be a string"),

    body("sort")
        .optional({ nullable: true })
        .matches(/^(name|email|created_at|status)-(ASC|DESC)$/)
        .withMessage(
            "sort must be one of: name-ASC, name-DESC, email-ASC, email-DESC, created_at-ASC, created_at-DESC, status-ASC, status-DESC"
        )

];

const updateProfileValidation = [

    body("name")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Name cannot be empty")
        .bail()
        .isLength({ max: 80 })
        .withMessage("Name must be at most 80 characters"),

    body("username")
        .optional()
        .trim()
        .toLowerCase()
        .matches(USERNAME_PATTERN)
        .withMessage("Username must be 3-30 lowercase letters, numbers or underscores"),

    // null and "" both clear the bio (null is coerced to "" here and stored as NULL).
    body("bio")
        .optional()
        .trim()
        .isLength({ max: 300 })
        .withMessage("Bio must be at most 300 characters"),

    body("region")
        .optional()
        .isISO31661Alpha2()
        .withMessage("region must be a two-letter country code")
        .toUpperCase(),

    // A TMDB backdrop path chosen from the user's own films, e.g. "/abc123.jpg"; null clears it.
    body("bannerPath")
        .optional()
        .custom((value) => value === null || /^\/[A-Za-z0-9]+\.(jpg|png)$/.test(value))
        .withMessage("bannerPath must be a TMDB image path")

];

const searchUsersValidation = [
    query("q")
        .trim()
        .isLength({ min: 2, max: 40 })
        .withMessage("q must be 2-40 characters")
];

const usernameParam = [
    param("username")
        .trim()
        .toLowerCase()
        .matches(USERNAME_PATTERN)
        .withMessage("Invalid username")
];

module.exports = {
    getUsersValidation,
    updateProfileValidation,
    searchUsersValidation,
    usernameParam
};
