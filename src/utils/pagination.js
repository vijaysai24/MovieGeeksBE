const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parsePagination = ({ page, limit } = {}, defaultLimit = DEFAULT_LIMIT) => {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || defaultLimit));

    return {
        page: safePage,
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit
    };
};

const paginated = (items, total, { page, limit }) => ({
    items,
    page,
    pageSize: limit,
    totalRecords: total,
    totalPages: Math.max(1, Math.ceil(total / limit))
});

module.exports = {
    parsePagination,
    paginated
};
