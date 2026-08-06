const { body } = require("express-validator");

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

module.exports = {
    getUsersValidation
};