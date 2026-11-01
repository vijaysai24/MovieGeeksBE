const mysql=require("mysql2/promise");
require("dotenv").config({ quiet: true });

const pool=mysql.createPool({

host:process.env.DB_HOST,

port:Number(process.env.DB_PORT) || 3306,

user:process.env.DB_USER,

password:process.env.DB_PASSWORD,

database:process.env.DB_NAME,

waitForConnections:true,

connectionLimit:10,

// Keep DATE columns (release dates, diary dates) as plain "YYYY-MM-DD" strings and read
// TIMESTAMP/DATETIME in UTC so values never shift with the server's time zone.
dateStrings:["DATE"],

timezone:"Z"

});

pool.pool.on("connection",(connection)=>{

connection.query("SET time_zone = '+00:00'");

});

module.exports=pool;
