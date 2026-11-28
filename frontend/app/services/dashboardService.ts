import { apiRequest } from '@/lib/api';
import type { DashboardData } from '@/types/dashboard';
import type { ApiReadResponse } from '@/types/task';

/** `GET /dashboard` (Sprint2_API_Contract.md §10.1) */
export async function fetchDashboard(): Promise<DashboardData> {
  const res = await apiRequest<ApiReadResponse<DashboardData>>('/dashboard');
  return res.data ?? {};
}