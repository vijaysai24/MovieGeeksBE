// Every read of external movie data goes through here: one place that decides what to ask TMDB,
// how long to cache it, and how to shape it.
const tmdb = require("../integrations/tmdb/tmdbClient");
const mapper = require("../integrations/tmdb/tmdbMapper");
const omdb = require("../integrations/omdb/omdbClient");
const cache = require("./cacheService");
const AppError = require("../utils/AppError");
const { today, daysFromToday, monthRange } = require("../utils/dates");

const HOUR = 3600;
const TTL = {
    trending: 1 * HOUR,
    list: 3 * HOUR,
    discover: 3 * HOUR,
    search: 0.25 * HOUR,
    details: 12 * HOUR,
    person: 24 * HOUR,
    calendar: 6 * HOUR,
    reference: 7 * 24 * HOUR
};

const DETAILS_APPEND = {
    movie: "credits,videos,watch/providers,external_ids,release_dates,recommendations,similar",
    tv: "credits,videos,watch/providers,external_ids,content_ratings,recommendations,similar"
};

// Trailers are often in the original language; ask for the common ones plus language-less clips.
const VIDEO_LANGUAGES = "en,hi,te,ta,ml,kn,ko,ja,es,fr,de,it,null";

const STREAMING_TYPES = "flatrate|free|ads";

// News, reality and talk shows crowd TMDB's fixed TV lists (airing today, popular).
const NON_STORY_TV_GENRES = new Set([10763, 10764, 10767]);

const cachedGet = (key, ttl, path, params) => cache.wrap(`tmdb:${key}`, ttl, () => tmdb.get(path, params));

