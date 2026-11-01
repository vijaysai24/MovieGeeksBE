const { body } = require("express-validator");

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

const passwordRule = (field) => body(field)
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be 8-128 characters")
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage("Password must contain a letter")
    .matches(/\d/)
    .withMessage("Password must contain a number");

const registerValidation = [

    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required")
        .bail()
        .isLength({ max: 80 })
        .withMessage("Name must be at most 80 characters"),

    body("email")
        .trim()
        .isEmail()
        .withMessage("Valid email is required")
        .normalizeEmail({ gmail_remove_dots: false }),

    body("username")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .matches(USERNAME_PATTERN)
        .withMessage("Username must be 3-30 lowercase letters, numbers or underscores"),

    passwordRule("password")

];

const loginValidation = [

    body("email")
        .trim()
        .isEmail()
        .withMessage("Valid email is required")
        .normalizeEmail({ gmail_remove_dots: false }),

    body("password")
        .notEmpty()
        .withMessage("Password is required")

];

const changePasswordValidation = [

    body("currentPassword")
        .notEmpty()
        .withMessage("Current password is required"),

    passwordRule("newPassword")

];

module.exports = {
    USERNAME_PATTERN,
    registerValidation,
    loginValidation,
    changePasswordValidation
};
