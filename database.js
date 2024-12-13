const sql = require("mysql");

const database = sql.createConnection({
    host : "localhost",
    user : "root",
    password : "",
    database : "books"
});

database.connect(function(error){
    if (error) throw error;
    console.log("Terkoneksi");
});

module.exports = database;