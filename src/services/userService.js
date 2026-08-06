const repository = require('../repositories/userRepository');

const getUsers = async (payload) => {
    const users = await repository.getAllUsers(payload);
    const total = await repository.getUsersCount(payload.search);

    return {
        users,
        totalRecords: total,
        currentPage: payload.page || 1,
        pageSize: payload.limit || 10,
        totalPages: Math.ceil(total / (payload.limit || 10)),
    };
}

module.exports = {
    getUsers
};