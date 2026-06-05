import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import playersRouter from "./players.js";
import teamsRouter from "./teams.js";
import bracketRouter from "./bracket.js";
import serverBroadcastRouter from "./server-broadcast.js";
import stateRouter from "./state.js";
import adminAuthRouter from "./admin-auth.js";
import mapImagesRouter from "./map-images.js";
import matchzyRouter from "./matchzy.js";
import externalApiRouter from "./external-api.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminAuthRouter);
router.use(mapImagesRouter);
router.use(playersRouter);
router.use(teamsRouter);
router.use(bracketRouter);
router.use(serverBroadcastRouter);
router.use(stateRouter);
router.use(matchzyRouter);
router.use(externalApiRouter);

export default router;
