require("dotenv").config({ quiet: true });

const required = ["DB_HOST", "DB_USER", "DB_NAME", "JWT_SECRET", "TMDB_TOKEN"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
    port: Number(process.env.PORT) || 5000,
    isProduction: process.env.NODE_ENV === "production",
    clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((origin) => origin.trim()),
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || "15m"
    },
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS) || 30,
    redisUrl: process.env.REDIS_URL || null,
    tmdb: {
        token: process.env.TMDB_TOKEN,
        baseUrl: process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3"
    },
    omdbApiKey: process.env.OMDB_API_KEY || null,
    defaultRegion: (process.env.DEFAULT_REGION || "IN").toUpperCase()
};
