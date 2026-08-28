import { redirect } from 'next/navigation';

// Middleware sends signed-in users to /upcoming and everyone else to /login;
// this only catches the case where middleware is bypassed.
export default function RootPage() {
  redirect('/login');
}
