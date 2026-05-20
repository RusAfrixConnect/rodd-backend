import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

router.post("/audio", upload.single("audio"), async (req, res) => {
  try {
    const { type } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Fichier audio manquant" });

    const key = `audio/${type}/${req.user.id}/${uuidv4()}.opus`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "audio/opus",
    }));

    const audioUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ audioUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur upload" });
  }
});

export default router;