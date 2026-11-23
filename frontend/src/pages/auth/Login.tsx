import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, ShieldCheck, User, Users } from "lucide-react";
import AuthLayout from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { homeFor, useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/services/api";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormData = z.infer<typeof schema>;

const DEMO = [
  { label: "Admin", email: "admin@electricity.com", password: "Admin@123", icon: ShieldCheck },
  { label: "Staff", email: "staff@electricity.com", password: "Staff@123", icon: Users },
  { label: "Customer", email: "customer@electricity.com", password: "Customer@123", icon: User },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = async (d: FormData) => {
    setError(null);
    try {
      const u = await login(d.email, d.password);
      const from = loc.state?.from;
      const allowed = from && from.startsWith(homeFor(u.role));
      navigate(allowed ? from : homeFor(u.role), { replace: true });
    } catch (e) {
      setError(errorMessage(e, "Login failed."));
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl">Sign in</h2>
      <p className="mt-1 text-sm text-ink-muted">Use your registered email and password.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email address" error={errors.email?.message}>
          <Input type="email" autoComplete="email" placeholder="you@example.com" invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <Input type={show ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" invalid={!!errors.password} className="pr-10" {...register("password")} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-700">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<LogIn className="h-4 w-4" />}>
          Sign in
        </Button>
      </form>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          <span className="h-px flex-1 bg-line" /> Demo accounts <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => {
                setValue("email", d.email, { shouldValidate: true });
                setValue("password", d.password, { shouldValidate: true });
              }}
              className="flex flex-col items-center gap-1 rounded-lg border border-line bg-white px-2 py-2.5 text-xs font-medium text-ink-soft shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <d.icon className="h-4 w-4" />
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-faint">Click to fill credentials (local demo only).</p>
      </div>
    </AuthLayout>
  );
}
