import prisma from "../config/prisma.ts"


export const getRolePermissions= async (role: string)=>{
    const permissions= await prisma.rolePersmission.findMany({
        where: {role},
        include: { permission: true}
    });

    return permissions.map(p => p.permission.key);
};

export const hasPermission= async (
    role: string,
    permissionKey: string
)=>{
    const perms = await getRolePermissions(role);
    return perms.includes(permissionKey);
};