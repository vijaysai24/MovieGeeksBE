// The one place that decides which user columns leave the API. Email is only ever shown to the
// account owner.
const toPublicUser = (row) => row && ({
    id: row.id,
    name: row.name,
    username: row.username,
    bio: row.bio || null,
    avatarUrl: row.avatar_url || null,
    bannerPath: row.banner_path || null,
    createdAt: row.created_at
});

const toSelfUser = (row) => row && ({
    ...toPublicUser(row),
    email: row.email,
    region: row.region,
    role: row.role
});

// For rows that come back from joins with author_* columns (reviews, comments, activity).
const toAuthor = (row, prefix = "author_") => ({
    id: row[`${prefix}id`],
    name: row[`${prefix}name`],
    username: row[`${prefix}username`],
    avatarUrl: row[`${prefix}avatar_url`] || null
});

module.exports = {
    toPublicUser,
    toSelfUser,
    toAuthor
};
