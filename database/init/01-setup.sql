-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create role for the application
CREATE ROLE evidence_user WITH LOGIN PASSWORD 'evidence_pass';
GRANT CONNECT ON DATABASE evidence_platform TO evidence_user;
GRANT USAGE ON SCHEMA public TO evidence_user;
GRANT CREATE ON SCHEMA public TO evidence_user;

-- Create indexes for better performance
-- These will be created by Prisma migrations, but including here for reference

-- User table indexes
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
-- CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
-- CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Case table indexes  
-- CREATE INDEX IF NOT EXISTS idx_cases_number ON cases(case_number);
-- CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
-- CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to_id);
-- CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at);

-- Evidence table indexes
-- CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence_items(case_id);
-- CREATE INDEX IF NOT EXISTS idx_evidence_number ON evidence_items(item_number);
-- CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_items(type);
-- CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_items(status);

-- Audit log indexes
-- CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
-- CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- Full-text search indexes
-- CREATE INDEX IF NOT EXISTS idx_cases_search ON cases USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
-- CREATE INDEX IF NOT EXISTS idx_evidence_search ON evidence_items USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Row Level Security policies (example)
-- ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for cases - users can only see cases they created or are assigned to
-- CREATE POLICY case_access ON cases FOR ALL TO evidence_user
--   USING (created_by_id = current_setting('app.user_id')::uuid OR 
--          assigned_to_id = current_setting('app.user_id')::uuid OR
--          EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id 
--                  WHERE ur.user_id = current_setting('app.user_id')::uuid 
--                  AND r.name IN ('admin', 'super_admin')));

COMMIT;