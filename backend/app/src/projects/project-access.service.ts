import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ProjectAccess {
  project: { id: string; ownerId: string; isArchived: boolean };
  /** Every `ProjectMember` user id, including the OWNER row. */
  memberIds: Set<string>;
}

function forbidden(): never {
  throw apiError(
    HttpStatus.FORBIDDEN,
    'FORBIDDEN_ROLE',
    'You do not have permission to do this.',
  );
}

function notFound(): never {
  throw apiError(
    HttpStatus.NOT_FOUND,
    'NOT_FOUND',
    'The item was not found.',
  );
}

/**
 * One place for the Sprint 2 project checks, so every route applies the same
 * 403-before-404 order and the same archived-project rule.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller must be the `PROJECT_MANAGER` owner of a non-archived project. */
  async requireProjectManager(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ProjectAccess> {
    if (user.role !== 'PROJECT_MANAGER') {
      forbidden();
    }

    const access = await this.load(projectId);
    if (!access || access.project.ownerId !== user.id) {
      notFound();
    }

    return access;
  }

  /**
   * The caller must be a project member. A `PROJECT_MANAGER` must be the
   * owner; a `WORKER` must have a `ProjectMember` row.
   */
  async requireProjectMember(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ProjectAccess> {
    if (user.role !== 'PROJECT_MANAGER' && user.role !== 'WORKER') {
      forbidden();
    }

    const access = await this.load(projectId);
    if (!access) {
      notFound();
    }

    const allowed =
      user.role === 'PROJECT_MANAGER'
        ? access.project.ownerId === user.id
        : access.memberIds.has(user.id);

    if (!allowed) {
      notFound();
    }

    return access;
  }

  private async load(projectId: string): Promise<ProjectAccess | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isArchived: false },
      select: {
        id: true,
        ownerId: true,
        isArchived: true,
        members: { select: { userId: true } },
      },
    });

    if (!project) {
      return null;
    }

    return {
      project: {
        id: project.id,
        ownerId: project.ownerId,
        isArchived: project.isArchived,
      },
      memberIds: new Set(project.members.map((member) => member.userId)),
    };
  }
}
