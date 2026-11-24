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
  0: { label: "Too short", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  1: { label: "Weak", bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  2: { label: "Fair", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-300" },
  3: { label: "Good", bar: "bg-lime-500", text: "text-lime-600 dark:text-lime-400" },
  4: { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
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
  initialError?: string;
  initialMode: AuthMode;
}) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    authenticate,
    initialError
      ? { status: "error", title: "We couldn't confirm your email", message: initialError }
      : { status: "idle" },
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
        <h1 key={mode} className="text-[26px] font-semibold tracking-tight text-zinc-900 motion-safe:animate-fade-in dark:text-white">
          {t.title}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
      </div>

      <ModeSwitch mode={mode} onChange={switchMode} />

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
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
              className="grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:hover:bg-white/10 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOffIcon className="size-[18px]" /> : <EyeIcon className="size-[18px]" />}
            </button>
          }
          footer={
            <>
              {capsLock && (
                <p className="flex items-center gap-1.5 text-[13px] text-amber-600 motion-safe:animate-fade-down dark:text-amber-400">
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
                          score >= step ? strength.bar : "bg-zinc-200 dark:bg-white/10"
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
            className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 motion-safe:animate-fade-down dark:border-rose-400/20 dark:bg-rose-500/10"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              <AlertIcon className="size-[18px]" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-rose-900 dark:text-rose-100">{serverError.title}</p>
              <p className="mt-0.5 text-rose-700 dark:text-rose-200/80">{serverError.message}</p>
              {suggestion && (
                <button
                  type="button"
                  onClick={() => switchMode(suggestion)}
                  className="mt-2 inline-flex items-center gap-1 font-medium text-rose-900 underline decoration-rose-300 underline-offset-4 hover:decoration-rose-900 dark:text-rose-100 dark:decoration-rose-400/50 dark:hover:decoration-rose-100"
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
          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-[15px] font-semibold text-white shadow-lg ring-1 shadow-violet-600/30 ring-white/10 transition-all ring-inset hover:shadow-xl hover:shadow-violet-600/40 hover:brightness-110 focus-visible:ring-4 focus-visible:ring-violet-500/40 focus-visible:outline-none active:scale-[0.985] disabled:cursor-wait disabled:brightness-95"
        >
          {/* Light sweep on hover. */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 -left-full w-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-[left] duration-700 ease-out group-hover:left-full"
          />
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

      <p className="mt-7 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t.switchPrompt}{" "}
        <button
          type="button"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
          className="rounded font-semibold text-indigo-600 underline-offset-4 hover:text-indigo-500 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-indigo-300 dark:hover:text-indigo-200"
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
      className="relative mt-7 grid grid-cols-2 rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 dark:border-white/10 dark:bg-white/[0.04]"
    >
      {/* Sliding highlight behind the active option. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-zinc-900/5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-white/10 dark:ring-white/10 ${
          mode === "signup" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 h-9 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
            mode === option.value
              ? "text-zinc-900 dark:text-white"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
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
      <label htmlFor={id} className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={error ? errorId : undefined}
          className={`auth-input peer h-12 w-full rounded-xl border bg-white/70 pl-11 text-[15px] text-zinc-900 shadow-xs transition outline-none placeholder:text-zinc-400 focus:bg-white focus:ring-4 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-zinc-500 dark:focus:bg-white/[0.07] ${
            trailing ? "pr-12" : "pr-4"
          } ${
            invalid
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15 dark:border-rose-400/70 dark:focus:border-rose-400 dark:focus:ring-rose-400/15"
              : "border-zinc-200 hover:border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500/15 dark:border-white/10 dark:hover:border-white/20 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20"
          }`}
          {...inputProps}
        />
        <span
          className={`pointer-events-none absolute inset-y-0 left-3.5 flex items-center transition-colors ${
            invalid ? "text-rose-500 dark:text-rose-400" : "text-zinc-400 peer-focus:text-indigo-500 dark:peer-focus:text-indigo-300"
          }`}
        >
          {icon}
        </span>
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-5 text-rose-600 motion-safe:animate-fade-down dark:text-rose-400">
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
        <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-violet-500/40 blur-xl" />
        <span className="relative grid size-16 place-items-center rounded-2xl bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg ring-1 ring-white/20">
          <MailIcon className="size-7" />
        </span>
      </div>
      <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-white">Check your inbox</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        We sent a confirmation link to
        <br />
        <span className="font-medium break-all text-zinc-900 dark:text-white">{email}</span>
      </p>
      <ol className="mt-7 space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 text-left text-[13px] text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
        {[
          `Open the email from ${APP_NAME}.`,
          "Click the confirmation link. It signs you in.",
          "Can't find it? Check your spam or promotions folder.",
        ].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onBack}
        className="mt-7 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-4" />
        Back to sign in
      </button>
    </div>
  );
}
