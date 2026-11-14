import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAssignmentNotification } from '../projects/project.types.js';

const NOTIFICATION_INCLUDE = {
  project: { select: { name: true } },
} as const;
type NotificationWithProject = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string): Promise<ProjectAssignmentNotification[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: NOTIFICATION_INCLUDE,
    });

    return notifications.map((notification) => this.toResponse(notification));
  }

  async markRead(
    userId: string,
    id: string,
  ): Promise<ProjectAssignmentNotification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      include: NOTIFICATION_INCLUDE,
    });
    if (!notification) throw new NotFoundException('Notification not found');

    // Idempotent: once read, later calls keep the first `readAt` timestamp.
    if (notification.readAt) return this.toResponse(notification);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      include: NOTIFICATION_INCLUDE,
    });
    return this.toResponse(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toResponse(
    notification: NotificationWithProject,
  ): ProjectAssignmentNotification {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      projectId: notification.projectId,
      projectName: notification.project.name,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
