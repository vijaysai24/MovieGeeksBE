const { verifyToken } = require("../utils/jwt");

// For routes that guests can use but signed-in users see more of. A missing token is fine; an
// expired one is still reported so the client knows to refresh.
module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next();
    }

    try {
        req.user = verifyToken(authHeader.split(" ")[1]);
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
            code: error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN"
        });
    }
};
