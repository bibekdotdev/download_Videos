const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();

const FRONTEND_ORIGIN = "https://download-videos-uv7k.onrender.com";

// Enable CORS for frontend origin
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// Handle OPTIONS preflight requests for all routes
app.options("*", cors());

// Middleware to add CORS headers on all responses
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

let progressClients = [];
let startTime = null;

// SSE endpoint for progress updates
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Important: Set CORS headers explicitly for SSE endpoint
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.flushHeaders();

  progressClients.push(res);

  req.on("close", () => {
    progressClients = progressClients.filter((client) => client !== res);
  });
});

// Send progress data to all connected SSE clients
function sendProgress(progress) {
  progressClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(progress)}\n\n`);
  });
}

// Download route
app.get("/download", (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) {
      res.status(400).send("No URL provided");
      return;
    }

    const timestamp = Date.now();
    const fileName = `video_${timestamp}.mp4`;

    startTime = Date.now();

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
        return;
      }

      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
      sendProgress({ progress: 100, time: timeTaken });

      res.download(fileName, (err) => {
        if (err) {
          console.error("Error sending file:", err);
          if (!res.headersSent) res.status(500).send("Error sending file");
        }
        try {
          fs.unlinkSync(fileName);
        } catch (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
