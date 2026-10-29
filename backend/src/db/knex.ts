import knex from "knex";
import config from "./knexfile";
const env = process.env.NODE_ENV || "development";
const db = knex(config[env as keyof typeof config] || config.development);
export default db;
