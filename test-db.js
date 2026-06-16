import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT 1").then(() => {
  console.log("DB OK !");
  process.exit(0);
}).catch((err) => {
  console.error("DB ERROR:", err.message);
  process.exit(1);
});