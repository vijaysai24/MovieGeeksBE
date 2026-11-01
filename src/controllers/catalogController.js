const { matchedData } = require("express-validator");
const service = require("../services/catalogService");
const statsRepository = require("../repositories/statsRepository");
const config = require("../config/env");
const { ok } = require("../utils/response");

// Express 5 re-parses req.query on every read, so sanitized values only exist in matchedData.
const input = (req) => matchedData(req, { includeOptionals: false });

const regionOf = (data) => data.region || config.defaultRegion;

const discoverFilters = (data) => ({
    genres: data.genres,
    providers: data.providers,
    language: data.language,
    yearFrom: data.yearFrom,
    yearTo: data.yearTo,
    ratingMin: data.ratingMin,
    availability: data.availability,
    sort: data.sort,
    withPeople: data.withPeople,
    page: data.page
});

const getHome = async (req, res, next) => {
    try {
        ok(res, await service.getHome(regionOf(input(req))));
    } catch (err) {
        next(err);
    }
};

const getList = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.getList(data.list, data.mediaType || "movie", data.page || 1, regionOf(data)));
    } catch (err) {
        next(err);
    }
};

const discover = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.discover(data.mediaType || "movie", discoverFilters(data), regionOf(data)));
    } catch (err) {
        next(err);
    }
};

const search = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.search(data.q, data.type || "all", data.page || 1));
    } catch (err) {
        next(err);
    }
};

const autocomplete = async (req, res, next) => {
    try {
        ok(res, await service.autocomplete(input(req).q));
    } catch (err) {
        next(err);
    }
};

const getDetails = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.getDetails(data.mediaType, data.id, regionOf(data)));
    } catch (err) {
        next(err);
    }
};

const getPerson = async (req, res, next) => {
    try {
        ok(res, await service.getPerson(input(req).id));
    } catch (err) {
        next(err);
    }
};

const getGenres = async (req, res, next) => {
    try {
        ok(res, await service.getGenres());
    } catch (err) {
        next(err);
    }
};

const getLanguages = async (req, res, next) => {
    try {
        ok(res, await service.getLanguages());
    } catch (err) {
        next(err);
    }
};

const getRegions = async (req, res, next) => {
    try {
        ok(res, await service.getRegions());
    } catch (err) {
        next(err);
    }
};

const getProviders = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.getProviders(data.mediaType || "movie", regionOf(data)));
    } catch (err) {
        next(err);
    }
};

const getCalendar = async (req, res, next) => {
    try {
        const data = input(req);
        ok(res, await service.getCalendar(data.month, data.type || "theatrical", data.mediaType || "movie", regionOf(data)));
    } catch (err) {
        next(err);
    }
};

const getRandom = async (req, res, next) => {
    try {
        const data = input(req);
        const mediaType = data.mediaType || "movie";
        const known = req.user ? await statsRepository.knownTitleRefs(req.user.id) : [];
        const exclude = new Set(known.filter((row) => row.media_type === mediaType).map((row) => row.tmdb_id));
        ok(res, await service.getRandom(mediaType, discoverFilters(data), regionOf(data), exclude));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getHome,
    getList,
    discover,
    search,
    autocomplete,
    getDetails,
    getPerson,
    getGenres,
    getLanguages,
    getRegions,
    getProviders,
    getCalendar,
    getRandom
};
