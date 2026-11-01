const express = require("express");
const router = express.Router();
const controller = require("../controllers/userController");
const validate = require("../middlewares/validationMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const { avatarUpload, verifyImage } = require("../middlewares/uploadMiddleware");
const { updateProfileValidation } = require("../validations/userValidation");

router.use(authMiddleware);

router.patch("/profile", updateProfileValidation, validate, controller.updateProfile);
router.post("/avatar", avatarUpload, verifyImage, controller.uploadAvatar);
router.delete("/avatar", controller.removeAvatar);

module.exports = router;
