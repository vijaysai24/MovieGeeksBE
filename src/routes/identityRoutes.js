const express = require("express");
const router = express.Router();
const controller = require("../controllers/identityController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const { usernameParam } = require("../validations/userValidation");
const v = require("../validations/identityValidation");

// A member's movie identity: stats and Film DNA, how their taste compares, what to watch next.
router.get("/me/stats", authMiddleware, v.myStatsValidation, validate, controller.getMyStats);
router.get("/me/preferences", authMiddleware, controller.getPreferences);
router.put("/me/preferences", authMiddleware, v.preferencesValidation, validate, controller.setPreferences);
router.get("/me/recommendations", authMiddleware, controller.getRecommendations);
router.get("/me/random", authMiddleware, v.queueRandomValidation, validate, controller.randomFromQueue);

router.get("/users/:username/stats", v.userStatsValidation, validate, controller.getUserStats);
router.get("/users/:username/taste-match", authMiddleware, usernameParam, validate, controller.getTasteMatch);

module.exports = router;
