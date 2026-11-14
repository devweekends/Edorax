import { Router } from "express";
import * as shellLabs from "../../controllers/shell-labs.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requireVerified } from "../../middlewares/require-verified.js";

// Shell labs for the signed-in desktop app. The app runs the checks, so the whole
// lab (checks and solutions) is sent, as the bundled files were before.
const router = Router();

router.use(authenticate, requireVerified);

router.get("/version", shellLabs.version);
router.get("/", shellLabs.list);

export default router;
