"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { APP_NAME } from "@/lib/brand";
import { authenticate, type AuthField, type AuthMode, type AuthState } from "./actions";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CapsLockIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  SpinnerIcon,
} from "@/components/icons";

const MIN_PASSWORD_LENGTH = 6;

type FieldErrors = Partial<Record<AuthField, string>>;

const copy = {
  signin: {
    title: "Welcome back",
    subtitle: "Sign in to pick up where you left off.",
    submit: "Sign in",
    pending: "Signing in…",
    switchPrompt: `New to ${APP_NAME}?`,
    switchAction: "Create an account",
  },
  signup: {
    title: "Create your account",
    subtitle: "Save links with rich previews in seconds.",
    submit: "Create account",
    pending: "Creating your account…",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
  },
} as const;

function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (/\s/.test(email)) return "Email addresses can't contain spaces.";
  const at = email.lastIndexOf("@");
  if (at === -1) return "Your email is missing an “@”, like name@example.com.";
  if (at === 0) return "Add the part before the “@”.";
  const domain = email.slice(at + 1);
  if (!domain) return "Add the part after the “@”, like gmail.com.";
  if (!/^[^\s@]+\.[^\s@]{2,}$/.test(domain)) return `“${domain}” isn't a complete domain. It should look like example.com.`;
  return undefined;
}

