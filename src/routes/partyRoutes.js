const express = require("express");
const router = express.Router();
const controller = require("../controllers/partyController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const contentLimiter = require("../middlewares/contentLimiter");
const v = require("../validations/partyValidation");

// Every watch party route is for members of that party only.
router.get("/me/parties", authMiddleware, controller.listMine);
router.post("/me/parties", authMiddleware, contentLimiter, v.createValidation, validate, controller.create);

router.post("/parties/join", authMiddleware, contentLimiter, v.joinValidation, validate, controller.join);
router.get("/parties/:id", authMiddleware, v.idValidation, validate, controller.get);
router.patch("/parties/:id", authMiddleware, v.renameValidation, validate, controller.rename);
router.delete("/parties/:id", authMiddleware, v.idValidation, validate, controller.remove);
router.post("/parties/:id/invite", authMiddleware, v.idValidation, validate, controller.regenerateInvite);
router.delete("/parties/:id/members/me", authMiddleware, v.idValidation, validate, controller.leave);
router.delete("/parties/:id/members/:userId", authMiddleware, v.memberValidation, validate, controller.removeMember);
router.get("/parties/:id/suggestions", authMiddleware, v.idValidation, validate, controller.suggestions);
router.post("/parties/:id/items", authMiddleware, v.addItemValidation, validate, controller.addItem);
router.delete("/parties/:id/items/:mediaType/:tmdbId", authMiddleware, v.titleValidation, validate, controller.removeItem);
router.put("/parties/:id/items/:mediaType/:tmdbId/vote", authMiddleware, v.titleValidation, validate, controller.vote);
router.delete("/parties/:id/items/:mediaType/:tmdbId/vote", authMiddleware, v.titleValidation, validate, controller.unvote);

module.exports = router;
