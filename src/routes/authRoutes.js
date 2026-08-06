const express=require("express");

const router=express.Router();

const controller=require("../controllers/authController");

const {registerValidation,loginValidation} = require("../validations/authValidation");

const validate=require("../middlewares/validationMiddleware");

router.post("/login",loginValidation,validate,controller.login);

router.post( "/register",registerValidation,validate,controller.register);



module.exports=router;