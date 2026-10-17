import express from "express";
import { invitationAcceptRateLimit } from "../../middlewares/AuthRateLimit.middleware.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { InvitationController } from "../../controllers/tenant/Invitation.controller.ts";

// Accepting a staff invitation. No tenant context: the invitation names the
// tenant. Rate limited, since the public route takes a token.
const router = express.Router();

// New account for the invited email
router.post("/accept", invitationAcceptRateLimit, InvitationController.acceptWithNewAccount);

// Existing account, signed in
router.post("/accept/existing", invitationAcceptRateLimit, authenticate, InvitationController.acceptAsCurrentUser);

export default router;
