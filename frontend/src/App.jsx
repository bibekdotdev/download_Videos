import { useState } from "react";

export default function App() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [timeTaken, setTimeTaken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // For download failure

  const resetAll = () => {
    setUrl("");
    setProgress(0);
    setTimeTaken(null);
    setLoading(false);
    setError(null);
  };

  const handleDownload = () => {
    if (!url.trim()) {
      alert("Please enter a video URL");
      return;
    }

    setLoading(true);
    setProgress(0);
    setError(null);
    const startTime = Date.now();

    // Listen to progress events from backend
   const eventSource = new EventSource("https://download-videosb.onrender.com/progress");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          setError(data.error);
          setLoading(false);
          eventSource.close();
          return;
        }

        if (data.progress) {
          setProgress(data.progress);
        }
        if (data.time) {
          eventSource.close();
          setTimeTaken(data.time);
          setLoading(false);

          // Reset all after 3 seconds
          setTimeout(() => {
            resetAll();
          }, 3000);
        }
      } catch {
        console.warn("Invalid SSE message", event.data);
      }
    };

    // Trigger the actual download
    fetch(`https://download-videosb.onrender.com/download?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Download failed for this link");
        }
        return res.blob();
      })
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "video.mp4";
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        eventSource.close();
      });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6">
      <div className="bg-gray-800 rounded-2xl shadow-lg p-8 w-full max-w-lg">
        <h1 className="text-4xl font-bold mb-2 text-center">
          📥 Video Downloader
        </h1>
        <p className="text-gray-400 mb-6 text-center">
          Developed by{" "}
          <a
            href="https://github.com/bibekdotdev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 font-semibold underline hover:text-blue-600"
          >
            Bibek Jana
          </a>
        </p>

        <input
          type="text"
          placeholder="Enter video URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border border-gray-600 bg-gray-900 p-3 w-full rounded-lg mb-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleDownload}
          disabled={loading}
          className={`px-6 py-3 rounded-lg w-full font-semibold transition ${
            loading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Downloading..." : "Download"}
        </button>

        {loading && (
          <div className="mt-4 w-full bg-gray-700 rounded-full h-4">
            <div
              className="bg-green-500 h-4 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {timeTaken && (
          <p className="mt-4 text-center text-green-400">
            ✅ Download completed in {timeTaken} seconds
          </p>
        )}

        {error && <p className="mt-4 text-center text-red-400">❌ {error}</p>}
      </div>
    </div>
  );
}
