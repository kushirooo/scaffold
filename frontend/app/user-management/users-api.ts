
import type {
  AccountStatus,
  UserInput,
  UserRecord,
} from "./user-types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

export const IS_DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// No hardcoded employee records.
// The backend will provide the actual employee information.

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeStatus(value: unknown): AccountStatus {
  return (
    String(value ?? "Active").toLowerCase() === "inactive" ||
    value === false
  )
    ? "Inactive"
    : "Active";
}

function normalizeUser(value: unknown): UserRecord {
  const raw = asObject(value);

  const joined =
    raw.joinedAt ?? raw.createdAt ?? raw.created_at;

  const lastActive =
    raw.lastActiveAt ??
    raw.lastActive ??
    raw.last_active_at ??
    null;

  const roleValue =
    raw.role ?? raw.systemRole ?? raw.system_role ?? "Viewer";

  const experience = Number(
    raw.yearsOfExperience ?? raw.years_of_experience ?? 0
  );

  return {
    id: stringValue(
      raw.id ?? raw.userId ?? raw.user_id
    ),
    name: stringValue(
      raw.name ?? raw.fullName ?? raw.full_name,
      "Unnamed user"
    ),
    email: stringValue(raw.email),
    position: stringValue(raw.position, "Clerk / Admin"),
    yearsOfExperience:
      Number.isFinite(experience) && experience >= 0
        ? experience
        : 0,
    profilePictureUrl:
      typeof raw.profilePictureUrl === "string"
        ? raw.profilePictureUrl
        : typeof raw.profile_picture_url === "string"
          ? raw.profile_picture_url
          : null,
    role: [
      "Admin",
      "Project Manager",
      "Worker",
      "Viewer",
    ].includes(String(roleValue))
      ? (String(roleValue) as UserRecord["role"])
      : "Viewer",
    status: normalizeStatus(raw.status ?? raw.active),
    joinedAt: stringValue(
      joined,
      new Date().toISOString()
    ),
    lastActiveAt:
      typeof lastActive === "string" ? lastActive : null,
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.method && init.method.toUpperCase() !== "GET"
          ? { "X-MARS-CSRF": "1" }
          : {}),
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      `Cannot connect to the API at ${API_BASE_URL}. Check that NestJS is running.`,
      0,
      "NETWORK_ERROR"
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  const body: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  const raw = asObject(body);

  if (!response.ok) {
    const message = stringValue(
      raw.message ?? raw.error,
      typeof body === "string"
        ? body
        : `Request failed (${response.status}).`
    );

    const code = stringValue(
      raw.code,
      response.status === 409
        ? "DUPLICATE_EMAIL"
        : undefined
    );

    throw new ApiError(message, response.status, code);
  }

  return body as T;
}

function preventDemoWrite(): never {
  throw new ApiError(
    "Demo mode is enabled. Connect the NestJS backend to manage real user accounts.",
    0,
    "DEMO_MODE"
  );
}

// GET USERS

export async function getUsers(): Promise<{
  users: UserRecord[];
  demo: boolean;
}> {
  if (IS_DEMO_MODE) {
    return {
      users: [],
      demo: true,
    };
  }

  const response = await request<unknown>("/users");
  const raw = asObject(response);

  const list = Array.isArray(response)
    ? response
    : Array.isArray(raw.users)
      ? raw.users
      : Array.isArray(raw.data)
        ? raw.data
        : [];

  return {
    users: list.map(normalizeUser),
    demo: false,
  };
}

// CREATE USER

export async function createUser(
  input: UserInput
): Promise<{ user: UserRecord }> {
  if (IS_DEMO_MODE) {
    return preventDemoWrite();
  }

  // File upload must be supported by the NestJS API
  // before profilePicture can be permanently stored.
  const userData = {
    name: input.name,
    email: input.email,
    password: input.password,
    position: input.position,
    yearsOfExperience: input.yearsOfExperience,
    role: input.role,
  };

  const response = await request<unknown>("/users", {
    method: "POST",
    body: JSON.stringify(userData),
  });

  const raw = asObject(response);

  const userSource = raw.user ?? raw.data ?? raw;
  const rawUser = asObject(userSource);

  const returnedId =
    rawUser.id ?? rawUser.userId ?? rawUser.user_id;

  const returnedEmail = rawUser.email;

  if (
    typeof returnedId !== "string" ||
    !returnedId.trim() ||
    typeof returnedEmail !== "string" ||
    !returnedEmail.trim()
  ) {
    throw new ApiError(
      "The API response did not include the created user's ID and email.",
      502,
      "INVALID_CREATE_RESPONSE"
    );
  }

  return {
    user: normalizeUser(userSource),
  };
}

// UPDATE USER

export async function updateUser(
  id: string,
  input: UserInput
): Promise<void> {
  if (IS_DEMO_MODE) {
    return preventDemoWrite();
  }

  const userData = {
    name: input.name,
    email: input.email,
    position: input.position,
    yearsOfExperience: input.yearsOfExperience,
    role: input.role,
  };

  await request<unknown>(
    `/users/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(userData),
    }
  );
}

// ACTIVATE / DEACTIVATE USER

export async function setUserStatus(
  id: string,
  status: AccountStatus
): Promise<void> {
  if (IS_DEMO_MODE) {
    return preventDemoWrite();
  }

  await request<unknown>(
    `/users/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

// DELETE USER

export async function deleteUser(
  id: string
): Promise<void> {
  if (IS_DEMO_MODE) {
    return preventDemoWrite();
  }

  await request<unknown>(
    `/users/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}
