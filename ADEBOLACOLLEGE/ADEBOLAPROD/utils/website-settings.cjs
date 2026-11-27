const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_PATTERN = /^[+0-9()\-\s]{6,40}$/;
const WEBSITE_PATHS = new Set([
  '/about-us',
  '/academics',
  '/admissions',
  '/contact-us',
  '/e-learning',
  '/families',
  '/student-life',
]);
const HERO_IMAGE_PATH_PATTERN = /^homepage\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i;

const DEFAULT_WEBSITE_SETTINGS = Object.freeze({
  contactPhonePrimary: '+2348035364720',
  contactPhoneSecondary: '+2348033628755',
  contactEmail: 'contactus@adebolacollege.org',
  elearningEmail: 'elearning@adebolacollege.org',
  heroTitle: 'Welcome to Adebola College',
  heroDescription: 'A private coeducational school offering Junior and Senior Secondary education and distance learning.',
  primaryButtonLabel: 'Explore admissions',
  primaryButtonHref: '/admissions',
  secondaryButtonLabel: 'About the College',
  secondaryButtonHref: '/about-us',
  heroImagePath: null,
  heroImageAlt: 'Students playing on the school field in front of a College building.',
  heroImageUrl: '',
});

function isValidHeroImagePath(value) {
  return value === null || (typeof value === 'string' && HERO_IMAGE_PATH_PATTERN.test(value));
}

function validateWebsiteSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Website settings are invalid.';
  }
  const { contactPhonePrimary, contactPhoneSecondary, contactEmail, elearningEmail,
    heroTitle, heroDescription, primaryButtonLabel, primaryButtonHref,
    secondaryButtonLabel, secondaryButtonHref, heroImagePath, heroImageAlt } = value;

  if (typeof contactPhonePrimary !== 'string'
    || (contactPhonePrimary !== '' && !PHONE_PATTERN.test(contactPhonePrimary))
    || typeof contactPhoneSecondary !== 'string'
    || (contactPhoneSecondary !== '' && !PHONE_PATTERN.test(contactPhoneSecondary))) {
    return 'Enter phone numbers using digits and standard phone punctuation.';
  }
  if (typeof contactEmail !== 'string' || contactEmail.length > 254 || !EMAIL_PATTERN.test(contactEmail)
    || typeof elearningEmail !== 'string' || elearningEmail.length > 254 || !EMAIL_PATTERN.test(elearningEmail)) {
    return 'Enter valid school and E-Learning email addresses.';
  }
  if (typeof heroTitle !== 'string' || heroTitle.trim().length < 1 || heroTitle.length > 140
    || typeof heroDescription !== 'string' || heroDescription.trim().length < 1 || heroDescription.length > 600) {
    return 'Enter a homepage title (up to 140 characters) and description (up to 600 characters).';
  }
  if (typeof primaryButtonLabel !== 'string' || primaryButtonLabel.trim().length < 1 || primaryButtonLabel.length > 40
    || typeof secondaryButtonLabel !== 'string' || secondaryButtonLabel.trim().length < 1 || secondaryButtonLabel.length > 40
    || !WEBSITE_PATHS.has(primaryButtonHref) || !WEBSITE_PATHS.has(secondaryButtonHref)) {
    return 'Choose button labels and destinations from the available public pages.';
  }
  if (typeof heroImageAlt !== 'string' || heroImageAlt.trim().length < 1 || heroImageAlt.length > 160
    || !isValidHeroImagePath(heroImagePath)) {
    return 'Enter descriptive image text and select a valid uploaded homepage image.';
  }
  return '';
}

function matchesHeroImageSignature(contentType, bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return false;
  const buffer = Buffer.from(bytes);
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

module.exports = {
  DEFAULT_WEBSITE_SETTINGS,
  HERO_IMAGE_PATH_PATTERN,
  matchesHeroImageSignature,
  validateWebsiteSettings,
};
