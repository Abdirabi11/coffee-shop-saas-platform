import crypto from "crypto";
import prisma from "../config/prisma.ts"


export const verifyWebhookSignature= async (
    payload: string,
    signature: string,
    provider: string
)=> {
    const secrets= await prisma.webhookSecret.findMany({
        where: {
            provider,
            isActive: true
        }
    });

    for(const s of secrets){
        const expected= crypto
         .createHmac("sha256", s.secretHash)
         .update(payload)
         .digest("hex")
        
        if (crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(signature)
        )) {
            return true;
        }
    };
    return false;
};