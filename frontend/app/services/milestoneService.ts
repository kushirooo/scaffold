import { apiRequest } from '@/lib/api';
import {
  CreateMilestoneInput,
  Milestone,
  UpdateMilestoneInput,
} from '@/types/milestone';
import { ApiMutationResponse, ApiReadResponse } from '@/types/task';

/** `GET /projects/:projectId/milestones` (§8.3) */
export async function fetchProjectMilestones(
  projectId: string,
): Promise<Milestone[]> {
  const res = await apiRequest<ApiReadResponse<Milestone[]>>(
    `/projects/${encodeURIComponent(projectId)}/milestones`,
  );
  return res.data;
}

/** `POST /projects/:projectId/milestones` (§8.1) */
export async function createMilestone(
  projectId: string,
  input: CreateMilestoneInput,
): Promise<ApiMutationResponse<Milestone>> {
  return apiRequest<ApiMutationResponse<Milestone>>(
    `/projects/${encodeURIComponent(projectId)}/milestones`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

/** `PATCH /milestones/:milestoneId` (§8.2) */
export async function updateMilestone(
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<ApiMutationResponse<Milestone>> {
  return apiRequest<ApiMutationResponse<Milestone>>(
    `/milestones/${encodeURIComponent(milestoneId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}