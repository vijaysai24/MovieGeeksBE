const service = require("../services/authService.js");
const config = require("../config/env");

const REFRESH_COOKIE = "mg_refresh";

// The refresh token never reaches JavaScript: it lives in an httpOnly cookie scoped to the auth
// routes, and only the short-lived access token is returned in the body.
const cookieOptions = (expires) => ({
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? "none" : "lax",
    path: "/api/auth",
    ...(expires && { expires })
});

const sendSession = (res, status, message, session) => {
    res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(session.refreshExpiresAt));
    res.status(status).json({
        success: true,
        message,
        data: {
            token: session.token,
            user: session.user
        }
    });
};

const register = async (req, res, next) => {
    try {
        const { name, email, password, username } = req.body;
        const session = await service.register(
            name,
            email,
            password,
            { username, userAgent: req.get("user-agent") }
        );
        sendSession(res, 201, "User registered successfully", session);
    } catch (err) {
        next(err);
    }
};


const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const session = await service.login(email, password, { userAgent: req.get("user-agent") });
        sendSession(res, 200, "Login successful", session);
    }
    catch (err) {
        next(err);
    }
};

const refresh = async (req, res, next) => {
    try {
        const session = await service.refresh(req.cookies[REFRESH_COOKIE], { userAgent: req.get("user-agent") });
        sendSession(res, 200, "Session refreshed", session);
    } catch (err) {
        if (err.code !== "REFRESH_RACE") {
            res.clearCookie(REFRESH_COOKIE, cookieOptions());
        }
        next(err);
    }
};

const logout = async (req, res, next) => {
    try {
        await service.logout(req.cookies[REFRESH_COOKIE]);
        res.clearCookie(REFRESH_COOKIE, cookieOptions());
        res.status(200).json({
            success: true,
            message: "Logged out"
        });
    } catch (err) {
        next(err);
    }
};

const me = async (req, res, next) => {
    try {
        const user = await service.getMe(req.user.id);
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        next(err);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const session = await service.changePassword(req.user.id, currentPassword, newPassword, {
            userAgent: req.get("user-agent")
        });
        sendSession(res, 200, "Password changed", session);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    me,
    changePassword
};
