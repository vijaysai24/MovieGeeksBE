const { body, query } = require("express-validator");
const { usernameParam } = require("./userValidation");

const year = query("year").optional().isInt({ min: 1900, max: 2100 }).toInt();

const myStatsValidation = [year];

const userStatsValidation = [...usernameParam, year];

const preferencesValidation = [
    body("genres").isArray({ max: 12 }).withMessage("genres must be a list of at most 12 genre ids"),
    body("genres.*").isInt({ min: 1 }).toInt()
];

const queueRandomValidation = [
    query("mediaType").optional().isIn(["movie", "tv"]),
    query("genre").optional().isInt({ min: 1 }).toInt()
];

module.exports = {
    myStatsValidation,
    userStatsValidation,
    preferencesValidation,
    queueRandomValidation
};
