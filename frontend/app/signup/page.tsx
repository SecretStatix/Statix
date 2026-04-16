'use client';

import { useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const NDA_TEXT = `NON-DISCLOSURE AND NON-COMPETE AGREEMENT

This Non-Disclosure and Non-Compete Agreement (the "Agreement") is entered into as of the date the Tester accepts these terms (the "Effective Date"), between Statix (the "Company") and the individual accepting this Agreement (the "Tester").

1. Confidential Information
"Confidential Information" means any non-public information about the Company's platform, business, or technology disclosed to or observed by the Tester, including but not limited to:
  - Platform mechanics, including the automated market maker trading model, dividend distribution model, and fantasy scoring methodology;
  - User interface, user experience, designs, screens, and visual elements;
  - Smart contract architecture, code, and deployment details on Base (Ethereum L2);
  - Business model, monetization strategy, roadmap, and any proprietary technology or know-how;
  - The existence, scope, and participants of the closed beta itself;
  - The core concept of trading shares of NBA players via an AMM with dividend payouts based on real player statistics.

2. Acknowledgment of Novelty
The Tester acknowledges that the concept, mechanics, and implementation of Statix — including the combination of AMM-based trading of NBA player shares with dividend payouts driven by real-world performance statistics — are original to and proprietary to the Company. The Tester agrees not to dispute the Company's authorship or ownership of these ideas.

3. Non-Disclosure
The Tester shall not share, describe, screenshot, screen-record, post, publish, or otherwise disclose any Confidential Information to any person who is not a confirmed participant in the closed beta. This restriction applies to all channels, including social media, group chats, blogs, podcasts, public or private messages, and in-person conversations. The Tester shall use Confidential Information solely for the purpose of testing and providing feedback to the Company.

4. Non-Compete and Non-Use
For a period of one (1) year following the end of the Tester's beta access, the Tester shall not, directly or indirectly, use any Confidential Information to build, develop, launch, advise, consult for, employ, or invest in any product, service, or venture that competes with Statix — including any platform involving tokenized or share-based trading of athletes with performance-linked payouts.

5. No Reverse Engineering
The Tester shall not attempt to reverse-engineer, decompile, disassemble, fork, copy, or derive the source code, smart contracts, algorithms, data models, or platform architecture of Statix, whether by inspecting on-chain data, intercepting network traffic, or any other means.

6. Beta Disclaimer
The Tester understands that the beta uses simulated currency ("DBucks"), which has no real-world monetary value and cannot be redeemed for cash, cryptocurrency, or anything of value. The platform is provided "as is" for testing purposes only, with no warranties or guarantees of any kind. Nothing in the beta constitutes a security, investment, or financial product.

7. Feedback Ownership
Any feedback, suggestions, ideas, bug reports, or improvements the Tester provides to the Company in connection with the beta ("Feedback") shall become the sole property of the Company. The Tester hereby assigns all right, title, and interest in such Feedback to the Company, with no obligation of compensation or attribution.

8. Remedies
The Tester acknowledges that any breach of this Agreement may cause irreparable harm to the Company for which monetary damages alone would be inadequate. Accordingly, the Company shall be entitled to seek injunctive relief and specific performance, in addition to any other remedies available at law or in equity, including monetary damages and recovery of reasonable legal fees.

9. Term
This Agreement takes effect on the Effective Date, and the obligations herein — particularly those of confidentiality, non-use, non-compete, and no reverse engineering — shall survive for one (1) year after the Tester's beta access ends.

10. Governing Law
This Agreement is governed by the laws of the Province of British Columbia and the federal laws of Canada applicable therein. The parties consent to the exclusive jurisdiction of the courts located in British Columbia.

11. Entire Agreement
This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes any prior discussions or understandings. It may only be modified in writing signed by the Company. If any provision is held unenforceable, the remainder shall remain in full force.

By checking the box below, you acknowledge that you have read, understood, and agree to be bound by the terms of this Agreement.`;

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
        <div className="p-4 sm:p-8 border-b border-border text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <Image src="/logo.png" alt="Statix" width={32} height={32} className="rounded-lg" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {step === 'info' ? 'Create your Statix account' : 'Review & Accept NDA'}
          </h1>
        </div>

        {/* Step indicator */}
        <div className="px-4 sm:px-8 pt-4 flex items-center gap-2">
          <div className="flex-1 h-0.5 rounded bg-primary" />
          <div className={`flex-1 h-0.5 rounded ${step === 'nda' ? 'bg-primary' : 'bg-secondary'}`} />
        </div>
        <div className="px-4 sm:px-8 pt-1.5 pb-2 flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
          <span>Account Info</span>
          <span>NDA Agreement</span>
        </div>

        {error && (
          <div className="mx-4 sm:mx-8 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        {step === 'info' ? (
          <form onSubmit={handleInfoSubmit} className="p-4 sm:p-8 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="p-4 sm:p-8 space-y-4">
            <div className="bg-secondary/50 border border-border rounded-xl p-5 max-h-72 overflow-y-auto text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
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
