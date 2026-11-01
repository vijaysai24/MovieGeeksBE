const Redis = require("ioredis");
const config = require("./env");

// Redis is an accelerator, not a dependency: when it is unreachable every command fails fast
// (no offline queue) and cacheService falls back to its in-process store.
let client = null;

if (config.redisUrl) {
    client = new Redis(config.redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) => Math.min(attempt * 1000, 15000)
    });

    let reportedDown = false;

    client.on("ready", () => {
        reportedDown = false;
        console.log("Redis connected");
    });

    client.on("error", (err) => {
        if (!reportedDown) {
            reportedDown = true;
            console.warn(`Redis unavailable (${err.message}); using in-memory cache`);
        }
    });
}

const isReady = () => client !== null && client.status === "ready";

module.exports = {
    client,
    isReady
};
