import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';
import type {
  ApiProjectMemberRole,
  ApiProjectStatus,
  ProjectResponse,
} from './project.types.js';

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PROJECT_WITH_MEMBERS = { members: { include: { user: true } } } as const;
type ProjectWithMembers = Prisma.ProjectGetPayload<{
  include: typeof PROJECT_WITH_MEMBERS;
}>;

function toDatabaseStatus(status: ApiProjectStatus): 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' {
  switch (status) {
    case 'Active': return 'ACTIVE';
    case 'On Hold': return 'ON_HOLD';
    case 'Completed': return 'COMPLETED';
  }
}

function toApiStatus(status: ProjectWithMembers['status']): ApiProjectStatus {
  switch (status) {
    case 'ACTIVE': return 'Active';
    case 'ON_HOLD': return 'On Hold';
    case 'COMPLETED': return 'Completed';
  }
}

function toApiMemberRole(role: ProjectWithMembers['members'][number]['role']): ApiProjectMemberRole {
  switch (role) {
    case 'OWNER': return 'Owner';
    case 'MEMBER': return 'Member';
    case 'CONTRIBUTOR': return 'Contributor';
  }
}

function dateFromInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, input: CreateProjectDto): Promise<ProjectResponse> {
    this.validateDateRange(input.startDate, input.endDate);
    const status = input.status ? toDatabaseStatus(input.status) : 'ACTIVE';

    const project = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          name: input.name.trim(),
          description: input.description.trim(),
          startDate: dateFromInput(input.startDate),
          endDate: dateFromInput(input.endDate),
          budget: input.budget,
          status,
          ownerId,
        },
      });
      await transaction.projectMember.create({
        data: { projectId: created.id, userId: ownerId, role: 'OWNER' },
      });
      return transaction.project.findUniqueOrThrow({
        where: { id: created.id },
        include: PROJECT_WITH_MEMBERS,
      });
    });

    return this.toResponse(project);
  }

  async findAll(ownerId: string): Promise<ProjectResponse[]> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      include: PROJECT_WITH_MEMBERS,
    });
    return projects.map((project) => this.toResponse(project));
  }

  async findArchived(ownerId: string): Promise<ProjectResponse[]> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId, isArchived: true },
      orderBy: { updatedAt: 'desc' },
      include: PROJECT_WITH_MEMBERS,
    });
    return projects.map((project) => this.toResponse(project));
  }

  async findAssignableWorkers() {
    const workers = await this.prisma.user.findMany({
      where: { role: 'WORKER', isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true },
    });
    return workers.map((worker) => ({
      id: worker.id,
      name: worker.fullName,
      email: worker.email,
      systemRole: 'WORKER' as const,
    }));
  }

  async assignWorker(
    ownerId: string,
    projectId: string,
    userId: string,
    role: ApiProjectMemberRole,
  ) {
    const project = await this.findOneRecord(ownerId, projectId);
    const worker = await this.prisma.user.findFirst({
      where: { id: userId, role: 'WORKER', isActive: true },
      select: { id: true, fullName: true, email: true },
    });
    if (!worker) {
      throw new NotFoundException('Active worker not found');
    }

    try {
      const member = await this.prisma.$transaction(async (transaction) => {
        const assignment = await transaction.projectMember.create({
          data: { projectId, userId, role: this.toDatabaseMemberRole(role) },
          include: { user: true },
        });
        await transaction.notification.create({
          data: {
            userId,
            projectId,
            type: 'PROJECT_ASSIGNED',
            title: 'You were assigned to a project',
            message: `You were assigned to ${project.name} as ${role}.`,
          },
        });
        return assignment;
      });
      return this.toApiMember(member);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Worker is already assigned to this project');
      }
      throw error;
    }
  }

  async removeWorker(ownerId: string, projectId: string, userId: string) {
    const project = await this.findOneRecord(ownerId, projectId);
    const assignment = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!assignment) throw new NotFoundException('Project member not found');
    if (userId === project.ownerId) {
      throw new ConflictException('The project owner cannot be removed as a member');
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    return { projectId, userId, removed: true };
  }

  async findAssignedToWorker(userId: string): Promise<ProjectResponse[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        isArchived: false,
        members: { some: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      include: PROJECT_WITH_MEMBERS,
    });
    return projects.map((project) => this.toResponse(project));
  }

  async findOne(ownerId: string, id: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId, isArchived: false },
      include: PROJECT_WITH_MEMBERS,
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.toResponse(project);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one project field must be provided');
    }

    const current = await this.findOneRecord(ownerId, id);
    const startDate = input.startDate ?? this.toDateOnly(current.startDate);
    const endDate = input.endDate ?? this.toDateOnly(current.endDate);
    this.validateDateRange(startDate, endDate);

    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description.trim();
    if (input.startDate !== undefined) data.startDate = dateFromInput(input.startDate);
    if (input.endDate !== undefined) data.endDate = dateFromInput(input.endDate);
    if (input.budget !== undefined) data.budget = input.budget;
    if (input.status !== undefined) {
      data.status = toDatabaseStatus(input.status);
    }

    const project = await this.prisma.project.update({
      where: { id },
      data,
      include: PROJECT_WITH_MEMBERS,
    });
    return this.toResponse(project);
  }

  async archive(ownerId: string, id: string): Promise<ProjectResponse> {
    await this.findOneRecord(ownerId, id);
    const project = await this.prisma.project.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date() },
      include: PROJECT_WITH_MEMBERS,
    });
    return this.toResponse(project);
  }

  async restore(ownerId: string, id: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId, isArchived: true },
      include: PROJECT_WITH_MEMBERS,
    });
    if (!project) throw new NotFoundException('Archived project not found');

    if (!project.archivedAt || Date.now() - project.archivedAt.getTime() > RESTORE_WINDOW_MS) {
      throw new ConflictException('Projects can only be restored within 30 days of archiving');
    }

    const restored = await this.prisma.project.update({
      where: { id },
      data: { isArchived: false, archivedAt: null },
      include: PROJECT_WITH_MEMBERS,
    });
    return this.toResponse(restored);
  }

  private async findOneRecord(ownerId: string, id: string): Promise<ProjectWithMembers> {
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId, isArchived: false },
      include: PROJECT_WITH_MEMBERS,
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private validateDateRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException('Start date must be on or before end date');
    }
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toResponse(project: ProjectWithMembers): ProjectResponse {
    return {
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      description: project.description,
      startDate: this.toDateOnly(project.startDate),
      endDate: this.toDateOnly(project.endDate),
      budget: Number(project.budget),
      status: toApiStatus(project.status),
      isArchived: project.isArchived,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      tasks: [],
      members: project.members.map((member) => this.toApiMember(member)),
    };
  }

  private toApiMember(member: ProjectWithMembers['members'][number]) {
    return {
      id: member.userId,
      userId: member.userId,
      name: member.user.fullName,
      email: member.user.email,
      projectRole: toApiMemberRole(member.role),
    };
  }

  private toDatabaseMemberRole(role: ApiProjectMemberRole) {
    switch (role) {
      case 'Owner': return 'OWNER' as const;
      case 'Member': return 'MEMBER' as const;
      case 'Contributor': return 'CONTRIBUTOR' as const;
    }
  }
}
