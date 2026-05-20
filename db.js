import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "rodd",
  user: "postgres",
  password: "Rodd2024",
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => console.error("PostgreSQL pool error:", err));