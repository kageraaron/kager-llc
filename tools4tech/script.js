/* ============================================================
   Tools4Tech — script.js
   All tool logic: Navigation, Markdown, Regex, Timestamp,
   URL Parser, Cron Schedule
   ============================================================ */

(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function escapeHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const toast = $('#copyToast');
    toast.textContent = msg || 'Copied to clipboard!';
    toast.classList.add('show');
    clearTimeout(toast._tid);
    toast._tid = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast());
  }

  /* ---------- copy buttons via data-copy ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const id = btn.getAttribute('data-copy');
    const el = document.getElementById(id);
    if (el && el.value) copyText(el.value);
  });

  /* ==========================================================
     1. NAVIGATION
     ========================================================== */
  const navItems = $$('.nav-item');
  const sections = $$('.tool-section');
  const sidebar = $('#sidebar');
  const mobileBtn = $('#mobileMenuBtn');

  function switchTool(toolId) {
    navItems.forEach((n) => n.classList.toggle('active', n.dataset.tool === toolId));
    sections.forEach((s) => {
      s.classList.toggle('active', s.id === 'tool-' + toolId);
    });
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  }

  navItems.forEach((n) =>
    n.addEventListener('click', (e) => {
      e.preventDefault();
      const tool = n.dataset.tool;
      history.replaceState(null, '', '#' + tool);
      switchTool(tool);
    })
  );

  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Hash routing on load
  const initHash = location.hash.replace('#', '') || 'markdown';
  switchTool(initHash);

  /* ==========================================================
     2. MARKDOWN EDITOR
     ========================================================== */
  const mdInput = $('#markdownInput');
  const mdPreview = $('#markdownPreview');
  const mdCopyBtn = $('#mdCopyHtml');
  const mdClearBtn = $('#mdClear');
  const mdToolbarBtns = $$('[data-md]');

  const defaultMd = `# Welcome to Tools4Tech

A fast, client-side Markdown editor with live preview.

## Features
- **Bold** and *Italic* text
- Live rendering as you type
- Code blocks:

\`\`\`javascript
console.log("Hello, World!");
\`\`\`

- [Links](https://example.com)
- > Blockquotes

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
`;

  mdInput.value = defaultMd;

  function renderMd() {
    mdPreview.innerHTML = marked.parse(mdInput.value);
  }

  mdInput.addEventListener('input', renderMd);
  renderMd();

  mdClearBtn.addEventListener('click', () => {
    mdInput.value = '';
    renderMd();
    mdInput.focus();
  });

  mdCopyBtn.addEventListener('click', () => {
    copyText(marked.parse(mdInput.value));
  });

  /* toolbar actions */
  function mdInsert(before, after) {
    const start = mdInput.selectionStart;
    const end = mdInput.selectionEnd;
    const sel = mdInput.value.substring(start, end) || 'text';
    mdInput.setRangeText(before + sel + (after || ''), start, end, 'select');
    mdInput.focus();
    renderMd();
  }

  mdToolbarBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      const t = btn.dataset.md;
      if (t === 'bold') mdInsert('**', '**');
      else if (t === 'italic') mdInsert('*', '*');
      else if (t === 'code') mdInsert('`', '`');
      else if (t === 'link') mdInsert('[', '](url)');
      else if (t === 'heading') mdInsert('## ', '');
    })
  );

  /* ==========================================================
     3. REGEX TESTER
     ========================================================== */
  const rxPattern = $('#regexPattern');
  const rxFlags = $('#regexFlags');
  const rxTestStr = $('#regexTestString');
  const rxHighlight = $('#regexHighlightLayer');
  const rxError = $('#regexError');
  const rxMatchCount = $('#regexMatchCount');
  const rxMatchDetails = $('#regexMatchDetails');

  rxPattern.value = '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b';
  rxFlags.value = 'g';
  rxTestStr.value = 'Contact us at info@example.com or support@test.org for more information.';

  function evalRegex() {
    const pat = rxPattern.value;
    const flags = rxFlags.value;
    const text = rxTestStr.value;

    if (!pat) {
      rxHighlight.innerHTML = escapeHtml(text);
      rxError.classList.add('hidden');
      rxMatchCount.textContent = '0 matches';
      rxMatchDetails.innerHTML = '<div class="match-item"><span class="match-index" style="color:var(--text-muted)">No matches yet</span></div>';
      return;
    }

    let regex;
    try {
      regex = new RegExp(pat, flags);
      rxError.classList.add('hidden');
    } catch {
      rxError.classList.remove('hidden');
      rxHighlight.innerHTML = escapeHtml(text);
      rxMatchCount.textContent = 'Error';
      return;
    }

    // Need global to iterate all matches
    let gRegex;
    try {
      const gFlags = flags.includes('g') ? flags : flags + 'g';
      gRegex = new RegExp(pat, gFlags);
    } catch {
      gRegex = regex;
    }

    if (gRegex.test('') && pat !== '^' && pat !== '$') {
      rxHighlight.innerHTML = escapeHtml(text);
      rxMatchCount.textContent = 'Matches empty string';
      return;
    }

    const matches = [];
    let m;
    const searchRegex = new RegExp(pat, (flags.includes('g') ? flags : flags + 'g'));
    while ((m = searchRegex.exec(text)) !== null) {
      matches.push({ value: m[0], index: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) { searchRegex.lastIndex++; }
    }

    // Build highlight
    let html = '';
    let last = 0;
    matches.forEach((mt) => {
      html += escapeHtml(text.slice(last, mt.index));
      html += '<mark class="regex-match-hl">' + escapeHtml(mt.value) + '</mark>';
      last = mt.end;
    });
    html += escapeHtml(text.slice(last)) + '\n';
    rxHighlight.innerHTML = html;

    rxMatchCount.textContent = matches.length + ' match' + (matches.length === 1 ? '' : 'es');

    // Details
    if (matches.length === 0) {
      rxMatchDetails.innerHTML = '<div class="match-item"><span class="match-index" style="color:var(--text-muted)">No matches</span></div>';
    } else {
      rxMatchDetails.innerHTML = matches
        .map(
          (mt, i) =>
            `<div class="match-item"><span class="match-index">#${i + 1}</span><span class="match-value">${escapeHtml(mt.value)}</span><span class="match-range">[${mt.index}–${mt.end}]</span></div>`
        )
        .join('');
    }
  }

  rxPattern.addEventListener('input', evalRegex);
  rxFlags.addEventListener('input', evalRegex);
  rxTestStr.addEventListener('input', evalRegex);
  rxTestStr.addEventListener('scroll', () => {
    rxHighlight.scrollTop = rxTestStr.scrollTop;
  });
  evalRegex();

  /* ==========================================================
     4. UNIX TIMESTAMP CONVERTER
     ========================================================== */
  const tsLiveEpoch = $('#tsLiveEpoch');
  const tsLiveDate = $('#tsLiveDate');
  const tsEpochInput = $('#tsEpochInput');
  const tsConvertEpochBtn = $('#tsConvertEpochBtn');
  const tsLocalResult = $('#tsLocalResult');
  const tsUtcResult = $('#tsUtcResult');
  const tsIsoResult = $('#tsIsoResult');
  const tsRelativeResult = $('#tsRelativeResult');
  const tsEpochError = $('#tsEpochError');
  const tsDateInput = $('#tsDateInput');
  const tsConvertDateBtn = $('#tsConvertDateBtn');
  const tsEpochResult = $('#tsEpochResult');
  const tsMsResult = $('#tsMsResult');

  function updateLiveClock() {
    const now = new Date();
    tsLiveEpoch.textContent = Math.floor(now.getTime() / 1000);
    tsLiveDate.textContent = now.toLocaleString();
  }

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  function relativeTime(date) {
    const now = Date.now();
    const diff = date.getTime() - now;
    const absDiff = Math.abs(diff);
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);
    let label;
    if (years > 0) label = years + ' year' + (years > 1 ? 's' : '');
    else if (days > 0) label = days + ' day' + (days > 1 ? 's' : '');
    else if (hours > 0) label = hours + ' hour' + (hours > 1 ? 's' : '');
    else if (minutes > 0) label = minutes + ' minute' + (minutes > 1 ? 's' : '');
    else label = seconds + ' second' + (seconds !== 1 ? 's' : '');
    return diff >= 0 ? 'in ' + label : label + ' ago';
  }

  tsConvertEpochBtn.addEventListener('click', () => {
    let val = parseInt(tsEpochInput.value.trim(), 10);
    if (isNaN(val)) { tsEpochError.classList.remove('hidden'); return; }
    tsEpochError.classList.add('hidden');
    if (val < 1e11) val *= 1000;
    const d = new Date(val);
    if (isNaN(d.getTime())) { tsEpochError.classList.remove('hidden'); return; }
    tsLocalResult.value = d.toLocaleString();
    tsUtcResult.value = d.toUTCString();
    tsIsoResult.value = d.toISOString();
    tsRelativeResult.value = relativeTime(d);
  });

  tsConvertDateBtn.addEventListener('click', () => {
    const d = new Date(tsDateInput.value);
    if (isNaN(d.getTime())) return;
    tsEpochResult.value = Math.floor(d.getTime() / 1000);
    tsMsResult.value = d.getTime();
  });

  // Default date
  const tzOff = new Date().getTimezoneOffset() * 60000;
  tsDateInput.value = new Date(Date.now() - tzOff).toISOString().slice(0, 16);

  /* ==========================================================
     5. URL PARSER
     ========================================================== */
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

  let currentUrl = null;

  function parseUrl() {
    const raw = urlInput.value.trim();
    if (!raw) {
      urlParsed.classList.add('hidden');
      urlError.classList.add('hidden');
      return;
    }
    try {
      currentUrl = new URL(raw);
      urlError.classList.add('hidden');
      urlParsed.classList.remove('hidden');

      urlProto.value = currentUrl.protocol;
      urlHost.value = currentUrl.hostname;
      urlPort.value = currentUrl.port || (currentUrl.protocol === 'https:' ? '443' : '80');
      urlPath.value = currentUrl.pathname;
      urlHash.value = currentUrl.hash;
      urlOrigin.value = currentUrl.origin;

      const params = Array.from(currentUrl.searchParams.entries());
      urlParamCount.textContent = params.length + ' param' + (params.length === 1 ? '' : 's');

      if (params.length === 0) {
        urlQueryTable.classList.add('hidden');
        urlNoParams.classList.remove('hidden');
      } else {
        urlQueryTable.classList.remove('hidden');
        urlNoParams.classList.add('hidden');
        urlQueryBody.innerHTML = '';
        params.forEach(([key, value]) => {
          const tr = document.createElement('tr');
          const tdK = document.createElement('td');
          const kInput = document.createElement('input');
          kInput.type = 'text';
          kInput.value = key;
          kInput.readOnly = true;
          tdK.appendChild(kInput);

          const tdV = document.createElement('td');
          const vInput = document.createElement('input');
          vInput.type = 'text';
          vInput.value = value;
          vInput.addEventListener('input', (ev) => {
            currentUrl.searchParams.set(key, ev.target.value);
            urlInput.value = currentUrl.toString();
          });
          tdV.appendChild(vInput);

          tr.appendChild(tdK);
          tr.appendChild(tdV);
          urlQueryBody.appendChild(tr);
        });
      }
    } catch {
      urlError.classList.remove('hidden');
      urlParsed.classList.add('hidden');
    }
  }

  urlInput.addEventListener('input', parseUrl);
  parseUrl();

  /* ==========================================================
     6. CRON SCHEDULE
     ========================================================== */
  const cronFields = ['cronMin', 'cronHour', 'cronDom', 'cronMonth', 'cronDow'];
  const cronInputs = cronFields.map((id) => document.getElementById(id));
  const cronFullExpr = $('#cronFullExpression');
  const cronDesc = $('#cronDescription');
  const cronNextRuns = $('#cronNextRuns');
  const cronPresetBtns = $$('.cron-preset-btn');

  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* Parse a single cron field into an array of valid integers */
  function parseCronField(field, min, max) {
    const vals = new Set();
    const parts = field.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // step: */n or range/n
      const [rangeStr, stepStr] = trimmed.split('/');
      const step = stepStr ? parseInt(stepStr, 10) : 1;
      if (isNaN(step) || step < 1) return null;

      let start, end;
      if (rangeStr === '*') {
        start = min;
        end = max;
      } else if (rangeStr.includes('-')) {
        const [a, b] = rangeStr.split('-').map(Number);
        if (isNaN(a) || isNaN(b)) return null;
        start = a;
        end = b;
      } else {
        const n = parseInt(rangeStr, 10);
        if (isNaN(n)) return null;
        start = n;
        end = n;
      }
      if (start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i += step) vals.add(i);
    }
    return vals.size > 0 ? Array.from(vals).sort((a, b) => a - b) : null;
  }

  /* Describe one field in human language */
  function describeField(field, min, max, unit, nameArray) {
    if (field === '*') return '';
    const parsed = parseCronField(field, min, max);
    if (!parsed) return 'invalid ' + unit;
    if (parsed.length === max - min + 1) return '';

    const stepMatch = field.match(/^\*\/(\d+)$/);
    if (stepMatch) return 'every ' + stepMatch[1] + ' ' + unit + (parseInt(stepMatch[1]) > 1 ? 's' : '');

    const names = parsed.map((v) => (nameArray ? nameArray[v] || v : v));
    return unit + ' ' + names.join(', ');
  }

  function describeCron(parts) {
    const [minF, hrF, domF, monF, dowF] = parts;
    const pieces = [];

    // Minute
    if (minF === '*') pieces.push('every minute');
    else if (minF.startsWith('*/')) pieces.push('every ' + minF.slice(2) + ' minutes');
    else pieces.push('at minute ' + minF);

    // Hour
    if (hrF === '*') { /* every hour, already implied */ }
    else if (hrF.startsWith('*/')) pieces.push('every ' + hrF.slice(2) + ' hours');
    else pieces.push('past hour ' + hrF);

    // Day of month
    if (domF !== '*') {
      if (domF.startsWith('*/')) pieces.push('every ' + domF.slice(2) + ' days');
      else pieces.push('on day ' + domF + ' of the month');
    }

    // Month
    if (monF !== '*') {
      const mParsed = parseCronField(monF, 1, 12);
      if (mParsed) pieces.push('in ' + mParsed.map((m) => MONTH_NAMES[m]).join(', '));
    }

    // Day of week
    if (dowF !== '*') {
      const dParsed = parseCronField(dowF, 0, 6);
      if (dParsed) pieces.push('on ' + dParsed.map((d) => DOW_NAMES[d]).join(', '));
    }

    return pieces.join(', ').replace(/^./, (c) => c.toUpperCase());
  }

  /* Compute next N run times */
  function nextCronRuns(parts, count) {
    const [minVals, hrVals, domVals, monVals, dowVals] = [
      parseCronField(parts[0], 0, 59),
      parseCronField(parts[1], 0, 23),
      parseCronField(parts[2], 1, 31),
      parseCronField(parts[3], 1, 12),
      parseCronField(parts[4], 0, 6),
    ];

    if (!minVals || !hrVals || !domVals || !monVals || !dowVals) return [];

    const runs = [];
    const now = new Date();
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
    const limit = 525600; // max 1 year of minutes to search

    for (let i = 0; i < limit && runs.length < count; i++) {
      const cMonth = cursor.getMonth() + 1;
      const cDom = cursor.getDate();
      const cDow = cursor.getDay();
      const cHour = cursor.getHours();
      const cMin = cursor.getMinutes();

      if (
        monVals.includes(cMonth) &&
        domVals.includes(cDom) &&
        dowVals.includes(cDow) &&
        hrVals.includes(cHour) &&
        minVals.includes(cMin)
      ) {
        runs.push(new Date(cursor));
      }
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return runs;
  }

  function updateCron() {
    const parts = cronInputs.map((inp) => inp.value.trim() || '*');
    cronFullExpr.textContent = parts.join(' ');

    const desc = describeCron(parts);
    cronDesc.textContent = desc || 'Runs every minute';

    const runs = nextCronRuns(parts, 5);
    if (runs.length === 0) {
      cronNextRuns.innerHTML = '<li><span class="run-index">—</span>No upcoming runs found (check expression)</li>';
    } else {
      cronNextRuns.innerHTML = runs
        .map(
          (d, i) =>
            `<li><span class="run-index">${i + 1}.</span>${d.toLocaleString()}</li>`
        )
        .join('');
    }
  }

  cronInputs.forEach((inp) => inp.addEventListener('input', updateCron));

  cronPresetBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      const vals = btn.dataset.cron.split(' ');
      cronInputs.forEach((inp, i) => (inp.value = vals[i] || '*'));
      updateCron();
    })
  );

  updateCron();
})();
