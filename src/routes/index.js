const express=require("express");

const router=express.Router();

router.use("/auth",require("./authRoutes"));
router.use("/users",require("./userRoutes"));
router.use("/catalog",require("./catalogRoutes"));

module.exports=router;
