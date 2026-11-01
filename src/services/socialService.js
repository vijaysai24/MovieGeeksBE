const follows = require("../repositories/followRepository");
const feed = require("../repositories/feedRepository");
const activities = require("../repositories/activityRepository");
const notifications = require("../repositories/notificationRepository");
const users = require("../repositories/userRepository");
const AppError = require("../utils/AppError");
const { toAuthor, toPublicUser } = require("../utils/userPresenter");
const { toTitleCard } = require("../utils/titlePresenter");
const { paginated } = require("../utils/pagination");

const findUser = async (username) => {
    const user = await users.findActiveByUsername(username);
    if (!user) throw AppError.notFound("User not found", "USER_NOT_FOUND");
    return user;
};

// Follows ------------------------------------------------------------------------------------

const follow = async (followerId, username) => {
    const target = await findUser(username);
    if (target.id === followerId) throw AppError.badRequest("You can't follow yourself", "SELF_FOLLOW");

    if (await follows.follow(followerId, target.id)) {
        await activities.record({ userId: followerId, type: "FOLLOWED", targetId: target.id });
        await notifications.create({ userId: target.id, type: "FOLLOW", actorId: followerId });
    }
    return { viewerFollows: true, ...(await follows.counts(target.id)) };
};

const unfollow = async (followerId, username) => {
    const target = await findUser(username);
    if (await follows.unfollow(followerId, target.id)) {
        await activities.removeForTarget(followerId, "FOLLOWED", target.id);
    }
    return { viewerFollows: false, ...(await follows.counts(target.id)) };
};

const listConnections = async (username, direction, pagination, viewer) => {
    const user = await findUser(username);
    const { rows, total } = await follows.list(user.id, direction, { viewerId: viewer?.id || null, ...pagination });
    return paginated(rows.map((row) => ({
        ...toPublicUser(row),
        viewerFollows: Boolean(row.viewer_follows),
        followedAt: row.followed_at
    })), total, pagination);
};

// Feed ---------------------------------------------------------------------------------------

const REVIEW_EXCERPT = 320;

const toFeedItem = (row) => ({
    id: row.activity_id,
    type: row.type,
    createdAt: row.activity_at,
    actor: toAuthor(row),
    rating: row.activity_rating ?? null,
    title: row.tmdb_id ? toTitleCard(row) : null,
    ...(row.type === "REVIEWED" && {
        review: {
            id: row.target_id,
            excerpt: row.review_body.length > REVIEW_EXCERPT ? `${row.review_body.slice(0, REVIEW_EXCERPT)}...` : row.review_body,
            hasSpoilers: Boolean(row.review_has_spoilers),
            likeCount: row.review_like_count,
            commentCount: row.review_comment_count
        }
    }),
    ...(row.type === "FOLLOWED" && { followed: toAuthor(row, "followed_") }),
    ...(row.type === "LISTED" && { collection: { id: row.target_id, name: row.collection_name } })
});

// Feeds page by "has more" rather than a total: counting a join over every followed account on
// each scroll is wasted work.
const feedPage = (rows, { page, limit }) => ({
    items: rows.slice(0, limit).map(toFeedItem),
    page,
    pageSize: limit,
    hasMore: rows.length > limit
});

const getFeed = async (userId, pagination) => feedPage(await feed.forFollower(userId, pagination), pagination);

const getUserActivity = async (username, pagination) => {
    const user = await findUser(username);
    return feedPage(await feed.forUser(user.id, pagination), pagination);
};

// Notifications ------------------------------------------------------------------------------

const toNotification = (row) => ({
    id: row.id,
    type: row.type,
    message: row.message,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    actor: row.author_id ? toAuthor(row) : null,
    title: row.tmdb_id ? toTitleCard(row) : null
});

const getNotifications = async (userId, { unreadOnly }, pagination) => {
    const { rows, total } = await notifications.list(userId, { unreadOnly, ...pagination });
    return paginated(rows.map(toNotification), total, pagination);
};

const getUnreadCount = async (userId) => ({ unread: await notifications.unreadCount(userId) });

const markNotificationsRead = async (userId, ids) => {
    await notifications.markRead(userId, ids);
    return getUnreadCount(userId);
};

module.exports = {
    findUser,
    follow,
    unfollow,
    listConnections,
    getFeed,
    getUserActivity,
    getNotifications,
    getUnreadCount,
    markNotificationsRead
};
