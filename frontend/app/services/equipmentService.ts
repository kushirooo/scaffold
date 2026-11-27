import { apiRequest } from '@/lib/api';
import type {
  CreateEquipmentAssignmentInput,
  CreateEquipmentInput,
  EquipmentAssignment,
  EquipmentInventory,
  EquipmentMutationResult,
  EquipmentStatus,
  UpdateEquipmentInput,
} from '@/types/equipment';

interface EquipmentListEnvelope {
  data: EquipmentInventory;
}

export interface EquipmentFilters {
  status?: EquipmentStatus;
  type?: string;
}

/** GET /equipment — summary is returned for the whole inventory, even when filtered. */
export async function fetchEquipment(
  filters: EquipmentFilters = {},
): Promise<EquipmentInventory> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.type) query.set('type', filters.type);

  const serializedQuery = query.toString();
  const suffix = serializedQuery ? `?${serializedQuery}` : '';
  const response = await apiRequest<EquipmentListEnvelope>(`/equipment${suffix}`);
  return response.data;
}

/** POST /equipment — the backend sets the initial status to AVAILABLE. */
export async function createEquipment(
  input: CreateEquipmentInput,
): Promise<EquipmentMutationResult> {
  return apiRequest<EquipmentMutationResult>('/equipment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PATCH /equipment/:equipmentId — status is deliberately not editable here. */
export async function updateEquipment(
  equipmentId: string,
  input: UpdateEquipmentInput,
): Promise<EquipmentMutationResult> {
  return apiRequest<EquipmentMutationResult>(
    `/equipment/${encodeURIComponent(equipmentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}


/**
 * POST /equipment/:equipmentId/assignments — the backend records checkedOutBy
 * from the authenticated user's session. The frontend must not send that field.
 */
export async function assignEquipment(
  equipmentId: string,
  input: CreateEquipmentAssignmentInput,
): Promise<EquipmentMutationResult> {
  return apiRequest<EquipmentMutationResult>(
    `/equipment/${encodeURIComponent(equipmentId)}/assignments`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

/**
 * GET /equipment/:equipmentId/assignments — Sprint 2 contract returns an array
 * of assignment records directly, sorted newest checkout date first by backend.
 */
export async function fetchEquipmentAssignmentHistory(
  equipmentId: string,
): Promise<EquipmentAssignment[]> {
  return apiRequest<EquipmentAssignment[]>(
    `/equipment/${encodeURIComponent(equipmentId)}/assignments`,
  );
}


/**
 * PATCH /equipment/:equipmentId/status (US07-F4).
 * F4 may set only AVAILABLE or MAINTENANCE; IN_USE is assigned through F3.
 * The backend closes any open assignment and updates the status atomically.
 */
export async function updateEquipmentStatus(
  equipmentId: string,
  status: Exclude<EquipmentStatus, 'IN_USE'>,
): Promise<EquipmentMutationResult> {
  return apiRequest<EquipmentMutationResult>(
    `/equipment/${encodeURIComponent(equipmentId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}