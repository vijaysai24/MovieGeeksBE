const repository = require('../repositories/userRepository');
const AppError = require('../utils/AppError');
const { toSelfUser } = require('../utils/userPresenter');
const { removeAvatarFile } = require('../middlewares/uploadMiddleware');

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

const updateProfile = async (userId, changes) => {
    if (changes.username && await repository.usernameTakenByOther(changes.username, userId)) {
        throw AppError.conflict('That username is taken', 'USERNAME_TAKEN');
    }

    await repository.updateProfile(userId, {
        ...changes,
        ...(changes.bio !== undefined && { bio: changes.bio || null })
    });
    return toSelfUser(await repository.findById(userId));
};

const setAvatar = async (userId, file) => {
    const previous = await repository.findById(userId);
    await repository.updateProfile(userId, { avatarUrl: `/uploads/avatars/${file.filename}` });
    removeAvatarFile(previous?.avatar_url);
    return toSelfUser(await repository.findById(userId));
};

const removeAvatar = async (userId) => {
    const previous = await repository.findById(userId);
    await repository.updateProfile(userId, { avatarUrl: null });
    removeAvatarFile(previous?.avatar_url);
    return toSelfUser(await repository.findById(userId));
};

const searchUsers = async (term) => repository.searchPublic(term);

module.exports = {
    getUsers,
    updateProfile,
    setAvatar,
    removeAvatar,
    searchUsers
};