function validatePassword(value: string, mode: AuthMode): string | undefined {
  if (!value) return mode === "signup" ? "Create a password to continue." : "Enter your password.";
  if (mode === "signup" && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters (${MIN_PASSWORD_LENGTH - value.length} more).`;
  }
  return undefined;
}

/** 0 = too short, 1–4 = weak to strong. */
type Score = 0 | 1 | 2 | 3 | 4;

const strengthLevels: Record<Score, { label: string; bar: string; text: string }> = {
  0: { label: "Too short", bar: "bg-danger", text: "text-danger" },
  1: { label: "Weak", bar: "bg-accent", text: "text-accent" },
  2: { label: "Fair", bar: "bg-accent", text: "text-accent" },
  3: { label: "Good", bar: "bg-brand", text: "text-brand" },
  4: { label: "Strong", bar: "bg-brand", text: "text-brand" },
};

/** A hint for the person, not a rule: the server only enforces the minimum length. */
function passwordScore(password: string): Score {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  let score = 1;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  else if (/\d|[^A-Za-z0-9]/.test(password) && password.length >= 12) score++;
  return Math.min(score, 4) as Score;
}

/** Shakes the element sideways once, unless the person prefers reduced motion. */
function shake(element: HTMLElement | null) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 380, easing: "ease-in-out" },
  );
}

export function LoginForm({
  next,
  initialError,
  initialMode,
}: {
  next: string;
  /** From the URL: a failed email link, or a just-deleted account. */
  initialError?: { title: string; message: string };
  initialMode: AuthMode;
}) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    authenticate,
    initialError ? { status: "error", ...initialError } : { status: "idle" },
  );
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // The server state stays until the next submit; this hides it once it's out of date.
  const [dismissed, setDismissed] = useState<AuthState | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const serverError = state.status === "error" && state !== dismissed && !isPending ? state : null;
  const suggestion = serverError?.suggest && serverError.suggest !== mode ? serverError.suggest : null;
  const t = copy[mode];

  // After a failed submit, put the cursor where the fix goes.
  useEffect(() => {
    if (state.status !== "error" || !state.field) return;
    const input = (state.field === "email" ? emailRef : passwordRef).current;
    input?.focus();
    if (state.field === "password") input?.select();
    shake(formRef.current);
  }, [state]);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    // An email problem is the same in both modes; password rules differ, so re-check that on submit.
    setErrors((current) => ({ email: current.email }));
    setDismissed(state);
    // Keep the URL in step so a refresh or a shared link opens the same tab.
    const url = new URL(window.location.href);
    if (nextMode === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password, mode),
    };
    if (!nextErrors.email && !nextErrors.password) return; // Let the server action run.

    event.preventDefault();
    setErrors(nextErrors);
    (nextErrors.email ? emailRef : passwordRef).current?.focus();
    shake(formRef.current);
  }

  function serverErrorFor(field: AuthField) {
    return serverError?.field === field ? serverError : null;
  }

  function fieldMessage(field: AuthField) {
    const fromServer = serverErrorFor(field);
    // Server errors with a title are shown in the banner; the input is only outlined.
    return errors[field] ?? (fromServer && !fromServer.title ? fromServer.message : undefined);
  }

  function updateField(field: AuthField, value: string) {
    if (field === "email") setEmail(value);
    else setPassword(value);
    // Re-check as they type once a message is showing, so it clears the moment it's fixed.
    if (errors[field]) {
      setErrors((current) => ({
        ...current,
        [field]: field === "email" ? validateEmail(value) : validatePassword(value, mode),
      }));
    }
    if (serverErrorFor(field)) setDismissed(state);
  }

  function checkOnBlur(field: AuthField, value: string) {
    // Don't nag about empty fields someone is just tabbing past.
    if (!value) return;
    if (field === "email") setErrors((current) => ({ ...current, email: validateEmail(value) }));
    else if (mode === "signup") setErrors((current) => ({ ...current, password: validatePassword(value, mode) }));
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  if (state.status === "check-email" && state !== dismissed) {
    return (
      <CheckEmail
        email={state.email ?? email}
        onBack={() => {
          setDismissed(state);
          setPassword("");
          switchMode("signin");
        }}
      />
    );
  }

  const emailError = fieldMessage("email");
  const passwordError = fieldMessage("password");
  const score = passwordScore(password);
  const strength = strengthLevels[score];

  return (
    <div>
      <div className="text-center">
        <h1 key={mode} className="text-[26px] font-semibold tracking-tight text-ink motion-safe:animate-fade-in">
          {t.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t.subtitle}</p>
      </div>

      <ModeSwitch mode={mode} onChange={switchMode} />

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="mt-7 space-y-5 shorter:mt-5 shorter:space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="intent" value={mode} />

        <TextField
          id="email"
          label="Email"
          icon={<MailIcon className="size-[18px]" />}
          error={emailError}
          invalid={Boolean(emailError || serverErrorFor("email"))}
          inputRef={emailRef}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(event) => updateField("email", event.target.value)}
          onBlur={(event) => checkOnBlur("email", event.target.value)}
        />

        <TextField
          id="password"
          label="Password"
          icon={<LockIcon className="size-[18px]" />}
          error={passwordError}
          invalid={Boolean(passwordError || serverErrorFor("password"))}
          inputRef={passwordRef}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters` : "Your password"}
          value={password}
          onChange={(event) => updateField("password", event.target.value)}
          onBlur={(event) => {
            setCapsLock(false);
            checkOnBlur("password", event.target.value);
          }}
          onKeyDown={trackCapsLock}
          onKeyUp={trackCapsLock}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              // Keep focus (and the caret) in the input when the button is clicked.
              onMouseDown={(event) => event.preventDefault()}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls="password"
              title={showPassword ? "Hide password" : "Show password"}
              className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
            >
              {showPassword ? <EyeOffIcon className="size-[18px]" /> : <EyeIcon className="size-[18px]" />}
            </button>
          }
          footer={
            <>
              {capsLock && (
                <p className="flex items-center gap-1.5 text-[13px] text-accent motion-safe:animate-fade-down">
                  <CapsLockIcon className="size-4" />
                  Caps Lock is on
                </p>
              )}
              {mode === "signup" && password && !passwordError && (
                <div className="flex items-center gap-3 motion-safe:animate-fade-down" aria-live="polite">
                  <div className="flex flex-1 gap-1.5">
                    {[1, 2, 3, 4].map((step) => (
                      <span
                        key={step}
                        className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                          score >= step ? strength.bar : "bg-line"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`w-14 text-right text-xs font-medium ${strength.text}`}>{strength.label}</span>
                </div>
              )}
            </>
          }
        />

        {serverError?.title && (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-danger/30 bg-danger-soft/90 p-3.5 motion-safe:animate-fade-down"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
              <AlertIcon className="size-[18px]" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-danger">{serverError.title}</p>
              <p className="mt-0.5 text-danger">{serverError.message}</p>
              {suggestion && (
                <button
                  type="button"
                  onClick={() => switchMode(suggestion)}
                  className="mt-2 inline-flex items-center gap-1 font-medium text-danger underline decoration-danger underline-offset-4 hover:decoration-danger"
                >
                  {suggestion === "signin" ? "Sign in instead" : "New here? Create an account"}
                  <ArrowRightIcon className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="group relative flex h-12 w-full shorter:h-11 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-on-brand transition-colors hover:bg-brand/90 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:outline-none active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
        >
          {isPending ? (
            <>
              <SpinnerIcon />
              {t.pending}
            </>
          ) : (
            <>
              {t.submit}
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-muted shorter:mt-5">
        {t.switchPrompt}{" "}
        <button
          type="button"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
          className="rounded font-semibold text-brand underline-offset-4 hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
        >
          {t.switchAction}
        </button>
      </p>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: AuthMode; onChange: (mode: AuthMode) => void }) {
  const options: { value: AuthMode; label: string }[] = [
    { value: "signin", label: "Sign in" },
    { value: "signup", label: "Create account" },
  ];
  return (
    <div
      role="group"
      aria-label="Sign in or create an account"
      className="relative mt-7 grid grid-cols-2 rounded-xl bg-subtle p-1 shorter:mt-5"
    >
      {/* Sliding highlight behind the active option. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-surface shadow-xs ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mode === "signup" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 h-9 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none ${
            mode === option.value
              ? "text-ink"
              : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string;
  invalid: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  trailing?: ReactNode;
  footer?: ReactNode;
};

function TextField({ id, label, icon, error, invalid, inputRef, trailing, footer, ...inputProps }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={error ? errorId : undefined}
          className={`auth-input peer h-12 w-full shorter:h-11 rounded-xl border bg-canvas pl-11 text-[15px] text-ink transition outline-none placeholder:text-muted/80 focus:bg-surface focus:ring-4 ${
            trailing ? "pr-12" : "pr-4"
          } ${
            invalid
              ? "border-danger focus:border-danger focus:ring-danger/15"
              : "border-line hover:border-muted/40 focus:border-brand/60 focus:ring-brand/15"
          }`}
          {...inputProps}
        />
        <span
          className={`pointer-events-none absolute inset-y-0 left-3.5 flex items-center transition-colors ${
            invalid ? "text-danger" : "text-muted peer-focus:text-brand"
          }`}
        >
          {icon}
        </span>
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-5 text-danger motion-safe:animate-fade-down">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {footer}
    </div>
  );
}

function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="text-center motion-safe:animate-fade-up" role="status">
      <div className="relative mx-auto w-fit">
        <span className="relative grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
          <MailIcon className="size-7" />
        </span>
      </div>
      <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-ink">Check your inbox</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        We sent a confirmation link to
        <br />
        <span className="font-medium break-all text-ink">{email}</span>
      </p>
      <ol className="mt-7 space-y-3 rounded-xl border border-line bg-subtle p-4 text-left text-[13px] text-muted">
        {[
          `Open the email from ${APP_NAME}.`,
          "Click the confirmation link. It signs you in.",
          "Can't find it? Check your spam or promotions folder.",
        ].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onBack}
        className="mt-7 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-4" />
        Back to sign in
      </button>
    </div>
  );
}
