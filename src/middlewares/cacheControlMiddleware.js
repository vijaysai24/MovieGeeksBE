// Lets browsers reuse public catalogue responses for a few minutes instead of re-asking the API.
module.exports = (maxAgeSeconds) => (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") {
        res.set("Cache-Control", `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`);
    }
    next();
};
