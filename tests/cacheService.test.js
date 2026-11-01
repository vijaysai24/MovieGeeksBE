// Runs with Redis disabled, which also exercises the in-memory fallback used when Redis is down.
process.env.REDIS_URL = "";

const test = require("node:test");
const assert = require("node:assert");
const cache = require("../src/services/cacheService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("set and get round-trip through the fallback store", async () => {
    await cache.set("test:roundtrip", { a: 1 }, 10);
    assert.deepStrictEqual(await cache.get("test:roundtrip"), { a: 1 });
    await cache.del("test:roundtrip");
    assert.strictEqual(await cache.get("test:roundtrip"), null);
});

test("wrap shares one load between concurrent callers", async () => {
    let calls = 0;
    const loader = async () => {
        calls++;
        await sleep(20);
        return "value";
    };

    const results = await Promise.all([1, 2, 3].map(() => cache.wrap("test:dedupe", 10, loader)));

    assert.deepStrictEqual(results, ["value", "value", "value"]);
    assert.strictEqual(calls, 1);
});

test("wrap serves the stale value when a refresh fails", async () => {
    await cache.wrap("test:stale", 0.05, async () => "first", { staleTtl: 5 });
    await sleep(80);

    const value = await cache.wrap("test:stale", 0.05, async () => {
        throw new Error("provider down");
    }, { staleTtl: 5 });

    assert.strictEqual(value, "first");
});

test("wrap rethrows when there is nothing stale to fall back on", async () => {
    await assert.rejects(
        cache.wrap("test:empty", 1, async () => {
            throw new Error("provider down");
        }),
        /provider down/
    );
});
