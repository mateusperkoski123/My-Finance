ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255) NULL AFTER senha_hash,
ADD COLUMN reset_expires DATETIME NULL AFTER reset_token;
