const reports = require("../repositories/reportRepository");
const reviews = require("../repositories/reviewRepository");
const users = require("../repositories/userRepository");
const refreshTokens = require("../repositories/refreshTokenRepository");
const cache = require("./cacheService");
const AppError = require("../utils/AppError");
const { toAuthor } = require("../utils/userPresenter");
const { paginated } = require("../utils/pagination");

// Content reported by this many different people is hidden until a moderator looks at it.
const AUTO_HIDE_THRESHOLD = 3;

const loadTarget = async (targetType, targetId) => {
    if (targetType === "REVIEW") {
        const review = await reviews.findById(targetId);
        return review && { ownerId: review.user_id, status: review.status, titleId: review.title_id };
    }
    const comment = await reviews.findComment(targetId);
    return comment && { ownerId: comment.user_id, status: comment.status, titleId: null };
};

const setTargetStatus = async (targetType, targetId, status, titleId) => {
    if (targetType === "REVIEW") {
        await reviews.setStatus(targetId, status);
        if (titleId) await cache.del(`title:${titleId}:community`);
    } else {
        await reviews.setCommentStatus(targetId, status);
    }
};

const report = async (reporterId, { targetType, targetId, reason, details }) => {
    const target = await loadTarget(targetType, targetId);
    if (!target || target.status === "REMOVED") throw AppError.notFound("That content no longer exists");
    if (target.ownerId === reporterId) throw AppError.badRequest("You can't report your own content", "OWN_CONTENT");

    const created = await reports.create({ reporterId, targetType, targetId, reason, details });

    if (created && target.status === "PUBLISHED"
        && await reports.openCountForTarget(targetType, targetId) >= AUTO_HIDE_THRESHOLD) {
        await setTargetStatus(targetType, targetId, "HIDDEN", target.titleId);
    }

    return { reported: true, alreadyReported: !created };
};

const listReports = async ({ status }, pagination) => {
    const { rows, total } = await reports.listGrouped({ status, ...pagination });
    return paginated(rows.map((row) => ({
        targetType: row.target_type,
        targetId: row.target_id,
        reportCount: Number(row.report_count),
        reasons: row.reasons ? row.reasons.split(",") : [],
        lastReportedAt: row.last_reported_at,
        content: row.content,
        contentStatus: row.content_status,
        hasSpoilers: Boolean(row.has_spoilers),
        author: row.author_id ? toAuthor(row) : null,
        title: row.tmdb_id ? { id: row.tmdb_id, mediaType: row.media_type, title: row.title } : null
    })), total, pagination);
};

const getReportDetails = async (targetType, targetId) => (await reports.listDetails(targetType, targetId)).map((row) => ({
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reporter: row.reporter_username
}));

// DISMISS: reports were unfounded, so anything auto-hidden comes back.
// HIDE / REMOVE: act on the content and close its reports. RESTORE: undo a hide.
const ACTIONS = {
    DISMISS: { contentStatus: "PUBLISHED", onlyIfHidden: true, reportStatus: "DISMISSED" },
    HIDE: { contentStatus: "HIDDEN", reportStatus: "RESOLVED" },
    REMOVE: { contentStatus: "REMOVED", reportStatus: "RESOLVED" },
    RESTORE: { contentStatus: "PUBLISHED", reportStatus: null }
};

const act = async (moderatorId, { targetType, targetId, action }) => {
    const target = await loadTarget(targetType, targetId);
    if (!target) throw AppError.notFound("That content no longer exists");

    const plan = ACTIONS[action];
    if (!plan.onlyIfHidden || target.status === "HIDDEN") {
        await setTargetStatus(targetType, targetId, plan.contentStatus, target.titleId);
    }
    const closed = plan.reportStatus ? await reports.resolveTarget(targetType, targetId, plan.reportStatus, moderatorId) : 0;

    return { targetType, targetId, action, reportsClosed: closed };
};

// Banning signs the user out everywhere; their content stays but drops out of public lists,
// which only show active accounts.
const setUserStatus = async (moderator, username, status) => {
    const user = await users.findByUsername(username);
    if (!user) throw AppError.notFound("User not found");
    if (user.id === moderator.id) throw AppError.badRequest("You can't change your own status");
    if (user.role !== "USER" && moderator.role !== "ADMIN") {
        throw AppError.forbidden("Only admins can moderate staff accounts");
    }

    await users.setStatus(user.id, status);
    if (status !== "ACTIVE") {
        await refreshTokens.revokeAllForUser(user.id);
    }
    return { username: user.username, status };
};

module.exports = {
    report,
    listReports,
    getReportDetails,
    act,
    setUserStatus
};
