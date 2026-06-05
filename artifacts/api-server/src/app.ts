import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

import { getMatch } from "./lib/sqlite-db.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET /match/:matchId
// Completely public endpoint serving the raw MatchZy JSON config from SQLite
app.get("/match/:matchId", (req, res) => {
  try {
    const matchId = req.params.matchId;
    const configJson = getMatch(matchId);
    if (configJson) {
      res.setHeader("Content-Type", "application/json");
      res.send(configJson);
    } else {
      res.status(404).json({ error: `Match ${matchId} not found.` });
    }
  } catch (e: any) {
    res.status(500).json({ error: `Server error: ${e.message}` });
  }
});

app.use("/api", router);

export default app;
