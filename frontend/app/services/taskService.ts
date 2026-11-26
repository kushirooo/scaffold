import { apiRequest } from '@/lib/api';
import {
  ApiMutationResponse,
  ApiReadResponse,
  CreateTaskInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
  UpdateTaskStatusData,
  UpdateTaskStatusInput,
} from '@/types/task';

/** `GET /projects/:projectId/tasks` (§7.2) */
export async function fetchProjectTasks(
  projectId: string,
  status?: TaskStatus,
): Promise<Task[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiRequest<ApiReadResponse<Task[]>>(
    `/projects/${encodeURIComponent(projectId)}/tasks${query}`,
  );
  return res.data;
}

/** `POST /projects/:projectId/tasks` (§7.1) */
export async function createTask(
  projectId: string,
  input: CreateTaskInput,
): Promise<ApiMutationResponse<Task>> {
  return apiRequest<ApiMutationResponse<Task>>(
    `/projects/${encodeURIComponent(projectId)}/tasks`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

/** `PATCH /tasks/:taskId` (§7.3) */
export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<ApiMutationResponse<Task>> {
  return apiRequest<ApiMutationResponse<Task>>(
    `/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

/** `PATCH /tasks/:taskId/status` (§7.4) */
export async function updateTaskStatus(
  taskId: string,
  input: UpdateTaskStatusInput,
): Promise<ApiMutationResponse<UpdateTaskStatusData>> {
  return apiRequest<ApiMutationResponse<UpdateTaskStatusData>>(
    `/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}