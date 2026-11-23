import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Shell from "@/layouts/Shell";
import { homeFor, useAuth } from "@/context/AuthContext";
import { LoadingBlock } from "@/components/ui/States";
import Login from "@/pages/auth/Login";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import type { Role } from "@/types";

// Admin / staff
const Dashboard = lazy(() => import("@/pages/app/Dashboard"));
const CustomerList = lazy(() => import("@/pages/app/customers/CustomerList"));
const CustomerForm = lazy(() => import("@/pages/app/customers/CustomerForm"));
const CustomerDetail = lazy(() => import("@/pages/app/customers/CustomerDetail"));
const ConnectionList = lazy(() => import("@/pages/app/connections/ConnectionList"));
const ConnectionDetail = lazy(() => import("@/pages/app/connections/ConnectionDetail"));
const ReadingList = lazy(() => import("@/pages/app/readings/ReadingList"));
const AddReading = lazy(() => import("@/pages/app/readings/AddReading"));
const TariffList = lazy(() => import("@/pages/app/tariffs/TariffList"));
const BillingDashboard = lazy(() => import("@/pages/app/billing/BillingDashboard"));
const BillsList = lazy(() => import("@/pages/app/billing/BillsList"));
const PaymentList = lazy(() => import("@/pages/app/payments/PaymentList"));
const ComplaintList = lazy(() => import("@/pages/app/complaints/ComplaintList"));
const StaffList = lazy(() => import("@/pages/app/staff/StaffList"));
const Reports = lazy(() => import("@/pages/app/reports/Reports"));
const AuditLogs = lazy(() => import("@/pages/app/audit/AuditLogs"));
const SystemSettings = lazy(() => import("@/pages/app/settings/SystemSettings"));
// Shared
const BillDetail = lazy(() => import("@/pages/shared/BillDetail"));
const ComplaintDetail = lazy(() => import("@/pages/shared/ComplaintDetail"));
const Notifications = lazy(() => import("@/pages/shared/Notifications"));
const AccountSettings = lazy(() => import("@/pages/shared/AccountSettings"));
// Customer portal
const PortalDashboard = lazy(() => import("@/pages/portal/PortalDashboard"));
const MyProfile = lazy(() => import("@/pages/portal/MyProfile"));
const MyConnection = lazy(() => import("@/pages/portal/MyConnection"));
const CurrentBill = lazy(() => import("@/pages/portal/CurrentBill"));
const BillHistory = lazy(() => import("@/pages/portal/BillHistory"));
const PayBill = lazy(() => import("@/pages/portal/PayBill"));
const Checkout = lazy(() => import("@/pages/portal/Checkout"));
const PaymentHistory = lazy(() => import("@/pages/portal/PaymentHistory"));
const Consumption = lazy(() => import("@/pages/portal/Consumption"));
const MyComplaints = lazy(() => import("@/pages/portal/MyComplaints"));
const PortalBillDetail = lazy(() => import("@/pages/portal/BillDetail"));

function Protected({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingBlock className="h-full" label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "admin" ? <>{children}</> : <Navigate to="/app" replace />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock className="h-full" />;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-5xl font-semibold text-navy-800">404</p>
      <p className="text-ink-muted">This page does not exist.</p>
      <a href="/" className="mt-2 text-sm font-medium text-brand-600">Go home</a>
    </div>
  );
}

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/app" element={<Protected roles={["admin", "staff"]}><Shell /></Protected>}>
        <Route index element={<S><Dashboard /></S>} />
        <Route path="customers" element={<S><CustomerList /></S>} />
        <Route path="customers/new" element={<S><CustomerForm /></S>} />
        <Route path="customers/:id" element={<S><CustomerDetail /></S>} />
        <Route path="customers/:id/edit" element={<S><CustomerForm /></S>} />
        <Route path="connections" element={<S><ConnectionList /></S>} />
        <Route path="connections/:id" element={<S><ConnectionDetail /></S>} />
        <Route path="readings" element={<S><ReadingList /></S>} />
        <Route path="readings/new" element={<S><AddReading /></S>} />
        <Route path="tariffs" element={<S><TariffList /></S>} />
        <Route path="billing" element={<S><BillingDashboard /></S>} />
        <Route path="bills" element={<S><BillsList /></S>} />
        <Route path="bills/:id" element={<S><BillDetail /></S>} />
        <Route path="payments" element={<S><PaymentList /></S>} />
        <Route path="complaints" element={<S><ComplaintList /></S>} />
        <Route path="complaints/:id" element={<S><ComplaintDetail /></S>} />
        <Route path="reports" element={<S><Reports /></S>} />
        <Route path="notifications" element={<S><Notifications /></S>} />
        <Route path="profile" element={<S><AccountSettings /></S>} />
        <Route path="staff" element={<AdminOnly><S><StaffList /></S></AdminOnly>} />
        <Route path="audit-logs" element={<AdminOnly><S><AuditLogs /></S></AdminOnly>} />
        <Route path="settings" element={<AdminOnly><S><SystemSettings /></S></AdminOnly>} />
      </Route>

      <Route path="/portal" element={<Protected roles={["customer"]}><Shell /></Protected>}>
        <Route index element={<S><PortalDashboard /></S>} />
        <Route path="profile" element={<S><MyProfile /></S>} />
        <Route path="connection" element={<S><MyConnection /></S>} />
        <Route path="current-bill" element={<S><CurrentBill /></S>} />
        <Route path="bills" element={<S><BillHistory /></S>} />
        <Route path="bills/:id" element={<S><PortalBillDetail /></S>} />
        <Route path="pay" element={<S><PayBill /></S>} />
        <Route path="pay/:billId" element={<S><Checkout /></S>} />
        <Route path="payments" element={<S><PaymentHistory /></S>} />
        <Route path="consumption" element={<S><Consumption /></S>} />
        <Route path="complaints" element={<S><MyComplaints /></S>} />
        <Route path="complaints/:id" element={<S><ComplaintDetail /></S>} />
        <Route path="notifications" element={<S><Notifications /></S>} />
        <Route path="settings" element={<S><AccountSettings /></S>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
