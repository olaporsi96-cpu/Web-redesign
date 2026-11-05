'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import ThemeToggle from './theme-toggle';

const navGroups = [
  { label: 'Home', href: '/' },
  {
    label: 'About Us',
    href: '/about-us',
    links: [
      { label: 'Mission & Vision', href: '/about-us#mission' },
      { label: 'Employment', href: '/about-us#employment' },
      { label: 'Facilities', href: '/about-us#facilities' },
    ],
  },
  {
    label: 'Admissions',
    href: '/admissions',
    links: [
      { label: 'How to Apply', href: '/admissions#process' },
      { label: 'Requirements', href: '/admissions#requirements' },
      { label: 'FAQs', href: '/admissions#faq' },
    ],
  },
  {
    label: 'Academics',
    href: '/academics',
    links: [
      { label: 'JSS', href: '/academics#jss' },
      { label: 'SSS', href: '/academics#sss' },
      { label: 'Resources', href: '/academics#resources' },
    ],
  },
  {
    label: 'Student Life',
    href: '/student-life',
    links: [
      { label: 'Activities', href: '/student-life#activities' },
      { label: 'Sports', href: '/student-life#sports' },
      { label: 'Calendar', href: '/student-life#calendar' },
    ],
  },
  {
    label: 'Families',
    href: '/families',
    links: [
      { label: 'Parent Resources', href: '/families#resources' },
      { label: 'Communication', href: '/families#communication' },
      { label: 'Support', href: '/families#support' },
    ],
  },
  {
    label: 'E-Learning',
    href: '/e-learning',
    links: [
      { label: 'Learning Platform', href: '/e-learning#platform' },
      { label: 'Courses', href: '/e-learning#courses' },
      { label: 'Support', href: '/e-learning#support' },
    ],
  },
  { label: 'Contact Us', href: '/contact-us' },
];

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <header className="site-header">
      <div className="container nav-row">
        <Link href="/" className="brand" aria-label="Adebola College home" onClick={closeMobileMenu}>
          <span className="brand-mark">
            <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College logo" width={44} height={45} />
          </span>
          <span className="brand-copy">
            <strong>Adebola</strong>
            <span>College</span>
          </span>
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span aria-hidden="true">{mobileOpen ? '×' : '☰'}</span>
        </button>

        <nav
          id="primary-navigation"
          className={`main-nav ${mobileOpen ? 'mobile-open' : ''}`}
          aria-label="Main navigation"
        >
          {navGroups.map((item) => {
            const hasLinks = Array.isArray(item.links) && item.links.length > 0;

            if (!hasLinks) {
              return (
                <Link href={item.href} key={item.label} className="nav-trigger" onClick={closeMobileMenu}>
                  {item.label}
                </Link>
              );
            }

            return (
              <div className="nav-group" key={item.label}>
                <Link href={item.href} className="nav-trigger" onClick={closeMobileMenu}>
                  {item.label}
                </Link>
                <div className="nav-panel">
                  {item.links.map((link) => (
                    <Link href={link.href} key={link.href} onClick={closeMobileMenu}>{link.label}</Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <Link href="/admissions" className="header-cta" onClick={closeMobileMenu}>
          Apply Now
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
