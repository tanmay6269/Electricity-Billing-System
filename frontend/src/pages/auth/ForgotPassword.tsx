import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Mail } from "lucide-react";
import AuthLayout from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { api, errorMessage } from "@/services/api";

const schema = z.object({ email: z.string().min(1, "Email is required").email("Enter a valid email") });

export default function ForgotPassword() {
  const [done, setDone] = useState<{ message: string; link?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  const onSubmit = async (d: { email: string }) => {
    setError(null);
    try {
      const { data } = await api.post("/api/auth/forgot-password", d);
      setDone({ message: data.message, link: data.dev_reset_link });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <AuthLayout>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
      <h2 className="text-2xl">Forgot password</h2>
      <p className="mt-1 text-sm text-ink-muted">Enter your email and we will send you a reset link.</p>
      {done ? (
        <div className="mt-6 space-y-3">
          <Alert tone="success">{done.message}</Alert>
          {done.link && (
            <Alert tone="info" title="Local demo mode">
              Email sending is off, so here is the reset link:{" "}
              <a href={done.link.replace(/^https?:\/\/[^/]+/, "")} className="font-medium underline">Reset my password</a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email address" error={errors.email?.message}>
            <Input type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<Mail className="h-4 w-4" />}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
