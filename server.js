"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   BASIC SETTINGS
========================= */

app.disable("x-powered-by");

app.use(express.json({
  limit: "10mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "10mb"
}));

/* =========================
   STATIC FILES
========================= */

app.use(
  express.static(
    path.join(__dirname)
  )
);

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    app: "Neuro-chat",
    status: "online",
    timestamp: new Date().toISOString()
  });
});

/* =========================
   API STATUS
========================= */

app.get("/api/status", (req, res) => {
  res.status(200).json({
    success: true,
    name: "Neuro-chat",
    version: "1.0.0",
    server: "online"
  });
});

/* =========================
   FRONTEND
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================
   SPA FALLBACK
========================= */

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================
   API 404
========================= */

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found"
  });
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

/* =========================
   START
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Neuro-chat is running on port ${PORT}`
  );
});