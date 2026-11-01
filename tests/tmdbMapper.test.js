const test = require("node:test");
const assert = require("node:assert");
const mapper = require("../src/integrations/tmdb/tmdbMapper");

const baseMovie = (overrides = {}) => mapper.mapDetails({
    id: 1,
    title: "Example",
    release_date: "2026-10-01",
    vote_average: 7.25,
    vote_count: 120,
    genres: [{ id: 18, name: "Drama" }],
    credits: {
        crew: [
            { id: 10, name: "Dee Rector", job: "Director", department: "Directing" },
            { id: 10, name: "Dee Rector", job: "Screenplay", department: "Writing" }
        ],
        cast: [{ id: 20, name: "Lead Actor", character: "Hero" }]
    },
    videos: {
        results: [
            { key: "clip", name: "Clip", type: "Clip", site: "YouTube", official: true, iso_639_1: "en", published_at: "2026-09-01" },
            { key: "teaser", name: "Teaser", type: "Teaser", site: "YouTube", official: true, iso_639_1: "en", published_at: "2026-08-01" },
            { key: "trailer", name: "Trailer", type: "Trailer", site: "YouTube", official: true, iso_639_1: "en", published_at: "2026-07-01" },
            { key: "vimeo", name: "Trailer", type: "Trailer", site: "Vimeo", official: true, iso_639_1: "en", published_at: "2026-09-01" }
        ]
    },
    release_dates: {
        results: [{ iso_3166_1: "IN", release_dates: [{ type: 3, release_date: "2026-10-10T00:00:00.000Z", certification: "UA" }] }]
    },
    "watch/providers": { results: {} },
    ...overrides
}, "movie");

test("summary fields are normalised", () => {
    const details = baseMovie();
    assert.strictEqual(details.year, 2026);
    assert.strictEqual(details.rating, 7.3);
    assert.deepStrictEqual(details.crew.directors.map((d) => d.name), ["Dee Rector"]);
    assert.strictEqual(details.cast[0].character, "Hero");
});

test("the official YouTube trailer is chosen over teasers and clips", () => {
    assert.strictEqual(baseMovie().trailer.key, "trailer");
});

test("a recent theatrical release with no streaming is IN_THEATRES", () => {
    const details = mapper.forRegion(baseMovie(), "IN", "2026-11-01");
    assert.strictEqual(details.availability, "IN_THEATRES");
    assert.strictEqual(details.releaseInfo.theatrical, "2026-10-10");
    assert.strictEqual(details.releaseInfo.certification, "UA");
    assert.strictEqual("regional" in details, false);
});

test("a regional release date in the future is UPCOMING", () => {
    assert.strictEqual(mapper.forRegion(baseMovie(), "IN", "2026-10-05").availability, "UPCOMING");
});

test("streaming providers in the region win over the theatrical window", () => {
    const details = baseMovie({
        "watch/providers": {
            results: { IN: { link: "x", flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/n.png", display_priority: 1 }] } }
        }
    });
    const inIndia = mapper.forRegion(details, "IN", "2026-11-01");
    assert.strictEqual(inIndia.availability, "STREAMING");
    assert.deepStrictEqual(inIndia.providers.stream.map((p) => p.name), ["Netflix"]);

    // The same cached details answer differently for a region without that provider.
    assert.strictEqual(mapper.forRegion(details, "US", "2026-11-01").providers.stream.length, 0);
});

test("an old film with nothing to watch it on is NOT_AVAILABLE", () => {
    assert.strictEqual(mapper.forRegion(baseMovie(), "IN", "2027-06-01").availability, "NOT_AVAILABLE");
});
