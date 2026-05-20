import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { username, phone, email, password } = req.body;
  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username ou email déjà utilisé" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, phone, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email`,
      [username, phone, email, passwordHash]
    );
    const user = result.rows[0];
    const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const refreshToken = uuidv4();
    await pool.query(
      `INSERT INTO auth_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken]
    );
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1 OR email = $1`,
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Identifiants invalides" });
    const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const refreshToken = uuidv4();
    await pool.query(
      `INSERT INTO auth_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken]
    );
    await pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [user.id]);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const result = await pool.query(
      `SELECT user_id FROM auth_sessions
       WHERE refresh_token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Session expirée" });
    }
    const { user_id } = result.rows[0];
    const accessToken = jwt.sign({ userId: user_id }, process.env.JWT_SECRET, { expiresIn: "15m" });
    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;