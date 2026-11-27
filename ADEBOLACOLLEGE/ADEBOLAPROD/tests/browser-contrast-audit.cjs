module.exports = String.raw`(() => {
  function parseColor(value) {
    if (!value || value === 'transparent') return null;
    if (value.startsWith('#')) {
      let hex = value.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        hex = [...hex.slice(0, 3)].map((channel) => channel + channel).join('');
      }
      return {
        red: parseInt(hex.slice(0, 2), 16),
        green: parseInt(hex.slice(2, 4), 16),
        blue: parseInt(hex.slice(4, 6), 16),
        alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    if (!value.startsWith('rgb')) return null;
    const channels = value.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length < 3) return null;
    return {
      red: channels[0],
      green: channels[1],
      blue: channels[2],
      alpha: channels.length > 3 ? channels[3] : 1,
    };
  }

  function composite(foreground, background) {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
    if (!alpha) return { red: 255, green: 255, blue: 255, alpha: 1 };
    return {
      red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
      green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
      blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
      alpha,
    };
  }

  function luminance(color) {
    return [color.red, color.green, color.blue]
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  }

  function ratio(first, second) {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }

  function colorString(color) {
    return 'rgb(' + Math.round(color.red) + ', ' + Math.round(color.green) + ', ' + Math.round(color.blue) + ')';
  }

  function visible(element) {
    if (!element.getClientRects().length || element.closest('[aria-hidden="true"]')) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      if (parent.tagName === 'NEXTJS-PORTAL') return false;
    }
    return true;
  }

  function backgroundCandidates(element) {
    const ancestors = [];
    for (let current = element; current; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    let candidates = [{ red: 255, green: 255, blue: 255, alpha: 1 }];
    let hasImageBackground = false;
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      const background = parseColor(style.backgroundColor);
      if (background && background.alpha > 0) {
        candidates = candidates.map((base) => composite(background, base));
      }
      const image = style.backgroundImage || '';
      if (image === 'none') continue;
      const imageColors = image.match(/rgba?\([^)]+\)|#[\da-f]{3,8}/gi) || [];
      if (image.includes('url(')) hasImageBackground = true;
      if (imageColors.length) {
        const stops = imageColors.map(parseColor).filter(Boolean);
        candidates = candidates.flatMap((base) => stops.map((stop) => composite(stop, base)));
      }
    }
    return { candidates, hasImageBackground };
  }

  function selector(element) {
    if (element.id) return element.tagName.toLowerCase() + '#' + element.id;
    const classes = [...element.classList].slice(0, 2);
    return element.tagName.toLowerCase() + classes.map((name) => '.' + name).join('');
  }

  const failures = [];
  let checkedCount = 0;
  let minimumRatio = Infinity;
  let imageBackgroundCount = 0;
  const seen = new Set();
  const auditRoot = document.querySelector('[data-browser-contrast-scope]') || document.body;
  const walker = document.createTreeWalker(auditRoot, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    const element = node.parentElement;
    if (!text || !element || !visible(element) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(element.tagName)) continue;
    const key = selector(element) + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);

    const style = getComputedStyle(element);
    const foreground = parseColor(style.color);
    if (!foreground || foreground.alpha === 0) continue;
    let opacity = 1;
    for (let parent = element; parent; parent = parent.parentElement) {
      opacity *= Number(getComputedStyle(parent).opacity);
    }
    foreground.alpha *= opacity;
    const { candidates, hasImageBackground } = backgroundCandidates(element);
    if (hasImageBackground) imageBackgroundCount++;
    const ratios = candidates.map((background) => ({
      foreground: composite(foreground, background),
      background,
      value: ratio(composite(foreground, background), background),
    }));
    const worst = ratios.sort((a, b) => a.value - b.value)[0];
    if (!worst) continue;

    const fontSize = Number.parseFloat(style.fontSize);
    const bold = Number.parseInt(style.fontWeight, 10) >= 700;
    const largeText = fontSize >= 24 || (fontSize >= 18.67 && bold);
    const minimum = largeText ? 3 : 4.5;
    checkedCount++;
    minimumRatio = Math.min(minimumRatio, worst.value);
    if (worst.value < minimum) {
      failures.push({
        element: selector(element),
        text: text.slice(0, 160),
        foreground: colorString(worst.foreground),
        background: colorString(worst.background),
        ratio: Number(worst.value.toFixed(2)),
        required: minimum,
        fontSize: fontSize + 'px',
        fontWeight: style.fontWeight,
        backgroundImage: getComputedStyle(element).backgroundImage,
      });
    }
  }

  const placeholders = [...auditRoot.querySelectorAll('input[placeholder], textarea[placeholder]')]
    .filter((element) => !element.value && element.placeholder && visible(element))
    .map((element) => {
      const style = getComputedStyle(element, '::placeholder');
      const foreground = parseColor(style.color);
      const { candidates } = backgroundCandidates(element);
      if (!foreground || !candidates.length) return null;
      const worst = candidates.map((background) => ({
        foreground: composite(foreground, background),
        background,
        value: ratio(composite(foreground, background), background),
      })).sort((a, b) => a.value - b.value)[0];
      checkedCount++;
      minimumRatio = Math.min(minimumRatio, worst.value);
      if (worst.value < 4.5) {
        failures.push({
          element: selector(element) + '::placeholder',
          text: element.placeholder.slice(0, 160),
          foreground: colorString(worst.foreground),
          background: colorString(worst.background),
          ratio: Number(worst.value.toFixed(2)),
          required: 4.5,
          fontSize: Number.parseFloat(style.fontSize) + 'px',
          fontWeight: style.fontWeight,
          backgroundImage: getComputedStyle(element).backgroundImage,
        });
      }
      return true;
    });

  return {
    checkedCount,
    minimumRatio: Number.isFinite(minimumRatio) ? Number(minimumRatio.toFixed(2)) : null,
    failures,
    imageBackgroundCount,
    placeholdersChecked: placeholders.filter(Boolean).length,
  };
})()`;
