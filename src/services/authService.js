const bcrypt = require("bcrypt");
const crypto = require("crypto");

const repository = require("../repositories/authRepository");
const refreshTokens = require("../repositories/refreshTokenRepository");
const { generateToken, generateRefreshToken, hashToken } = require("../utils/jwt");
const { toSelfUser } = require("../utils/userPresenter");
const AppError = require("../utils/AppError");
const config = require("../config/env");

const SALT_ROUNDS = 12;
const REFRESH_RACE_GRACE_MS = 30 * 1000;

const slugify = (value) => value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);

// Existing clients register with only name, email and password, so a username is derived when
// none is given.
const availableUsername = async (requested, name, email) => {
    if (requested) {
        if (await repository.findByUsername(requested)) {
            throw AppError.conflict("That username is taken", "USERNAME_TAKEN");
        }
        return requested;
    }

    let base = slugify(name) || slugify(email.split("@")[0]);
    if (base.length < 3) base = `geek${base}`;

    if (!(await repository.findByUsername(base))) return base;

    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = `${base.slice(0, 24)}${crypto.randomInt(100, 99999)}`;
        if (!(await repository.findByUsername(candidate))) return candidate;
    }

    throw AppError.conflict("Could not pick a username, please choose one", "USERNAME_TAKEN");
};

const issueSession = async (user, { familyId = crypto.randomUUID(), userAgent = null } = {}) => {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 3600 * 1000);

    await refreshTokens.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt,
        userAgent: userAgent ? userAgent.slice(0, 255) : null
    });

    const token = generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
    });

    return {
        token,
        refreshToken,
        refreshExpiresAt: expiresAt,
        user: toSelfUser(user)
    };
};

const register = async (name, email, password, { username, userAgent } = {}) => {
    const existingUser = await repository.findByEmail(email);

    if (existingUser) {
        throw AppError.conflict("Email already registered", "EMAIL_TAKEN");
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const chosenUsername = await availableUsername(username, name, email);

    const id = await repository.createUser(
        name,
        chosenUsername,
        email,
        hashedPassword
    );

    return issueSession(await repository.findById(id), { userAgent });
};

const login = async (email, password, { userAgent } = {}) => {
    const user = await repository.findByEmail(email);
    if (!user) {
        throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
        throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.status !== "ACTIVE") {
        throw AppError.forbidden("This account is not active", "ACCOUNT_INACTIVE");
    }

    return issueSession(user, { userAgent });
};

// Rotation: every refresh token works exactly once. Presenting a token that was already used
// means it was copied, so the whole session family is revoked and the user must sign in again.
const refresh = async (rawToken, { userAgent } = {}) => {
    if (!rawToken) {
        throw AppError.unauthorized("Session expired, please sign in again", "SESSION_EXPIRED");
    }

    const stored = await refreshTokens.findByHash(hashToken(rawToken));

    if (!stored) {
        throw AppError.unauthorized("Session expired, please sign in again", "SESSION_EXPIRED");
    }

    // Two tabs refreshing at the same moment send the same cookie; the loser should retry with
    // the cookie the winner just received rather than sign everyone out.
    if (stored.revoked_at) {
        // A family with no live token was signed out or already shut down for reuse.
        if (!(await refreshTokens.hasActiveInFamily(stored.family_id))) {
            throw AppError.unauthorized("Session expired, please sign in again", "SESSION_EXPIRED");
        }
        if (Date.now() - new Date(stored.revoked_at).getTime() < REFRESH_RACE_GRACE_MS) {
            throw AppError.unauthorized("Session was just refreshed, retry", "REFRESH_RACE");
        }
        await refreshTokens.revokeFamily(stored.family_id);
        throw AppError.unauthorized("Session expired, please sign in again", "SESSION_REUSED");
    }

    if (new Date(stored.expires_at) <= new Date()) {
        throw AppError.unauthorized("Session expired, please sign in again", "SESSION_EXPIRED");
    }

    if (!(await refreshTokens.revoke(stored.id))) {
        throw AppError.unauthorized("Session was just refreshed, retry", "REFRESH_RACE");
    }

    const user = await repository.findById(stored.user_id);
    if (!user || user.status !== "ACTIVE") {
        throw AppError.forbidden("This account is not active", "ACCOUNT_INACTIVE");
    }

    return issueSession(user, { familyId: stored.family_id, userAgent });
};

const logout = async (rawToken) => {
    if (!rawToken) return;
    const stored = await refreshTokens.findByHash(hashToken(rawToken));
    if (stored) {
        await refreshTokens.revokeFamily(stored.family_id);
    }
};

const getMe = async (userId) => {
    const user = await repository.findById(userId);
    if (!user) throw AppError.notFound("User not found");
    return toSelfUser(user);
};

// Changing the password signs out every other device.
const changePassword = async (userId, currentPassword, newPassword, { userAgent } = {}) => {
    const user = await repository.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    if (!(await bcrypt.compare(currentPassword, user.password))) {
        throw AppError.badRequest("Current password is incorrect", "INVALID_PASSWORD");
    }

    await repository.updatePassword(userId, await bcrypt.hash(newPassword, SALT_ROUNDS));
    await refreshTokens.revokeAllForUser(userId);

    return issueSession(user, { userAgent });
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    getMe,
    changePassword
};
