import express from "express";
const app = express();
app.get("/", (_req, res) => res.json({ status: "scaffold" }));
app.listen(Number(process.env.PORT || 3001), "127.0.0.1");
