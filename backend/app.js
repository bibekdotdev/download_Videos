const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();

const FRONTEND_ORIGIN = "https://download-videos-uv7k.onrender.com";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);
app.options("*", cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// To manage one progress stream at a time for simplicity
let sseClient = null;

app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.flushHeaders();

  sseClient = res;

  req.on("close", () => {
    sseClient = null;
  });
});

function sendProgress(data) {
  if (sseClient) {
    sseClient.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

app.get("/download", (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    res.status(400).send("No URL provided");
    return;
  }

  const timestamp = Date.now();
  const fileName = `video_${timestamp}.mp4`;
  const filePath = path.join(__dirname, fileName);
  const startTime = Date.now();

  const ytdlp = spawn("yt-dlp", ["-o", fileName, videoUrl]);

  ytdlp.stdout.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/(\d+\.\d)%/);
    if (match) {
      const percent = parseFloat(match[1]);
      sendProgress({ progress: percent });
    }
  });

  ytdlp.stderr.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/(\d+\.\d)%/);
    if (match) {
      const percent = parseFloat(match[1]);
      sendProgress({ progress: percent });
    } else if (output.toLowerCase().includes("error")) {
      sendProgress({ error: "Download failed for this link" });
    }
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      sendProgress({ error: "Download failed or unsupported link" });
      if (!res.headersSent) res.status(500).send("Download failed");
      cleanupFile(filePath);
      return;
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    sendProgress({ progress: 100, time: timeTaken });

    // Send the downloaded file as response
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        if (!res.headersSent) res.status(500).send("Error sending file");
      }
      cleanupFile(filePath);
    });
  });

  function cleanupFile(pathToFile) {
    fs.unlink(pathToFile, (err) => {
      if (err) console.error("Error deleting file:", err);
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
