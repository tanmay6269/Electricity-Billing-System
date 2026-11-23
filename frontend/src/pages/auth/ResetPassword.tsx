import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { api, errorMessage } from "@/services/api";
import { newPasswordSchema, PASSWORD_HINT, type NewPassword } from "@/utils/validation";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<NewPassword>({ resolver: zodResolver(newPasswordSchema) });

  const onSubmit = async (d: NewPassword) => {
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token, new_password: d.new_password });
      toast.success("Password updated. Please sign in.");
      navigate("/login", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl">Set a new password</h2>
      <p className="mt-1 text-sm text-ink-muted">{PASSWORD_HINT}</p>
      {!token ? (
        <div className="mt-6">
          <Alert tone="error">This reset link is missing its token. <Link to="/forgot-password" className="underline">Request a new link</Link>.</Alert>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" error={errors.new_password?.message}>
            <Input type="password" autoComplete="new-password" invalid={!!errors.new_password} {...register("new_password")} />
          </Field>
          <Field label="Confirm password" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register("confirm")} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<KeyRound className="h-4 w-4" />}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
