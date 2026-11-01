const db = require("../config/db");

const getAllUsers = async ({
    page = 1,
    limit = 10,
    search = null,
    sort = null
}) => {

    const offset = (page - 1) * limit;

    let finalSortBy = "created_at";
    let finalSortOrder = "DESC";

    if (sort) {
        const [sortBy, sortOrder] = sort.split("-");

        const allowedSortColumns = [
            "name",
            "email",
            "created_at",
            "status"
        ];

        const allowedOrders = ["ASC", "DESC"];

        if (allowedSortColumns.includes(sortBy)) {
            finalSortBy = sortBy;
        }

        if (allowedOrders.includes(sortOrder?.toUpperCase())) {
            finalSortOrder = sortOrder.toUpperCase();
        }
    }

    let query = `
        SELECT
            id,
            name,
            username,
            email,
            role,
            status,
            created_at
        FROM users
        WHERE 1=1
    `;

    const params = [];

    if (search !== null && search.trim() !== "") {
        query += ` AND (name LIKE ? OR email LIKE ? OR username LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY ${finalSortBy} ${finalSortOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const [rows] = await db.execute(query, params);

    return rows;
};

const getUsersCount = async (search = null) => {

    let query = `
        SELECT COUNT(*) AS total
        FROM users
        WHERE 1=1
    `;

    const params = [];

    if (search !== null && search.trim() !== "") {
        query += ` AND (name LIKE ? OR email LIKE ? OR username LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await db.execute(query, params);

    return rows[0].total;
};

const findById = async (id) => {
    const [rows] = await db.execute("SELECT * FROM users WHERE id = ?", [id]);
    return rows[0];
};

const findActiveByUsername = async (username) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE username = ? AND status = 'ACTIVE'",
        [username]
    );
    return rows[0];
};

const usernameTakenByOther = async (username, userId) => {
    const [rows] = await db.execute(
        "SELECT 1 FROM users WHERE username = ? AND id <> ?",
        [username, userId]
    );
    return rows.length > 0;
};

// Only the columns named here can ever be written through a profile update.
const PROFILE_COLUMNS = {
    name: "name",
    username: "username",
    bio: "bio",
    region: "region",
    bannerPath: "banner_path",
    avatarUrl: "avatar_url"
};

const updateProfile = async (userId, changes) => {
    const entries = Object.entries(changes).filter(([key, value]) => PROFILE_COLUMNS[key] && value !== undefined);
    if (!entries.length) return;

    const assignments = entries.map(([key]) => `${PROFILE_COLUMNS[key]} = ?`).join(", ");
    await db.execute(
        `UPDATE users SET ${assignments} WHERE id = ?`,
        [...entries.map(([, value]) => value), userId]
    );
};

const searchPublic = async (term, limit = 10) => {
    const [rows] = await db.execute(
        `SELECT id, name, username, avatar_url, bio
         FROM users
         WHERE status = 'ACTIVE' AND (username LIKE ? OR name LIKE ?)
         ORDER BY username = ? DESC, username
         LIMIT ${Number(limit)}`,
        [`${term}%`, `%${term}%`, term]
    );
    return rows;
};

module.exports = {
    getAllUsers,
    getUsersCount,
    findById,
    findActiveByUsername,
    usernameTakenByOther,
    updateProfile,
    searchPublic
};
