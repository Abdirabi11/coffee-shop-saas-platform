import express from "express"
import { loginRateLimit, otpRateLimit, passwordChangeRateLimit, passwordResetRateLimit, tokenRotateRateLimit } from "../../middlewares/AuthRateLimit.middleware.ts";
import { AuthController } from "../../controllers/auth/Auth.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";


const router = express.Router();
 
// ── Auth Flows (public) ──────────────────────────────────────────────────────
 
// Signup
router.post("/auth/signup/request-otp", loginRateLimit, AuthController.requestSignupOtp);
router.post("/auth/signup/verify", otpRateLimit, AuthController.verifySignup);
 
// Login (OTP)
router.post("/auth/login/request-otp", loginRateLimit, AuthController.requestLoginOtp);
router.post("/auth/login/verify", otpRateLimit, AuthController.verifyLoginOtp);
 
// Login (Password — Admin/SuperAdmin only)
router.post("/auth/login/password", loginRateLimit, AuthController.loginWithPassword);

router.post("/auth/logout", AuthController.logout);
router.post("/auth/logout/all", authenticate, AuthController.logoutAll);

router.get( "/auth/me", authenticate, AuthController.me);

router.get( "/auth/email/verify", AuthController.verifyEmail); 
router.post("/auth/email/send-verification", authenticate, AuthController.sendEmailVerification);
router.post("/auth/email/resend", authenticate, AuthController.resendEmailVerification); 

router.post("/auth/token/rotate", tokenRotateRateLimit, AuthController.rotateToken);

router.get( "/auth/sessions", authenticate, AuthController.listSessions);
router.post("/auth/sessions/:uuid/revoke", authenticate, AuthController.revokeSession);

// Login (2FA — after primary auth returns tempToken)
router.post("/auth/2fa/setup", authenticate, AuthController.setup2FA);
router.post("/auth/login/2fa", otpRateLimit, AuthController.verify2FA);
router.post("/auth/2fa/enable", authenticate, AuthController.enable2FA);
 
// Login (Biometric — mobile)
router.post("/auth/login/biometric", AuthController.loginWithBiometric);
 
//Login (Social)
router.post("/auth/login/google", AuthController.loginWithGoogle);
router.post("/auth/login/apple", AuthController.loginWithApple);

// Public — token in query

router.post("/auth/password/change", authenticate, passwordChangeRateLimit, AuthController.changePassword);
router.post("/auth/password/forgot", passwordResetRateLimit, AuthController.forgotPassword);
router.post("/auth/password/reset", passwordResetRateLimit, AuthController.resetPassword);


export default router;