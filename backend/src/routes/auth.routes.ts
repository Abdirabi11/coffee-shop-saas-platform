import express from "express"
import { 
    requestSignupOtp, 
    verifySignup, 
    requestLoginOtp, 
    verifyLoginOtp,
    logout, 
    refreshToken, 
    getMe, 
    resendOtp,
    logoutAll,
    getSessions,
    completeProfile,
    selectStore
} from "../controllers/auth.controller.ts";
import {authenticate} from "../middlewares/auth.middleware.ts"
import { otpRequestLimiter } from "../utils/rateLimit.ts";

const router= express.Router();

router.post("/signup/request-otp", otpRequestLimiter, requestSignupOtp)
router.post("/signup/verify", verifySignup)
router.post("/login/request-otp", otpRequestLimiter, requestLoginOtp);
router.post("/login/verify", verifyLoginOtp);
router.post("/logout", logout);
router.post("/refresh", refreshToken);
router.get("/getme", authenticate, getMe);
router.post("/otp/resend", otpRequestLimiter, resendOtp)
router.post("/logout-all", authenticate, logoutAll)
router.get("/sessions", authenticate, getSessions) //get Device name, IP, Last active, Current session flag
router.patch("profile", authenticate, completeProfile)
router.post("/select-store", authenticate, selectStore);





// router.get(
//     "/admin",
//     authenticate,
//     authorize("ADMIN"),
//     adminController
//   );

export default router;