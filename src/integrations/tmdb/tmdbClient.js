const axios = require("axios");
const config = require("../../config/env");
const AppError = require("../../utils/AppError");

// TMDB allows roughly 40-50 requests per second; stay well under it and retry politely.
const MAX_CONCURRENT = 16;
const MAX_RETRIES = 2;

const http = axios.create({
    baseURL: config.tmdb.baseUrl,
    timeout: 8000,
    headers: {
        Authorization: `Bearer ${config.tmdb.token}`,
        Accept: "application/json"
    }
});

let active = 0;
const waiting = [];

const acquire = () => new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
        active++;
        resolve();
    } else {
        waiting.push(resolve);
    }
});

const release = () => {
    const next = waiting.shift();
    if (next) {
        next();
    } else {
        active--;
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (err) => !err.response || err.response.status === 429 || err.response.status >= 500;

const retryDelay = (err, attempt) => {
    const retryAfter = Number(err.response?.headers?.["retry-after"]);
    if (retryAfter > 0) return Math.min(retryAfter, 10) * 1000;
    return 300 * 2 ** attempt + Math.random() * 200;
};

const get = async (path, params = {}) => {
    await acquire();
    try {
        for (let attempt = 0; ; attempt++) {
            try {
                const response = await http.get(path, { params: { language: "en-US", ...params } });
                return response.data;
            } catch (err) {
                const status = err.response?.status;

                if (status === 404) {
                    throw AppError.notFound("We couldn't find that title or person", "TMDB_NOT_FOUND");
                }

                if (status === 401) {
                    console.error("TMDB rejected the API token. Check TMDB_TOKEN in .env");
                }

                if (attempt >= MAX_RETRIES || !isRetryable(err)) {
                    console.warn(`TMDB request failed: ${path} (${status || err.code || err.message})`);
                    throw new AppError(502, "Movie data is temporarily unavailable. Please try again shortly.", "PROVIDER_UNAVAILABLE");
                }

                await sleep(retryDelay(err, attempt));
            }
        }
    } finally {
        release();
    }
};

module.exports = {
    get
};
