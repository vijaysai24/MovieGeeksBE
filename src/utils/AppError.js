// An error that is safe to show to the client: it carries its own HTTP status and an optional
// machine-readable code the frontend can branch on.
class AppError extends Error {
    constructor(statusCode, message, code = null) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
    }

    static badRequest(message, code = "BAD_REQUEST") {
        return new AppError(400, message, code);
    }

    static unauthorized(message = "Authentication required", code = "UNAUTHORIZED") {
        return new AppError(401, message, code);
    }

    static forbidden(message = "You do not have permission to do that", code = "FORBIDDEN") {
        return new AppError(403, message, code);
    }

    static notFound(message = "Not found", code = "NOT_FOUND") {
        return new AppError(404, message, code);
    }

    static conflict(message, code = "CONFLICT") {
        return new AppError(409, message, code);
    }
}

module.exports = AppError;
