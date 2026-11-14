
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
  profilePictureUrl?: string | null;
  role: SystemRole;
  status: AccountStatus;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  position: UserPosition;
  yearsOfExperience: number;
  role: SystemRole;
  profilePicture?: File | null;
}

export interface ApiResult<T> {
  data: T;
  demo: boolean;
}

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  retryLabel?: string;
}
