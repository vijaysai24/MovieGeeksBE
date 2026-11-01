const rateLimit = require("express-rate-limit");

// Caps how fast one account can post reviews, comments and reports. Use after authMiddleware.
module.exports = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 40,
    keyGenerator: (req) => `user:${req.user.id}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "You're posting very fast, take a breather and try again", code: "RATE_LIMITED" }
});
