import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/conversations", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.type, c.name, c.updated_at,
              array_agg(DISTINCT jsonb_build_object(
                'id', u.id, 'username', u.username,
                'display_name', u.display_name, 'avatar_url', u.avatar_url
              )) FILTER (WHERE u.id != $1) as members
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       JOIN conversation_members cm2 ON cm2.conversation_id = c.id
       JOIN users u ON u.id = cm2.user_id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  const { limit = 30 } = req.query;
  try {
    const member = await pool.query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, req.user.id]
    );
    if (member.rows.length === 0) return res.status(403).json({ error: "Accès refusé" });

    const result = await pool.query(
      `SELECT m.*, u.username as sender_username, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.sent_at DESC LIMIT $2`,
      [conversationId, limit]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/conversations", async (req, res) => {
  const { recipientId } = req.body;
  try {
    const existing = await pool.query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = $1
       JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = $2
       WHERE c.type = 'direct'`,
      [req.user.id, recipientId]
    );
    if (existing.rows.length > 0) return res.json(existing.rows[0]);

    const conv = await pool.query(
      "INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING *",
      [req.user.id]
    );
    const conversationId = conv.rows[0].id;
    await pool.query(
      "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
      [conversationId, req.user.id, recipientId]
    );
    res.status(201).json(conv.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;