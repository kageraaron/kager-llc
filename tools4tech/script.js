import {
  renderMarkdown,
  evaluateRegex,
  epochToDate,
  dateToEpoch,
  formatRelativeTime,
  parseURL,
  updateURLParam,
  describeCron,
  nextCronRuns,
  formatJSON,
  encodeBase64,
  decodeBase64,
  generatePassword,
  decodeJWT,
  parseColor,
  hashText,
  computeDiff,
  parseBaseInput,
  convertBases,
  convertCase
} from '@kager-llc/shared';

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showToast(msg) {
    const toast = $('#copyToast');
    toast.textContent = msg || 'Copied to clipboard!';
    toast.classList.add('show');
    clearTimeout(toast._tid);
    toast._tid = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast()).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast();
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const id = btn.getAttribute('data-copy');
    const el = document.getElementById(id);
    if (el && el.value) copyText(el.value);
  });

  /* 1. NAVIGATION */
  const navItems = $$('.nav-item');
  const sections = $$('.tool-section');
  const sidebar = $('#sidebar');
  const mobileBtn = $('#mobileMenuBtn');

  function switchTool(toolId) {
    if (!toolId) toolId = 'markdown';
    navItems.forEach((n) => n.classList.toggle('active', n.dataset.tool === toolId));
    sections.forEach((s) => {
      s.classList.toggle('active', s.id === 'tool-' + toolId);
    });
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  }

  window.addEventListener('hashchange', () => {
    const tool = location.hash.replace('#', '') || 'markdown';
    switchTool(tool);
  });

  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Initial routing
  const initHash = location.hash.replace('#', '') || 'markdown';
  switchTool(initHash);

  /* 2. MARKDOWN EDITOR */
  const mdInput = $('#markdownInput');
  const mdPreview = $('#markdownPreview');
  const mdCopyBtn = $('#mdCopyHtml');
  const mdClearBtn = $('#mdClear');
  const mdToolbarBtns = $$('[data-md]');

  function renderMd() {
    mdPreview.innerHTML = renderMarkdown(mdInput.value);
  }

  mdInput.addEventListener('input', renderMd);
  renderMd();

  mdClearBtn.addEventListener('click', () => {
    mdInput.value = '';
    renderMd();
    mdInput.focus();
  });

  mdCopyBtn.addEventListener('click', () => {
    copyText(renderMarkdown(mdInput.value));
  });

  /* 3. REGEX TESTER */
  const rxPattern = $('#regexPattern');
  const rxFlags = $('#regexFlags');
  const rxTestStr = $('#regexTestString');
  const rxHighlight = $('#regexHighlightLayer');
  const rxError = $('#regexError');
  const rxMatchCount = $('#regexMatchCount');
  const rxMatchDetails = $('#regexMatchDetails');

  function evalRegexUI() {
    const res = evaluateRegex(rxPattern.value, rxFlags.value, rxTestStr.value);
    if (res.error) {
      rxError.classList.remove('hidden');
      rxHighlight.innerHTML = res.highlightedHtml;
      rxMatchCount.textContent = 'Error';
    } else {
      rxError.classList.add('hidden');
      rxHighlight.innerHTML = res.highlightedHtml + '\n';
      rxMatchCount.textContent = res.matches + ' match' + (res.matches === 1 ? '' : 'es');
    }
  }

  rxPattern.addEventListener('input', evalRegexUI);
  rxFlags.addEventListener('input', evalRegexUI);
  rxTestStr.addEventListener('input', evalRegexUI);
  rxTestStr.addEventListener('scroll', () => {
    rxHighlight.scrollTop = rxTestStr.scrollTop;
  });
  evalRegexUI();

  /* 4. UNIX TIMESTAMP */
  const tsLiveEpoch = $('#tsLiveEpoch');
  const tsLiveDate = $('#tsLiveDate');
  const tsEpochInput = $('#tsEpochInput');
  const tsConvertEpochBtn = $('#tsConvertEpochBtn');
  const tsLocalResult = $('#tsLocalResult');
  const tsUtcResult = $('#tsUtcResult');
  const tsIsoResult = $('#tsIsoResult');
  const tsRelativeResult = $('#tsRelativeResult');
  const tsEpochError = $('#tsEpochError');

  function updateLiveClock() {
    const now = new Date();
    tsLiveEpoch.textContent = Math.floor(now.getTime() / 1000);
    tsLiveDate.textContent = now.toLocaleString();
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  tsConvertEpochBtn.addEventListener('click', () => {
    const d = epochToDate(tsEpochInput.value.trim());
    if (!d) { tsEpochError.classList.remove('hidden'); return; }
    tsEpochError.classList.add('hidden');
    tsLocalResult.value = d.toLocaleString();
    tsUtcResult.value = d.toUTCString();
    tsIsoResult.value = d.toISOString();
    tsRelativeResult.value = formatRelativeTime(d);
  });

  const tsDateInput = $('#tsDateInput');
  const tsEpochResult = $('#tsEpochResult');
  const tsMsResult = $('#tsMsResult');

  $('#tsConvertDateBtn')?.addEventListener('click', () => {
    const d = dateToEpoch(tsDateInput.value);
    if (!d) {
      tsEpochResult.value = '';
      tsMsResult.value = '';
      return;
    }
    tsEpochResult.value = d.seconds;
    tsMsResult.value = d.milliseconds;
  });

  /* 5. URL PARSER */
  const urlInput = $('#urlInput');
  const urlError = $('#urlError');
  const urlParsed = $('#urlParsedResults');
  const urlProto = $('#urlCompProtocol');
  const urlHost = $('#urlCompHostname');
  const urlPort = $('#urlCompPort');
  const urlPath = $('#urlCompPathname');
  const urlHash = $('#urlCompHash');
  const urlOrigin = $('#urlCompOrigin');
  const urlQueryBody = $('#urlQueryBody');
  const urlQueryTable = $('#urlQueryTable');
  const urlNoParams = $('#urlNoParams');
  const urlParamCount = $('#urlParamCount');

  function parseUrlUI() {
    const raw = urlInput.value.trim();
    const res = parseURL(raw);
    if (!res) {
      if (raw) urlError.classList.remove('hidden');
      urlParsed.classList.add('hidden');
      return;
    }
    urlError.classList.add('hidden');
    urlParsed.classList.remove('hidden');
    urlProto.value = res.protocol;
    urlHost.value = res.hostname;
    urlPort.value = res.port;
    urlPath.value = res.pathname;
    urlHash.value = res.hash;
    urlOrigin.value = res.origin;
    urlParamCount.textContent = res.params.length + ' param' + (res.params.length === 1 ? '' : 's');

    if (res.params.length === 0) {
      urlQueryTable.classList.add('hidden');
      urlNoParams.classList.remove('hidden');
    } else {
      urlQueryTable.classList.remove('hidden');
      urlNoParams.classList.add('hidden');
      urlQueryBody.innerHTML = '';
      res.params.forEach(([key, value]) => {
        const tr = document.createElement('tr');

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.value = key;
        keyInput.readOnly = true;

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.value = value;
        valInput.addEventListener('input', (e) => {
          urlInput.value = updateURLParam(urlInput.value, key, e.target.value);
        });

        const tdKey = document.createElement('td');
        tdKey.appendChild(keyInput);
        const tdVal = document.createElement('td');
        tdVal.appendChild(valInput);

        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        urlQueryBody.appendChild(tr);
      });
    }
  }
  urlInput.addEventListener('input', parseUrlUI);
  parseUrlUI();

  /* 6. CRON SCHEDULE */
  const cronInputs = ['cronMin', 'cronHour', 'cronDom', 'cronMonth', 'cronDow'].map(id => $('#' + id));
  const cronFullExpr = $('#cronFullExpression');
  const cronDesc = $('#cronDescription');
  const cronNextRuns = $('#cronNextRuns');

  function updateCronUI() {
    const parts = cronInputs.map(i => i.value.trim() || '*');
    cronFullExpr.textContent = parts.join(' ');
    cronDesc.textContent = describeCron(parts);
    const runs = nextCronRuns(parts, 5);
    cronNextRuns.innerHTML = runs.length ? runs.map((d, i) => '<li><span class="run-index">' + (i + 1) + '.</span>' + d.toLocaleString() + '</li>').join('') : '<li>No upcoming runs</li>';
  }
  cronInputs.forEach(i => i.addEventListener('input', updateCronUI));

  $$('.cron-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.cron.split(' ');
      cronInputs.forEach((el, i) => el.value = parts[i]);
      updateCronUI();
    });
  });

  updateCronUI();

  /* 7. JSON FORMATTER */
  const jsonInput = $('#jsonInput');
  const jsonOutput = $('#jsonOutput');
  const jsonError = $('#jsonError');

  function processJson(indent) {
    const res = formatJSON(jsonInput.value, indent);
    if (res.error) {
      jsonError.classList.remove('hidden');
      jsonOutput.value = '';
    } else {
      jsonError.classList.add('hidden');
      jsonOutput.value = res.data;
    }
  }

  $('#jsonBeautify')?.addEventListener('click', () => processJson(2));
  $('#jsonMinify')?.addEventListener('click', () => processJson(0));
  $('#jsonClear')?.addEventListener('click', () => {
    jsonInput.value = '';
    jsonOutput.value = '';
    jsonError.classList.add('hidden');
  });

  /* 8. BASE64 CONVERTER */
  const b64Text = $('#b64Text');
  const b64Base64 = $('#b64Base64');

  $('#b64Encode')?.addEventListener('click', () => {
    b64Base64.value = encodeBase64(b64Text.value);
  });
  $('#b64Decode')?.addEventListener('click', () => {
    b64Text.value = decodeBase64(b64Base64.value);
  });

  /* 9. PASSWORD GENERATOR */
  const pwOutput = $('#pwOutput');
  const pwLength = $('#pwLength');
  const pwLengthVal = $('#pwLengthVal');
  const pwOptions = ['pwUpper', 'pwLower', 'pwNumbers', 'pwSymbols'];

  function triggerPwGen() {
    const opts = {};
    pwOptions.forEach(id => {
      const el = $('#' + id);
      if (el) opts[id.replace('pw', '').toLowerCase()] = el.checked;
    });
    pwOutput.value = generatePassword(parseInt(pwLength.value), opts);
  }

  pwLength?.addEventListener('input', () => {
    pwLengthVal.textContent = pwLength.value;
    triggerPwGen();
  });
  $('#pwGenBtn')?.addEventListener('click', triggerPwGen);
  
  // Initial password
  if (pwOutput) triggerPwGen();

  /* 10. JWT DECODER */
  const jwtInput = $('#jwtInput');
  const jwtError = $('#jwtError');
  const jwtResults = $('#jwtResults');
  const jwtHeader = $('#jwtHeader');
  const jwtPayload = $('#jwtPayload');
  const jwtSignature = $('#jwtSignature');
  const jwtAlgBadge = $('#jwtAlgBadge');
  const jwtExpBadge = $('#jwtExpBadge');
  const jwtTimestamps = $('#jwtTimestamps');

  function renderJwtTimestamp(label, date) {
    const li = document.createElement('li');
    li.className = 'jwt-ts-row';
    const key = document.createElement('span');
    key.className = 'jwt-ts-key';
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = date.toLocaleString();
    li.appendChild(key);
    li.appendChild(val);
    return li;
  }

  function decodeJwtUI() {
    const raw = jwtInput.value.trim();
    if (!raw) {
      jwtError.classList.add('hidden');
      jwtResults.classList.add('hidden');
      return;
    }
    const res = decodeJWT(raw);
    if (res.error) {
      jwtError.textContent = res.error;
      jwtError.classList.remove('hidden');
      jwtResults.classList.add('hidden');
      return;
    }
    jwtError.classList.add('hidden');
    jwtResults.classList.remove('hidden');

    jwtHeader.textContent = JSON.stringify(res.header, null, 2);
    jwtPayload.textContent = JSON.stringify(res.payload, null, 2);
    jwtSignature.value = res.signature;
    jwtAlgBadge.textContent = res.header.alg || '';

    if (res.isExpired === true) {
      jwtExpBadge.textContent = 'Expired';
      jwtExpBadge.className = 'badge badge-expired';
    } else if (res.isExpired === false) {
      jwtExpBadge.textContent = 'Valid';
      jwtExpBadge.className = 'badge badge-valid';
    } else {
      jwtExpBadge.textContent = 'No expiry';
      jwtExpBadge.className = 'badge';
    }

    jwtTimestamps.innerHTML = '';
    const tsList = document.createElement('ul');
    tsList.className = 'jwt-ts-list';
    if (res.issuedAt) tsList.appendChild(renderJwtTimestamp('Issued at', res.issuedAt));
    if (res.expiresAt) tsList.appendChild(renderJwtTimestamp('Expires at', res.expiresAt));
    if (res.notBefore) tsList.appendChild(renderJwtTimestamp('Not before', res.notBefore));
    if (tsList.children.length) jwtTimestamps.appendChild(tsList);
  }

  jwtInput.addEventListener('input', decodeJwtUI);

  /* 11. COLOR CONVERTER */
  const colorPicker = $('#colorPicker');
  const colorTextInput = $('#colorTextInput');
  const colorError = $('#colorError');
  const colorResults = $('#colorResults');
  const colorSwatch = $('#colorSwatch');
  const colorSwatchLabel = $('#colorSwatchLabel');
  const colorHex = $('#colorHex');
  const colorRgb = $('#colorRgb');
  const colorHsl = $('#colorHsl');
  const colorCssVar = $('#colorCssVar');

  function renderColorUI(c) {
    colorError.classList.add('hidden');
    colorResults.classList.remove('hidden');
    colorSwatch.style.background = c.hex;
    colorSwatchLabel.textContent = c.hex;
    colorHex.value = c.hex;
    colorRgb.value = `rgb(${c.r}, ${c.g}, ${c.b})`;
    colorHsl.value = `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
    colorCssVar.value = `--color: ${c.hex};`;
    colorPicker.value = c.hex;
  }

  function parseColorFromText() {
    const raw = colorTextInput.value.trim();
    if (!raw) {
      colorError.classList.add('hidden');
      colorResults.classList.add('hidden');
      return;
    }
    const c = parseColor(raw);
    if (!c) {
      colorError.classList.remove('hidden');
      colorResults.classList.add('hidden');
      return;
    }
    renderColorUI(c);
  }

  colorTextInput.addEventListener('input', parseColorFromText);
  colorPicker.addEventListener('input', () => {
    colorTextInput.value = colorPicker.value;
    const c = parseColor(colorPicker.value);
    if (c) renderColorUI(c);
  });

  // Initialize with the default picker value
  renderColorUI(parseColor(colorPicker.value));

  /* 12. HASH GENERATOR */
  const hashInput = $('#hashInput');
  const hashOutput = $('#hashOutput');
  const hashBitLength = $('#hashBitLength');

  function getHashAlgo() {
    const checked = $('input[name="hashAlgo"]:checked');
    return checked ? checked.value : 'SHA-256';
  }

  function updateHashUI() {
    const text = hashInput.value;
    const algo = getHashAlgo();
    const bits = { 'SHA-1': '160', 'SHA-256': '256', 'SHA-384': '384', 'SHA-512': '512' };
    hashBitLength.textContent = (bits[algo] || '') + ' bits';
    if (!text) { hashOutput.value = ''; return; }
    hashText(text, algo).then(hex => { hashOutput.value = hex; });
  }

  hashInput.addEventListener('input', updateHashUI);
  $$('input[name="hashAlgo"]').forEach(r => r.addEventListener('change', updateHashUI));
  updateHashUI();

  /* 13. DIFF VIEWER */
  const diffOriginal = $('#diffOriginal');
  const diffModified = $('#diffModified');
  const diffOutput = $('#diffOutput');
  const diffStats = $('#diffStats');

  function escapeHtmlText(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderDiffUI() {
    const a = diffOriginal.value;
    const b = diffModified.value;
    if (!a && !b) {
      diffStats.innerHTML = '';
      diffOutput.innerHTML = '<div class="diff-empty">Enter text in both fields to see the diff.</div>';
      return;
    }
    const { hunks, added, removed, equal } = computeDiff(a, b);

    diffStats.innerHTML =
      (added   ? `<span class="diff-stat diff-stat-added">+${added} added</span>`   : '') +
      (removed ? `<span class="diff-stat diff-stat-removed">−${removed} removed</span>` : '') +
      `<span class="diff-stat diff-stat-equal">${equal} unchanged</span>`;

    const fragment = document.createDocumentFragment();
    hunks.forEach(({ type, value }) => {
      const line = document.createElement('div');
      line.className = 'diff-line diff-line-' + type;
      const prefix = type === 'added' ? '+ ' : type === 'removed' ? '− ' : '  ';
      line.textContent = prefix + value;
      fragment.appendChild(line);
    });
    diffOutput.innerHTML = '';
    diffOutput.appendChild(fragment);
  }

  diffOriginal.addEventListener('input', renderDiffUI);
  diffModified.addEventListener('input', renderDiffUI);

  /* 14. NUMBER BASE CONVERTER */
  const baseFields = {
    dec: { el: $('#baseDec'), base: 10 },
    hex: { el: $('#baseHex'), base: 16 },
    bin: { el: $('#baseBin'), base: 2  },
    oct: { el: $('#baseOct'), base: 8  },
  };
  const baseError = $('#baseError');
  const bits8El   = $('#bits8');
  const bits16El  = $('#bits16');
  const bits32El  = $('#bits32');

  function updateBaseUI(sourceKey) {
    const { el, base } = baseFields[sourceKey];
    const n = parseBaseInput(el.value, base);

    if (el.value.trim() === '') {
      baseError.classList.add('hidden');
      Object.values(baseFields).forEach(f => { if (f !== baseFields[sourceKey]) f.el.value = ''; });
      bits8El.textContent = bits16El.textContent = bits32El.textContent = '';
      return;
    }

    if (n === null) {
      baseError.classList.remove('hidden');
      return;
    }

    baseError.classList.add('hidden');
    const result = convertBases(n);
    baseFields.dec.el.value = sourceKey === 'dec' ? el.value : result.decimal;
    baseFields.hex.el.value = sourceKey === 'hex' ? el.value.toUpperCase() : result.hex;
    baseFields.bin.el.value = sourceKey === 'bin' ? el.value : result.binary;
    baseFields.oct.el.value = sourceKey === 'oct' ? el.value : result.octal;

    bits8El.textContent  = result.bits8;
    bits16El.textContent = result.bits16;
    bits32El.textContent = result.bits32;
  }

  Object.keys(baseFields).forEach(key => {
    baseFields[key].el.addEventListener('input', () => updateBaseUI(key));
  });

  /* 15. CASE CONVERTER */
  const caseInput   = $('#caseInput');
  const caseResults = $('#caseResults');

  function updateCaseUI() {
    const result = convertCase(caseInput.value);
    if (!result) {
      caseResults.classList.add('hidden');
      return;
    }
    caseResults.classList.remove('hidden');
    $('#caseCamel').value     = result.camel;
    $('#casePascal').value    = result.pascal;
    $('#caseSnake').value     = result.snake;
    $('#caseScreaming').value = result.screamingSnake;
    $('#caseKebab').value     = result.kebab;
    $('#caseTitleCase').value = result.titleCase;
    $('#caseLower').value     = result.lower;
    $('#caseUpper').value     = result.upper;
    $('#caseDot').value       = result.dot;
    $('#casePath').value      = result.path;
  }

  caseInput.addEventListener('input', updateCaseUI);

  /* 16. SAMPLE DATA LOADING */
  const SAMPLES = {
    md: "# Tools4Tech\n\nThis is a **live preview** of the Markdown editor.\n\n### Features:\n- 100% Client-Side\n- Fast & Private\n- [Easy to use](https://tools4tech.com)\n\n```javascript\nconsole.log('Hello World');\n```",
    rx: { pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', test: 'Contact us at hello@tools4tech.com or support@example.org' },
    ts: '1714521600',
    url: 'https://example.com:8080/path/to/resource?query=1&auth=true#section-1',
    cr: '0 9 * * 1-5',
    json: '{\n  "project": "Tools4Tech",\n  "version": "1.0.0",\n  "active": true,\n  "tools": ["JSON", "Base64", "Regex"]\n}',
    b64: 'SGVsbG8gZnJvbSBUb29sczRUZWNoIQ==',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    color: '#6366F1',
    hash: 'The quick brown fox jumps over the lazy dog',
    diffA: 'function greet(name) {\n  console.log("Hello, " + name);\n  return true;\n}\n\nconst user = "Alice";\ngreet(user);',
    diffB: 'function greet(name, greeting = "Hello") {\n  console.log(greeting + ", " + name + "!");\n  return name;\n}\n\nconst user = "Bob";\ngreet(user, "Hi");',
    base: '255',
    caseText: 'user profile settings'
  };

  $('#mdSample')?.addEventListener('click', () => {
    mdInput.value = SAMPLES.md;
    renderMd();
  });

  $('#rxSample')?.addEventListener('click', () => {
    rxPattern.value = SAMPLES.rx.pattern;
    rxTestStr.value = SAMPLES.rx.test;
    evalRegexUI();
  });

  $('#tsSample')?.addEventListener('click', () => {
    tsEpochInput.value = SAMPLES.ts;
    tsConvertEpochBtn.click();
  });

  $('#urlSample')?.addEventListener('click', () => {
    urlInput.value = SAMPLES.url;
    parseUrlUI();
  });

  $('#crSample')?.addEventListener('click', () => {
    const parts = SAMPLES.cr.split(' ');
    cronInputs.forEach((el, i) => el.value = parts[i]);
    updateCronUI();
  });

  $('#jsonSample')?.addEventListener('click', () => {
    jsonInput.value = SAMPLES.json;
    processJson(2);
  });

  $('#b64Sample')?.addEventListener('click', () => {
    b64Base64.value = SAMPLES.b64;
    b64Text.value = decodeBase64(SAMPLES.b64);
  });

  $('#jwtSample')?.addEventListener('click', () => {
    jwtInput.value = SAMPLES.jwt;
    decodeJwtUI();
  });

  $('#colorSample')?.addEventListener('click', () => {
    colorTextInput.value = SAMPLES.color;
    parseColorFromText();
  });

  $('#hashSample')?.addEventListener('click', () => {
    hashInput.value = SAMPLES.hash;
    updateHashUI();
  });

  $('#diffSample')?.addEventListener('click', () => {
    diffOriginal.value = SAMPLES.diffA;
    diffModified.value = SAMPLES.diffB;
    renderDiffUI();
  });

  $('#baseSample')?.addEventListener('click', () => {
    baseFields.dec.el.value = SAMPLES.base;
    updateBaseUI('dec');
  });

  $('#caseSample')?.addEventListener('click', () => {
    caseInput.value = SAMPLES.caseText;
    updateCaseUI();
  });

})();