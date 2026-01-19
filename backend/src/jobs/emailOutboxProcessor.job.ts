import prisma from "../config/prisma.ts"

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

export class EmailOutboxProcessorJob{
    static async run(){
        const emails= await prisma.emailOutbox.findMany({
            where: {
                status: "PENDING",
                attempts: { lt: MAX_ATTEMPTS },
            },
            take: BATCH_SIZE,
            orderBy: { createdAt: "asc" },
        });

        for (const email of emails) {
            await this.process(email.uuid);
        };
    }

    private static async process(emailUuid: string){
        const email= await prisma.EmailOutbox.update({
            where: {uuid: emailUuid},
            data: {
                status: "PROCESSING",
                attempts: { increment: 1 },
            }
        });

        try {
            await sendEmail({
                to: email.to,
                subject: email.subject,
                template: email.template,
                payload: email.payload,
            });

            await prisma.emailOutbox.update({
                where: { uuid: emailUuid },
                data: {
                    status: "SENT",
                    sentAt: new Date(),
                },
            });


        } catch (error: any) {
            const attemptsLeft = email.attempts + 1 >= MAX_ATTEMPTS;

            await prisma.emailOutbox.update({
                where: { uuid: emailUuid },
                data: {
                    status: attemptsLeft ? "DEAD" : "PENDING",
                    lastError: error.message,
                },
            });
            
            // 🚨 Alert admins only on serious failure
            if (attemptsLeft) {
                AlertService.ops("Email delivery failed (dead-letter)", {
                  emailUuid,
                  to: email.to,
                  template: email.template,
                  error: error.message,
                });
            }
        }
    }
}