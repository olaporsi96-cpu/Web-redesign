'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import ThemeToggle from './theme-toggle';
import navigationConfig from '../utils/public-navigation.cjs';

const { applyNowHref, publicNavigation } = navigationConfig;

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
          {publicNavigation.map((item) => {
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

        <Link href={applyNowHref} className="header-cta" onClick={closeMobileMenu}>
          Apply Now
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
