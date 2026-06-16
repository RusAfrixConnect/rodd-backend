import dotenv from "dotenv";
dotenv.config();import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db.js";
import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messages.js";
import postRoutes from "./routes/posts.js";
import uploadRoutes from "./routes/upload.js";
import zndRoutes from "./routes/znd.js";
import { socketHandler } from "./sockets/index.js";
import { authenticateToken } from "./middleware/auth.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

app.use(helmet());
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use("/api/auth", authRoutes);
app.use("/api/messages", authenticateToken, messageRoutes);
app.use("/api/posts", authenticateToken, postRoutes);
app.use("/api/upload", authenticateToken, uploadRoutes);
app.use("/api/znd", authenticateToken, zndRoutes);

app.get("/health", (_, res) => res.json({ status: "ok", version: "1.0.0" }));

socketHandler(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🎙 RODD server on port ${PORT}`));

export { io };