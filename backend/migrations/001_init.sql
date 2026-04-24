-- Migration: 001_init
-- Creates the core schema for the expense tracker.

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  role          ENUM('employee', 'manager', 'admin') NOT NULL DEFAULT 'employee',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_email (email)
);

CREATE TABLE IF NOT EXISTS expenses (
  id               CHAR(36)        NOT NULL PRIMARY KEY,
  user_id          CHAR(36)        NOT NULL,

  -- DECIMAL for financial amounts — never FLOAT (binary floating-point rounding causes
  -- penny discrepancies that compound in reporting and PCI-DSS audits).
  amount           DECIMAL(12, 2)  NOT NULL CHECK (amount > 0),
  currency         CHAR(3)         NOT NULL DEFAULT 'USD',

  category         ENUM(
    'travel', 'accommodation', 'meals', 'transportation',
    'office_supplies', 'software', 'training', 'other'
  ) NOT NULL,

  description      VARCHAR(500)    NOT NULL,
  receipt_url      VARCHAR(2048)   NULL,

  status           ENUM('draft', 'submitted', 'approved', 'rejected', 'reimbursed')
                   NOT NULL DEFAULT 'draft',

  submitted_at     DATETIME        NULL,
  approved_by      CHAR(36)        NULL,
  approved_at      DATETIME        NULL,
  rejection_reason VARCHAR(1000)   NULL,

  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_expenses_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_expenses_approver FOREIGN KEY (approved_by) REFERENCES users(id),

  -- Covers the two most common queries: list by user, filter by status
  INDEX idx_expenses_user_status   (user_id, status),
  INDEX idx_expenses_user_date     (user_id, created_at DESC),
  INDEX idx_expenses_approver      (approved_by),
  INDEX idx_expenses_submitted_at  (submitted_at)
);

-- Audit log — append-only, never updated. Immutable record for PCI-DSS / GDPR audit trails.
CREATE TABLE IF NOT EXISTS expense_audit_log (
  id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  expense_id  CHAR(36)          NOT NULL,
  actor_id    CHAR(36)          NOT NULL,
  action      VARCHAR(50)       NOT NULL,
  old_status  VARCHAR(20)       NULL,
  new_status  VARCHAR(20)       NULL,
  metadata    JSON              NULL,
  created_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_audit_expense (expense_id),
  INDEX idx_audit_actor   (actor_id)
);
