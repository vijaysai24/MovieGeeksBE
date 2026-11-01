const titleRepository = require("../repositories/titleRepository");
const catalog = require("./catalogService");

// Snapshots are refreshed on the next interaction once they are a week old, which keeps posters,
// release dates and scores current without a background sync of every stored title.
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const isFresh = (syncedAt) => Date.now() - new Date(syncedAt).getTime() < SNAPSHOT_MAX_AGE_MS;

// Returns our titles.id for a TMDB title, storing its snapshot the first time a user acts on it.
// Throws 404 when TMDB does not know the title, so the library never holds dangling references.
const ensureTitle = async (mediaType, tmdbId) => {
    const existing = await titleRepository.findByTmdb(mediaType, tmdbId);
    if (existing && isFresh(existing.synced_at)) return existing.id;

    try {
        const details = await catalog.getCachedDetails(mediaType, tmdbId);
        return await titleRepository.upsertSnapshot(details);
    } catch (err) {
        // A stale snapshot is still a valid reference if TMDB is briefly unavailable.
        if (existing && err.statusCode !== 404) return existing.id;
        throw err;
    }
};

// Read paths never create snapshots: a title nobody has touched has no community data.
const findTitleId = async (mediaType, tmdbId) => {
    const existing = await titleRepository.findByTmdb(mediaType, tmdbId);
    return existing ? existing.id : null;
};

module.exports = {
    ensureTitle,
    findTitleId
};
