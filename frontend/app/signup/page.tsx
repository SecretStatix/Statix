'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const NDA_TEXT = `CONFIDENTIAL BETA TESTING AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into by and between Dividend Fantasy ("Company") and the undersigned beta tester ("Tester").

1. CONFIDENTIALITY
Tester agrees that all information regarding the Dividend Fantasy platform, including but not limited to its features, functionality, trading mechanics, user interface, and any proprietary technology, constitutes confidential information.

2. NON-DISCLOSURE
Tester shall not disclose, publish, or otherwise share any confidential information with any third party without prior written consent from the Company.

3. BETA TESTING
Tester acknowledges that this is a beta version of the platform. All currency used within the platform during this testing phase is simulated and holds no real monetary value.

4. FEEDBACK
Tester agrees to provide honest feedback about their experience and any bugs or issues encountered during testing.

5. NO WARRANTY
The platform is provided "as is" without any warranties. The Company is not liable for any losses or damages arising from the use of the beta platform.

6. TERM
This Agreement remains in effect until terminated by either party with written notice.

By checking the box below, you acknowledge that you have read, understood, and agree to be bound by the terms of this Agreement.

[PLACEHOLDER — Final NDA text will be provided]`;

export default function SignupPage() {
  const [step, setStep] = useState<'info' | 'nda'>('info');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Legal first and last name are required');
      return;
    }
    if (!dateOfBirth) {
      setError('Date of birth is required');
      return;
    }
    const age = Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) {
      setError('You must be at least 18 years old');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setStep('nda');
  };

  const handleSignup = async () => {
    if (!ndaAccepted) {
      setError('You must accept the NDA to continue');
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dateOfBirth,
          nda_accepted: true,
          nda_accepted_at: new Date().toISOString(),
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user && !data.session) {
      setSuccess(true);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="text-2xl font-bold mb-4">Check Your Email</h2>
          <p className="text-gray-400 mb-6">
            We sent a confirmation link to <span className="text-white font-medium">{email}</span>. 
            Click the link to activate your account.
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
        {/* Header */}
        <div className="p-6 border-b border-gray-700 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">
            Dividend Fantasy
          </h1>
          <p className="text-gray-400 mt-2">
            {step === 'info' ? 'Create your account' : 'Review & Accept NDA'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-3">
          <div className={`flex-1 h-1 rounded ${step === 'info' ? 'bg-orange-500' : 'bg-orange-500'}`} />
          <div className={`flex-1 h-1 rounded ${step === 'nda' ? 'bg-orange-500' : 'bg-gray-700'}`} />
        </div>
        <div className="px-6 pt-1 pb-2 flex justify-between text-xs text-gray-500">
          <span>Account Info</span>
          <span>NDA Agreement</span>
        </div>

        {error && (
          <div className="mx-6 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {step === 'info' ? (
          <form onSubmit={handleInfoSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Legal First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Legal Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="your_username"
              />
            </div>
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Re-enter password"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition"
            >
              Continue to NDA
            </button>

            <p className="text-center text-gray-400 text-sm">
              Already have an account?{' '}
              <Link href="/login" className="text-orange-400 hover:text-orange-300">
                Log in
              </Link>
            </p>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            {/* NDA text */}
            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">
              {NDA_TEXT}
            </div>

            {/* Accept checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ndaAccepted}
                onChange={(e) => setNdaAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-300">
                I have read and agree to the terms of this Non-Disclosure Agreement. 
                I understand that this is a beta testing platform using simulated currency.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('info'); setError(''); }}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition"
              >
                Back
              </button>
              <button
                onClick={handleSignup}
                disabled={!ndaAccepted || loading}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
              >
                {loading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
