'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="text-2xl font-bold mb-4">Check Your Email</h2>
          <p className="text-gray-400 mb-6">
            We sent a password reset link to <span className="text-white font-medium">{email}</span>.
            Click the link in the email to set a new password.
          </p>
          <Link
            href="/login"
            className="text-orange-400 hover:text-orange-300 font-medium"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-700 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">
            Dividend Fantasy
          </h1>
          <p className="text-gray-400 mt-2">Reset your password</p>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-400">
            Enter the email address you signed up with and we&apos;ll send you a link to reset your password.
          </p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded-lg font-semibold transition"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <p className="text-center text-gray-400 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-orange-400 hover:text-orange-300">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
