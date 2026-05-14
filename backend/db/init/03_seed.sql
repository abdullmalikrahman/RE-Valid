-- ============================================================
-- RE-Valid Seed Data
-- Run order: 03 (setelah 02_schema.sql)
-- Stasiun TIDAK lagi di-seed secara otomatis.
-- Tambahkan stasiun nyata melalui halaman /admin setelah deploy.
-- ============================================================

-- Default admin user. Ganti password setelah deploy pertama.
-- Hash dihasilkan dengan bcrypt rounds=12 untuk password "admin" — GANTI di production!
INSERT INTO users (username, email, hashed_password, role)
VALUES (
    'admin',
    'admin@re-valid.id',
    '$2b$12$q8UKcAMAz7m5AyR3U7bNZe7Z3b2V8gihoNPiz.lZtUr/bYpwC/Oau',
    'admin'
)
ON CONFLICT (username) DO NOTHING;