const stableKey = (params) => Object.keys(params)
    .sort()
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${key}=${params[key]}`)
    .join("&");

// Discover ------------------------------------------------------------------------------------

const SORTS = {
    popularity: { movie: "popularity.desc", tv: "popularity.desc" },
    rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
    newest: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
    oldest: { movie: "primary_release_date.asc", tv: "first_air_date.asc" },
    title: { movie: "title.asc", tv: "name.asc" },
    votes: { movie: "vote_count.desc", tv: "vote_count.desc" }
};

const buildDiscoverParams = (mediaType, filters, region) => {
    const isMovie = mediaType === "movie";
    const dateField = isMovie ? "primary_release_date" : "first_air_date";
    const sort = SORTS[filters.sort] ? filters.sort : "popularity";

    const params = {
        page: filters.page || 1,
        include_adult: false,
        sort_by: SORTS[sort][mediaType]
    };

    if (filters.genres?.length) params.with_genres = filters.genres.join("|");
    if (filters.language) params.with_original_language = filters.language;
    if (filters.yearFrom) params[`${dateField}.gte`] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params[`${dateField}.lte`] = `${filters.yearTo}-12-31`;
    if (filters.ratingMin) params["vote_average.gte"] = filters.ratingMin;
    if (filters.withPeople && isMovie) params.with_people = filters.withPeople;

    // A rating sort or floor is meaningless on titles with a handful of votes. Regional-language
    // cinema has far fewer TMDB voters, so its floor is lower.
    if (filters.ratingMin || sort === "rating") {
        params["vote_count.gte"] = filters.language && filters.language !== "en" ? 25 : 150;
    }

    if (filters.providers?.length) {
        params.with_watch_providers = filters.providers.join("|");
        params.watch_region = region;
        params.with_watch_monetization_types = STREAMING_TYPES;
    }

    switch (filters.availability) {
        case "theatres":
            if (isMovie) {
                params.region = region;
                params.with_release_type = "2|3";
                params["release_date.gte"] = daysFromToday(-45);
                params["release_date.lte"] = today();
            }
            break;
        case "streaming":
            params.watch_region = region;
            params.with_watch_monetization_types = STREAMING_TYPES;
            break;
        case "rent":
            params.watch_region = region;
            params.with_watch_monetization_types = "rent|buy";
            break;
        case "upcoming":
            if (isMovie) {
                params.region = region;
                params.with_release_type = "2|3";
                params["release_date.gte"] = daysFromToday(1);
            } else {
                params["first_air_date.gte"] = daysFromToday(1);
            }
            break;
        default:
            break;
    }

    // Without an upper bound, "newest" surfaces placeholder entries dated years ahead.
    if (sort === "newest" && filters.availability !== "upcoming" && !params[`${dateField}.lte`]) {
        params[`${dateField}.lte`] = today();
    }

    return params;
};

const discover = async (mediaType, filters, region) => {
    const params = buildDiscoverParams(mediaType, filters, region);
    const data = await cachedGet(`discover:${mediaType}:${stableKey(params)}`, TTL.discover, `/discover/${mediaType}`, params);
    return mapper.mapPage(data, mediaType);
};

// Curated lists --------------------------------------------------------------------------------

const LISTS = {
    trending: {
        mediaTypes: ["movie", "tv", "all"],
        ttl: TTL.trending,
        request: (mediaType, page) => ({ path: `/trending/${mediaType}/week`, params: { page } })
    },
    popular: {
        mediaTypes: ["movie", "tv"],
        request: (mediaType, page, region) => ({ path: `/${mediaType}/popular`, params: { page, region } })
    },
    top_rated: {
        mediaTypes: ["movie", "tv"],
        request: (mediaType, page) => ({ path: `/${mediaType}/top_rated`, params: { page } })
    },
    now_playing: {
        mediaTypes: ["movie"],
        request: (mediaType, page, region) => ({ path: "/movie/now_playing", params: { page, region } })
    },
    upcoming: {
        mediaTypes: ["movie", "tv"],
        discover: { availability: "upcoming", sort: "popularity" }
    },
    airing_today: {
        mediaTypes: ["tv"],
        request: (mediaType, page) => ({ path: "/tv/airing_today", params: { page } })
    },
    on_the_air: {
        mediaTypes: ["tv"],
        request: (mediaType, page) => ({ path: "/tv/on_the_air", params: { page } })
    },
    // Loved by the people who found them, but outside the blockbuster vote counts. Sorting by
    // popularity inside that band surfaces recognisable gems rather than the obscure top of a
    // rating sort; documentaries, concerts, TV movies and anime would otherwise dominate it.
    hidden_gems: {
        mediaTypes: ["movie", "tv"],
        params: (mediaType) => ({
            sort_by: "popularity.desc",
            "vote_average.gte": 7.4,
            "vote_count.gte": 300,
            "vote_count.lte": 3000,
            [mediaType === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: daysFromToday(-365),
            without_genres: mediaType === "movie" ? "99,10770,10402,16" : "99,10763,10764,10767,16",
            include_adult: false
        })
    },
    new_on_streaming: {
        mediaTypes: ["movie", "tv"],
        params: (mediaType, region) => (mediaType === "movie"
            ? {
                region,
                with_release_type: "4",
                "release_date.gte": daysFromToday(-60),
                "release_date.lte": today(),
                watch_region: region,
                with_watch_monetization_types: STREAMING_TYPES,
                sort_by: "popularity.desc"
            }
            : {
                "first_air_date.gte": daysFromToday(-60),
                "first_air_date.lte": today(),
                watch_region: region,
                with_watch_monetization_types: STREAMING_TYPES,
                sort_by: "popularity.desc"
            })
    },
    coming_to_streaming: {
        mediaTypes: ["movie"],
        params: (mediaType, region) => ({
            region,
            with_release_type: "4",
            "release_date.gte": daysFromToday(1),
            "release_date.lte": daysFromToday(120),
            sort_by: "popularity.desc"
        })
    }
};

const LIST_NAMES = Object.keys(LISTS);

const getList = async (name, mediaType, page, region) => {
    const list = LISTS[name];
    if (!list) throw AppError.notFound(`Unknown list "${name}"`);
    if (!list.mediaTypes.includes(mediaType)) {
        throw AppError.badRequest(`The ${name} list is only available for: ${list.mediaTypes.join(", ")}`);
    }

    if (list.discover) {
        return discover(mediaType, { ...list.discover, page }, region);
    }

    if (list.params) {
        const params = { ...list.params(mediaType, region), page };
        const data = await cachedGet(`list:${name}:${mediaType}:${stableKey(params)}`, TTL.list, `/discover/${mediaType}`, params);
        return mapper.mapPage(data, mediaType);
    }

    const { path, params } = list.request(mediaType, page, region);
    const data = await cachedGet(`list:${name}:${mediaType}:${stableKey(params)}`, list.ttl || TTL.list, path, params);
    const result = mapper.mapPage(data, mediaType === "all" ? undefined : mediaType);

    return {
        ...result,
        items: result.items.filter((item) => !(item.genreIds || []).some((genre) => NON_STORY_TV_GENRES.has(genre)))
    };
};

const getHome = async (region) => {
    const sections = [
        { key: "trending", title: "Trending this week", list: "trending", mediaType: "all" },
        { key: "in_theatres", title: "In theatres now", list: "now_playing", mediaType: "movie" },
        { key: "new_on_streaming", title: "New on streaming", list: "new_on_streaming", mediaType: "movie" },
        { key: "upcoming", title: "Coming soon to cinemas", list: "upcoming", mediaType: "movie" },
        { key: "popular_tv", title: "Series everyone is watching", list: "popular", mediaType: "tv" },
        { key: "hidden_gems", title: "Hidden gems", list: "hidden_gems", mediaType: "movie" },
        { key: "top_rated", title: "All-time greats", list: "top_rated", mediaType: "movie" },
        { key: "coming_to_streaming", title: "Coming to streaming", list: "coming_to_streaming", mediaType: "movie" }
    ];

    // One failing list must not blank the whole home page.
    const results = await Promise.allSettled(
        sections.map((section) => getList(section.list, section.mediaType, 1, region))
    );

    const loaded = sections
        .map((section, index) => ({
            ...section,
            items: results[index].status === "fulfilled" ? results[index].value.items : []
        }))
        .filter((section) => section.items.length);

    if (!loaded.length) {
        throw new AppError(502, "Movie data is temporarily unavailable. Please try again shortly.", "PROVIDER_UNAVAILABLE");
    }

    const trending = loaded.find((section) => section.key === "trending")?.items || loaded[0].items;
    const spotlight = trending.filter((item) => item.backdropPath && item.overview).slice(0, 6);

    return {
        region,
        spotlight,
        sections: loaded
    };
};

// Search -------------------------------------------------------------------------------------

const SEARCH_PATHS = {
    all: "/search/multi",
    movie: "/search/movie",
    tv: "/search/tv",
    person: "/search/person"
};

const search = async (query, type = "all", page = 1) => {
    const normalized = query.trim().toLowerCase();
    const params = { query: normalized, page, include_adult: false };
    const data = await cachedGet(`search:${type}:${page}:${normalized}`, TTL.search, SEARCH_PATHS[type], params);
    return mapper.mapPage(data, type === "all" ? undefined : type);
};

const autocomplete = async (query) => {
    const { items } = await search(query, "all", 1);

    // TMDB orders by relevance but lets obscure exact matches outrank what people mean.
    // Nudge well-known results up without discarding the relevance order entirely.
    return items
        .map((item, index) => ({ item, score: Math.log10((item.popularity || 0) + 1) * 2 - index }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ item }) => item);
};

// Details ------------------------------------------------------------------------------------

const getCachedDetails = (mediaType, id) => cache.wrap(`tmdb:details:${mediaType}:${id}`, TTL.details, async () => {
    const data = await tmdb.get(`/${mediaType}/${id}`, {
        append_to_response: DETAILS_APPEND[mediaType],
        include_video_language: VIDEO_LANGUAGES
    });
    return mapper.mapDetails(data, mediaType);
}, { staleTtl: 7 * 24 * HOUR });

const getDetails = async (mediaType, id, region) => {
    const details = mapper.forRegion(await getCachedDetails(mediaType, id), region, today());
    const omdbRatings = await omdb.getRatings(details.imdbId);

    return {
        ...details,
        externalRatings: {
            tmdb: details.rating ? { score: details.rating, votes: details.voteCount } : null,
            imdb: omdbRatings?.imdb || null,
            rottenTomatoes: omdbRatings?.rottenTomatoes || null,
            metacritic: omdbRatings?.metacritic || null
        }
    };
};

const getPerson = async (id) => {
    const data = await cachedGet(`person:${id}`, TTL.person, `/person/${id}`, {
        append_to_response: "combined_credits,external_ids"
    });
    return mapper.mapPersonDetails(data);
};

// Reference data -----------------------------------------------------------------------------

const getGenres = async () => {
    const [movie, tv] = await Promise.all([
        cachedGet("genres:movie", TTL.reference, "/genre/movie/list"),
        cachedGet("genres:tv", TTL.reference, "/genre/tv/list")
    ]);

    const byId = new Map();
    for (const [mediaType, data] of [["movie", movie], ["tv", tv]]) {
        for (const genre of data.genres || []) {
            const existing = byId.get(genre.id) || { id: genre.id, name: genre.name, mediaTypes: [] };
            existing.mediaTypes.push(mediaType);
            byId.set(genre.id, existing);
        }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const getLanguages = async () => {
    const data = await cachedGet("languages", TTL.reference * 4, "/configuration/languages");
    return data
        .filter((language) => language.iso_639_1 !== "xx")
        .map((language) => ({ code: language.iso_639_1, name: language.english_name }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

const getRegions = async () => {
    const data = await cachedGet("regions", TTL.reference * 4, "/watch/providers/regions");
    return (data.results || [])
        .map((region) => ({ code: region.iso_3166_1, name: region.english_name }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

const getProviders = async (mediaType, region) => {
    const data = await cachedGet(`providers:${mediaType}:${region}`, TTL.reference, `/watch/providers/${mediaType}`, {
        watch_region: region
    });
    return (data.results || [])
        .map((provider) => ({
            id: provider.provider_id,
            name: provider.provider_name,
            logoPath: provider.logo_path,
            priority: provider.display_priorities?.[region] ?? provider.display_priority
        }))
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 24)
        .map(({ priority, ...provider }) => provider);
};

// Calendar -----------------------------------------------------------------------------------

// Discover only returns each film's worldwide release date, so for movies the exact regional date
// is read from each film's (cached, and later reused) details.
const getCalendar = (month, type, mediaType, region) => cache.wrap(
    `calendar:${mediaType}:${type}:${region}:${month}`,
    TTL.calendar,
    async () => {
        const { from, to } = monthRange(month);
        const isMovie = mediaType === "movie";

        const params = isMovie
            ? {
                region,
                with_release_type: type === "digital" ? "4" : "2|3",
                "release_date.gte": from,
                "release_date.lte": to,
                sort_by: "popularity.desc",
                include_adult: false
            }
            : {
                "first_air_date.gte": from,
                "first_air_date.lte": to,
                sort_by: "popularity.desc",
                include_adult: false
            };

        const pages = await Promise.all([1, 2].map((page) => tmdb.get(`/discover/${mediaType}`, { ...params, page })));
        const items = pages.flatMap((data) => mapper.mapPage(data, mediaType).items);

        let dated = items.map((item) => ({ ...item, calendarDate: item.releaseDate }));

        if (isMovie) {
            const regionalDates = await Promise.all(items.map(async (item) => {
                try {
                    const details = await getCachedDetails("movie", item.id);
                    const info = mapper.mapReleaseInfo(details.regional.releaseDates, region);
                    return type === "digital" ? info.digital : info.theatrical;
                } catch {
                    return null;
                }
            }));
            dated = items.map((item, index) => ({ ...item, calendarDate: regionalDates[index] }));
        }

        const inMonth = dated.filter((item) => item.calendarDate && item.calendarDate >= from && item.calendarDate <= to);

        const days = {};
        for (const item of inMonth) {
            (days[item.calendarDate] ||= []).push(item);
        }

        return {
            month,
            type,
            mediaType,
            region,
            days: Object.keys(days).sort().map((date) => ({ date, items: days[date] }))
        };
    }
);

// Random pick --------------------------------------------------------------------------------

const MAX_RANDOM_PAGE = 15;

const getRandom = async (mediaType, filters, region, excludeIds = new Set()) => {
    const first = await discover(mediaType, { ...filters, page: 1 }, region);
    if (!first.items.length) return null;

    const lastPage = Math.min(first.totalPages, MAX_RANDOM_PAGE);
    const page = 1 + Math.floor(Math.random() * lastPage);
    const pool = page === 1 ? first : await discover(mediaType, { ...filters, page }, region);

    const candidates = pool.items.filter((item) => item.posterPath && !excludeIds.has(item.id));
    const fallback = first.items.filter((item) => item.posterPath && !excludeIds.has(item.id));
    const choices = candidates.length ? candidates : fallback;

    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
};

module.exports = {
    LIST_NAMES,
    discover,
    getList,
    getHome,
    search,
    autocomplete,
    getCachedDetails,
    getDetails,
    getPerson,
    getGenres,
    getLanguages,
    getRegions,
    getProviders,
    getCalendar,
    getRandom
};
