-- ============================================================
-- RE-Valid Seed Data
-- Run order: 03 (setelah 02_schema.sql)
-- Stasiun TIDAK lagi di-seed secara otomatis.
-- Tambahkan stasiun nyata melalui halaman /admin setelah deploy.
-- ============================================================

-- Default admin user. Ganti password setelah deploy pertama.
-- Hash dihasilkan dengan bcrypt rounds=12 untuk password 
INSERT INTO users (username, email, hashed_password, role)
VALUES (
    'admin',
    'admin@re-valid.id',
    '$2b$12$ocR8qhxPpQk62sxtAp4HdeisaBesG8yita60R9KpX0dGsHX15F4qy',
    'admin'
)
ON CONFLICT (username) DO NOTHING;
