// Applies src/db/migrations/*.sql in filename order, once each, tracked in schema_migrations.
// Usage: npm run migrate          apply pending migrations
//        npm run migrate status   list applied and pending migrations
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const run = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(150) PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [rows] = await connection.query("SELECT version FROM schema_migrations");
        const applied = new Set(rows.map((row) => row.version));

        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter((file) => file.endsWith(".sql"))
            .sort();

        const pending = files.filter((file) => !applied.has(file));

        if (process.argv[2] === "status") {
            files.forEach((file) => console.log(`${applied.has(file) ? "applied" : "pending"}  ${file}`));
            return;
        }

        if (!pending.length) {
            console.log("Database is up to date.");
            return;
        }

        for (const file of pending) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
            console.log(`Applying ${file}...`);
            // MySQL commits DDL implicitly, so a failed migration must be fixed forward.
            await connection.query(sql);
            await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
        }

        console.log(`Applied ${pending.length} migration(s).`);
    } finally {
        await connection.end();
    }
};

run().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
