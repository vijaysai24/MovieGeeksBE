const db = require("../config/db");
const { TITLE_COLUMNS } = require("../utils/titlePresenter");

// Activity whose subject has since been hidden, removed or made private drops out of the feed.
const FEED_SELECT = `
    SELECT a.id AS activity_id, a.type, a.target_id, a.rating AS activity_rating, a.created_at AS activity_at,
           u.id AS author_id, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
           rv.body AS review_body, rv.has_spoilers AS review_has_spoilers, rv.like_count AS review_like_count,
           rv.comment_count AS review_comment_count,
           fu.id AS followed_id, fu.name AS followed_name, fu.username AS followed_username, fu.avatar_url AS followed_avatar_url,
           col.name AS collection_name,
           ${TITLE_COLUMNS}
    FROM activities a
    JOIN users u ON u.id = a.user_id AND u.status = 'ACTIVE'
    LEFT JOIN titles t ON t.id = a.title_id
    LEFT JOIN reviews rv ON a.type = 'REVIEWED' AND rv.id = a.target_id AND rv.status = 'PUBLISHED'
    LEFT JOIN users fu ON a.type = 'FOLLOWED' AND fu.id = a.target_id AND fu.status = 'ACTIVE'
    LEFT JOIN collections col ON a.type = 'LISTED' AND col.id = a.target_id AND col.is_public = TRUE
`;

const VISIBLE = `
    NOT (a.type = 'REVIEWED' AND rv.id IS NULL)
    AND NOT (a.type = 'FOLLOWED' AND fu.id IS NULL)
    AND NOT (a.type = 'LISTED' AND col.id IS NULL)
`;

const forFollower = async (followerId, { limit, offset }) => {
    const [rows] = await db.execute(
        `${FEED_SELECT}
         JOIN follows f ON f.following_id = a.user_id AND f.follower_id = ?
         WHERE ${VISIBLE}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ${Number(limit) + 1} OFFSET ${Number(offset)}`,
        [followerId]
    );
    return rows;
};

const forUser = async (userId, { limit, offset }) => {
    const [rows] = await db.execute(
        `${FEED_SELECT}
         WHERE a.user_id = ? AND ${VISIBLE}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ${Number(limit) + 1} OFFSET ${Number(offset)}`,
        [userId]
    );
    return rows;
};

module.exports = {
    forFollower,
    forUser
};
