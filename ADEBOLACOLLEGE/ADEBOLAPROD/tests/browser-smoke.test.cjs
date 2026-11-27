const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const contrastAudit = require('./browser-contrast-audit.cjs');

const baseUrl = process.env.BROWSER_TEST_BASE_URL || 'http://localhost:3000';
const outputDirectory = path.join(__dirname, '..', 'test-results', 'browser');
const screenshotDirectory = path.join(outputDirectory, 'screenshots');
const publicRoutes = [
  '/',
  '/about-us',
  '/academics',
  '/student-life',
  '/families',
  '/admissions',
  '/contact-us',
  '/e-learning',
  '/student/login',
  '/auth/accept-invite?next=%2Fstudent%2Flogin&error=invalid-invite',
];
const adminRoutes = [
  '/admin/login',
  '/admin/login/main',
  '/admin/login/sub-admin',
  '/admin/password-recovery',
  '/admin',
  '/admin/activity',
  '/admin/calendar',
  '/admin/courses',
  '/admin/lessons',
  '/admin/materials',
  '/admin/media',
  '/admin/orders',
  '/admin/profile',
  '/admin/results',
  '/admin/settings',
  '/admin/students',
  '/admin/users',
  '/admin/website-settings',
];
const studentProtectedRoutes = [
  '/student',
  '/student/profile',
  '/student/results',
];
const viewports = [
  { name: 'desktop', width: 1365, height: 900, mobile: false },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitForEvent(method, sessionId, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method} after ${timeout} ms`));
      }, timeout);
      const listener = (message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(message.params || {});
      };
      this.listeners.add(listener);
    });
  }

  close() {
    this.socket.close();
  }
}

let browser;
let connection;
let sessionId;
let browserProcess;
let profileDirectory;
let browserVersion;
const report = {
  baseUrl,
  startedAt: new Date().toISOString(),
  browser: null,
  checks: [],
  errors: [],
  publicRoutes,
  adminRoutes,
  viewportMatrix: viewports.map(({ name, width, height }) => ({ name, width, height })),
  contrastFailures: [],
};

function findChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1248', 'chrome-win', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForBrowser(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chromium exited during startup with code ${browserProcess.exitCode}.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await delay(250);
  }
  throw new Error('Chromium did not expose its DevTools endpoint within 15000 ms.');
}

async function evaluate(expression, awaitPromise = false) {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function auditContrastWithin(scopeSelector) {
  await evaluate(`(() => {
    document.querySelectorAll('[data-browser-contrast-scope]').forEach(element => {
      element.removeAttribute('data-browser-contrast-scope');
    });
    const scope = document.querySelector(${JSON.stringify(scopeSelector)});
    if (!scope) throw new Error('Contrast audit scope not found: ${scopeSelector}');
    scope.setAttribute('data-browser-contrast-scope', '');
  })()`);
  try {
    return await evaluate(contrastAudit);
  } finally {
    await evaluate(`document.querySelectorAll('[data-browser-contrast-scope]').forEach(element => {
      element.removeAttribute('data-browser-contrast-scope');
    })`);
  }
}

async function navigate(route) {
  const domContentEvent = connection.waitForEvent('Page.domContentEventFired', sessionId);
  const result = await connection.send('Page.navigate', { url: new URL(route, baseUrl).href }, sessionId);
  if (result.errorText) throw new Error(`Navigation to ${route} failed: ${result.errorText}`);
  if (result.loaderId) await domContentEvent;
  await evaluate(`new Promise(resolve => {
    if (document.readyState !== 'loading') resolve(true);
    else document.addEventListener('DOMContentLoaded', () => resolve(true), { once: true });
  })`, true);
  await delay(250);
}

async function inspectPage() {
  return evaluate(String.raw`(() => {
    const body = document.body;
    const main = document.querySelector('main');
    const h1 = main?.querySelector('h1');
    const logo = document.querySelector('.brand img');
    return {
      title: document.title,
      theme: document.documentElement.dataset.theme || '',
      heading: h1?.innerText.trim() || '',
      mainText: main?.innerText.trim().slice(0, 500) || '',
      logo: logo ? {
        loaded: logo.complete && logo.naturalWidth > 0,
        width: Math.round(logo.getBoundingClientRect().width),
        alt: logo.alt,
      } : null,
      links: [...document.querySelectorAll('header a')].map((link) => ({
        text: link.innerText.trim(),
        href: link.getAttribute('href'),
      })),
      images: [...(main?.querySelectorAll('img') || [])].map((image) => ({
        src: image.currentSrc || image.src,
        loaded: image.complete && image.naturalWidth > 0,
        naturalSize: [image.naturalWidth, image.naturalHeight],
        displayedSize: [
          Math.round(image.getBoundingClientRect().width),
          Math.round(image.getBoundingClientRect().height),
        ],
        objectFit: getComputedStyle(image).objectFit,
        alt: image.alt,
      })),
      invalidFragments: [...document.querySelectorAll('a[href*="#"]')].map((link) => {
        const url = new URL(link.href, location.href);
        const id = decodeURIComponent(url.hash.slice(1));
        return url.origin === location.origin && url.pathname === location.pathname && id && !document.getElementById(id)
          ? { href: link.getAttribute('href'), text: link.innerText.trim() }
          : null;
      }).filter(Boolean),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
    };
  })()`);
}

async function setViewport(viewport) {
  await connection.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  await connection.send('Emulation.setTouchEmulationEnabled', viewport.mobile
    ? { enabled: true, maxTouchPoints: 1 }
    : { enabled: false }, sessionId);
}

async function waitForImages() {
  await evaluate(`Promise.all([...document.images].map(image => {
    image.loading = 'eager';
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 1500);
    });
  }))`, true);
}

async function saveScreenshot(name) {
  const { data } = await connection.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  }, sessionId);
  fs.writeFileSync(path.join(screenshotDirectory, `${name}.png`), Buffer.from(data, 'base64'));
}

function record(name, details) {
  report.checks.push({ name, ...details });
}

function browserTest(name, run) {
  test(name, async () => {
    try {
      await run();
    } catch (error) {
      report.errors.push({ name, message: error.message, stack: error.stack });
      throw error;
    }
  });
}

before(async () => {
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  const response = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, `Existing development server at ${baseUrl} must return HTTP 200.`);

  const executable = findChromium();
  assert.ok(executable, 'Install-free Chromium executable was not found in the local browser cache.');
  const port = await reservePort();
  profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'adebola-browser-smoke-'));
  browserProcess = spawn(executable, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let browserStderr = '';
  browserProcess.stderr.setEncoding('utf8');
  browserProcess.stderr.on('data', (chunk) => { browserStderr = (browserStderr + chunk).slice(-4000); });
  browserVersion = await waitForBrowser(port).catch((error) => {
    throw new Error(`${error.message}${browserStderr ? ` Chromium stderr: ${browserStderr}` : ''}`);
  });
  const socket = new WebSocket(browserVersion.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
    setTimeout(() => reject(new Error('Timed out connecting to Chromium DevTools.')), 5000);
  });
  connection = new CdpConnection(socket);
  const target = await connection.send('Target.createTarget', { url: 'about:blank' });
  const attached = await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await connection.send('Page.enable', {}, sessionId);
  await connection.send('Runtime.enable', {}, sessionId);
  await connection.send('Emulation.setDeviceMetricsOverride', {
    width: 1365,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  report.browser = {
    product: browserVersion.Browser,
    executable,
    protocol: 'Chrome DevTools Protocol (Node built-in WebSocket)',
  };
});
after(async () => {
  report.completedAt = new Date().toISOString();
  report.result = report.errors.length ? 'failed' : 'completed';
  fs.writeFileSync(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (connection) connection.close();
  if (browserProcess && browserProcess.exitCode === null) {
    browserProcess.kill();
    await Promise.race([
      new Promise((resolve) => browserProcess.once('close', resolve)),
      delay(3000),
    ]);
  }
  if (profileDirectory && fs.existsSync(profileDirectory)) {
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
  console.log(`Browser screenshots and report: ${outputDirectory}`);
});

browserTest('all public routes pass rendered-text contrast checks in light and dark responsive layouts', async () => {
  for (const theme of ['light', 'dark']) {
    for (const viewport of viewports) {
      await setViewport(viewport);
      await navigate('/');
      await evaluate(`localStorage.setItem('adebola-theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
      for (const route of publicRoutes) {
        const response = await fetch(new URL(route, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200, `${route} should return HTTP 200 in ${theme} theme (${viewport.name}).`);
        await navigate(route);
        const page = await inspectPage();
        assert.equal(page.theme, theme, `${route} should use the ${theme} theme.`);
        assert.ok(page.heading, `${route} should render a main heading.`);
        assert.deepEqual(page.invalidFragments, [], `${route} has broken in-page navigation links.`);
        assert.ok(page.documentWidth <= viewport.width + 1, `${route} overflows horizontally at ${viewport.name} width (${page.documentWidth}px > ${viewport.width}px).`);
        if (route === '/') {
          assert.ok(page.logo?.loaded, 'Homepage logo should load.');
          assert.ok(page.logo.width >= 32, 'Homepage logo should remain comfortably visible.');
        }
        let audit = { checkedCount: 0, minimumRatio: null, failures: [], imageBackgroundCount: 0, placeholdersChecked: 0 };
        if (viewport.name === 'desktop') {
          await waitForImages();
          const loadedPage = await inspectPage();
          assert.ok(loadedPage.images.every((image) => image.loaded), `${route} has unloaded images: ${JSON.stringify(loadedPage.images.filter((image) => !image.loaded))}`);
        }
        audit = await evaluate(contrastAudit);
        for (const failure of audit.failures) {
          report.contrastFailures.push({ route, theme, viewport: viewport.name, ...failure });
        }
        if (viewport.name === 'desktop') {
          const routePath = route.split('?')[0];
          const screenshot = `${routePath === '/' ? 'home' : routePath.slice(1).replaceAll('/', '-')}-${theme}`;
          await saveScreenshot(screenshot);
          record('public screenshot', {
            route,
            theme,
            viewport: viewport.name,
            screenshot: `screenshots/${screenshot}.png`,
          });
        }
        record('public route and contrast audit', {
          route,
          theme,
          viewport: viewport.name,
          status: response.status,
          heading: page.heading,
          ...audit,
        });
      }
    }
  }
  assert.equal(
    report.contrastFailures.length,
    0,
    `Found ${report.contrastFailures.length} WCAG AA text contrast failure(s): ${JSON.stringify(report.contrastFailures.slice(0, 50), null, 2)}`,
  );
});

