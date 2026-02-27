'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const NDA_TEXT = `CONFIDENTIAL BETA TESTING AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into by and between Statix ("Company") and the undersigned beta tester ("Tester").

1. CONFIDENTIALITY
Tester agrees that all information regarding the Statix platform, including but not limited to its features, functionality, trading mechanics, user interface, and any proprietary technology, constitutes confidential information.

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

  const inputClass = "w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition [color-scheme:dark]";

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-3">Check Your Email</h2>
          <p className="text-muted-foreground text-sm mb-6">
            We sent a confirmation link to <span className="text-foreground font-medium">{email}</span>.
            Click the link to activate your account.
          </p>
          <Link href="/login" className="text-sm text-primary hover:text-primary/80 font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="p-8 border-b border-border text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
            <span className="text-white font-bold text-lg">SX</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {step === 'info' ? 'Create your Statix account' : 'Review & Accept NDA'}
          </h1>
        </div>

        {/* Step indicator */}
        <div className="px-8 pt-4 flex items-center gap-2">
          <div className="flex-1 h-0.5 rounded bg-primary" />
          <div className={`flex-1 h-0.5 rounded ${step === 'nda' ? 'bg-primary' : 'bg-secondary'}`} />
        </div>
        <div className="px-8 pt-1.5 pb-2 flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
          <span>Account Info</span>
          <span>NDA Agreement</span>
        </div>

        {error && (
          <div className="mx-8 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        {step === 'info' ? (
          <form onSubmit={handleInfoSubmit} className="p-8 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Legal First Name</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} placeholder="John" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Legal Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Date of Birth</label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required max={new Date().toISOString().split('T')[0]} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className={inputClass} placeholder="your_username" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputClass} placeholder="At least 6 characters" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={inputClass} placeholder="Re-enter password" />
            </div>

            <button type="submit" className="w-full py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:from-primary-600 hover:to-accent hover:glow-primary hover:scale-[1.02] active:scale-[0.98] transition">
              Continue to NDA
            </button>

            <p className="text-center text-muted-foreground text-sm">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium">Log in</Link>
            </p>
          </form>
        ) : (
          <div className="p-8 space-y-4">
            <div className="bg-secondary/50 border border-border rounded-xl p-4 max-h-64 overflow-y-auto text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
              {NDA_TEXT}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ndaAccepted}
                onChange={(e) => setNdaAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border bg-input/30 text-primary focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">
                I have read and agree to the terms of this Non-Disclosure Agreement.
                I understand that this is a beta testing platform using simulated currency.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('info'); setError(''); }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border transition"
              >
                Back
              </button>
              <button
                onClick={handleSignup}
                disabled={!ndaAccepted || loading}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:from-primary-600 hover:to-accent hover:glow-primary hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:glow-none transition"
              >
                {loading ? 'Creating...' : 'Sign Up'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
