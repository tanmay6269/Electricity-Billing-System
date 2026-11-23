import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, tokenStore } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { dateTime } from "@/utils/format";
import { PASSWORD_HINT, strongPassword } from "@/utils/validation";

const pwSchema = z.object({ current_password: z.string().min(1, "Required"), new_password: strongPassword, confirm: z.string() })
  .refine((d) => d.new_password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
type PwForm = z.infer<typeof pwSchema>;

export function ChangePasswordCard() {
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PwForm>({ resolver: zodResolver(pwSchema) });
  const onSubmit = async (d: PwForm) => {
    setErr(null);
    try {
      const { data } = await api.post("/api/auth/change-password", { current_password: d.current_password, new_password: d.new_password });
      tokenStore.set(data.access_token); // old sessions are signed out; keep this one
      toast.success("Password changed. Other sessions were signed out.");
      reset();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Card>
      <CardHeader title="Change password" subtitle={PASSWORD_HINT} />
      <CardBody>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {err && <Alert tone="error">{err}</Alert>}
          <Field label="Current password" error={errors.current_password?.message}><Input type="password" autoComplete="current-password" {...register("current_password")} /></Field>
          <Field label="New password" error={errors.new_password?.message}><Input type="password" autoComplete="new-password" {...register("new_password")} /></Field>
          <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register("confirm")} /></Field>
          <Button type="submit" loading={isSubmitting} icon={<KeyRound className="h-4 w-4" />}>Update password</Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Profile + password page for staff (/app/profile) and customers (/portal/settings). */
export default function AccountSettings() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const isCustomer = user.role === "customer";

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/api/users/me", { full_name: name, phone: phone || null });
      toast.success("Profile updated");
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={isCustomer ? "Settings" : "My Profile"} subtitle="Account details and security." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <CardBody className="space-y-4">
            <InfoGrid items={[{ label: "Email (login)", value: user.email }, { label: "Role", value: <span className="capitalize">{user.role}</span> }, { label: "Last login", value: dateTime(user.last_login_at) }, { label: "Member since", value: dateTime(user.created_at) }]} />
            {isCustomer ? (
              <p className="text-xs text-ink-muted">Update your phone and address from <b>My Profile</b>.</p>
            ) : (
              <div className="space-y-4 border-t border-line pt-4">
                <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Save profile</Button>
              </div>
            )}
          </CardBody>
        </Card>
        <ChangePasswordCard />
      </div>
    </div>
  );
}
