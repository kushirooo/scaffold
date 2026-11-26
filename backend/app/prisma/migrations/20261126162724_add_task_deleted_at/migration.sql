-- DropIndex
DROP INDEX "tasks_project_id_idx";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "tasks_project_id_deleted_at_idx" ON "tasks"("project_id", "deleted_at");
