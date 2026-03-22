import express from "express"
import { AuthController } from "../../controllers/auth/Auth.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { deviceFingerprintMiddleware } from "../../middlewares/deviceFingerprint.middleware.ts";
import { burstProtection, rateLimitByUser } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { sanitizeInput } from "../../middlewares/sanitization.middleware.ts";
import { loginRateLimit, otpRateLimit, passwordChangeRateLimit, tokenRotateRateLimit } from "../../middlewares/AuthRateLimit.middleware.ts";


const router= express.Router();

// PUBLIC AUTH ROUTES (No authentication required)

router.use(sanitizeInput);
router.use(deviceFingerprintMiddleware);

//POST /auth/signup/request-otp
//Request OTP for signup
//Rate limit: 5 requests per 15 minutes per IP
router.post(
    "/signup/request-otp",
    burstProtection(),
    rateLimitByUser({ points: 5, duration: 900, keyPrefix: "signup_otp" }),
    AuthController.requestSignupOtp
);

/**
 * POST /auth/signup/verify
 * Verify signup OTP
 * Rate limit: 10 requests per 15 minutes per IP
*/
router.post(
    "/signup/verify",
    burstProtection(),
    rateLimitByUser({ points: 10, duration: 900, keyPrefix: "signup_verify" }),
    AuthController.verifySignup
);
  
/**
   * POST /auth/login/request-otp
   * Request OTP for login
   * Rate limit: 5 requests per 15 minutes per IP
*/
router.post(
    "/login/request-otp",
    burstProtection(),
    rateLimitByUser({ points: 5, duration: 900, keyPrefix: "login_otp" }),
    AuthController.requestLoginOtp
);
  
/**
   * POST /auth/login/verify
   * Verify login OTP
   * Rate limit: 10 requests per 15 minutes per IP
*/
router.post(
    "/login/verify",
    burstProtection(),
    rateLimitByUser({ points: 10, duration: 900, keyPrefix: "login_verify" }),
    AuthController.verifyLoginOtp
);
  
/**
   * POST /auth/refresh
   * Refresh access token
   * Rate limit: 30 requests per 15 minutes per user
*/
router.post(
    "/refresh",
    rateLimitByUser({ points: 30, duration: 900, keyPrefix: "refresh" }),
    AuthController.refreshToken
);


// AUTHENTICATED AUTH ROUTES
// ═══════════════════════════════════════════════════════════

router.use(authenticate);

/**
 * POST /auth/logout
 * Logout current session
*/
router.post("/logout", AuthController.logout);

/**
 * POST /auth/logout-all
 * Logout all sessions
*/
router.post("/logout-all", AuthController.logoutAll);

/**
 * GET /auth/me
 * Get current user
*/
router.get("/me", AuthController.getMe);

/**
 * GET /auth/sessions
 * Get user sessions
*/
router.get("/sessions", AuthController.getSessions);

/**
 * DELETE /auth/sessions/:sessionUuid
 * Revoke specific session
*/
router.delete("/sessions/:sessionUuid", AuthController.revokeSession);

/**
 * GET /auth/devices
 * Get trusted devices
*/
router.get("/devices", AuthController.getTrustedDevices);

/**
 * DELETE /auth/devices/:deviceUuid
 * Revoke device trust
*/
router.delete("/devices/:deviceUuid", AuthController.revokeDeviceTrust);

export default router;

router.post("/auth/signup/request-otp", loginRateLimit, AuthController.requestSignupOtp);
router.post("/auth/signup/verify", otpRateLimit, AuthController.verifySignup);
 
// ── Login: Phone + OTP (public, rate limited) ───────────────────────────
router.post("/auth/login/request-otp", loginRateLimit, AuthController.requestLoginOtp);
router.post("/auth/login/verify", otpRateLimit, AuthController.verifyLoginOtp);
 
// ── Login: Admin Password (public, rate limited) ────────────────────────
router.post("/auth/login/password", loginRateLimit, AuthController.loginWithPassword);
 
// ── Login: 2FA (public — temp token auth) ───────────────────────────────
router.post("/auth/login/2fa", otpRateLimit, AuthController.verify2FA);
 
// ── Login: Biometric (public, device-authenticated) ─────────────────────
router.post("/auth/login/biometric", AuthController.loginWithBiometric);
 
// ── Login: Social (public) ──────────────────────────────────────────────
router.post("/auth/login/google", AuthController.loginWithGoogle);
router.post("/auth/login/apple", AuthController.loginWithApple);
 
// ── Token Rotation (public — validated by refresh token) ────────────────
router.post("/auth/token/rotate", tokenRotateRateLimit, AuthController.rotateToken);
 
// ── Logout (works with cookie, no strict auth needed) ───────────────────
router.post("/auth/logout", AuthController.logout);
router.post("/auth/logout/all", authenticate, AuthController.logoutAll);
 
// ── Sessions (authenticated) ────────────────────────────────────────────
router.get("/auth/sessions", authenticate,       AuthController.listSessions);
router.post("/auth/sessions/:sessionUuid/revoke", authenticate, AuthController.revokeSession);
 
// ── Password (authenticated + rate limited) ─────────────────────────────
router.post("/auth/password/change", authenticate, passwordChangeRateLimit, AuthController.changePassword);
 
// ── Profile (authenticated) ─────────────────────────────────────────────
router.get("/auth/me", authenticate, AuthController.me);
