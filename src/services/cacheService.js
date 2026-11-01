const redis = require("../config/redis");

const PREFIX = "mg:";
const MEMORY_LIMIT = 2000;

// Fallback store used while Redis is unreachable. Map keeps insertion order, so deleting the
// first key evicts the oldest entry.
const memory = new Map();
const inFlight = new Map();

const memoryGet = (key) => {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        memory.delete(key);
        return null;
    }
    return entry.value;
};

const memorySet = (key, value, ttlSeconds) => {
    if (memory.size >= MEMORY_LIMIT) {
        memory.delete(memory.keys().next().value);
    }
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

const get = async (key) => {
    const fullKey = PREFIX + key;
    if (redis.isReady()) {
        try {
            const raw = await redis.client.get(fullKey);
            return raw === null ? null : JSON.parse(raw);
        } catch {
            // fall through to memory
        }
    }
    return memoryGet(fullKey);
};

const set = async (key, value, ttlSeconds) => {
    const fullKey = PREFIX + key;
    if (redis.isReady()) {
        try {
            await redis.client.set(fullKey, JSON.stringify(value), "EX", Math.ceil(ttlSeconds));
            return;
        } catch {
            // fall through to memory
        }
    }
    memorySet(fullKey, value, ttlSeconds);
};

const del = async (...keys) => {
    const fullKeys = keys.map((key) => PREFIX + key);
    fullKeys.forEach((key) => memory.delete(key));
    if (redis.isReady() && fullKeys.length) {
        try {
            await redis.client.del(...fullKeys);
        } catch {
            // the entry will expire on its own
        }
    }
};

// Read-through cache with stale fallback. Each entry is kept for `staleTtl` but is only fresh for
// `ttl`; after that the loader runs again, and if it fails (provider down, rate limited) the last
// good value is served instead of an error. Concurrent misses for one key share a single load.
const wrap = async (key, ttl, loader, { staleTtl = ttl * 8 } = {}) => {
    const cached = await get(key);
    if (cached && cached.freshUntil > Date.now()) {
        return cached.value;
    }

    if (inFlight.has(key)) {
        return inFlight.get(key);
    }

    const load = (async () => {
        try {
            const value = await loader();
            await set(key, { value, freshUntil: Date.now() + ttl * 1000 }, Math.max(ttl, staleTtl));
            return value;
        } catch (err) {
            if (cached) {
                return cached.value;
            }
            throw err;
        } finally {
            inFlight.delete(key);
        }
    })();

    inFlight.set(key, load);
    return load;
};

module.exports = {
    get,
    set,
    del,
    wrap
};
