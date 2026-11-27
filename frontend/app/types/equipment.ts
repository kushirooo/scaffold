/**
 * US07 equipment DTOs. These types follow Sprint 2 API Contract v1.3,
 * sections 9 and 12.3–12.4.
 */

export type EquipmentStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';

export interface EquipmentAssignment {
  id: string;
  equipmentId: string;
  projectId: string;
  projectName: string;
  checkedOutBy: string;
  checkedOutByName: string;
  checkoutDate: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
  createdAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  location: string;
  status: EquipmentStatus;
  isOverdue: boolean;
  currentAssignment: EquipmentAssignment | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentTypeSummary {
  type: string;
  total: number;
  available: number;
  inUse: number;
  maintenance: number;
}

export interface EquipmentInventory {
  items: Equipment[];
  summary: EquipmentTypeSummary[];
}

/** POST /equipment request body. No quantity or status field is accepted. */
export interface CreateEquipmentInput {
  name: string;
  type: string;
  location: string;
}

/** PATCH /equipment/:equipmentId request body. */
export type UpdateEquipmentInput = Partial<CreateEquipmentInput>;

export interface EquipmentMutationResult {
  message: string;
  data: Equipment;
}

/** POST /equipment/:equipmentId/assignments request body (US07-F3). */
export interface CreateEquipmentAssignmentInput {
  projectId: string;
  checkoutDate?: string;
  expectedReturnDate?: string;
}
