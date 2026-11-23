export type Role = "admin" | "staff" | "customer";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  customer_id?: number | null;
  customer_code?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  summary?: Record<string, number>;
}

export interface Customer {
  id: number;
  customer_code: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  customer_type: string;
  status: string;
  profile_picture_url: string | null;
  has_login: boolean;
  created_at: string;
  connection_count: number;
  connection_id: number | null;
  connection_code: string | null;
  meter_number: string | null;
  connection_date: string | null;
  tariff_plan: string | null;
  sanctioned_load_kw: number | null;
}

export interface Connection {
  id: number;
  connection_code: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  meter_id: number;
  meter_number: string;
  meter_status: string;
  meter_manufacturer: string | null;
  initial_reading: number;
  connection_type: string;
  sanctioned_load_kw: number;
  tariff_plan_id: number;
  tariff_plan: string;
  tariff_category: string;
  installation_date: string;
  status: string;
  address: string;
  created_at: string;
}

export interface Slab {
  id?: number;
  from_unit: number;
  to_unit: number | null;
  rate: number;
}

export interface Tariff {
  id: number;
  code: string;
  name: string;
  customer_category: string;
  billing_method: "flat" | "slab";
  flat_rate: number | null;
  fixed_charge: number;
  tax_rate: number;
  additional_charges: number;
  additional_charges_label: string | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
  description: string | null;
  slabs: Slab[];
  connections_using: number | null;
  updated_at: string;
}

export interface Reading {
  id: number;
  connection_id: number;
  connection_code: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  meter_number: string;
  billing_period: string;
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  reading_date: string;
  reading_type: string;
  entered_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  history?: AuditEntry[];
}

export interface BillItem {
  item_type: string;
  description: string;
  units: number | null;
  rate: number | null;
  amount: number;
}

export interface Bill {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  customer_type: string;
  connection_id: number;
  connection_code: string;
  meter_number: string;
  billing_period: string;
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  consumption_charge: number;
  fixed_charge: number;
  additional_charges: number;
  tax_amount: number;
  late_fee: number;
  discount: number;
  previous_outstanding: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  issue_date: string;
  due_date: string;
  status: string;
  carried_forward_to_id: number | null;
  tariff_name: string | null;
  created_at: string;
  customer_address?: string;
  customer_email?: string;
  customer_phone?: string;
  tariff_snapshot?: Record<string, unknown>;
  cancel_reason?: string | null;
  remarks?: string | null;
  items?: BillItem[];
  payments?: Payment[];
  carried_forward_to_invoice?: string | null;
  carried_from?: { id: number; invoice_number: string }[];
}

export interface Payment {
  id: number;
  payment_code: string;
  transaction_id: string;
  receipt_number: string | null;
  bill_id: number;
  invoice_number: string;
  billing_period: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  amount: number;
  method: string;
  status: string;
  payment_date: string;
  remarks: string | null;
  bill_balance_due: number;
  bill_status: string;
  demo_mode?: boolean;
}

export interface TimelineEntry {
  id: number;
  status: string;
  note: string | null;
  by: string;
  by_role: string | null;
  created_at: string;
}

export interface Complaint {
  id: number;
  complaint_code: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  connection_id: number | null;
  connection_code: string | null;
  category: string;
  subject: string;
  priority: string;
  status: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  description?: string;
  resolution_notes?: string | null;
  timeline?: TimelineEntry[];
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditEntry {
  id?: number;
  action: string;
  entity_type?: string;
  entity_id?: string | null;
  summary: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address?: string | null;
  user?: string;
  by?: string;
  user_role?: string | null;
  created_at: string;
}

export interface CustomerProfile {
  customer: Customer;
  connections: Connection[];
  latest_reading: Reading | null;
  current_bill: Bill | null;
  total_paid: number;
  outstanding_balance: number;
  consumption_history: { billing_period: string; units: number; connection_code: string }[];
  bills: Bill[];
  payments: Payment[];
  complaints: Complaint[];
}

export interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}
