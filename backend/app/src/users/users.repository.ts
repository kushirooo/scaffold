import type { CreateUserInput, User, UserWithPassword } from './user.types.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  /** Case-insensitive lookup used only by the login flow. */
  findByEmail(email: string): Promise<UserWithPassword | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
