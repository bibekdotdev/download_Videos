const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();

// Enable CORS only for your frontend domain
app.use(
  cors({
    origin: "https://download-videos-uv7k.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

let progressClients = [];
let startTime = null;

// SSE endpoint for progress updates
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Explicit CORS headers for SSE
  res.setHeader("Access-Control-Allow-Origin", "https://download-videos-uv7k.onrender.com");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.flushHeaders();

  progressClients.push(res);

  req.on("close", () => {
    progressClients = progressClients.filter((client) => client !== res);
  });
});

// Send progress to all connected SSE clients
function sendProgress(progress) {
  progressClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(progress)}\n\n`);
  });
}

// Download route
app.get("/download", (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send("No URL provided");

  const timestamp = Date.now();
  const fileName = `video_${timestamp}.mp4`;

  startTime = Date.now();

  // Run yt-dlp command
  const ytdlp = spawn("yt-dlp", ["-o", fileName, videoUrl]);

  ytdlp.stdout.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/(\d+\.\d)%/); // match "12.3%"
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
      return res.status(500).send("Download failed");
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    sendProgress({ progress: 100, time: timeTaken });

    res.download(fileName, () => {
      fs.unlinkSync(fileName); // Delete after sending
    });
  });
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));
