const publicNavigation = [
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

const applyNowHref = '/admissions';

module.exports = { applyNowHref, publicNavigation };
