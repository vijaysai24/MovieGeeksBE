const axios = require("axios");
const config = require("../../config/env");
const cache = require("../../services/cacheService");

// OMDb is the only source here for IMDb, Rotten Tomatoes and Metacritic scores. It is optional:
// without OMDB_API_KEY, or when OMDb fails, title pages simply show TMDB's score alone.
const TTL_SECONDS = 3 * 24 * 3600;

const parseNumber = (value) => {
    const number = Number(String(value).replace(/[^0-9.]/g, ""));
    return value && value !== "N/A" && Number.isFinite(number) && number > 0 ? number : null;
};

const getRatings = async (imdbId) => {
    if (!config.omdbApiKey || !imdbId) return null;

    try {
        return await cache.wrap(`omdb:${imdbId}`, TTL_SECONDS, async () => {
            const { data } = await axios.get("https://www.omdbapi.com/", {
                params: { apikey: config.omdbApiKey, i: imdbId },
                timeout: 5000
            });

            if (data.Response === "False") return null;

            const rottenTomatoes = (data.Ratings || []).find((rating) => rating.Source === "Rotten Tomatoes");

            return {
                imdb: parseNumber(data.imdbRating)
                    ? { score: parseNumber(data.imdbRating), votes: parseNumber(data.imdbVotes) }
                    : null,
                rottenTomatoes: rottenTomatoes ? parseNumber(rottenTomatoes.Value) : null,
                metacritic: parseNumber(data.Metascore)
            };
        });
    } catch (err) {
        console.warn(`OMDb lookup failed for ${imdbId}: ${err.message}`);
        return null;
    }
};

module.exports = {
    getRatings
};
