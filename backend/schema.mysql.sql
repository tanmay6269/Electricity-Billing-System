-- Electricity Billing Management System - MySQL 8 schema (generated from SQLAlchemy models)
-- Usage: mysql -u ebms -p ebms < schema.sql   (or run `alembic upgrade head`)

SET NAMES utf8mb4;

CREATE TABLE meters (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	meter_number VARCHAR(30) NOT NULL, 
	manufacturer VARCHAR(80), 
	initial_reading NUMERIC(12, 2) NOT NULL, 
	installed_on DATE, 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_meters_meter_number ON meters (meter_number);

CREATE TABLE roles (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(20) NOT NULL, 
	description VARCHAR(255), 
	PRIMARY KEY (id), 
	UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE system_settings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	`key` VARCHAR(60) NOT NULL, 
	value TEXT NOT NULL, 
	description VARCHAR(255), 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE tariff_plans (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	code VARCHAR(30) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	customer_category VARCHAR(20) NOT NULL, 
	billing_method VARCHAR(10) NOT NULL, 
	flat_rate NUMERIC(10, 4), 
	fixed_charge NUMERIC(10, 2) NOT NULL, 
	tax_rate NUMERIC(5, 2) NOT NULL, 
	additional_charges NUMERIC(10, 2) NOT NULL, 
	additional_charges_label VARCHAR(80), 
	effective_from DATE NOT NULL, 
	effective_to DATE, 
	status VARCHAR(10) NOT NULL, 
	description TEXT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_tariff_plans_customer_category ON tariff_plans (customer_category);
CREATE INDEX ix_tariff_plans_status ON tariff_plans (status);

CREATE TABLE tariff_slabs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	tariff_plan_id INTEGER NOT NULL, 
	from_unit INTEGER NOT NULL, 
	to_unit INTEGER, 
	rate NUMERIC(10, 4) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(tariff_plan_id) REFERENCES tariff_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_tariff_slabs_tariff_plan_id ON tariff_slabs (tariff_plan_id);

CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(120) NOT NULL, 
	phone VARCHAR(20), 
	role_id INTEGER NOT NULL, 
	is_active BOOL NOT NULL, 
	token_version INTEGER NOT NULL, 
	last_login_at DATETIME, 
	reset_token_hash VARCHAR(64), 
	reset_token_expires_at DATETIME, 
	deleted_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_users_email ON users (email);
CREATE INDEX ix_users_reset_token_hash ON users (reset_token_hash);
CREATE INDEX ix_users_role_id ON users (role_id);

CREATE TABLE audit_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER, 
	action VARCHAR(50) NOT NULL, 
	entity_type VARCHAR(40) NOT NULL, 
	entity_id VARCHAR(40), 
	summary VARCHAR(255), 
	old_values JSON, 
	new_values JSON, 
	ip_address VARCHAR(45), 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_audit_logs_action ON audit_logs (action);
CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX ix_audit_logs_entity_id ON audit_logs (entity_id);
CREATE INDEX ix_audit_logs_entity_type ON audit_logs (entity_type);
CREATE INDEX ix_audit_logs_user_id ON audit_logs (user_id);

CREATE TABLE customers (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	customer_code VARCHAR(20) NOT NULL, 
	user_id INTEGER, 
	full_name VARCHAR(120) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	phone VARCHAR(20) NOT NULL, 
	address VARCHAR(255) NOT NULL, 
	city VARCHAR(80) NOT NULL, 
	state VARCHAR(80) NOT NULL, 
	postal_code VARCHAR(10) NOT NULL, 
	customer_type VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	profile_picture_url VARCHAR(500), 
	deleted_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_customers_customer_code ON customers (customer_code);
CREATE INDEX ix_customers_customer_type ON customers (customer_type);
CREATE INDEX ix_customers_deleted_at ON customers (deleted_at);
CREATE INDEX ix_customers_email ON customers (email);
CREATE INDEX ix_customers_full_name ON customers (full_name);
CREATE INDEX ix_customers_status ON customers (status);

CREATE TABLE notifications (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	type VARCHAR(30) NOT NULL, 
	title VARCHAR(150) NOT NULL, 
	message TEXT NOT NULL, 
	link VARCHAR(255), 
	dedupe_key VARCHAR(100), 
	is_read BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_notifications_created_at ON notifications (created_at);
CREATE INDEX ix_notifications_dedupe_key ON notifications (dedupe_key);
CREATE INDEX ix_notifications_is_read ON notifications (is_read);
CREATE INDEX ix_notifications_type ON notifications (type);
CREATE INDEX ix_notifications_user_id ON notifications (user_id);

CREATE TABLE electricity_connections (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	connection_code VARCHAR(20) NOT NULL, 
	customer_id INTEGER NOT NULL, 
	meter_id INTEGER NOT NULL, 
	tariff_plan_id INTEGER NOT NULL, 
	connection_type VARCHAR(20) NOT NULL, 
	sanctioned_load_kw NUMERIC(8, 2) NOT NULL, 
	installation_date DATE NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	address TEXT NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	UNIQUE (meter_id), 
	FOREIGN KEY(meter_id) REFERENCES meters (id), 
	FOREIGN KEY(tariff_plan_id) REFERENCES tariff_plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_electricity_connections_connection_code ON electricity_connections (connection_code);
CREATE INDEX ix_electricity_connections_customer_id ON electricity_connections (customer_id);
CREATE INDEX ix_electricity_connections_status ON electricity_connections (status);
CREATE INDEX ix_electricity_connections_tariff_plan_id ON electricity_connections (tariff_plan_id);

CREATE TABLE complaints (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	complaint_code VARCHAR(20) NOT NULL, 
	customer_id INTEGER NOT NULL, 
	connection_id INTEGER, 
	category VARCHAR(30) NOT NULL, 
	subject VARCHAR(200) NOT NULL, 
	description TEXT NOT NULL, 
	priority VARCHAR(10) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	assigned_to INTEGER, 
	resolution_notes TEXT, 
	resolved_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(connection_id) REFERENCES electricity_connections (id), 
	FOREIGN KEY(assigned_to) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_complaints_assigned_to ON complaints (assigned_to);
CREATE INDEX ix_complaints_category ON complaints (category);
CREATE UNIQUE INDEX ix_complaints_complaint_code ON complaints (complaint_code);
CREATE INDEX ix_complaints_customer_id ON complaints (customer_id);
CREATE INDEX ix_complaints_status ON complaints (status);

CREATE TABLE meter_readings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	connection_id INTEGER NOT NULL, 
	customer_id INTEGER NOT NULL, 
	meter_id INTEGER NOT NULL, 
	billing_period VARCHAR(7) NOT NULL, 
	previous_reading NUMERIC(12, 2) NOT NULL, 
	current_reading NUMERIC(12, 2) NOT NULL, 
	units_consumed NUMERIC(12, 2) NOT NULL, 
	reading_date DATE NOT NULL, 
	reading_type VARCHAR(12) NOT NULL, 
	entered_by INTEGER, 
	remarks TEXT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_reading_connection_period UNIQUE (connection_id, billing_period), 
	FOREIGN KEY(connection_id) REFERENCES electricity_connections (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(meter_id) REFERENCES meters (id), 
	FOREIGN KEY(entered_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_meter_readings_billing_period ON meter_readings (billing_period);
CREATE INDEX ix_meter_readings_connection_id ON meter_readings (connection_id);
CREATE INDEX ix_meter_readings_customer_id ON meter_readings (customer_id);
CREATE INDEX ix_meter_readings_reading_type ON meter_readings (reading_type);

CREATE TABLE bills (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	invoice_number VARCHAR(30) NOT NULL, 
	customer_id INTEGER NOT NULL, 
	connection_id INTEGER NOT NULL, 
	reading_id INTEGER NOT NULL, 
	tariff_plan_id INTEGER NOT NULL, 
	billing_period VARCHAR(7) NOT NULL, 
	active_period_key VARCHAR(40), 
	previous_reading NUMERIC(12, 2) NOT NULL, 
	current_reading NUMERIC(12, 2) NOT NULL, 
	units_consumed NUMERIC(12, 2) NOT NULL, 
	consumption_charge NUMERIC(12, 2) NOT NULL, 
	fixed_charge NUMERIC(12, 2) NOT NULL, 
	additional_charges NUMERIC(12, 2) NOT NULL, 
	tax_amount NUMERIC(12, 2) NOT NULL, 
	late_fee NUMERIC(12, 2) NOT NULL, 
	discount NUMERIC(12, 2) NOT NULL, 
	previous_outstanding NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	amount_paid NUMERIC(12, 2) NOT NULL, 
	balance_due NUMERIC(12, 2) NOT NULL, 
	issue_date DATE NOT NULL, 
	due_date DATE NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	tariff_snapshot JSON NOT NULL, 
	carried_forward_to_id INTEGER, 
	cancel_reason TEXT, 
	remarks TEXT, 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(connection_id) REFERENCES electricity_connections (id), 
	FOREIGN KEY(reading_id) REFERENCES meter_readings (id), 
	FOREIGN KEY(tariff_plan_id) REFERENCES tariff_plans (id), 
	UNIQUE (active_period_key), 
	FOREIGN KEY(carried_forward_to_id) REFERENCES bills (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_bills_billing_period ON bills (billing_period);
CREATE INDEX ix_bills_connection_id ON bills (connection_id);
CREATE INDEX ix_bills_customer_id ON bills (customer_id);
CREATE INDEX ix_bills_due_date ON bills (due_date);
CREATE UNIQUE INDEX ix_bills_invoice_number ON bills (invoice_number);
CREATE INDEX ix_bills_reading_id ON bills (reading_id);
CREATE INDEX ix_bills_status ON bills (status);

CREATE TABLE complaint_updates (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	complaint_id INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	note TEXT, 
	updated_by INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(complaint_id) REFERENCES complaints (id) ON DELETE CASCADE, 
	FOREIGN KEY(updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_complaint_updates_complaint_id ON complaint_updates (complaint_id);

CREATE TABLE bill_items (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	bill_id INTEGER NOT NULL, 
	item_type VARCHAR(20) NOT NULL, 
	description VARCHAR(200) NOT NULL, 
	units NUMERIC(12, 2), 
	rate NUMERIC(10, 4), 
	amount NUMERIC(12, 2) NOT NULL, 
	sort_order INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bill_id) REFERENCES bills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_bill_items_bill_id ON bill_items (bill_id);

CREATE TABLE payments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	payment_code VARCHAR(30) NOT NULL, 
	transaction_id VARCHAR(40) NOT NULL, 
	receipt_number VARCHAR(30), 
	bill_id INTEGER NOT NULL, 
	customer_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	method VARCHAR(20) NOT NULL, 
	status VARCHAR(12) NOT NULL, 
	payment_date DATETIME NOT NULL, 
	remarks TEXT, 
	recorded_by INTEGER, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (receipt_number), 
	FOREIGN KEY(bill_id) REFERENCES bills (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(recorded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_payments_bill_id ON payments (bill_id);
CREATE INDEX ix_payments_customer_id ON payments (customer_id);
CREATE INDEX ix_payments_method ON payments (method);
CREATE UNIQUE INDEX ix_payments_payment_code ON payments (payment_code);
CREATE INDEX ix_payments_payment_date ON payments (payment_date);
CREATE INDEX ix_payments_status ON payments (status);
CREATE UNIQUE INDEX ix_payments_transaction_id ON payments (transaction_id);

