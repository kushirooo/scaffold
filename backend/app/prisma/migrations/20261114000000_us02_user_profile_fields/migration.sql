ALTER TABLE "users"
ADD COLUMN "position" TEXT NOT NULL DEFAULT 'Clerk / Admin',
ADD COLUMN "years_of_experience" INTEGER NOT NULL DEFAULT 0;
