'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInStudent } from './actions';
import '../results/results.css';

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('error');
    if (status === 'inactive') {
      setError('This student account is archived or inactive. Ask the school administrator to restore it if access is needed.');
    } else if (status === 'unauthorized') {
      setError('This account does not have student portal access.');
    }
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const requestedNext = new URLSearchParams(window.location.search).get('next');
      const response = await signInStudent(email, password, requestedNext);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      router.push(response.next);
      router.refresh();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="student-login-page">
      <div className="student-login-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={88} height={90} />
        <h1>Student portal</h1>
        <p>Sign in with your student account to view released examination results.</p>
        <form className="student-login-current student-auth-form" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="admin-auth-error" role="alert">{error}</p>}
          <button type="submit" className="result-button result-button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <Link className="student-login-return" href="/">Return to the public website</Link>
      </div>
    </section>
  );
}
