const express=require("express");

const rateLimit=require("express-rate-limit");

const router=express.Router();

const controller=require("../controllers/authController");

const {registerValidation,loginValidation,changePasswordValidation} = require("../validations/authValidation");

const validate=require("../middlewares/validationMiddleware");

const authMiddleware=require("../middlewares/authMiddleware");

// Slows down password guessing; successful sign-ins do not count against the limit.
const credentialLimiter=rateLimit({
windowMs:15*60*1000,
limit:20,
skipSuccessfulRequests:true,
standardHeaders:"draft-8",
legacyHeaders:false,
message:{ success:false, message:"Too many attempts, try again in a few minutes", code:"RATE_LIMITED" }
});

router.post("/login",credentialLimiter,loginValidation,validate,controller.login);

router.post( "/register",credentialLimiter,registerValidation,validate,controller.register);

router.post("/refresh",controller.refresh);

router.post("/logout",controller.logout);

router.get("/me",authMiddleware,controller.me);

router.put("/password",authMiddleware,credentialLimiter,changePasswordValidation,validate,controller.changePassword);



module.exports=router;
