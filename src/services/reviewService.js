const repository = require("../repositories/reviewRepository");
const activities = require("../repositories/activityRepository");
const notifications = require("../repositories/notificationRepository");
const titleService = require("./titleService");
const libraryService = require("./libraryService");
const AppError = require("../utils/AppError");
const { toAuthor } = require("../utils/userPresenter");
const { toTitleCard } = require("../utils/titlePresenter");
const { paginated } = require("../utils/pagination");

const STAFF_ROLES = ["MODERATOR", "ADMIN"];
const isStaff = (viewer) => Boolean(viewer && STAFF_ROLES.includes(viewer.role));

const EDIT_GRACE_MS = 60 * 1000;

const toReview = (row, viewerId = null) => ({
    id: row.id,
    body: row.body,
    hasSpoilers: Boolean(row.has_spoilers),
    likeCount: row.like_count,
    dislikeCount: row.dislike_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: new Date(row.updated_at) - new Date(row.created_at) > EDIT_GRACE_MS,
    author: toAuthor(row),
    authorRating: row.author_rating ?? null,
    viewerReaction: row.viewer_reaction || null,
    isOwn: viewerId !== null && viewerId === row.user_id,
    // Only the author sees that their review is hidden; to everyone else it does not exist.
    ...(row.status !== "PUBLISHED" && { status: row.status }),
    ...(row.tmdb_id && { title: toTitleCard(row) })
});

const toComment = (row, viewer = null) => ({
    id: row.id,
    reviewId: row.review_id,
    body: row.body,
    createdAt: row.created_at,
    author: toAuthor(row),
    isOwn: Boolean(viewer && viewer.id === row.user_id)
});

const loadVisibleReview = async (reviewId, viewer) => {
    const row = await repository.findById(reviewId, viewer?.id || null);
    const visible = row && (row.status === "PUBLISHED" || (viewer && (row.user_id === viewer.id || isStaff(viewer))));
    if (!visible) throw AppError.notFound("Review not found");
    return row;
};

const listForTitle = async (mediaType, tmdbId, { sort }, pagination, viewer) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (!titleId) return paginated([], 0, pagination);

    const { rows, total } = await repository.listForTitle(titleId, {
        sort,
        viewerId: viewer?.id || null,
        ...pagination
    });
    return paginated(rows.map((row) => toReview(row, viewer?.id || null)), total, pagination);
};

// One review per person per title; posting again edits it. A rating sent with the review is
// saved as the user's rating, and reviewing implies having watched it.
const saveReview = async (userId, mediaType, tmdbId, { body, hasSpoilers, rating }) => {
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    const existing = await repository.findOwn(userId, titleId);

    const { id } = await repository.upsert({ userId, titleId, body, hasSpoilers: Boolean(hasSpoilers) });
    await libraryService.markWatchedForTitle(userId, titleId, { rating });

    if (!existing || existing.status === "REMOVED") {
        await activities.replaceRecent({ userId, type: "REVIEWED", titleId, targetId: id, rating: rating ?? null });
    }

    return toReview(await repository.findById(id, userId), userId);
};

const deleteOwnReview = async (userId, mediaType, tmdbId) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    const existing = titleId ? await repository.findOwn(userId, titleId) : null;
    if (!existing) throw AppError.notFound("You have not reviewed this title");

    await repository.remove(existing.id);
    await activities.removeForTarget(userId, "REVIEWED", existing.id);
    await libraryService.invalidate(userId, titleId);
};

const getReview = async (reviewId, viewer) => toReview(await loadVisibleReview(reviewId, viewer), viewer?.id || null);

const react = async (viewer, reviewId, reaction) => {
    const review = await loadVisibleReview(reviewId, viewer);
    if (review.status !== "PUBLISHED") throw AppError.badRequest("This review is not public");
    if (review.user_id === viewer.id) throw AppError.forbidden("You can't react to your own review", "OWN_REVIEW");

    const previous = await repository.setReaction(reviewId, viewer.id, reaction);

    if (reaction === "LIKE" && previous !== "LIKE") {
        await notifications.create({
            userId: review.user_id,
            type: "REVIEW_LIKE",
            actorId: viewer.id,
            titleId: review.title_id,
            entityId: reviewId
        });
    }

    return getReview(reviewId, viewer);
};

const unreact = async (viewer, reviewId) => {
    await loadVisibleReview(reviewId, viewer);
    await repository.clearReaction(reviewId, viewer.id);
    return getReview(reviewId, viewer);
};

const listComments = async (reviewId, pagination, viewer) => {
    await loadVisibleReview(reviewId, viewer);
    const { rows, total } = await repository.listComments(reviewId, pagination);
    return paginated(rows.map((row) => toComment(row, viewer)), total, pagination);
};

const addComment = async (viewer, reviewId, body) => {
    const review = await loadVisibleReview(reviewId, viewer);
    if (review.status !== "PUBLISHED") throw AppError.badRequest("This review is not public");

    const commentId = await repository.createComment({ reviewId, userId: viewer.id, body });

    await notifications.create({
        userId: review.user_id,
        type: "REVIEW_COMMENT",
        actorId: viewer.id,
        titleId: review.title_id,
        entityId: reviewId,
        message: body.slice(0, 140)
    });

    return toComment(await repository.findComment(commentId), viewer);
};

// Commenters, the review's author (on their own thread) and staff may remove a comment.
const deleteComment = async (viewer, commentId) => {
    const comment = await repository.findComment(commentId);
    if (!comment || comment.status === "REMOVED") throw AppError.notFound("Comment not found");

    const review = await repository.findById(comment.review_id);
    const allowed = comment.user_id === viewer.id || review?.user_id === viewer.id || isStaff(viewer);
    if (!allowed) throw AppError.forbidden();

    await repository.setCommentStatus(commentId, "REMOVED");
};

const listPopular = async ({ period }, pagination, viewer) => {
    const { rows, total } = await repository.listPopular({ period, viewerId: viewer?.id || null, ...pagination });
    return paginated(rows.map((row) => toReview(row, viewer?.id || null)), total, pagination);
};

const listByUser = async (userId, { sort }, pagination, viewer) => {
    const { rows, total } = await repository.listByUser(userId, { sort, viewerId: viewer?.id || null, ...pagination });
    return paginated(rows.map((row) => toReview(row, viewer?.id || null)), total, pagination);
};

module.exports = {
    STAFF_ROLES,
    isStaff,
    toReview,
    listForTitle,
    saveReview,
    deleteOwnReview,
    getReview,
    react,
    unreact,
    listComments,
    addComment,
    deleteComment,
    listPopular,
    listByUser
};
