-- Account holder type — "individual" | "company" — captured at
-- registration. Drives which Settings section (Profile vs Company) an
-- individual-owner account sees.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_type" text DEFAULT 'individual' NOT NULL;
