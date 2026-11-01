// Translates TMDB payloads into Movie Geeks' own shapes so nothing outside the integration layer
// depends on TMDB field names. Image fields stay as TMDB paths; the client picks the size.

const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) || null : null);

const round1 = (value) => (typeof value === "number" && value > 0 ? Math.round(value * 10) / 10 : null);

const uniqueBy = (items, keyOf) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = keyOf(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const mapPersonSummary = (person) => ({
    id: person.id,
    mediaType: "person",
    name: person.name,
    profilePath: person.profile_path || null,
    knownForDepartment: person.known_for_department || null,
    knownFor: (person.known_for || []).slice(0, 3).map((item) => item.title || item.name),
    popularity: person.popularity || 0
});

const mapSummary = (item, fallbackType) => {
    const mediaType = item.media_type || fallbackType;
    if (mediaType === "person") return mapPersonSummary(item);

    const releaseDate = item.release_date || item.first_air_date || null;

    return {
        id: item.id,
        mediaType,
        title: item.title || item.name,
        originalTitle: item.original_title || item.original_name || null,
        overview: item.overview || "",
        posterPath: item.poster_path || null,
        backdropPath: item.backdrop_path || null,
        releaseDate,
        year: yearOf(releaseDate),
        rating: round1(item.vote_average),
        voteCount: item.vote_count || 0,
        popularity: item.popularity || 0,
        genreIds: item.genre_ids || (item.genres || []).map((genre) => genre.id),
        originalLanguage: item.original_language || null
    };
};

// TMDB never serves pages past 500.
const mapPage = (data, fallbackType) => ({
    items: (data.results || [])
        .map((item) => mapSummary(item, fallbackType))
        .filter((item) => item.mediaType === "person" || item.title),
    page: data.page || 1,
    totalPages: Math.max(1, Math.min(data.total_pages || 1, 500)),
    totalResults: data.total_results || 0
});

const mapPerson = (credit) => ({
    id: credit.id,
    name: credit.name,
    profilePath: credit.profile_path || null
});

const crewWithJobs = (crew, matches, limit) => uniqueBy(
    crew.filter(matches),
    (member) => member.id
).slice(0, limit).map((member) => ({ ...mapPerson(member), job: member.job }));

const mapCrew = (crew = [], createdBy = []) => ({
    directors: crewWithJobs(crew, (m) => m.job === "Director", 4),
    creators: createdBy.map(mapPerson),
    writers: crewWithJobs(crew, (m) => m.department === "Writing", 6),
    producers: crewWithJobs(crew, (m) => m.job === "Producer" || m.job === "Executive Producer", 6),
    cinematography: crewWithJobs(crew, (m) => m.job === "Director of Photography", 2),
    music: crewWithJobs(crew, (m) => m.job === "Original Music Composer" || m.job === "Music", 2)
});

const mapCast = (cast = []) => cast.slice(0, 24).map((member) => ({
    ...mapPerson(member),
    character: member.character || null
}));

const VIDEO_TYPES = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes"];

const mapVideos = (videos) => (videos?.results || [])
    .filter((video) => video.site === "YouTube" && VIDEO_TYPES.includes(video.type))
    .map((video) => ({
        key: video.key,
        name: video.name,
        type: video.type,
        official: Boolean(video.official),
        language: video.iso_639_1,
        publishedAt: video.published_at
    }));

const pickTrailer = (videos) => {
    const score = (video) => (video.type === "Trailer" ? 4 : video.type === "Teaser" ? 2 : 0)
        + (video.official ? 2 : 0)
        + (video.language === "en" ? 1 : 0);

    const [best] = [...videos].sort((a, b) => score(b) - score(a)
        || new Date(b.publishedAt) - new Date(a.publishedAt));

    return best || null;
};

const mapProviderList = (list = []) => [...list]
    .sort((a, b) => a.display_priority - b.display_priority)
    .map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path
    }));

const mapProviders = (watchProviders, region) => {
    const regional = watchProviders?.[region];
    return {
        region,
        link: regional?.link || null,
        stream: mapProviderList(regional?.flatrate),
        free: mapProviderList(regional?.free),
        ads: mapProviderList(regional?.ads),
        rent: mapProviderList(regional?.rent),
        buy: mapProviderList(regional?.buy)
    };
};

// TMDB release types: 1 premiere, 2 limited theatrical, 3 theatrical, 4 digital, 5 physical, 6 TV.
const mapReleaseInfo = (releaseDates, region) => {
    const regional = (releaseDates || []).find((entry) => entry.iso_3166_1 === region)?.release_dates || [];

    const earliest = (types) => regional
        .filter((release) => types.includes(release.type))
        .map((release) => release.release_date.slice(0, 10))
        .sort()[0] || null;

    return {
        region,
        theatrical: earliest([2, 3]),
        digital: earliest([4]),
        physical: earliest([5]),
        certification: regional.find((release) => release.certification)?.certification || null
    };
};

const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);

// One status a person can act on: is it out yet, can I stream it, is it in cinemas?
const availabilityOf = ({ mediaType, releaseDate, releaseInfo, providers, today }) => {
    const canStream = providers.stream.length + providers.free.length + providers.ads.length > 0;
    const canRentOrBuy = providers.rent.length + providers.buy.length > 0;
    const firstRelease = releaseInfo?.theatrical || releaseDate;

    if (firstRelease && firstRelease > today) return "UPCOMING";
    if (canStream) return "STREAMING";

    if (mediaType === "movie" && releaseInfo?.theatrical) {
        const digitalOut = releaseInfo.digital && releaseInfo.digital <= today;
        if (!digitalOut && daysBetween(releaseInfo.theatrical, today) <= 60) return "IN_THEATRES";
    }

    if (canRentOrBuy) return "RENT_OR_BUY";
    return "NOT_AVAILABLE";
};

