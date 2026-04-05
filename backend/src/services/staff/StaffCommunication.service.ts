import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class StaffCommunicationService {
  
    static async createAnnouncement(input: {
        tenantUuid: string;
        storeUuid?: string; // Null = all stores
        title: string;
        message: string;
        priority: string;
        targetRoles?: string[];
        targetUsers?: string[];
        activeFrom?: Date;
        activeUntil?: Date;
        createdBy: string;
    }) {
        const announcement = await prisma.shiftAnnouncement.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                title: input.title,
                message: input.message,
                priority: (input.priority as any) || "NORMAL",
                targetRoles: (input.targetRoles as any) || [],
                targetUsers: input.targetUsers || [],
                activeFrom: input.activeFrom || new Date(),
                activeUntil: input.activeUntil,
                createdBy: input.createdBy,
            },
        });

        logWithContext("info", "[Communication] Announcement created", {
            announcementUuid: announcement.uuid,
            title: input.title,
            priority: input.priority,
        });

        // Emit event for real-time notification
        EventBus.emit("STAFF_ANNOUNCEMENT_CREATED", {
            announcementUuid: announcement.uuid,
            storeUuid: input.storeUuid,
            priority: input.priority,
        });

        return announcement;
    }

    static async getActiveAnnouncements(input: {
        userUuid: string;
        storeUuid: string;
    }) {
        // Get user's role at this store
        const userStore = await prisma.userStore.findUnique({
            where: {
                userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
            },
        });

        if (!userStore) return [];

        const now = new Date();

        return prisma.shiftAnnouncement.findMany({
            where: {
                OR: [
                    { storeUuid: input.storeUuid },
                    { storeUuid: null, tenantUuid: userStore.tenantUuid },
                ],
                activeFrom: { lte: now },
                OR: [
                    { activeUntil: null },
                    { activeUntil: { gte: now } },
                ],
                OR: [
                    { targetRoles: { isEmpty: true } },
                    { targetRoles: { has: userStore.role } },
                    { targetUsers: { has: input.userUuid } },
                ],
            },
            orderBy: [
                { priority: "desc" },
                { createdAt: "desc" },
            ],
        });
    }

    static async markAnnouncementRead(input: {
        announcementUuid: string;
        userUuid: string;
    }) {
        const announcement = await prisma.shiftAnnouncement.findUnique({
            where: { uuid: input.announcementUuid },
        });

        if (!announcement) {
            throw new Error("ANNOUNCEMENT_NOT_FOUND");
        };

        // Add user to readBy array if not already there
        if (!announcement.readBy.includes(input.userUuid)) {
            await prisma.shiftAnnouncement.update({
                where: { uuid: input.announcementUuid },
                data: {
                    readBy: {
                        push: input.userUuid,
                    },
                },
            });
        };
    }

    //Create task assignment
    static async createTask(input: {
        tenantUuid: string;
        storeUuid: string;
        assignedTo: string;
        title: string;
        description?: string;
        priority: string;
        dueAt?: Date;
        requiresVerification?: boolean;
        assignedBy: string;
    }) {
        const task = await prisma.staffTask.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                assignedTo: input.assignedTo,
                title: input.title,
                description: input.description,
                priority: (input.priority as any) || "NORMAL",
                dueAt: input.dueAt,
                requiresVerification: input.requiresVerification || false,
                assignedBy: input.assignedBy,
                status: "PENDING",
            },
        });

        logWithContext("info", "[Communication] Task created", {
            taskUuid: task.uuid,
            assignedTo: input.assignedTo,
            title: input.title,
        });

        // Emit event
        EventBus.emit("STAFF_TASK_ASSIGNED", {
            taskUuid: task.uuid,
            assignedTo: input.assignedTo,
            storeUuid: input.storeUuid,
        });

        return task;
    }

    static async updateTaskStatus(input: {
        taskUuid: string;
        status: string;
        completedBy?: string;
        completionNotes?: string;
    }) {
        const task = await prisma.staffTask.update({
            where: { uuid: input.taskUuid },
            data: {
                status: input.status as any,
                completedAt: input.status === "COMPLETED" ? new Date() : undefined,
                completedBy: input.completedBy,
                completionNotes: input.completionNotes,
            },
        });

        logWithContext("info", "[Communication] Task status updated", {
            taskUuid: input.taskUuid,
            status: input.status,
        });

        if (input.status === "COMPLETED") {
            EventBus.emit("STAFF_TASK_COMPLETED", {
                taskUuid: task.uuid,
                completedBy: input.completedBy,
            });
        }

        return task;
    }

    static async verifyTask(input: {
        taskUuid: string;
        verifiedBy: string;
    }) {
        const task = await prisma.staffTask.update({
            where: { uuid: input.taskUuid },
            data: {
                verifiedBy: input.verifiedBy,
                verifiedAt: new Date(),
            },
        });

        logWithContext("info", "[Communication] Task verified", {
            taskUuid: input.taskUuid,
            verifiedBy: input.verifiedBy,
        });

        return task;
    }

    static async getUserTasks(input: {
        userUuid: string;
        storeUuid: string;
        status?: string;
    }) {
        const where: any = {
            assignedTo: input.userUuid,
            storeUuid: input.storeUuid,
        };

        if (input.status) {
            where.status = input.status;
        };

        return prisma.staffTask.findMany({
            where,
            orderBy: [
                { priority: "desc" },
                { dueAt: "asc" },
                { createdAt: "desc" },
            ],
        });
    }

    static async getStoreTasks(input: {
        storeUuid: string;
        status?: string;
    }) {
        const where: any = {
            storeUuid: input.storeUuid,
        };

        if (input.status) {
            where.status = input.status;
        };

        return prisma.staffTask.findMany({
            where,
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: [
                { priority: "desc" },
                { dueAt: "asc" },
            ],
        });
    }

}