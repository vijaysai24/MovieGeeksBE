const express = require("express");
const router = express.Router();
const controller = require("../controllers/catalogController");
const validate = require("../middlewares/validationMiddleware");
const cacheControl = require("../middlewares/cacheControlMiddleware");
const optionalAuth = require("../middlewares/optionalAuthMiddleware");
const v = require("../validations/catalogValidation");

const noStore = (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
};

router.use((req, res, next) => (req.path === "/random" ? next() : cacheControl(300)(req, res, next)));

router.get("/home", v.homeValidation, validate, controller.getHome);
router.get("/lists/:list", v.listValidation, validate, controller.getList);
router.get("/discover", v.discoverValidation, validate, controller.discover);
// A member's pick skips what they already know, so the answer is personal and never shared-cached.
router.get("/random", noStore, optionalAuth, v.randomValidation, validate, controller.getRandom);
router.get("/search", v.searchValidation, validate, controller.search);
router.get("/autocomplete", v.autocompleteValidation, validate, controller.autocomplete);
router.get("/calendar", v.calendarValidation, validate, controller.getCalendar);
router.get("/genres", controller.getGenres);
router.get("/languages", controller.getLanguages);
router.get("/regions", controller.getRegions);
router.get("/providers", v.providersValidation, validate, controller.getProviders);
router.get("/person/:id", v.personValidation, validate, controller.getPerson);
router.get("/:mediaType/:id", v.detailsValidation, validate, controller.getDetails);

module.exports = router;
