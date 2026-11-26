import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

describe('US05 task schema invariants (real PostgreSQL)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('declares the TaskStatus and TaskPriority enums', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ enum_name: string; enum_label: string }>
    >`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('TaskStatus', 'TaskPriority')
      ORDER BY t.typname, e.enumsortorder
    `;

    const valuesOf = (enumName: string) =>
      rows
        .filter((row) => row.enum_name === enumName)
        .map((row) => row.enum_label);

    expect(valuesOf('TaskStatus')).toEqual([
      'PENDING',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    expect(valuesOf('TaskPriority')).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT',
    ]);
  });

  it('uses date columns for due_date and target_date', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'tasks' AND column_name = 'due_date')
          OR (table_name = 'milestones' AND column_name = 'target_date')
        )
    `;

    expect(columns).toEqual(
      expect.arrayContaining([
        {
          table_name: 'tasks',
          column_name: 'due_date',
          data_type: 'date',
        },
        {
          table_name: 'milestones',
          column_name: 'target_date',
          data_type: 'date',
        },
      ]),
    );
  });

  it('declares the task foreign key delete actions', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ constraint_name: string; delete_rule: string }>
    >`
      SELECT con.conname AS constraint_name, con.confdeltype AS delete_rule
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND c.relname = 'tasks'
    `;

    const byName = new Map(
      rows.map((row) => [row.constraint_name, row.delete_rule]),
    );

    expect(byName.get('tasks_project_id_fkey')).toBe('c');
    expect(byName.get('tasks_milestone_id_fkey')).toBe('n');
    expect(byName.get('tasks_assignee_id_fkey')).toBe('r');
    expect(byName.get('tasks_created_by_fkey')).toBe('r');
  });

  it('marks deleted tasks with a nullable deleted_at timestamp', async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        data_type: string;
        is_nullable: string;
      }>
    >`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'deleted_at'
    `;

    expect(columns).toHaveLength(1);
    expect(columns[0].data_type).toBe('timestamp with time zone');
    expect(columns[0].is_nullable).toBe('YES');
  });

  it('declares the task and milestone indexes', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('tasks', 'milestones')
    `;

    const names = new Set(rows.map((row) => row.indexname));

    for (const index of [
      'tasks_project_id_deleted_at_idx',
      'tasks_assignee_id_idx',
      'tasks_due_date_idx',
      'tasks_milestone_id_idx',
      'milestones_project_id_idx',
      'milestones_target_date_idx',
    ]) {
      expect(names.has(index)).toBe(true);
    }
  });
});
