import { useState } from "react";

type LoginPageProps = {
  onLoginSuccess?: (name: string) => void;
};

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register" | "success">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successTitle, setSuccessTitle] = useState("");
  const [successSub, setSuccessSub] = useState("");

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function getStrength(password: string) {
    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    const colors = ["", "#E24B4A", "#EF9F27", "#EF9F27", "#1D9E75"];

    return {
      score,
      label: labels[score],
      color: colors[score],
    };
  }

  const strength = getStrength(registerPassword);

  function showSuccess(title: string, sub: string) {
    setSuccessTitle(title);
    setSuccessSub(sub);
    setActiveTab("success");
  }

  function resetToLogin() {
    setLoginEmail("");
    setLoginPassword("");
    setRegisterName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setConfirmPassword("");
    setErrors({});
    setActiveTab("login");
  }

  async function submitLogin() {
    const nextErrors: Record<string, string> = {};

    if (!isValidEmail(loginEmail)) {
      nextErrors.loginEmail = "Please enter a valid email address.";
    }

    if (!loginPassword) {
      nextErrors.loginPassword = "Password is required.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setLoginLoading(true);

    try {
      /*
      Replace this temporary success with your real backend call later:

      const response = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors({ loginPassword: data.error || "Login failed." });
        return;
      }

      localStorage.setItem("canvasplus_token", data.token);
      */

      setTimeout(() => {
  setLoginLoading(false);

  const displayName =
    loginEmail.split("@")[0].charAt(0).toUpperCase() +
    loginEmail.split("@")[0].slice(1);

  showSuccess("You're in!", `Welcome back, ${displayName}.`);

  if (onLoginSuccess) {
    setTimeout(() => {
      onLoginSuccess(displayName);
    }, 900);
  }
}, 1200);
    } catch {
      setErrors({ loginPassword: "Network error. Make sure the backend is running." });
      setLoginLoading(false);
    }
  }

  async function submitRegister() {
    const nextErrors: Record<string, string> = {};

    if (!registerName.trim()) {
      nextErrors.registerName = "Name is required.";
    }

    if (!isValidEmail(registerEmail)) {
      nextErrors.registerEmail = "Please enter a valid email address.";
    }

    if (registerPassword.length < 8) {
      nextErrors.registerPassword = "Password must be at least 8 characters.";
    }

    if (confirmPassword !== registerPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setRegisterLoading(true);

    try {
      /*
      Replace this temporary success with your real backend call later:

      const response = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors({ registerEmail: data.error || "Registration failed." });
        return;
      }
      */

      setTimeout(() => {
        setRegisterLoading(false);
        showSuccess(
          "Account created!",
          `Welcome, ${registerName.split(" ")[0]}. Check your email to verify.`
        );
      }, 1400);
    } catch {
      setErrors({ registerEmail: "Network error. Make sure the backend is running." });
      setRegisterLoading(false);
    }
  }

  const fieldClass = (errorKey: string) =>
    `mb-4 ${errors[errorKey] ? "text-[#E24B4A]" : ""}`;

  const inputClass = (errorKey: string) =>
    `w-full py-[9px] pr-10 pl-9 text-sm border rounded-lg outline-none text-[#111827] bg-white transition-colors ${
      errors[errorKey]
        ? "border-[#E24B4A] focus:border-[#E24B4A]"
        : "border-[#d1d5db] focus:border-[#1D9E75]"
    }`;

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-8 font-sans">
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 w-full max-w-[400px]">
        {activeTab !== "success" && (
          <div className="flex border border-[#e5e7eb] rounded-lg overflow-hidden mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab("login");
                setErrors({});
              }}
              className={`flex-1 py-[10px] text-sm font-medium border-0 cursor-pointer transition-colors ${
                activeTab === "login"
                  ? "bg-[#f3f4f6] text-[#111827]"
                  : "bg-transparent text-[#6b7280]"
              }`}
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("register");
                setErrors({});
              }}
              className={`flex-1 py-[10px] text-sm font-medium border-0 cursor-pointer transition-colors ${
                activeTab === "register"
                  ? "bg-[#f3f4f6] text-[#111827]"
                  : "bg-transparent text-[#6b7280]"
              }`}
            >
              Create account
            </button>
          </div>
        )}

        {activeTab === "login" && (
          <div>
            <div className={fieldClass("loginEmail")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  ✉
                </span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={inputClass("loginEmail")}
                />
              </div>
              {errors.loginEmail && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.loginEmail}
                </div>
              )}
            </div>

            <div className={fieldClass("loginPassword")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  🔒
                </span>
                <input
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Your password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={inputClass("loginPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-[10px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[#9ca3af] text-[15px]"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? "🙈" : "👁"}
                </button>
              </div>
              {errors.loginPassword && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.loginPassword}
                </div>
              )}
            </div>

            <div className="text-right mb-4">
              <button
                type="button"
                onClick={() => alert("Reset link sent!")}
                className="bg-transparent border-0 text-[13px] text-[#1D9E75] cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="button"
              onClick={submitLogin}
              disabled={loginLoading}
              className="w-full p-[10px] text-sm font-medium rounded-lg bg-[#1D9E75] text-white border-0 cursor-pointer flex items-center justify-center gap-2 mt-1 hover:opacity-90 disabled:opacity-65 disabled:cursor-not-allowed"
            >
              {loginLoading && (
                <span className="w-[15px] h-[15px] border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              <span>{loginLoading ? "Please wait…" : "Sign in"}</span>
            </button>

            <div className="text-center text-[13px] text-[#6b7280] mt-4">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("register");
                  setErrors({});
                }}
                className="bg-transparent border-0 text-[#1D9E75] text-[13px] font-medium cursor-pointer p-0"
              >
                Create one
              </button>
            </div>
          </div>
        )}

        {activeTab === "register" && (
          <div>
            <div className={fieldClass("registerName")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Full name
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  👤
                </span>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  autoComplete="name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  className={inputClass("registerName")}
                />
              </div>
              {errors.registerName && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.registerName}
                </div>
              )}
            </div>

            <div className={fieldClass("registerEmail")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  ✉
                </span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className={inputClass("registerEmail")}
                />
              </div>
              {errors.registerEmail && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.registerEmail}
                </div>
              )}
            </div>

            <div className={fieldClass("registerPassword")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  🔒
                </span>
                <input
                  type={showRegisterPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className={inputClass("registerPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  className="absolute right-[10px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[#9ca3af] text-[15px]"
                  aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                >
                  {showRegisterPassword ? "🙈" : "👁"}
                </button>
              </div>

              <div className="h-[3px] bg-[#e5e7eb] rounded-sm mt-[6px] overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: registerPassword ? `${strength.score * 25}%` : "0%",
                    background: strength.color,
                  }}
                />
              </div>

              <div
                className="text-[11px] mt-1 min-h-4"
                style={{ color: strength.color || "#9ca3af" }}
              >
                {strength.label}
              </div>

              {errors.registerPassword && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.registerPassword}
                </div>
              )}
            </div>

            <div className={fieldClass("confirmPassword")}>
              <label className="block text-[13px] font-medium text-[#6b7280] mb-[6px]">
                Confirm password
              </label>
              <div className="relative">
                <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">
                  🔒
                </span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-[10px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[#9ca3af] text-[15px]"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? "🙈" : "👁"}
                </button>
              </div>
              {errors.confirmPassword && (
                <div className="text-xs text-[#E24B4A] mt-[5px]">
                  {errors.confirmPassword}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={submitRegister}
              disabled={registerLoading}
              className="w-full p-[10px] text-sm font-medium rounded-lg bg-[#1D9E75] text-white border-0 cursor-pointer flex items-center justify-center gap-2 mt-1 hover:opacity-90 disabled:opacity-65 disabled:cursor-not-allowed"
            >
              {registerLoading && (
                <span className="w-[15px] h-[15px] border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              <span>{registerLoading ? "Please wait…" : "Create account"}</span>
            </button>

            <div className="text-center text-[13px] text-[#6b7280] mt-4">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("login");
                  setErrors({});
                }}
                className="bg-transparent border-0 text-[#1D9E75] text-[13px] font-medium cursor-pointer p-0"
              >
                Sign in
              </button>
            </div>
          </div>
        )}

        {activeTab === "success" && (
          <div className="text-center py-8 px-4">
            <div className="w-[52px] h-[52px] rounded-full bg-[#E1F5EE] mx-auto mb-4 flex items-center justify-center text-[22px] text-[#0F6E56]">
              ✓
            </div>
            <div className="text-base font-medium text-[#111827] mb-[6px]">
              {successTitle}
            </div>
            <div className="text-[13px] text-[#6b7280]">{successSub}</div>
            <button
              type="button"
              onClick={resetToLogin}
              className="mt-6 bg-transparent border border-[#d1d5db] rounded-lg py-2 px-5 text-[13px] cursor-pointer text-[#374151] hover:bg-[#f9fafb]"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}