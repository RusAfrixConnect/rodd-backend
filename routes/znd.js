import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/wallet", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT wallet_address, znd_balance, znd_staked FROM user_wallets WHERE user_id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.json({ balance: 0, address: null });
    }
    res.json({
      address: result.rows[0].wallet_address,
      balance: result.rows[0].znd_balance,
      staked: result.rows[0].znd_staked,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, fu.username as from_username, tu.username as to_username
       FROM znd_transactions t
       LEFT JOIN users fu ON fu.id = t.from_user_id
       LEFT JOIN users tu ON tu.id = t.to_user_id
       WHERE t.from_user_id = $1 OR t.to_user_id = $1
       ORDER BY t.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/tip", async (req, res) => {
  const { toUserId, amount, type, referenceId } = req.body;
  if (!toUserId || !amount) return res.status(400).json({ error: "Paramètres manquants" });
  if (req.user.id === toUserId) return res.status(400).json({ error: "Auto-tip impossible" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const balance = await client.query(
      "SELECT znd_balance FROM user_wallets WHERE user_id = $1 FOR UPDATE",
      [req.user.id]
    );
    if (!balance.rows[0] || parseFloat(balance.rows[0].znd_balance) < amount) {
      throw new Error("Solde ZND insuffisant");
    }

    const creatorAmount = amount * 0.80;
    const platformCut = amount * 0.20;

    await client.query(
      "UPDATE user_wallets SET znd_balance = znd_balance - $1 WHERE user_id = $2",
      [amount, req.user.id]
    );
    await client.query(
      "UPDATE user_wallets SET znd_balance = znd_balance + $1 WHERE user_id = $2",
      [creatorAmount, toUserId]
    );
    await client.query(
      `INSERT INTO znd_transactions (from_user_id, to_user_id, amount, type, reference_id, status)
       VALUES ($1, $2, $3, $4, $5, 'completed')`,
      [req.user.id, toUserId, creatorAmount, type, referenceId]
    );

    await client.query("COMMIT");
    res.json({ ok: true, amount: creatorAmount, fee: platformCut });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;