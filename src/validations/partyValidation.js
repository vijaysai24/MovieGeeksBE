const { body, param } = require("express-validator");
const { titleRefBody } = require("./libraryValidation");

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer").toInt();

const nameRule = body("name")
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Give the party a name of up to 80 characters");

const titleParams = [
    idParam,
    param("mediaType").isIn(["movie", "tv"]).withMessage("mediaType must be movie or tv"),
    param("tmdbId").isInt({ min: 1 }).toInt()
];

module.exports = {
    createValidation: [nameRule],
    renameValidation: [idParam, nameRule],
    idValidation: [idParam],
    joinValidation: [
        body("code")
            .trim()
            .toUpperCase()
            .matches(/^[A-HJ-NP-Z2-9]{10}$/)
            .withMessage("Invite codes are 10 letters and numbers")
    ],
    memberValidation: [idParam, param("userId").isInt({ min: 1 }).toInt()],
    addItemValidation: [idParam, ...titleRefBody()],
    titleValidation: titleParams
};
