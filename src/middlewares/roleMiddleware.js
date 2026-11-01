// Use after authMiddleware: requireRole("MODERATOR", "ADMIN")
module.exports = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to do that",
            code: "FORBIDDEN"
        });
    }
    next();
};
