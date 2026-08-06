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
            email,
            status,
            created_at
        FROM users
        WHERE 1=1
    `;

    const params = [];

    if (search !== null && search.trim() !== "") {
        query += ` AND (name LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
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
        query += ` AND (name LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.execute(query, params);

    return rows[0].total;
};

module.exports = {
    getAllUsers,
    getUsersCount
};