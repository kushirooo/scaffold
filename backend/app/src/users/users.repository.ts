import type { CreateUserInput, User, UserWithPassword } from './user.types.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  /** Case-insensitive lookup used only by the login flow. */
  findByEmail(email: string): Promise<UserWithPassword | null>;
  /**
   * Active-account lookup for password recovery (US19 forgot/reset). Unlike
   * `findByEmail`, invited accounts are eligible even though they have no
   * credential row or password hash yet — a successful reset creates one.
   */
  findActiveByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
