'use client';

import { useAuth } from '@/lib/AuthContext';

export default function PendingApprovalPage() {
  const { user, signOut } = useAuth();
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'there';

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-2xl font-bold mb-3">Account Pending Review</h1>
        <p className="text-gray-400 mb-6 leading-relaxed">
          Hey {username}, thanks for signing up! Your account is currently being reviewed. 
          You&apos;ll get access once an admin approves your account.
        </p>
        <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-400">Signed up as</p>
          <p className="text-white font-medium">{user?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-500 hover:text-white transition px-4 py-2 rounded-lg hover:bg-gray-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
