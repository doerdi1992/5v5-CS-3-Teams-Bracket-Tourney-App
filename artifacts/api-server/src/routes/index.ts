import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import playersRouter from "./players.js";
import teamsRouter from "./teams.js";
import bracketRouter from "./bracket.js";
import serverBroadcastRouter from "./server-broadcast.js";
import stateRouter from "./state.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(teamsRouter);
router.use(bracketRouter);
router.use(serverBroadcastRouter);
router.use(stateRouter);

export default router;
