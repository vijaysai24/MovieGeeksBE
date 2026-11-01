const multer = require("multer");
const AppError = require("../utils/AppError");
const config = require("../config/env");

module.exports = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message,
            code: err.code
        });
    }

    // AppErrors and body-parser errors (malformed JSON, payload too large) are meant for the client.
    const statusCode = err instanceof AppError
        ? err.statusCode
        : (err.expose && err.status) || 500;

    if (statusCode >= 500) {
        console.error(err);
    }

    res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 && config.isProduction ? "Something went wrong" : err.message,
        ...(err instanceof AppError && err.code && { code: err.code })
    });
};
