'use client';

import Image from 'next/image';
import Link from 'next/link';
import HomeSpotlight from './home-spotlight';
import { useWebsiteSettings } from './website-settings-context';

const defaultImage = '/images/NewPics/Pix1-Building.jpeg';

export default function HomeHero() {
  const settings = useWebsiteSettings();
  const image = settings?.heroImageUrl || defaultImage;
  const primaryHref = settings?.primaryButtonHref || '/admissions';
  const secondaryHref = settings?.secondaryButtonHref || '/about-us';

  return (
    <section className="page-hero home-hero">
      <div className="container page-hero-inner">
        <div className="home-hero-copy">
          <span className="eyebrow eyebrow-light">Adebola College · Ilorin, Kwara State</span>
          <HomeSpotlight title={settings?.heroTitle} description={settings?.heroDescription} />
          <div className="hero-actions">
            <Link href={primaryHref} className="btn btn-primary">{settings?.primaryButtonLabel || 'Explore admissions'}</Link>
            <Link href={secondaryHref} className="btn btn-secondary">{settings?.secondaryButtonLabel || 'About the College'}</Link>
          </div>
        </div>

        <div className="school-visual">
          <Image
            src={image}
            alt={settings?.heroImageAlt || 'Students playing on the school field in front of a College building.'}
            width={960}
            height={640}
            priority
            unoptimized={image !== defaultImage}
            className="school-premises-photo"
          />
          <Image
            src="/images/NewPics/Pix25-SchoolLogo.jpg"
            alt="Adebola College crest"
            width={338}
            height={345}
            className="school-visual-logo"
          />
        </div>
      </div>
    </section>
  );
}
