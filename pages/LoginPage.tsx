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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessage();

    if (isSignup && !isPasswordValid) {
      setMessage('Please meet all password requirements.');
      return;
    }

    setLoading(true);

    const { error } = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (isSignup) {
      setMode('otp');
      setMessage('We sent a 6-digit verification code to your email.');
      return;
    }

    onLogin();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessage();

    if (!isOtpValid) {
      setMessage('Enter the 6-digit code sent to your email.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    onLogin();
  };

  const handleResendOtp = async () => {
    resetMessage();
    setLoading(true);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('A new verification code has been sent.');
  };

  const Requirement = ({ valid, text }: { valid: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`h-1.5 w-1.5 rounded-full ${valid ? 'bg-black' : 'bg-zinc-300'}`} />
      <span className={valid ? 'text-black' : 'text-zinc-500'}>{text}</span>
    </div>
  );

  return (
    <div className="relative w-full max-w-[420px] rounded-[28px] bg-white text-black shadow-2xl">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-black"
        aria-label="Close"
      >
        <svg className="h-5 w-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="p-7">
        <div className="mb-6 pr-10">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.36em] text-zinc-500">
            {isOtp ? 'VERIFY EMAIL' : isSignup ? 'CREATE ACCOUNT' : 'WELCOME BACK'}
          </p>

          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">
            {isOtp ? 'Enter verification code' : isSignup ? 'Sign up to Arbiter' : 'Login to Arbiter'}
          </h2>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {isOtp
              ? `Enter the 6-digit code sent to ${email}.`
              : isSignup
                ? 'Create an account to access the multi-agent reasoning workspace.'
                : 'Access your multi-agent reasoning workspace.'}
          </p>
        </div>

        {!isOtp ? (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Password</label>
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
              />

              {isSignup && (
                <div className="mt-3 grid gap-1.5 rounded-2xl bg-zinc-50 p-3">
                  <Requirement valid={passwordRules.length} text="At least 8 characters" />
                  <Requirement valid={passwordRules.uppercase} text="One uppercase letter" />
                  <Requirement valid={passwordRules.lowercase} text="One lowercase letter" />
                  <Requirement valid={passwordRules.number} text="One number" />
                  <Requirement valid={passwordRules.special} text="One special character" />
                </div>
              )}
            </div>

            {message && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (isSignup && !isPasswordValid)}
              className="w-full rounded-2xl bg-black py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {loading ? 'Please wait...' : isSignup ? 'Create account' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-center text-2xl font-semibold tracking-[0.45em] outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>

            {message && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isOtpValid}
              className="w-full rounded-2xl bg-black py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {loading ? 'Verifying...' : 'Verify account'}
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading}
              className="w-full text-sm font-medium text-zinc-600 transition hover:text-black disabled:opacity-50"
            >
              Resend code
            </button>
          </form>
        )}

        {!isOtp ? (
          <div className="mt-7 text-center text-sm text-zinc-500">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'login' : 'signup');
                setMessage('');
              }}
              className="font-semibold text-black hover:underline"
            >
              {isSignup ? 'Login' : 'Sign up now'}
            </button>
          </div>
        ) : (
          <div className="mt-7 text-center text-sm text-zinc-500">
            Wrong email?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setOtp('');
                setMessage('');
              }}
              className="font-semibold text-black hover:underline"
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