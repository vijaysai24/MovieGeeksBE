const express = require("express");
const router = express.Router();
const controller = require("../controllers/socialController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const optionalAuth = require("../middlewares/optionalAuthMiddleware");
const requireRole = require("../middlewares/roleMiddleware");
const contentLimiter = require("../middlewares/contentLimiter");
const { paginationQuery } = require("../validations/libraryValidation");
const { usernameParam } = require("../validations/userValidation");
const v = require("../validations/socialValidation");

// Public profiles.
router.get("/users/:username", optionalAuth, usernameParam, validate, controller.getProfile);
router.get("/users/:username/library", v.profileLibraryValidation, validate, controller.getProfileLibrary);
router.get("/users/:username/diary", v.profileDiaryValidation, validate, controller.getProfileDiary);
router.get("/users/:username/favorites", v.profileSetValidation, validate, controller.getProfileFavorites);
router.get("/users/:username/ratings", v.profileRatingsValidation, validate, controller.getProfileRatings);
router.get("/users/:username/reviews", optionalAuth, v.profileReviewsValidation, validate, controller.getProfileReviews);
router.get("/users/:username/activity", v.profileListValidation, validate, controller.getProfileActivity);
router.get("/users/:username/followers", optionalAuth, v.profileListValidation, validate, controller.getFollowers);
router.get("/users/:username/following", optionalAuth, v.profileListValidation, validate, controller.getFollowing);
router.put("/users/:username/follow", authMiddleware, usernameParam, validate, controller.follow);
router.delete("/users/:username/follow", authMiddleware, usernameParam, validate, controller.unfollow);

// The signed-in user's feed and notifications.
router.get("/me/feed", authMiddleware, paginationQuery, validate, controller.getFeed);
router.get("/me/notifications", authMiddleware, v.notificationListValidation, validate, controller.getNotifications);
router.get("/me/notifications/unread-count", authMiddleware, controller.getUnreadCount);
router.post("/me/notifications/read", authMiddleware, v.markReadValidation, validate, controller.markNotificationsRead);

// Reporting and moderation.
router.post("/reports", authMiddleware, contentLimiter, v.reportValidation, validate, controller.report);

const staffOnly = [authMiddleware, requireRole("MODERATOR", "ADMIN")];
router.get("/moderation/reports", staffOnly, v.moderationListValidation, validate, controller.listReports);
router.get("/moderation/reports/:targetType/:targetId", staffOnly, v.moderationTargetValidation, validate, controller.getReportDetails);
router.post("/moderation/actions", staffOnly, v.moderationActionValidation, validate, controller.moderate);
router.patch("/moderation/users/:username", staffOnly, v.userStatusValidation, validate, controller.setUserStatus);

module.exports = router;
