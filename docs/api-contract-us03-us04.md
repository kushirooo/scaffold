# US03/US04 API contract — projects and team assignment

| Field | Value |
|---|---|
| Status | Implemented in `feat/us03-us04-projects` (rebased onto `main`); verified by the `projects`/`project-members` e2e suites and CI |
| Auth | httpOnly `mars_at` cookie via `JwtAuthGuard`; every non-GET also requires `X-MARS-CSRF: 1` (global `CsrfGuard`) |
| Roles | `PROJECT_MANAGER` for project management; `WORKER` for `/projects/assigned`; any authenticated user for `/notifications` |
| Errors | Nest defaults `{ message, error, statusCode }`: 400 validation, 401 unauthenticated, 403 wrong role, 404 not found/not owned, 409 conflict |

## 1. Endpoints

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/projects` | PM | `CreateProjectDto` | 201 `ProjectResponse` |
| GET | `/projects` | PM | — | `ProjectResponse[]` (owner's non-archived projects) |
| GET | `/projects/archived` | PM | — | `ProjectResponse[]` |
| GET | `/projects/assignable-workers` | PM | — | `ProjectAssignableUser[]` |
| GET | `/projects/assigned` | WORKER | — | `ProjectResponse[]` (projects the worker is a member of) |
| GET | `/projects/:id` | PM | — | `ProjectResponse` |
| PATCH | `/projects/:id` | PM | `UpdateProjectDto` | `ProjectResponse` |
| DELETE | `/projects/:id` | PM | — | `ProjectResponse` (soft archive) |
| POST | `/projects/:id/restore` | PM | — | `ProjectResponse` (within 30 days) |
| POST | `/projects/:id/members` | PM | `AssignProjectMemberDto` | 201 `ProjectMemberResponse` |
| DELETE | `/projects/:id/members/:userId` | PM | — | `{ projectId, userId, removed: true }` |
| GET | `/notifications` | any | — | `ProjectAssignmentNotification[]` (own rows only) |
| PATCH | `/notifications/:id/read` | any | — | `ProjectAssignmentNotification` (own row; sets `readAt` once) |
| POST | `/notifications/read-all` | any | — | `{ updated: number }` (own unread rows only) |

Non-PM access to a PM route → 403 `"Project Manager role required"`. Non-worker access to
`/projects/assigned` → 403 `"Worker role required"`. A project is always scoped by `ownerId`;
a PM cannot read or mutate another PM's project (404 `"Project not found"`).

Notifications are caller-scoped: `PATCH /notifications/:id/read` returns 404
`"Notification not found"` for another user's row or an unknown id, and is idempotent (a second
call keeps the first `readAt`). A malformed non-UUID id is 400 (route UUID pipe). Both writes
require the CSRF header; without it the response is 403 `"Missing or invalid CSRF header"`.

## 2. Request bodies

`CreateProjectDto`
```json
{ "name": "string 1..200", "description": "string", "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD", "budget": 0, "status": "Active | On Hold | Completed" }
```
`UpdateProjectDto` — every field optional; at least one required (400 `"At least one project field must be provided"`).
`startDate <= endDate` is validated (400 `"Start date must be on or before end date"`).
`budget` is a number with at most 2 decimals, `>= 0`.

`AssignProjectMemberDto`
```json
{ "userId": "uuid", "projectRole": "Owner | Member | Contributor" }
```
The worker must exist, be active and have role `WORKER` (404 `"Active worker not found"`); a duplicate
assignment is 409 `"Worker is already assigned to this project"`. The project owner cannot be removed
(409 `"The project owner cannot be removed as a member"`).

## 3. Response shapes

```ts
interface ProjectResponse {
  id: string; ownerId: string; name: string; description: string;
  startDate: string;            // YYYY-MM-DD
  endDate: string;              // YYYY-MM-DD
  budget: number;
  status: 'Active' | 'On Hold' | 'Completed';
  isArchived: boolean; archivedAt: string | null;
  createdAt: string; updatedAt: string; // ISO timestamps
  tasks: unknown[];             // reserved, always []
  members: Array<{ id: string; userId: string; name: string; email: string;
                   projectRole: 'Owner' | 'Member' | 'Contributor' }>;
}

interface ProjectAssignableUser { id: string; name: string; email: string; systemRole: 'WORKER' }
interface ProjectMemberResponse { /* the members[] element */ }

interface ProjectAssignmentNotification {
  id: string; type: 'PROJECT_ASSIGNED'; title: string; message: string;
  projectId: string; projectName: string; readAt: string | null; createdAt: string;
}

interface NotificationsReadAllResponse { updated: number } // rows changed from unread to read
```

`markRead` returns the same `ProjectAssignmentNotification` shape as `GET /notifications`,
including the joined `projectName`; `readAt` is an ISO timestamp once read and unchanged by
later calls. `read-all` only counts the caller's rows whose `readAt` was null.

Display strings map to Prisma enums (`Active→ACTIVE`, `On Hold→ON_HOLD`, `Completed→COMPLETED`,
`Owner→OWNER`, `Member→MEMBER`, `Contributor→CONTRIBUTOR`). Persisted dates are `@db.Date`; API
serialisation is `YYYY-MM-DD`.

## 4. Frontend client

`frontend/app/services/projectService.ts` is the only client: base URL
`NEXT_PUBLIC_API_URL ?? http://localhost:4000`, `credentials: "include"`, `X-MARS-CSRF: 1` on
non-GET, 401 → `/login`, 403 → role message. `frontend/app/components/project-manager-guard.tsx`
calls `GET /auth/me` and only admits `PROJECT_MANAGER`; worker pages live under
`frontend/app/app/projects/` and the worker dashboard (`/dashboard`). The dashboard consumes
`/notifications` (`readAt === null` marks unread), maps per-row "mark read" to
`PATCH /notifications/:id/read`, and "mark all as read" to `POST /notifications/read-all`
(same `credentials`/`X-MARS-CSRF: 1` rules as every non-GET).

## 5. Deferred

- Delete is a soft archive (restore within 30 days); hard delete, task management (US05/US06) and
  pagination are out of scope for Sprint 1.
- AC matrix rows for US03/US04 are QA-owned and remain open until QA verification (see `k95`/`k99`).
