import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SYSTEM_ROLE_LABELS = [
  'Admin',
  'Project Manager',
  'Worker',
  'Viewer',
] as const;

export type SystemRoleLabel = (typeof SYSTEM_ROLE_LABELS)[number];

export function roleFromLabel(value: string):
  | 'ADMIN'
  | 'PROJECT_MANAGER'
  | 'WORKER'
  | 'VIEWER' {
  switch (value) {
    case 'Admin':
      return 'ADMIN';
    case 'Project Manager':
      return 'PROJECT_MANAGER';
    case 'Worker':
      return 'WORKER';
    case 'Viewer':
      return 'VIEWER';
    default:
      return value as 'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER';
  }
}

function normalizeRole(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return roleFromLabel(value);
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateManagedUserDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(1024)
  password!: string;

  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  position!: string;

  @IsInt()
  @Min(0)
  @Max(60)
  yearsOfExperience!: number;

  @Transform(({ value }: { value: unknown }) => normalizeRole(value))
  @IsIn(['ADMIN', 'PROJECT_MANAGER', 'WORKER', 'VIEWER'])
  role!: 'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER';
}

export class UpdateManagedUserDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsOfExperience?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeRole(value))
  @IsIn(['ADMIN', 'PROJECT_MANAGER', 'WORKER', 'VIEWER'])
  role?: 'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER';
}

export class UpdateManagedUserStatusDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
