const express = require("express");
const router = express.Router();
const controller = require("../controllers/libraryController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const v = require("../validations/libraryValidation");

router.use(authMiddleware);

// Everything the signed-in user has done with one title.
router.get("/titles/:mediaType/:tmdbId/state", v.titleParams, validate, controller.getState);
router.put("/titles/:mediaType/:tmdbId/status", v.statusValidation, validate, controller.setStatus);
router.delete("/titles/:mediaType/:tmdbId/status", v.titleParams, validate, controller.clearStatus);
router.put("/titles/:mediaType/:tmdbId/rating", v.ratingValidation, validate, controller.rate);
router.delete("/titles/:mediaType/:tmdbId/rating", v.titleParams, validate, controller.unrate);
router.put("/titles/:mediaType/:tmdbId/wishlist", v.titleParams, validate, controller.addToWishlist);
router.delete("/titles/:mediaType/:tmdbId/wishlist", v.titleParams, validate, controller.removeFromWishlist);
router.put("/titles/:mediaType/:tmdbId/favorite", v.titleParams, validate, controller.favorite);
router.delete("/titles/:mediaType/:tmdbId/favorite", v.titleParams, validate, controller.unfavorite);

router.get("/library", v.librarySortValidation, validate, controller.getLibrary);
router.get("/library/counts", controller.getCounts);
router.get("/wishlist", v.setListValidation, validate, controller.getWishlist);
router.post("/wishlist/sync", v.wishlistSyncValidation, validate, controller.syncWishlist);
router.get("/favorites", v.setListValidation, validate, controller.getFavorites);
router.get("/ratings", v.ratingsListValidation, validate, controller.getRatings);

router.get("/diary", v.diaryListValidation, validate, controller.getDiary);
router.get("/diary/years", controller.getDiaryYears);
router.post("/diary", v.createDiaryValidation, validate, controller.logWatch);
router.patch("/diary/:id", v.updateDiaryValidation, validate, controller.updateDiaryEntry);
router.delete("/diary/:id", v.diaryIdValidation, validate, controller.deleteDiaryEntry);

router.get("/top-five", controller.getTopFive);
router.put("/top-five", v.topFiveValidation, validate, controller.setTopFive);

module.exports = router;
