ALTER TABLE "incidents" ADD COLUMN "incident_type" varchar(100);--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "source_ip" varchar(200);--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "destination_ip" varchar(200);--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "action_taken" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "detection_source" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");