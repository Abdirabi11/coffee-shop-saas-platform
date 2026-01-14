import prisma from "../../config/prisma.ts"
import { MenuSnapshotService } from "./menu-snapshot.service.ts";

export class MenuPreviewService{
    static async getMenuPreview(storeUuid: string, adminUuid: string, menu: any){
        const categories= await prisma.category.findMany({
            where: {storeUuid},
            orderBy: {order: "asc"},
            include: {
                products: {
                    include: { options: true }
                }
            }
        });

        await MenuSnapshotService.createSnapshot(
            storeUuid,
            menu,
            "ADMIN_PREVIEW",
            adminUuid
        );

        return {
            storeUuid,
            categories: categories.map(c => ({
                uuid: c.uuid,
                name: c.name,
                isActive: c.isActive,
                order: c.order,
                products: c.products.map(p => ({
                    uuid: p.uuid,
                    name: p.name,
                    isActive: p.isActive,
                    basePrice: p.basePrice,
                    imageUrl: p.imageUrl,
                    options: p.options,
                })),
            }))
        }
    }
}