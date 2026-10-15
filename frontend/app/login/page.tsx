import { redirect } from 'next/navigation';

// Accounts are closed while Statix pursues regulatory approval; send visitors to the waitlist.
export default function LoginPage() {
  redirect('/signup');
}
