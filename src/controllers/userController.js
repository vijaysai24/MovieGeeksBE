const service = require('../services/userService');

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

module.exports = {
    getUsers
};