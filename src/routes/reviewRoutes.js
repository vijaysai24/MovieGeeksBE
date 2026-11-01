const express = require("express");
const router = express.Router();
const controller = require("../controllers/reviewController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const optionalAuth = require("../middlewares/optionalAuthMiddleware");
const contentLimiter = require("../middlewares/contentLimiter");
const { titleParams } = require("../validations/libraryValidation");
const v = require("../validations/socialValidation");

// Reviews and community numbers for one title.
router.get("/titles/:mediaType/:tmdbId/reviews", optionalAuth, v.reviewListValidation, validate, controller.listForTitle);
router.put("/titles/:mediaType/:tmdbId/review", authMiddleware, contentLimiter, v.saveReviewValidation, validate, controller.saveReview);
router.delete("/titles/:mediaType/:tmdbId/review", authMiddleware, titleParams, validate, controller.deleteOwnReview);
router.get("/titles/:mediaType/:tmdbId/community", titleParams, validate, controller.getTitleCommunity);

router.get("/reviews/popular", optionalAuth, v.popularReviewsValidation, validate, controller.listPopular);
router.get("/reviews/:id", optionalAuth, v.reviewIdValidation, validate, controller.getReview);
router.put("/reviews/:id/reaction", authMiddleware, v.reactionValidation, validate, controller.react);
router.delete("/reviews/:id/reaction", authMiddleware, v.reviewIdValidation, validate, controller.unreact);
router.get("/reviews/:id/comments", optionalAuth, v.commentListValidation, validate, controller.listComments);
router.post("/reviews/:id/comments", authMiddleware, contentLimiter, v.commentValidation, validate, controller.addComment);
router.delete("/comments/:id", authMiddleware, v.reviewIdValidation, validate, controller.deleteComment);

router.get("/community/trending", v.trendingValidation, validate, controller.getTrending);
router.get("/community/members", optionalAuth, controller.getMembers);

module.exports = router;
