import crypto from "crypto";
import prisma from "../config/prisma.ts"


function signPayload(payload: any, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }
  

export const dispatchWebhook= async (
    storeUuid: string,
    eventType: string,
    payload: any
)=>{
    const webhooks= await prisma.webhook.findMany({
        where: {storeUuid, eventType, active: true}
    });

    for (const hook of webhooks){
        await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Signature": signPayload(payload, hook.secret),
            },
            body: JSON.stringify(payload),
        })
    }
}


