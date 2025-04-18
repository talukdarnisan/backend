-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "last_checked" TIMESTAMPTZ(0),
ADD COLUMN     "region" VARCHAR(255),
ADD COLUMN     "user_picked" BOOLEAN NOT NULL DEFAULT false;
