CREATE TYPE "public"."homework_review_status" AS ENUM('PENDING', 'ACKNOWLEDGED', 'NEEDS_REWORK');--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN "link" varchar(500);--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN "review_status" "homework_review_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN "reviewed_by_id" text;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reviewed_by_id_teachers_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_submissions_student_idx" ON "homework_submissions" USING btree ("school_id","student_id");