import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordHasher } from '../auth/password-hasher.js';
import { ROLE_PERMISSIONS, roleLabel } from './user-permissions.js';
import type {
  CreateManagedUserDto,
  UpdateManagedUserDto,
} from './user-management.dto.js';
import type { UserRole } from './user.types.js';

interface ActingAdmin {
  id: string;
}

function isUniqueEmailError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function toPublicUser(record: {
  id: string;
  email: string;
  fullName: string;
  position: string;
  yearsOfExperience: number;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  sessions?: { createdAt: Date }[];
}) {
  return {
    id: record.id,
    name: record.fullName,
    email: record.email,
    position: record.position,
    yearsOfExperience: record.yearsOfExperience,
    role: roleLabel(record.role),
    status: record.isActive ? 'Active' : 'Inactive',
    joinedAt: record.createdAt,
    lastActiveAt: record.sessions?.[0]?.createdAt ?? null,
  };
}

@Injectable()
export class UserManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    return { users: users.map(toPublicUser) };
  }

  rolePermissions() {
    return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
      role: roleLabel(role as UserRole),
      permissions,
    }));
  }

  async createUser(input: CreateManagedUserDto) {
    const passwordHash = await this.passwordHasher.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.name,
          position: input.position,
          yearsOfExperience: input.yearsOfExperience,
          role: input.role,
          credential: {
            create: {
              passwordHash,
              passwordUpdatedAt: new Date(),
            },
          },
        },
      });
      return { user: toPublicUser(user) };
    } catch (error) {
      if (isUniqueEmailError(error)) {
        throw new ConflictException({
          code: 'DUPLICATE_EMAIL',
          message: 'This email address is already registered.',
        });
      }
      throw error;
    }
  }

  async updateUser(id: string, input: UpdateManagedUserDto, actor: ActingAdmin) {
    const existing = await this.findUser(id);
    const role = input.role;
    if (id === actor.id && role !== undefined && role !== 'ADMIN') {
      throw new ForbiddenException('You cannot remove your own administrator role.');
    }
    if (existing.role === 'ADMIN' && role !== undefined && role !== 'ADMIN') {
      await this.ensureAnotherActiveAdmin(id);
    }

    const identityChanged =
      (input.email !== undefined && input.email !== existing.email) ||
      (role !== undefined && role !== existing.role);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { fullName: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
            ...(input.yearsOfExperience !== undefined
              ? { yearsOfExperience: input.yearsOfExperience }
              : {}),
            ...(role !== undefined ? { role } : {}),
            ...(identityChanged ? { tokenVersion: { increment: 1 } } : {}),
          },
        });
        if (identityChanged) {
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return updated;
      });
      return { user: toPublicUser(user) };
    } catch (error) {
      if (isUniqueEmailError(error)) {
        throw new ConflictException({
          code: 'DUPLICATE_EMAIL',
          message: 'This email address is already registered.',
        });
      }
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: 'active' | 'inactive',
    actor: ActingAdmin,
  ) {
    const existing = await this.findUser(id);
    const isActive = status === 'active';
    if (existing.isActive === isActive) return { user: toPublicUser(existing) };
    if (id === actor.id && !isActive) {
      throw new ForbiddenException('You cannot deactivate your own account.');
    }
    if (existing.role === 'ADMIN' && !isActive) {
      await this.ensureAnotherActiveAdmin(id);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          isActive,
          ...(!isActive ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      if (!isActive) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    return { user: toPublicUser(user) };
  }

  async deleteUser(id: string, actor: ActingAdmin): Promise<void> {
    const existing = await this.findUser(id);
    if (id === actor.id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    if (existing.role === 'ADMIN') await this.ensureAnotherActiveAdmin(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private async findUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private async ensureAnotherActiveAdmin(excludedId: string): Promise<void> {
    const count = await this.prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: excludedId } },
    });
    if (count === 0) {
      throw new ConflictException('The last active administrator cannot be removed.');
    }
  }
}
