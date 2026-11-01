const express = require("express");
const router = express.Router();
const controller = require("../controllers/userController");
const validate = require("../middlewares/validationMiddleware");
const { getUsersValidation, searchUsersValidation } = require("../validations/userValidation");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/roleMiddleware");


// Lists every account with its email, so it is limited to staff.
router.post("/getAllUsers",authMiddleware,requireRole("ADMIN","MODERATOR"),getUsersValidation,validate,controller.getUsers);

router.get("/search",searchUsersValidation,validate,controller.searchUsers);

module.exports = router;
