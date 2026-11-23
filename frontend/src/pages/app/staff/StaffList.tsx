import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/States";
import type { Page, StaffUser } from "@/types";
import { dateTime } from "@/utils/format";
import { PASSWORD_HINT, strongPassword } from "@/utils/validation";

export default function StaffList() {
  const { user: me } = useAuth();
  const t = useTableState({ search: "", role: "", is_active: "" }, { by: "created_at", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<StaffUser>>("/api/users", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, role: t.filters.role, is_active: t.filters.is_active,
  });
  const [edit, setEdit] = useState<StaffUser | "new" | null>(null);
  const [pwFor, setPwFor] = useState<StaffUser | null>(null);
  const [del, setDel] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);

  const columns: Column<StaffUser>[] = [
    { key: "full_name", header: "Name", sortable: true, render: (u) => <div><p className="font-medium text-ink">{u.full_name} {u.id === me?.id && <span className="text-xs text-ink-muted">(you)</span>}</p><p className="text-xs text-ink-muted">{u.email}</p></div> },
    { key: "role", header: "Role", render: (u) => <Badge tone={u.role === "admin" ? "navy" : "blue"}>{u.role === "admin" ? "Administrator" : "Staff"}</Badge> },
    { key: "phone", header: "Phone", hideOnMobile: true, render: (u) => u.phone ?? "-" },
    { key: "is_active", header: "Status", render: (u) => <StatusBadge status={u.is_active ? "active" : "inactive"} /> },
    { key: "last_login_at", header: "Last login", hideOnMobile: true, render: (u) => dateTime(u.last_login_at) },
    { key: "a", header: "", align: "right", render: (u) => (
      <div className="flex justify-end">
        <IconButton label="Edit" onClick={() => setEdit(u)}><Pencil className="h-4 w-4" /></IconButton>
        <IconButton label="Reset password" onClick={() => setPwFor(u)}><KeyRound className="h-4 w-4" /></IconButton>
        {u.id !== me?.id && <IconButton label="Remove" className="hover:bg-bad-50 hover:text-bad-600" onClick={() => setDel(u)}><Trash2 className="h-4 w-4" /></IconButton>}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Staff Management" subtitle="Administrators and billing staff. Only administrators can manage accounts and roles."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Add user</Button>} />
      <Card>
        <Toolbar>
          <SearchInput className="sm:w-64" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Name or email..." />
          <Select className="sm:w-40" value={t.filters.role} onChange={(e) => t.setFilter("role", e.target.value)} placeholder="All roles" options={[{ value: "admin", label: "Administrator" }, { value: "staff", label: "Staff" }]} />
          <Select className="sm:w-36" value={t.filters.is_active} onChange={(e) => t.setFilter("is_active", e.target.value)} placeholder="Any status" options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
      <UserModal user={edit} selfId={me?.id} onClose={() => setEdit(null)} onSaved={reload} />
      <ResetPwModal user={pwFor} onClose={() => setPwFor(null)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={busy} title="Remove user?" confirmLabel="Remove"
        message={<>{del?.full_name} will lose access immediately. Their past actions stay in the audit log.</>}
        onConfirm={async () => {
          if (!del) return;
          setBusy(true);
          try { await api.delete(`/api/users/${del.id}`); toast.success("User removed"); setDel(null); reload(); }
          catch (e) { toast.error(errorMessage(e)); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

function UserModal({ user, selfId, onClose, onSaved }: { user: StaffUser | "new" | null; selfId?: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ full_name: "", email: "", phone: "", role: "staff", password: "", is_active: "true" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    if (user === "new") setF({ full_name: "", email: "", phone: "", role: "staff", password: "", is_active: "true" });
    else if (user) setF({ full_name: user.full_name, email: user.email, phone: user.phone ?? "", role: user.role, password: "", is_active: String(user.is_active) });
  }, [user]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isSelf = user !== "new" && user?.id === selfId;

  const save = async () => {
    setErr(null);
    if (user === "new") {
      const r = strongPassword.safeParse(f.password);
      if (!r.success) return setErr(r.error.issues[0].message);
    }
    setBusy(true);
    try {
      if (user === "new") await api.post("/api/users", { full_name: f.full_name, email: f.email, phone: f.phone || null, role: f.role, password: f.password });
      else if (user) await api.put(`/api/users/${user.id}`, { full_name: f.full_name, phone: f.phone || null, role: f.role, is_active: f.is_active === "true" });
      toast.success("User saved");
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!user} onClose={onClose} title={user === "new" ? "Add staff user" : "Edit user"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Full name" required><Input value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label="Email" required><Input type="email" disabled={user !== "new"} value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" hint={isSelf ? "You cannot change your own role" : undefined}><Select disabled={isSelf} value={f.role} onChange={set("role")} options={[{ value: "staff", label: "Staff" }, { value: "admin", label: "Administrator" }]} /></Field>
          {user !== "new" && <Field label="Status"><Select disabled={isSelf} value={f.is_active} onChange={set("is_active")} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} /></Field>}
        </div>
        {user === "new" && <Field label="Initial password" required hint={PASSWORD_HINT}><Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>}
      </div>
    </Modal>
  );
}

function ResetPwModal({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPw(""); setErr(null); }, [user]);
  const save = async () => {
    const r = strongPassword.safeParse(pw);
    if (!r.success) return setErr(r.error.issues[0].message);
    setBusy(true);
    try { await api.post(`/api/users/${user!.id}/reset-password`, { new_password: pw }); toast.success("Password reset"); onClose(); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={!!user} onClose={onClose} size="sm" title={`Reset password · ${user?.full_name ?? ""}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Reset</Button></>}>
      {err && <div className="mb-3"><Alert tone="error">{err}</Alert></div>}
      <Field label="New password" hint={PASSWORD_HINT}><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
    </Modal>
  );
}
