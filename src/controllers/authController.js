const service = require("../services/authService.js");

const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        const user = await service.register(
            name,
            email,
            password
        );
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: user
        });
    } catch (err) {
        next(err);
    }
};


const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const result = await service.login(email, password);
        res.status(200).json({
            success: true,
            message: "Login successful",
            data: result
        });
    }
    catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    login
};