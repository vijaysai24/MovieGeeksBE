const express=require("express");

const router=express.Router();

router.use("/auth",require("./authRoutes"));
router.use("/users",require("./userRoutes"));
router.use("/catalog",require("./catalogRoutes"));
router.use(require("./socialRoutes"));
router.use(require("./identityRoutes"));
router.use(require("./collectionRoutes"));
router.use(require("./reviewRoutes"));
router.use("/me",require("./profileRoutes"));
router.use("/me",require("./libraryRoutes"));

module.exports=router;
