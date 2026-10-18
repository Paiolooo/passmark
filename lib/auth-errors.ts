// Turns Supabase Auth errors into plain-language messages.

export type AuthMode = "signup" | "login";

export const MIN_PASSWORD_LENGTH = 6;

export const NETWORK_ERROR =
  "We couldn't reach the server. Check your internet connection and try again.";

/** Checks the form before anything is sent. Returns an error message or null. */
export function validateCredentials(
  email: string,
  password: string,
  mode: AuthMode,
): string | null {
  const e = email.trim();
  if (!e) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return "Enter a valid email address, like name@example.com.";
  }
  if (!password) return "Enter your password.";
  if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
    return `Your password is too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
};

export function friendlyAuthError(error: AuthErrorLike, mode: AuthMode): string {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (
    error.name === "AuthRetryableFetchError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  ) {
    return NETWORK_ERROR;
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Wrong email or password. Check them and try again.";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered")
  ) {
    return "This email is already registered. Log in instead.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return `Your password is too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (
    code === "email_address_invalid" ||
    message.includes("invalid format") ||
    message.includes("valid email")
  ) {
    return "Enter a valid email address, like name@example.com.";
  }
  if (code === "email_not_confirmed") {
    return "Your email isn't confirmed yet. Check your inbox for the confirmation link.";
  }
  if (code.startsWith("over_") || error.status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (code === "signup_disabled") {
    return "New sign-ups are closed right now.";
  }
  const fallback =
    mode === "signup" ? "We couldn't create your account." : "We couldn't log you in.";
  return error.message ? `${fallback} ${error.message}` : `${fallback} Please try again.`;
}
