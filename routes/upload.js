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
  forcePathStyle: true,
});

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
      }
    }

    let transcription = null;
    let language = null;

    if (type !== "message" && process.env.OPENAI_API_KEY) {
      try {
        console.log("🎙 Tentative transcription Whisper (fetch natif)...");
        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: "audio/m4a" });
        formData.append("file", blob, "audio.m4a");
        formData.append("model", "whisper-1");

        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: formData,
        });

        const whisperData = await whisperRes.json();
        if (whisperData.text) {
          transcription = whisperData.text;
          console.log("✅ Transcription réussie:", transcription);
        } else {
          console.error("❌ Whisper response error:", whisperData);
        }
      } catch (whisperErr) {
        console.error("❌ Whisper error (fetch):", whisperErr.message);
      }
    }

    res.json({ audioUrl, transcription, language });
  } catch (err) {
    console.error("❌ ERREUR GLOBALE:", err);
    res.status(500).json({ error: "Erreur upload" });
  }
});

export default router;