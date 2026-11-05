import Image from 'next/image';
import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" aria-label="Adebola College home">
              <span className="brand-mark">
                <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College logo" width={44} height={45} />
              </span>
              <span className="brand-copy">
                <strong>Adebola</strong>
                <span>College</span>
              </span>
            </Link>
            <p className="footer-intro">
              A private coeducational school in Ilorin, Kwara State, offering Junior and Senior Secondary
              education and distance learning.
            </p>
          </div>

          <div>
            <h4>Explore</h4>
            <div className="footer-links">
              <Link href="/about-us">About Us</Link>
              <Link href="/academics">Academics</Link>
              <Link href="/student-life">Student Life</Link>
              <Link href="/families">Families</Link>
            </div>
          </div>

          <div>
            <h4>Admissions</h4>
            <div className="footer-links">
              <Link href="/admissions">Admissions information</Link>
              <Link href="/admissions#requirements">Entry requirements</Link>
              <Link href="/contact-us">Contact the College</Link>
            </div>
          </div>

          <div>
            <h4>Connect</h4>
            <div className="footer-links">
              <Link href="/e-learning">E-Learning</Link>
              <Link href="/student/login">Student results portal</Link>
              <Link href="/contact-us">51 Gaa Akanbi Road, Ilorin</Link>
              <a href="mailto:contactus@adebolacollege.org">contactus@adebolacollege.org</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()} Adebola College. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
