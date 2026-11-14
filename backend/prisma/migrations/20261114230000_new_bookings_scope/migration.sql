-- CreateEnum
CREATE TYPE "NotifyScope" AS ENUM ('ALL', 'OWN', 'NONE');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "newBookingsScope" "NotifyScope" NOT NULL DEFAULT 'OWN';

-- Conserva lo que cada uno recibía: los dueños con avisos, todas las reservas;
-- los demás con avisos, las suyas; sin avisos, ninguna
UPDATE "Member" SET "newBookingsScope" = CASE
  WHEN NOT "notifyNewBookings" THEN 'NONE'
  WHEN "role" = 'OWNER' THEN 'ALL'
  ELSE 'OWN'
END::"NotifyScope";

ALTER TABLE "Member" DROP COLUMN "notifyNewBookings";
