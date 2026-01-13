"use strict";

const express = require("express");
const router = express.Router();
const cjResyncJob = require("../jobs/cjResyncJob");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD;

function requireAdminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN not configured" });
  }
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.post("/cj/resync", requireAdminAuth, (req, res) => {
  const { limit } = req.body || {};
  const result = cjResyncJob.startResync({ limit: limit ? parseInt(limit, 10) : undefined });
  res.json(result);
});

router.get("/cj/resync/status", requireAdminAuth, (req, res) => {
  res.json(cjResyncJob.getStatus());
});

router.get("/cj/resync/log", requireAdminAuth, (req, res) => {
  res.type("text/plain").send(cjResyncJob.getLogs());
});

module.exports = router;
