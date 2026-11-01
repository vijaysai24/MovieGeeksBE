const { verifyToken } = require("../utils/jwt");

const authMiddleware = (req, res, next) => {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization header is missing",
                code: "UNAUTHORIZED"
            });
        }

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format",
                code: "UNAUTHORIZED"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = verifyToken(token);

        req.user = decoded;

        next();

    } catch (error) {

        // TOKEN_EXPIRED tells the client to refresh and retry rather than sign the user out.
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
            code: error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN"
        });

    }

};

module.exports = authMiddleware;
