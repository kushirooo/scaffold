/**
 * US02 user-management types for the portal UI.
 *
 * These mirror the API contract (`docs/api-contract-us02.md` §1): the API sends
 * role labels and an "Active"/"Inactive" status, and this layer only ever sees
 * the mapped UI shape produced by `lib/user-admin.ts`.
 */

export const USER_POSITIONS = [
  "Principal",
  "Project Director",
  "Associate",
  "Senior Engineer",
  "Engineer",
  "Senior Designer",
  "Technical Assistant",
  "Draughtsperson",
  "Clerk / Admin",
  "Account Clerk",
  "Coordinator B.I.M.",
] as const;

/** Role labels exactly as `GET /users` returns them (DB enum → label). */
export const SYSTEM_ROLES = [
  "Admin",
  "Project Manager",
  "Worker",
  "Viewer",
] as const;

export type UserPosition = (typeof USER_POSITIONS)[number];
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type AccountStatus = "Active" | "Inactive";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  position: UserPosition | string;
  yearsOfExperience: number;
  role: SystemRole;
  status: AccountStatus;
  joinedAt: string;
  lastActiveAt: string | null;
}

/** Form input. `password` is required on create and ignored on update. */
export interface UserInput {
  name: string;
  email: string;
  password?: string;
  position: UserPosition | string;
  yearsOfExperience: number;
  role: SystemRole;
}

export type ToastKind = "success" | "error" | "info";
