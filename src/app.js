const express=require("express");

const path=require("path");

const helmet=require("helmet");

const cors=require("cors");

const cookieParser=require("cookie-parser");

const morgan=require("morgan");

const rateLimit=require("express-rate-limit");

const config=require("./config/env");

const routes=require("./routes");

const errorHandler=require("./middlewares/errorMiddleware");

const notFound=require("./middlewares/notFoundMiddleware");

const app=express();

// Avatars are served from this origin to the frontend's origin, so allow cross-origin embedding.
app.use(helmet({ crossOriginResourcePolicy:{ policy:"cross-origin" } }));

app.use(cors({ origin:config.clientOrigins, credentials:true }));

app.use(express.json({ limit:"100kb" }));

app.use(cookieParser());

if(!config.isProduction){
app.use(morgan("dev"));
}

app.use("/api",rateLimit({
windowMs:60*1000,
limit:600,
standardHeaders:"draft-8",
legacyHeaders:false,
message:{ success:false, message:"Too many requests, please slow down", code:"RATE_LIMITED" }
}));

app.use("/uploads",express.static(path.join(__dirname,"..","uploads"),{ maxAge:"7d", index:false }));

app.get("/api/health",(req,res)=>res.json({ success:true, data:{ status:"ok" } }));

app.use("/api",routes);

app.use("/api",notFound);

app.use(errorHandler);

module.exports=app;
