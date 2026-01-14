import prisma from "../../config/prisma.ts"

export class ProductOptionService{
    static async createGroup(productUuid: string, data: any){
        return prisma.productOptionGroup.create({
            data: {
                productUuid,
                name: data.name,
                required: data.required ?? false,
                multiSelect: data.multiSelect ?? false,
                min: data.min,
                max: data.max,
            }
        })
    };

    static async listGroups(productUuid: string){
        return prisma.productOptionGroup.findMany({
            where: {productUuid},
            include: {options: true},
            orderBy: {createAt: "asc"}
        })
    };

    static async updateGroup(groupUuid: string, data: any){
        return prisma.productOptionGroup.update({
            where: {uuid: groupUuid},
            data
        })
    };

    static async deleteGroup(groupUuid: string){
        await prisma.productOption.deleteMany({
            where: { optionGroupUuid: groupUuid}
        });

        return prisma.productOptionGroup.delete({
            where: {uuid: groupUuid}
        })
    };


    ///Options
    static async createOption(groupUuid: string, data: any){
        return prisma.productOption.create({
            data: {
                optionGroupUuid: groupUuid,
                name: data.name,
                extraCost: data.extraCost ?? 0,
                isDefault: data.isDefault ?? false,
            }
        })
    };

    static async updateOption(optionUuid: string, data: string){
        return prisma.productOption.update({
            where: {uuid: optionUuid},
            data
        })
    };

    static async deleteOption(optionUuid: string) {
        return prisma.productOption.delete({
          where: { uuid: optionUuid },
        });
    };
} 