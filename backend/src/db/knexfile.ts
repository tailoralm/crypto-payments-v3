import "dotenv/config";
import type { Knex } from "knex";
import path from "path";
const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "cryptopay",
    user: process.env.DB_USER || "cryptopay",
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.join(__dirname, "migrations"),
    loadExtensions: [path.extname(__filename)],
    extension: path.extname(__filename).slice(1),
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
    loadExtensions: [path.extname(__filename)],
  },
};
export default { development: config, production: config, test: config };
module.exports = { development: config, production: config, test: config };
