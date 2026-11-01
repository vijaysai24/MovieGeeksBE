const express = require("express");
const router = express.Router();
const controller = require("../controllers/collectionController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const optionalAuth = require("../middlewares/optionalAuthMiddleware");
const { paginationQuery } = require("../validations/libraryValidation");
const v = require("../validations/collectionValidation");

// The signed-in member's own lists.
router.get("/me/collections", authMiddleware, v.mineValidation, validate, controller.listMine);
router.post("/me/collections", authMiddleware, v.createValidation, validate, controller.create);
router.patch("/me/collections/:id", authMiddleware, v.updateValidation, validate, controller.update);
router.delete("/me/collections/:id", authMiddleware, v.idValidation, validate, controller.remove);
router.post("/me/collections/:id/items", authMiddleware, v.addItemValidation, validate, controller.addItem);
router.patch("/me/collections/:id/items/:mediaType/:tmdbId", authMiddleware, v.updateItemValidation, validate, controller.updateItem);
router.delete("/me/collections/:id/items/:mediaType/:tmdbId", authMiddleware, v.removeItemValidation, validate, controller.removeItem);
router.put("/me/collections/:id/order", authMiddleware, v.reorderValidation, validate, controller.reorder);

// Anyone's public lists; private ones only for their owner.
router.get("/collections", optionalAuth, paginationQuery, validate, controller.listPublic);
router.get("/collections/:id", optionalAuth, v.getValidation, validate, controller.get);
router.get("/users/:username/collections", optionalAuth, v.userListsValidation, validate, controller.listForUser);

module.exports = router;
