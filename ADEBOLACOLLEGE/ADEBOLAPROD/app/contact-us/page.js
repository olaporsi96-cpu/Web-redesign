'use client';

import { useEffect, useState } from 'react';

const CONTACT_EMAIL = 'contactus@adebolacollege.org';
const MAX_MESSAGE_WORDS = 400;

function createChallenge() {
  const first = Math.floor(Math.random() * 9) + 1;
  const second = Math.floor(Math.random() * 9) + 1;
  return { first, second, answer: first + second };
}

function countWords(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '', captcha: '' });
  const [challenge, setChallenge] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [mailLink, setMailLink] = useState('');

  useEffect(() => {
    setChallenge(createChallenge());
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setNotice({ type: '', text: '' });
    setMailLink('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedMessage = form.message.trim();

    if (!trimmedName) nextErrors.name = 'Enter your name.';
    if (!trimmedEmail) {
      nextErrors.email = 'Enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!trimmedMessage) {
      nextErrors.message = 'Enter a message.';
    } else if (countWords(trimmedMessage) > MAX_MESSAGE_WORDS) {
      nextErrors.message = `Your message must be ${MAX_MESSAGE_WORDS} words or fewer.`;
    }
    if (!challenge || form.captcha.trim() === '' || Number(form.captcha) !== challenge.answer) {
      nextErrors.captcha = 'The answer does not match the arithmetic question.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice({ type: 'error', text: 'Please correct the highlighted fields.' });
      if (challenge && Number(form.captcha) !== challenge.answer) {
        setChallenge(createChallenge());
        setForm((current) => ({ ...current, captcha: '' }));
      }
      setMailLink('');
      return;
    }

    const subject = `Website enquiry from ${trimmedName}`;
    const body = `Name: ${trimmedName}\nEmail: ${trimmedEmail}\n\n${trimmedMessage}`;
    setMailLink(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    setNotice({
      type: 'success',
      text: 'Validation passed. Your message has not been sent. Use the link below to open your email application and send it.',
    });
    setChallenge(createChallenge());
    setForm((current) => ({ ...current, captcha: '' }));
  };

  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Contact Us</span>
            <h1>We’re here to help you connect.</h1>
            <p>Contact Adebola College for admissions, family, academic, and E-Learning enquiries.</p>
          </div>
          <div className="hero-statement">
            <span className="hero-statement-mark" aria-hidden="true">Il</span>
            <p>51 Gaa Akanbi Road<br />Ilorin, Kwara State</p>
            <span className="hero-statement-caption">Address listed in the supplied school information</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container contact-grid">
          <div className="contact-information">
            <div className="contact-card">
              <span className="eyebrow">Visit or write</span>
              <h2>Contact information</h2>
              <address>
                Adebola College<br />
                #51 Gaa Akanbi Road<br />
                Ilorin, Kwara State
              </address>
              <a
                className="text-link"
                href="https://www.google.com/maps/search/?api=1&query=%2351+Gaa+Akanbi+Road+Ilorin+Kwara+State"
                target="_blank"
                rel="noreferrer"
              >
                Find the address on a map <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="contact-card contact-card-emphasis">
              <span className="eyebrow eyebrow-light">Email the College</span>
              <h2>Contact enquiries</h2>
              <a className="contact-email" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <p>This email address was confirmed in the client’s project instructions.</p>
            </div>

            <div className="contact-card">
              <span className="eyebrow">Telephone</span>
              <h2>Call the College</h2>
              <p><a className="contact-email" href="tel:+2348035364720">+2348035364720</a></p>
              <p><a className="contact-email" href="tel:+2348033628755">+2348033628755</a></p>
            </div>

            <p className="content-note">
              No office hours or additional telephone details are listed.
            </p>
          </div>

          <div className="form-shell contact-form-shell">
            <span className="eyebrow">Send an enquiry</span>
            <h2>Write to Adebola College</h2>
            <p className="form-intro">
              Complete the form to prepare an email. This website does not send or store your message.
            </p>
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="name">Your name</label>
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                  />
                  {errors.name && <span id="name-error" className="field-error">{errors.name}</span>}
                </div>

                <div className="field full">
                  <label htmlFor="email">Your email address</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                  {errors.email && <span id="email-error" className="field-error">{errors.email}</span>}
                </div>

                <div className="field full">
                  <label htmlFor="message">Message <span className="field-hint">(maximum 400 words)</span></label>
                  <textarea
                    id="message"
                    name="message"
                    rows={6}
                    value={form.message}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby="message-count message-error"
                  />
                  <div className="field-meta">
                    <span id="message-error" className="field-error">{errors.message || ''}</span>
                    <span id="message-count" className="character-count">{countWords(form.message)}/{MAX_MESSAGE_WORDS} words</span>
                  </div>
                </div>

                <div className="field captcha-field">
                  <label htmlFor="captcha">
                    {challenge ? `What is ${challenge.first} + ${challenge.second}?` : 'Loading arithmetic question…'}
                  </label>
                  <input
                    id="captcha"
                    name="captcha"
                    type="number"
                    inputMode="numeric"
                    required
                    value={form.captcha}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.captcha)}
                    aria-describedby={errors.captcha ? 'captcha-error' : undefined}
                  />
                  {errors.captcha && <span id="captcha-error" className="field-error">{errors.captcha}</span>}
                </div>
              </div>

              <button type="submit" className="btn btn-primary form-submit">Prepare email</button>

              {notice.text && (
                <div className={`notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite">
                  {notice.text}
                </div>
              )}
              {mailLink && (
                <a className="btn btn-outline mailto-action" href={mailLink}>
                  Open email application
                </a>
              )}
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
