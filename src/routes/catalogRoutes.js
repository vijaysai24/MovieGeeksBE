const express = require("express");
const router = express.Router();
const controller = require("../controllers/catalogController");
const validate = require("../middlewares/validationMiddleware");
const cacheControl = require("../middlewares/cacheControlMiddleware");
const v = require("../validations/catalogValidation");

router.use(cacheControl(300));

router.get("/home", v.homeValidation, validate, controller.getHome);
router.get("/lists/:list", v.listValidation, validate, controller.getList);
router.get("/discover", v.discoverValidation, validate, controller.discover);
router.get("/random", v.randomValidation, validate, controller.getRandom);
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
