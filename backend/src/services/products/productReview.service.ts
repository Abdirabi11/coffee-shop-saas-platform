import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";

export class ProductReview{
    //Create product review
    static async create(input: {
        tenantUuid: string;
        productUuid: string;
        tenantUserUuid: string;
        orderUuid: string;
        rating: number;
        title?: string;
        comment?: string;
        imageUrls?: string[];
    }){
        //Verify user purchased this product
        const orderItem = await prisma.orderItem.findFirst({
            where: {
                order: {
                    uuid: input.orderUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    status: "COMPLETED",
                },
                productUuid: input.productUuid,
            },
        });
    
        if (!orderItem) {
            throw new Error("CANNOT_REVIEW_UNPURCHASED_PRODUCT");
        };

        //check if already productReview exists
        const existing= await prisma.productReview.findFirst({
            where:{
                tenantUuid: input.tenantUuid,
                orderUuid: input.orderUuid,
                productUuid: input.productUuid,
            }
        });
        if(existing){
            throw new Error("ALREADY_REVIEWED");
        };

        // Create review
        const review = await prisma.productReview.create({
            data: {
                tenantUuid: input.tenantUuid,
                productUuid: input.productUuid,
                tenantUserUuid: input.tenantUserUuid,
                orderUuid: input.orderUuid,
                rating: input.rating,
                title: input.title,
                comment: input.comment,
                imageUrls: input.imageUrls || [],
                status: "APPROVED", // Auto-approve or set to PENDING for moderation
                isVerifiedPurchase: true,
            },
        });


        // Update product average rating
        await this.updateProductRating(input.productUuid);

        EventBus.emit("PRODUCT_REVIEWED", {
            tenantUuid: input.tenantUuid,
            productUuid: input.productUuid,
            reviewUuid: review.uuid,
            rating: input.rating,
        });

        return review;
    }

    //Update product average rating
    private static async updateProductRating(productUuid: string) {
        const stats = await prisma.productReview.aggregate({
            where: {
                productUuid,
                status: "APPROVED",
            },
            _avg: { rating: true },
            _count: { uuid: true },
        });

        await prisma.product.update({
            where: { uuid: productUuid },
            data: {
                averageRating: stats._avg.rating || 0,
                reviewCount: stats._count.uuid,
            },
        });
    }

    //List reviews for product
    static async list(input: {
        productUuid: string;
        pagination?: { page?: number; limit?: number };
    }) {
        const page = input.pagination?.page || 1;
        const limit = input.pagination?.limit || 10;
        const skip = (page - 1) * limit;

        const [reviews, total] = await Promise.all([
            prisma.productReview.findMany({
                where: {
                    productUuid: input.productUuid,
                    status: "APPROVED",
                },
                include: {
                    tenantUser: {
                        include: { user: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.productReview.count({
                where: {
                    productUuid: input.productUuid,
                    status: "APPROVED",
                },
            }),
        ]);
        return { reviews, pagination: { page, limit, total } };
    }
}