browserTest('public navigation, dropdowns, mobile menu, homepage logo, and Admissions anchors work', async () => {
  await setViewport(viewports[0]);
  await navigate('/');
  const navigation = await evaluate(`(() => ({
    logo: document.querySelector('.brand')?.getAttribute('href'),
    links: [...document.querySelectorAll('header a')].map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') })),
    image: document.querySelector('.brand img')?.complete && document.querySelector('.brand img')?.naturalWidth > 0,
    anchors: [...document.querySelectorAll('.main-nav a')].map(a => a.getAttribute('href')),
    iconLinks: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(link => ({
      href: link.href,
      rel: link.rel,
      type: link.type,
    })),
  }))()`);
  assert.equal(navigation.logo, '/');
  assert.ok(navigation.image, 'The homepage logo must load.');
  assert.ok(navigation.anchors.includes('/admissions'), 'Main navigation should link to Admissions.');
  assert.ok(navigation.anchors.includes('/e-learning'), 'Main navigation should link to E-Learning.');
  assert.ok(navigation.links.some(({ text, href }) => text === 'Apply Now' && href === '/admissions'));
  assert.ok(navigation.iconLinks.length >= 2, 'The favicon and Apple touch icon should be declared.');
  const iconResults = [];
  for (const icon of navigation.iconLinks) {
    const response = await fetch(icon.href, { signal: AbortSignal.timeout(10000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${icon.rel} should return HTTP 200.`);
    assert.equal(response.headers.get('content-type')?.split(';')[0], 'image/png', `${icon.rel} should be a PNG.`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${icon.rel} should contain a valid PNG.`);
    iconResults.push({ ...icon, status: response.status, bytes: bytes.length });
  }
  await evaluate(`localStorage.setItem('adebola-theme', 'dark'); document.documentElement.dataset.theme = 'dark'`);
  const dropdownTarget = await evaluate(`(() => {
    const group = document.querySelector('.nav-group');
    if (!group) return { available: false };
    const bounds = group.getBoundingClientRect();
    return {
      available: true,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  })()`);
  assert.ok(dropdownTarget.available, 'The public navigation dropdown should be present.');
  await connection.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: dropdownTarget.x,
    y: dropdownTarget.y,
  }, sessionId);
  await delay(100);
  const dropdown = await evaluate(`(() => {
    const group = document.querySelector('.nav-group');
    return {
      visible: getComputedStyle(group.querySelector('.nav-panel')).display !== 'none',
      links: [...group.querySelectorAll('.nav-panel a')].map(link => link.getAttribute('href')),
    };
  })()`);
  assert.ok(dropdown.visible && dropdown.links.length > 0, 'The public navigation dropdown should open on hover.');
  const darkDropdownAudit = await auditContrastWithin('.nav-panel');
  for (const failure of darkDropdownAudit.failures) {
    report.contrastFailures.push({ route: '/', theme: 'dark', viewport: 'desktop', state: 'navigation-dropdown', ...failure });
  }
  assert.equal(darkDropdownAudit.failures.length, 0,
    `Dark navigation dropdown contrast failures: ${JSON.stringify(darkDropdownAudit.failures, null, 2)}`);
  const themeToggle = await evaluate(`(() => {
    const button = document.querySelector('.theme-toggle');
    const before = document.documentElement.dataset.theme;
    button?.click();
    return {
      before,
      after: document.documentElement.dataset.theme,
      saved: localStorage.getItem('adebola-theme'),
      hasButton: Boolean(button),
    };
  })()`);
  assert.ok(themeToggle.hasButton, 'The public theme toggle should render.');
  assert.notEqual(themeToggle.after, themeToggle.before, 'The theme toggle should change the active theme.');
  assert.equal(themeToggle.saved, themeToggle.after, 'The theme toggle should persist its selection.');
  const lightDropdownTarget = await evaluate(`(() => {
    const bounds = document.querySelector('.nav-group').getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  })()`);
  await connection.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: lightDropdownTarget.x,
    y: lightDropdownTarget.y,
  }, sessionId);
  await delay(100);
  const lightDropdown = await evaluate(`(() => ({
    visible: getComputedStyle(document.querySelector('.nav-group .nav-panel')).display !== 'none',
    links: [...document.querySelectorAll('.nav-group .nav-panel a')].map(link => link.getAttribute('href')),
  }))()`);
  assert.ok(lightDropdown.visible && lightDropdown.links.length > 0, 'The light navigation dropdown should open on hover.');
  const lightDropdownAudit = await auditContrastWithin('.nav-panel');
  for (const failure of lightDropdownAudit.failures) {
    report.contrastFailures.push({ route: '/', theme: 'light', viewport: 'desktop', state: 'navigation-dropdown', ...failure });
  }
  assert.equal(lightDropdownAudit.failures.length, 0,
    `Light navigation dropdown contrast failures: ${JSON.stringify(lightDropdownAudit.failures, null, 2)}`);
  await evaluate(`document.querySelector('.main-nav a[href="/admissions"]').click()`);
  const admissionsNavigation = await evaluate(`new Promise(resolve => {
    const deadline = Date.now() + 12000;
    const timer = setInterval(() => {
      if (location.pathname === '/admissions' && document.querySelector('.page-hero h1')?.innerText.includes('next step')) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  })`, true);
  assert.ok(admissionsNavigation, 'Selecting Admissions in the site navigation should open the page.');

  await navigate('/admissions');
  const admissions = await evaluate(`(() => ({
    requirements: Boolean(document.getElementById('requirements')),
    faq: Boolean(document.getElementById('faq')),
    requirementLinks: [...document.querySelectorAll('a[href="#requirements"], a[href="/admissions#requirements"]')].length,
    faqLinks: [...document.querySelectorAll('a[href="#faq"], a[href="/admissions#faq"]')].length,
  }))()`);
  assert.ok(admissions.requirements, 'Admissions sample-paper section should exist.');
  assert.ok(admissions.faq, 'Admissions FAQ section should exist.');
  assert.ok(admissions.requirementLinks > 0, 'Admissions requirements navigation should be available.');
  assert.ok(admissions.faqLinks > 0, 'Admissions FAQ navigation should be available.');
  const papers = await evaluate(`(() => [...document.querySelectorAll('.paper-card')].map(link => ({
    title: link.querySelector('.paper-card-title')?.innerText.trim() || '',
    href: link.href,
  })))()`);
  assert.equal(papers.length, 4, 'Admissions should list all four sample-paper downloads.');
  const paperResults = [];
  for (const paper of papers) {
    const response = await fetch(paper.href, { signal: AbortSignal.timeout(10000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${paper.title} download should return HTTP 200.`);
    assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/pdf', `${paper.title} should be a PDF.`);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), '%PDF', `${paper.title} should have a PDF signature.`);
    paperResults.push({ title: paper.title, status: response.status, bytes: bytes.length });
  }
  await saveScreenshot('admissions-navigation-light');
  record('public navigation, theme toggle, and Admissions anchors', {
    navigation,
    icons: iconResults,
    dropdown: { dark: { ...dropdown, ...darkDropdownAudit }, light: { ...lightDropdown, ...lightDropdownAudit } },
    themeToggle,
    admissionsNavigation,
    admissions,
    samplePaperDownloads: paperResults,
  });

  await setViewport(viewports[2]);
  for (const theme of ['light', 'dark']) {
    await navigate('/');
    await evaluate(`localStorage.setItem('adebola-theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
    const mobileMenu = await evaluate(`(async () => {
      const button = document.querySelector('.menu-toggle');
      if (!button) return { available: false };
      button.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const navigation = document.querySelector('#primary-navigation');
      return {
        available: true,
        expanded: button.getAttribute('aria-expanded'),
        linksVisible: getComputedStyle(navigation).display !== 'none',
        visibleLinks: [...navigation.querySelectorAll('a')].filter(link => link.getClientRects().length > 0).length,
      };
    })()`, true);
    assert.ok(mobileMenu.available && mobileMenu.expanded === 'true' && mobileMenu.linksVisible && mobileMenu.visibleLinks > 0,
      `Mobile ${theme} navigation should open accessibly: ${JSON.stringify(mobileMenu)}`);
    const mobileAudit = await auditContrastWithin('#primary-navigation');
    for (const failure of mobileAudit.failures) {
      report.contrastFailures.push({ route: '/', theme, viewport: 'mobile', state: 'mobile-navigation', ...failure });
    }
    const screenshot = `mobile-navigation-${theme}`;
    await saveScreenshot(screenshot);
    record('mobile navigation contrast', { theme, ...mobileMenu, ...mobileAudit, screenshot: `screenshots/${screenshot}.png` });
    assert.equal(mobileAudit.failures.length, 0,
      `Mobile ${theme} navigation contrast failures: ${JSON.stringify(mobileAudit.failures, null, 2)}`);
    const escapedMenu = await evaluate(`(async () => {
      const button = document.querySelector('.menu-toggle');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise(resolve => setTimeout(resolve, 100));
      return button.getAttribute('aria-expanded');
    })()`, true);
    assert.equal(escapedMenu, 'false', 'Escape should close the mobile navigation.');
  }
});

browserTest('E-Learning course purchase opens safely without submitting a payment', async () => {
  await setViewport(viewports[0]);
  await navigate('/e-learning');
  const purchase = await evaluate(`(() => {
    const card = document.querySelector('.catalogue-demo-card');
    return {
      catalogue: Boolean(document.querySelector('.learning-catalogue')),
      courseCount: document.querySelectorAll('.catalogue-demo-card').length,
      buyButton: Boolean(card && [...card.querySelectorAll('button')].find(button => button.innerText.trim() === 'Buy Now')),
    };
  })()`);
  assert.ok(purchase.catalogue, 'The E-Learning catalogue should render.');
  if (purchase.courseCount > 0) {
    assert.ok(purchase.buyButton, 'Published courses should provide a Buy Now action.');
    for (const theme of ['light', 'dark']) {
      await navigate('/');
      await evaluate(`localStorage.setItem('adebola-theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
      await navigate('/e-learning');
      const activeTheme = await evaluate(`document.documentElement.dataset.theme || ''`);
      assert.equal(activeTheme, theme, `Checkout should render in the ${theme} theme.`);
      await evaluate(`(() => {
        const card = document.querySelector('.catalogue-demo-card');
        [...card.querySelectorAll('button')].find(button => button.innerText.trim() === 'Buy Now').click();
      })()`);
      const checkout = await evaluate(`(() => ({
        dialog: document.querySelector('[role="dialog"]')?.innerText || '',
        submitButtons: [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') || [])].map(button => button.innerText.trim()),
        alerts: [...(document.querySelector('[role="dialog"]')?.querySelectorAll('[role="alert"]') || [])].map(node => node.innerText.trim()),
      }))()`);
      assert.match(checkout.dialog, /Submit bank-transfer payment/i);
      assert.doesNotMatch(checkout.submitButtons.join(' '), /Submit for review|Submitting/i, 'Unconfigured checkout must not offer a payment submission action.');
      assert.match(checkout.alerts.join(' '), /not currently configured|not configured/i, 'Unavailable payment settings should be clearly explained.');
      const checkoutAudit = await auditContrastWithin('[role="dialog"]');
      for (const failure of checkoutAudit.failures) {
        report.contrastFailures.push({ route: '/e-learning', theme, viewport: 'desktop', state: 'checkout-modal', ...failure });
      }
      const screenshot = `course-purchase-checkout-${theme}`;
      await saveScreenshot(screenshot);
      record('course purchase checkout', {
        ...purchase,
        theme,
        checkoutOpen: true,
        submissionAttempted: false,
        ...checkoutAudit,
        screenshot: `screenshots/${screenshot}.png`,
      });
      assert.equal(checkoutAudit.failures.length, 0,
        `${theme} checkout modal contrast failures: ${JSON.stringify(checkoutAudit.failures, null, 2)}`);
    }
  } else {
    record('course purchase checkout', {
      ...purchase,
      checkoutOpen: false,
      note: 'No published course was available to exercise the Buy Now flow.',
    });
  }
});

browserTest('Admin sign-in pages render and protected Admin routes redirect without a session', async () => {
  await setViewport(viewports[0]);
  for (const theme of ['light', 'dark']) {
    await navigate('/');
    await evaluate(`localStorage.setItem('adebola-theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
    for (const route of adminRoutes) {
      await navigate(route);
      const result = await evaluate(`(() => ({
        url: location.pathname,
        theme: document.documentElement.dataset.theme || '',
        heading: document.querySelector('main h1')?.innerText.trim() || document.querySelector('h1')?.innerText.trim() || '',
        inputs: [...document.querySelectorAll('input')].map(input => input.type),
      }))()`);
      assert.equal(result.theme, theme, `${route} should retain the ${theme} theme.`);
      assert.ok(result.heading, `${route} should show a heading.`);
      if (route === '/admin/login' || route === '/admin/login/main' || route === '/admin/login/sub-admin') {
        assert.ok(result.inputs.includes('email'), `${route} should render an email field.`);
        assert.ok(result.inputs.includes('password'), `${route} should render a password field.`);
      }
      const protectedRoute = route === '/admin' ||
        (route.startsWith('/admin/') && !route.startsWith('/admin/login') && route !== '/admin/password-recovery');
      if (protectedRoute) {
        assert.match(result.url, /^\/admin\/login\/main/, `${route} must redirect an unauthenticated visitor to Main Admin sign in.`);
      }
      const contrast = await evaluate(contrastAudit);
      for (const failure of contrast.failures) {
        report.contrastFailures.push({ route, theme, viewport: 'desktop', ...failure });
      }
      const screenshot = `${route.slice(1).replaceAll('/', '-') || 'admin'}-${theme}`;
      await saveScreenshot(screenshot);
      record('Admin route and contrast audit', { route, ...result, ...contrast, screenshot: `screenshots/${screenshot}.png` });
    }
  }
  assert.equal(
    report.contrastFailures.length,
    0,
    `Admin page contrast failures: ${JSON.stringify(report.contrastFailures.slice(-50), null, 2)}`,
  );
});

browserTest('student portal and invitation error states remain protected and readable', async () => {
  for (const theme of ['light', 'dark']) {
    await navigate('/');
    await evaluate(`localStorage.setItem('adebola-theme', '${theme}'); document.documentElement.dataset.theme = '${theme}'`);
    for (const route of studentProtectedRoutes) {
      await navigate(route);
      const url = await evaluate('location.pathname');
      assert.equal(url, '/student/login', `${route} must redirect an unauthenticated visitor to student sign in.`);
      record('student protected route', { route, theme, redirect: url });
    }

    await navigate('/auth/accept-invite?next=%2Fstudent%2Flogin&error=invalid-invite');
    const invitation = await evaluate(`(() => ({
      heading: document.querySelector('h1')?.innerText.trim() || '',
      alert: document.querySelector('[role="alert"]')?.innerText.trim() || '',
      theme: document.documentElement.dataset.theme || '',
    }))()`);
    assert.equal(invitation.theme, theme);
    assert.ok(invitation.alert, 'An expired invitation should show an explicit error state.');
    const audit = await evaluate(contrastAudit);
    assert.equal(audit.failures.length, 0, `Invitation error contrast failures: ${JSON.stringify(audit.failures, null, 2)}`);
    record('expired invitation error state', { route: '/auth/accept-invite', theme, ...invitation, ...audit });
  }
});
