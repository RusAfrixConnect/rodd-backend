import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/audio", upload.single("audio"), async (req, res) => {
  try {
    const { type } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Fichier audio manquant" });

    let audioUrl = null;

    // Upload vers R2 seulement si configuré
    if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY) {
      const key = `audio/${type}/${req.user.id}/${uuidv4()}.m4a`;
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "audio/m4a",
      }));
      audioUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    }

    let transcription = null;
    let language = null;

    // Transcription Whisper pour les posts publics
    if (type !== "message" && process.env.OPENAI_API_KEY) {
      try {
        const { toFile } = await import("openai");
        const audioFile = await toFile(
          file.buffer,
          "audio.m4a",
          { type: "audio/m4a" }
        );

        const response = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });

        transcription = response.text;
        language = response.language;
      } catch (whisperErr) {
        console.warn("Whisper error:", whisperErr.message);
      }
    }

    res.json({ audioUrl, transcription, language });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur upload" });
  }
});

export default router;