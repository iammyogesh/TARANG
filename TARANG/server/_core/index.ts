import "dotenv/config";
import multer from "multer";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });

  // Backend Bridge for ML Pipeline (Python API running on port 5000)
  // TARANG frontend sends multipart field "scan" (tarangConfig.scanField)
  const upload = multer();

  app.post("/api/inference/predict", upload.single("scan"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No scan file provided" });
      }

      // Forward to Python Flask API using the same "scan" field name
      const formData = new FormData();
      formData.append("scan", new Blob([req.file.buffer as any]), req.file.originalname);
      
      const pyResponse = await fetch("http://localhost:5000/api/predict", {
        method: "POST",
        body: formData
      });
      
      if (!pyResponse.ok) {
        throw new Error(`Python API responded with ${pyResponse.status}`);
      }
      
      const data = await pyResponse.json();
      res.json(data);
    } catch (error) {
      console.error("ML Inference Error:", error);
      res.status(500).json({ 
        error: "Failed to connect to ML Model. Ensure the Python API is running on port 5000."
      });
    }
  });

  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
