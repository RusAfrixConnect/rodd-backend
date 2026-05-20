import { pool } from "../db.js";
import jwt from "jsonwebtoken";

export function socketHandler(io) {

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Token manquant"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query(
        "SELECT id, username, display_name, avatar_url FROM users WHERE id = $1",
        [decoded.userId]
      );
      if (!result.rows[0]) return next(new Error("User introuvable"));
      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 ${socket.user.username} connecté`);

    socket.join(`user:${socket.user.id}`);
    pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [socket.user.id]);

    socket.on("conversation:join", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("message:send", async (data, callback) => {
      const { conversationId, type, audioUrl, audioDurationMs, contentEncrypted, replyToId } = data;
      try {
        const member = await pool.query(
          "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
          [conversationId, socket.user.id]
        );
        if (!member.rows.length) return callback({ error: "Accès refusé" });

        const result = await pool.query(
          `INSERT INTO messages
            (conversation_id, sender_id, type, audio_url, audio_duration_ms, content_encrypted, reply_to_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [conversationId, socket.user.id, type, audioUrl, audioDurationMs, contentEncrypted, replyToId]
        );

        const message = { ...result.rows[0], sender: socket.user };
        await pool.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
        io.to(`conversation:${conversationId}`).emit("message:new", message);
        callback({ ok: true, message });
      } catch (err) {
        console.error(err);
        callback({ error: "Erreur envoi message" });
      }
    });

    socket.on("conversation:recording", ({ conversationId, isRecording }) => {
      socket.to(`conversation:${conversationId}`).emit("conversation:recording", {
        userId: socket.user.id,
        username: socket.user.username,
        isRecording,
      });
    });

    socket.on("call:offer", ({ recipientId, offer, conversationId }) => {
      io.to(`user:${recipientId}`).emit("call:incoming", {
        callerId: socket.user.id,
        caller: socket.user,
        offer,
        conversationId,
      });
    });

    socket.on("call:answer", ({ callerId, answer }) => {
      io.to(`user:${callerId}`).emit("call:answered", { answer });
    });

    socket.on("call:ice-candidate", ({ recipientId, candidate }) => {
      io.to(`user:${recipientId}`).emit("call:ice-candidate", { candidate });
    });

    socket.on("call:end", ({ recipientId }) => {
      io.to(`user:${recipientId}`).emit("call:ended", { by: socket.user.id });
    });

    socket.on("stadion:join", async ({ stadionId }) => {
      socket.join(`stadion:${stadionId}`);
      const count = io.sockets.adapter.rooms.get(`stadion:${stadionId}`)?.size || 0;
      io.to(`stadion:${stadionId}`).emit("stadion:listener_count", { count });
    });

    socket.on("stadion:leave", ({ stadionId }) => {
      socket.leave(`stadion:${stadionId}`);
      const count = io.sockets.adapter.rooms.get(`stadion:${stadionId}`)?.size || 0;
      io.to(`stadion:${stadionId}`).emit("stadion:listener_count", { count });
    });

    socket.on("stadion:chat", ({ stadionId, text }) => {
      if (!text || text.length > 300) return;
      io.to(`stadion:${stadionId}`).emit("stadion:chat", {
        user: socket.user,
        text,
        at: new Date().toISOString(),
      });
    });

    socket.on("znd:tip_stadion", async ({ stadionId, toUserId, amount, message }, callback) => {
      try {
        if (amount < 1) return callback({ error: "Minimum 1 ZND" });
        const balance = await pool.query(
          "SELECT znd_balance FROM user_wallets WHERE user_id = $1",
          [socket.user.id]
        );
        if (!balance.rows[0] || parseFloat(balance.rows[0].znd_balance) < amount) {
          return callback({ error: "Solde insuffisant" });
        }
        await pool.query(
          "UPDATE user_wallets SET znd_balance = znd_balance - $1 WHERE user_id = $2",
          [amount, socket.user.id]
        );
        await pool.query(
          "UPDATE user_wallets SET znd_balance = znd_balance + $1 WHERE user_id = $2",
          [amount * 0.80, toUserId]
        );
        io.to(`stadion:${stadionId}`).emit("znd:tip_received", {
          from: socket.user,
          amount,
          message: message?.slice(0, 100),
          at: new Date().toISOString(),
        });
        callback({ ok: true });
      } catch (err) {
        callback({ error: err.message });
      }
    });

    socket.on("disconnect", async () => {
      console.log(`❌ ${socket.user.username} déconnecté`);
      await pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [socket.user.id]);
    });
  });
}