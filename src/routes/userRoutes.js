const express = require("express");
const router = express.Router();
const controller = require("../controllers/userController");
const validate = require("../middlewares/validationMiddleware");
const { getUsersValidation } = require("../validations/userValidation");
const authMiddleware = require("../middlewares/authMiddleware");


router.post("/getAllUsers",authMiddleware,getUsersValidation,validate,controller.getUsers);

module.exports = router;