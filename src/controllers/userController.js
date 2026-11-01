const service = require('../services/userService');
const { matchedData } = require('express-validator');
const { toPublicUser } = require('../utils/userPresenter');

const getUsers = async (req, res, next) => {
    try {
        const users = await service.getUsers(req.body);
        res.status(200).json({
            success: true,
            message: "Users fetched successfully",
            data: users
        });
    } catch (error) {
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const user = await service.updateProfile(req.user.id, matchedData(req, { locations: ['body'] }));
        res.status(200).json({
            success: true,
            message: "Profile updated",
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const uploadAvatar = async (req, res, next) => {
    try {
        const user = await service.setAvatar(req.user.id, req.file);
        res.status(200).json({
            success: true,
            message: "Avatar updated",
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const removeAvatar = async (req, res, next) => {
    try {
        const user = await service.removeAvatar(req.user.id);
        res.status(200).json({
            success: true,
            message: "Avatar removed",
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const searchUsers = async (req, res, next) => {
    try {
        const { q } = matchedData(req, { locations: ['query'] });
        const users = await service.searchUsers(q);
        res.status(200).json({
            success: true,
            data: users.map(toPublicUser)
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getUsers,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    searchUsers
};