// Region-independent part of a title's details. Watch providers and release dates for every
// region are kept raw in `regional` so one cached TMDB response serves all regions.
const mapDetails = (data, mediaType) => {
    const videos = mapVideos(data.videos);
    const isTv = mediaType === "tv";

    return {
        ...mapSummary(data, mediaType),
        tagline: data.tagline || null,
        status: data.status || null,
        runtime: isTv
            ? data.episode_run_time?.[0] || data.last_episode_to_air?.runtime || null
            : data.runtime || null,
        genres: (data.genres || []).map((genre) => ({ id: genre.id, name: genre.name })),
        languages: (data.spoken_languages || []).map((language) => language.english_name || language.name),
        countries: isTv
            ? data.origin_country || []
            : (data.production_countries || []).map((country) => country.name),
        budget: data.budget || null,
        revenue: data.revenue || null,
        homepage: data.homepage || null,
        imdbId: data.imdb_id || data.external_ids?.imdb_id || null,
        crew: mapCrew(data.credits?.crew, data.created_by),
        cast: mapCast(data.credits?.cast),
        trailer: pickTrailer(videos),
        videos: videos.slice(0, 8),
        collection: data.belongs_to_collection
            ? {
                id: data.belongs_to_collection.id,
                name: data.belongs_to_collection.name,
                posterPath: data.belongs_to_collection.poster_path,
                backdropPath: data.belongs_to_collection.backdrop_path
            }
            : null,
        tv: isTv
            ? {
                numberOfSeasons: data.number_of_seasons || 0,
                numberOfEpisodes: data.number_of_episodes || 0,
                lastAirDate: data.last_air_date || null,
                inProduction: Boolean(data.in_production),
                nextEpisode: data.next_episode_to_air
                    ? {
                        airDate: data.next_episode_to_air.air_date,
                        seasonNumber: data.next_episode_to_air.season_number,
                        episodeNumber: data.next_episode_to_air.episode_number,
                        name: data.next_episode_to_air.name
                    }
                    : null,
                networks: (data.networks || []).map((network) => ({
                    id: network.id,
                    name: network.name,
                    logoPath: network.logo_path
                })),
                seasons: (data.seasons || [])
                    .filter((season) => season.season_number > 0)
                    .map((season) => ({
                        seasonNumber: season.season_number,
                        name: season.name,
                        episodeCount: season.episode_count,
                        airDate: season.air_date,
                        posterPath: season.poster_path
                    }))
            }
            : null,
        certificationsByRegion: isTv
            ? Object.fromEntries((data.content_ratings?.results || []).map((r) => [r.iso_3166_1, r.rating]))
            : null,
        recommendations: mapPage(data.recommendations || {}, mediaType).items.slice(0, 18),
        similar: mapPage(data.similar || {}, mediaType).items.slice(0, 18),
        regional: {
            watchProviders: data["watch/providers"]?.results || {},
            releaseDates: data.release_dates?.results || []
        }
    };
};

const forRegion = (details, region, today) => {
    const { regional, certificationsByRegion, ...rest } = details;
    const providers = mapProviders(regional.watchProviders, region);
    const releaseInfo = details.mediaType === "movie"
        ? mapReleaseInfo(regional.releaseDates, region)
        : { region, theatrical: null, digital: null, physical: null, certification: certificationsByRegion?.[region] || null };

    return {
        ...rest,
        providers,
        releaseInfo,
        availability: availabilityOf({
            mediaType: details.mediaType,
            releaseDate: details.releaseDate,
            releaseInfo,
            providers,
            today
        })
    };
};

// Talk shows and news appearances drown out an actor's filmography.
const NOISE_GENRES = new Set([10763, 10767]);

const mapPersonDetails = (data) => {
    const credits = data.combined_credits || {};
    const isRelevant = (credit) => !(credit.genre_ids || []).some((genre) => NOISE_GENRES.has(genre));

    const cast = uniqueBy(
        (credits.cast || []).filter(isRelevant),
        (credit) => `${credit.media_type}:${credit.id}`
    )
        .map((credit) => ({ ...mapSummary(credit), character: credit.character || null }))
        .sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));

    const crew = uniqueBy(
        (credits.crew || []).filter((credit) => isRelevant(credit)
            && ["Directing", "Writing", "Production", "Creator"].includes(credit.department)),
        (credit) => `${credit.media_type}:${credit.id}:${credit.job}`
    )
        .map((credit) => ({ ...mapSummary(credit), job: credit.job }))
        .sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));

    const knownFor = uniqueBy([...cast, ...crew], (credit) => `${credit.mediaType}:${credit.id}`)
        .sort((a, b) => b.voteCount - a.voteCount)
        .slice(0, 8);

    return {
        id: data.id,
        name: data.name,
        biography: data.biography || "",
        birthday: data.birthday || null,
        deathday: data.deathday || null,
        placeOfBirth: data.place_of_birth || null,
        profilePath: data.profile_path || null,
        knownForDepartment: data.known_for_department || null,
        imdbId: data.external_ids?.imdb_id || data.imdb_id || null,
        knownFor,
        cast: cast.slice(0, 80),
        crew: crew.slice(0, 60)
    };
};

module.exports = {
    mapSummary,
    mapPage,
    mapDetails,
    forRegion,
    mapProviderList,
    mapReleaseInfo,
    mapPersonDetails
};
