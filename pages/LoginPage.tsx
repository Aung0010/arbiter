import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LoginPageProps {
  onLogin: () => void;
  onClose: () => void;
}

type Mode = 'login' | 'signup' | 'otp';

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onClose }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const isSignup = mode === 'signup';
  const isOtp = mode === 'otp';

  const passwordRules = useMemo(
    () => ({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    }),
    [password]
  );

  const isPasswordValid = Object.values(passwordRules).every(Boolean);
  const isOtpValid = /^\d{6}$/.test(otp);

  const resetMessage = () => setMessage('');

  const isAlreadyRegisteredError = (errorMessage?: string) => {
    if (!errorMessage) return false;
    const normalizedMessage = errorMessage.toLowerCase();
    return (
      normalizedMessage.includes('already registered') ||
      normalizedMessage.includes('already exists') ||
      normalizedMessage.includes('user already') ||
      normalizedMessage.includes('email already')
    );
  };

  const showAlreadySignedUpMessage = () => {
    setMode('login');
    setOtp('');
    setMessage('You have already signed up. Please login.');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessage();

    if (isSignup && !isPasswordValid) {
      setMessage('Please meet all password requirements.');
      return;
    }

    setLoading(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);

      if (error) {
        if (isAlreadyRegisteredError(error.message)) { showAlreadySignedUpMessage(); return; }
        setMessage(error.message);
        return;
      }

      const identities = data.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        showAlreadySignedUpMessage();
        return;
      }

      setMode('otp');
      setMessage('We sent a 6-digit verification code to your email.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) { setMessage(error.message); return; }
    onLogin();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessage();

    if (!isOtpValid) { setMessage('Enter the 6-digit code sent to your email.'); return; }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' });
    setLoading(false);

    if (error) { setMessage(error.message); return; }
    onLogin();
  };

  const handleResendOtp = async () => {
    resetMessage();
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);

    if (error) {
      if (isAlreadyRegisteredError(error.message)) { showAlreadySignedUpMessage(); return; }
      setMessage(error.message);
      return;
    }
    setMessage('A new verification code has been sent.');
  };

  // Password requirement row
  const Requirement = ({ valid, text }: { valid: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className="h-1.5 w-1.5 rounded-pill flex-shrink-0 transition-colors"
        style={{ background: valid ? 'var(--c-ink)' : 'var(--c-hairline-strong)' }}
      />
      <span style={{ color: valid ? 'var(--c-ink)' : 'var(--c-muted)' }}>{text}</span>
    </div>
  );

  return (
    /* surface-card, hairline border, rounded-lg (12px) — no huge radius */
    <div className="relative w-full max-w-[420px] rounded-lg border border-hairline bg-surface-card">

      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-canvas-soft hover:text-ink"
        aria-label="Close"
      >
        <svg className="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="p-6">
        {/* Eyebrow + headline */}
        <div className="mb-6 pr-8">
          {/* caption-uppercase */}
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">
            {isOtp ? 'Verify Email' : isSignup ? 'Create Account' : 'Welcome Back'}
          </p>

          {/* display-md: 26px / 400 / -0.325px tracking */}
          <h2 className="text-[26px] font-normal leading-[1.25] tracking-[-0.0125em] text-ink">
            {isOtp ? 'Enter verification code' : isSignup ? 'Sign up to Arbiter' : 'Login to Arbiter'}
          </h2>

          {/* body-sm */}
          <p className="mt-2.5 text-[14px] leading-[1.5] text-body">
            {isOtp
              ? `Enter the 6-digit code sent to ${email}.`
              : isSignup
                ? 'Create an account to access the multi-agent reasoning workspace.'
                : 'Access your multi-agent reasoning workspace.'}
          </p>
        </div>

        {!isOtp ? (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Email</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setMessage(''); }}
                className="w-full rounded-md border border-hairline bg-surface-card px-4 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-muted-soft focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Password</label>
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setMessage(''); }}
                className="w-full rounded-md border border-hairline bg-surface-card px-4 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-muted-soft focus:border-primary focus:ring-2 focus:ring-primary/10"
              />

              {isSignup && (
                <div className="mt-3 grid gap-1.5 rounded-md bg-canvas-soft border border-hairline p-3">
                  <Requirement valid={passwordRules.length} text="At least 8 characters" />
                  <Requirement valid={passwordRules.uppercase} text="One uppercase letter" />
                  <Requirement valid={passwordRules.lowercase} text="One lowercase letter" />
                  <Requirement valid={passwordRules.number} text="One number" />
                  <Requirement valid={passwordRules.special} text="One special character" />
                </div>
              )}
            </div>

            {/* Status message */}
            {message && (
              <div
                className={`rounded-md border px-4 py-3 text-[14px] ${
                  message === 'You have already signed up. Please login.'
                    ? 'border-hairline bg-canvas-soft text-body'
                    : 'border-semantic-error/30 bg-semantic-error/8 text-semantic-error'
                }`}
              >
                {message}
              </div>
            )}

            {/* Submit — button-primary: Cursor Orange, rounded-md */}
            <button
              type="submit"
              disabled={loading || (isSignup && !isPasswordValid)}
              className="w-full rounded-md bg-primary hover:bg-primary-active py-2.5 text-[14px] font-medium text-on-primary transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setMessage(''); }}
                className="w-full rounded-md border border-hairline bg-surface-card px-4 py-2.5 text-center text-[24px] font-semibold tracking-[0.45em] text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono"
              />
            </div>

            {message && (
              <div className="rounded-md border border-hairline bg-canvas-soft px-4 py-3 text-[14px] text-body">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isOtpValid}
              className="w-full rounded-md bg-primary hover:bg-primary-active py-2.5 text-[14px] font-medium text-on-primary transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify account'}
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading}
              className="w-full text-[14px] font-medium text-body hover:text-ink transition disabled:opacity-50"
            >
              Resend code
            </button>
          </form>
        )}

        {/* Mode toggle */}
        {!isOtp ? (
          <div className="mt-6 text-center text-[14px] text-body">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setMode(isSignup ? 'login' : 'signup'); setMessage(''); setOtp(''); }}
              className="font-semibold text-primary hover:text-primary-active transition-colors"
            >
              {isSignup ? 'Login' : 'Sign up now'}
            </button>
          </div>
        ) : (
          <div className="mt-6 text-center text-[14px] text-body">
            Wrong email?{' '}
            <button
              type="button"
              onClick={() => { setMode('signup'); setOtp(''); setMessage(''); }}
              className="font-semibold text-primary hover:text-primary-active transition-colors"
            >
              Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default LoginPage;