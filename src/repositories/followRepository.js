const db = require("../config/db");

const follow = async (followerId, followingId) => {
    const [result] = await db.execute(
        "INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)",
        [followerId, followingId]
    );
    return result.affectedRows === 1;
};

const unfollow = async (followerId, followingId) => {
    const [result] = await db.execute(
        "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
        [followerId, followingId]
    );
    return result.affectedRows === 1;
};

const isFollowing = async (followerId, followingId) => {
    const [rows] = await db.execute(
        "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
        [followerId, followingId]
    );
    return rows.length > 0;
};

const counts = async (userId) => {
    const [[row]] = await db.execute(
        `SELECT
            (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.follower_id
             WHERE f.following_id = ? AND u.status = 'ACTIVE') AS followers,
            (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = ? AND u.status = 'ACTIVE') AS following`,
        [userId, userId]
    );
    return row;
};

// direction "followers": people who follow userId; "following": people userId follows.
const list = async (userId, direction, { viewerId, limit, offset }) => {
    const [joinColumn, matchColumn] = direction === "followers"
        ? ["follower_id", "following_id"]
        : ["following_id", "follower_id"];

    const viewerColumn = viewerId
        ? ", EXISTS (SELECT 1 FROM follows vf WHERE vf.follower_id = ? AND vf.following_id = u.id) AS viewer_follows"
        : ", 0 AS viewer_follows";

    const [rows] = await db.execute(
        `SELECT u.id, u.name, u.username, u.avatar_url, u.bio, f.created_at AS followed_at ${viewerColumn}
         FROM follows f JOIN users u ON u.id = f.${joinColumn}
         WHERE f.${matchColumn} = ? AND u.status = 'ACTIVE'
         ORDER BY f.created_at DESC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        viewerId ? [viewerId, userId] : [userId]
    );
    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM follows f JOIN users u ON u.id = f.${joinColumn}
         WHERE f.${matchColumn} = ? AND u.status = 'ACTIVE'`,
        [userId]
    );
    return { rows, total };
};

const followerIds = async (userId) => {
    const [rows] = await db.execute("SELECT follower_id FROM follows WHERE following_id = ?", [userId]);
    return rows.map((row) => row.follower_id);
};

module.exports = {
    follow,
    unfollow,
    isFollowing,
    counts,
    list,
    followerIds
};
