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
  forcePathStyle: true,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/audio", upload.single("audio"), async (req, res) => {
  console.log("📥 Upload reçu - type:", req.body.type, "- file:", req.file?.originalname, "- size:", req.file?.size);

  try {
    const { type } = req.body;
    const file = req.file;
    if (!file) {
      console.log("❌ Pas de fichier reçu");
      return res.status(400).json({ error: "Fichier audio manquant" });
    }

    let audioUrl = null;

    console.log("🔍 R2_ENDPOINT:", process.env.R2_ENDPOINT ? "défini" : "MANQUANT");
    console.log("🔍 R2_ACCESS_KEY:", process.env.R2_ACCESS_KEY ? "défini" : "MANQUANT");
    console.log("🔍 R2_BUCKET:", process.env.R2_BUCKET || "MANQUANT");

    if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY) {
      try {
        const key = `audio/${type}/${req.user.id}/${uuidv4()}.m4a`;
        console.log("📤 Upload vers R2, key:", key);
        await r2.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || "audio/m4a",
        }));
        audioUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
        console.log("✅ Upload R2 réussi:", audioUrl);
      } catch (r2Err) {
        console.error("❌ R2 ERROR:", r2Err.message);
        console.error(r2Err);
      }
    } else {
      console.log("⚠️ R2 non configuré, skip upload");
    }

    let transcription = null;
    let language = null;

if (type !== "message" && process.env.OPENAI_API_KEY) {
  try {
    console.log("🎙 Tentative transcription Whisper...");
    const { toFile } = await import("openai");
    const audioFile = await toFile(file.buffer, "audio.m4a", { type: "audio/m4a" });

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    transcription = response.text;
    language = response.language;
    console.log("✅ Transcription réussie:", transcription);
  } catch (whisperErr) {
    console.error("❌ Whisper error détaillée:", whisperErr);
    console.error("❌ Whisper error message:", whisperErr.message);
    console.error("❌ Whisper error cause:", whisperErr.cause);
  }
}

    res.json({ audioUrl, transcription, language });
  } catch (err) {
    console.error("❌ ERREUR GLOBALE:", err);
    res.status(500).json({ error: "Erreur upload" });
  }
});

export default router;