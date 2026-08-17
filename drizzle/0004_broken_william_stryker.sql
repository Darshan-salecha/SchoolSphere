CREATE TYPE "public"."loan_status" AS ENUM('ISSUED', 'RETURNED', 'OVERDUE', 'LOST');--> statement-breakpoint
CREATE TABLE "library_books" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"author" varchar(160),
	"isbn" varchar(20),
	"category" varchar(60),
	"publisher" varchar(160),
	"shelf" varchar(40),
	"total_copies" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"book_id" text NOT NULL,
	"student_id" text NOT NULL,
	"issued_by_id" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"returned_at" timestamp with time zone,
	"fine_amount" integer DEFAULT 0 NOT NULL,
	"status" "loan_status" DEFAULT 'ISSUED' NOT NULL,
	"note" varchar(200)
);
--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_books_title_idx" ON "library_books" USING btree ("school_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "library_books_isbn_unique" ON "library_books" USING btree ("school_id","isbn");--> statement-breakpoint
CREATE INDEX "library_loans_student_idx" ON "library_loans" USING btree ("school_id","student_id","status");--> statement-breakpoint
CREATE INDEX "library_loans_book_idx" ON "library_loans" USING btree ("school_id","book_id","status");