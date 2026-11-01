// Wraps an async controller so its errors reach the error middleware, keeping each handler to
// the work it actually does.
module.exports = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (err) {
        next(err);
    }
};
