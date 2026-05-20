import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/feed", async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const result = await pool.query(
      `SELECT vp.*, u.username, u.display_name, u.avatar_url,
              EXISTS(SELECT 1 FROM vocal_post_likes WHERE post_id = vp.id AND user_id = $1) as liked
       FROM vocal_posts vp
       JOIN users u ON u.id = vp.author_id
       WHERE vp.deleted_at IS NULL AND vp.visibility = 'public'
       AND (
         vp.author_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)
         OR vp.author_id = $1
       )
       ORDER BY vp.created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/explore", async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const result = await pool.query(
      `SELECT vp.*, u.username, u.display_name, u.avatar_url
       FROM vocal_posts vp
       JOIN users u ON u.id = vp.author_id
       WHERE vp.deleted_at IS NULL AND vp.visibility = 'public'
       AND vp.created_at > NOW() - INTERVAL '48 hours'
       ORDER BY (vp.likes_count * 2 + vp.replies_count * 3 + vp.listens_count) DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", async (req, res) => {
  const { audioUrl, audioDurationMs, audioWaveform, transcription, language, caption, hashtags, parentId, visibility = "public" } = req.body;
  try {
    let rootId = null;
    if (parentId) {
      const parent = await pool.query("SELECT root_id, id FROM vocal_posts WHERE id = $1", [parentId]);
      if (parent.rows.length > 0) rootId = parent.rows[0].root_id || parent.rows[0].id;
    }
    const result = await pool.query(
      `INSERT INTO vocal_posts
        (author_id, audio_url, audio_duration_ms, audio_waveform, transcription, language, caption, hashtags, parent_id, root_id, visibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.id, audioUrl, audioDurationMs, audioWaveform, transcription, language, caption, hashtags, parentId, rootId, visibility]
    );
    if (parentId) {
      await pool.query("UPDATE vocal_posts SET replies_count = replies_count + 1 WHERE id = $1", [parentId]);
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/:id/like", async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO vocal_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.params.id, req.user.id]
    );
    const count = await pool.query("SELECT likes_count FROM vocal_posts WHERE id = $1", [req.params.id]);
    res.json({ likes_count: count.rows[0]?.likes_count });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/like", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM vocal_post_likes WHERE post_id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const count = await pool.query("SELECT likes_count FROM vocal_posts WHERE id = $1", [req.params.id]);
    res.json({ likes_count: count.rows[0]?.likes_count });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/:id/listen", async (req, res) => {
  try {
    await pool.query("UPDATE vocal_posts SET listens_count = listens_count + 1 WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;