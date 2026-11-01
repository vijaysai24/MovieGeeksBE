const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../config/env");

const generateToken = (payload) => {
    return jwt.sign(
        payload,
        config.jwt.secret,
        {
            expiresIn: config.jwt.expiresIn
        }
    );
};

const verifyToken = (token) => {
    return jwt.verify(
        token,
        config.jwt.secret
    );
};

// Refresh tokens are opaque random strings. Only their SHA-256 is stored, so a database leak
// does not hand out live sessions.
const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

module.exports = {
    generateToken,
    verifyToken,
    generateRefreshToken,
    hashToken
};
