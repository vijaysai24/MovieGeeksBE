const config=require("./config/env");

const app=require("./app");

app.listen(config.port,()=>{

console.log(`Server running on port ${config.port}`);

});
