-- LOCAL ACCOUNTS: an admin-created account (or a reset) has a start password that must be replaced at the next login.
ALTER TABLE `User` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
