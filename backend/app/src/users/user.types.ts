export const USER_ROLES = [
  'ADMIN',
  'PROJECT_MANAGER',
  'WORKER',
  'VIEWER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** Monotonic global-invalidation counter; compared with the JWT `tv` claim. */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  passwordHash: string;
  isActive?: boolean;
}

export type PublicUser = Pick<
  User,
  'id' | 'email' | 'fullName' | 'role' | 'isActive'
>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}
