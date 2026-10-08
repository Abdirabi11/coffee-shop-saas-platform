import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { sendOutboundRequest } from "../../infrastructure/http/safeOutboundRequest.ts";


function signPayload(payload: any, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
};

export class WebhookDispatcher {
    static async dispatch(
      storeUuid: string,
      eventType: string,
      payload: any
    ){
        return dispatchWebhook(storeUuid, eventType, payload);
    }

    static async dispatchByOrder(
        orderUuid: string,
        eventType: string
    ){
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            select: { storeUuid: true },
        });
      
        if (!order) return;
      
        return dispatchWebhook(order.storeUuid, eventType, {
            orderUuid,
            eventType,
        });
    }

}
  
export const dispatchWebhook= async (
    storeUuid: string,
    eventType: string,
    payload: any
)=>{
    const webhooks= await prisma.webhook.findMany({
        where: {storeUuid, eventType, isActive: true}
    });

    for (const hook of webhooks){
        await sendOutboundRequest({
            url: hook.url,
            headers: {
              "Content-Type": "application/json",
              "X-Signature": signPayload(payload, hook.secret),
            },
            body: JSON.stringify(payload),
        })
    }
};


