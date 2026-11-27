'use client';

'use client';

import EquipmentDashboard from '@/components/equipment/equipment-dashboard';
import ProjectManagerGuard from '@/components/project-manager-guard';

export default function EquipmentPage() {
  return (
    <ProjectManagerGuard>
      <EquipmentDashboard />
    </ProjectManagerGuard>
  );
}