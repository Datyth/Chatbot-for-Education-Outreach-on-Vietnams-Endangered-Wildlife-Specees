import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { engine } from "express-handlebars";
import routes from "./routes/route.js";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.engine(
  "handlebars",
  engine({
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views", "layouts"),
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// Proxy chat API to FastAPI backend (place before routes to avoid 404)
app.use(
  "/api/chat",
  createProxyMiddleware({
    target: process.env.RAG_API_URL || "http://127.0.0.1:8000",
    changeOrigin: true,
    pathRewrite: { "^/api/chat": "/chat" },
  })
);
app.use("/", routes);
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
