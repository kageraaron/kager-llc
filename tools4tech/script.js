import { renderMarkdown } from '../utils/markdown-editor/lib.js';
import { evaluateRegex, escapeHtml } from '../utils/regex-tester/lib.js';
import { epochToDate, dateToEpoch, formatRelativeTime } from '../utils/unix-timestamp-converter/lib.js';
import { parseURL, updateURLParam } from '../utils/url-parser/lib.js';
import { describeCron, nextCronRuns } from '../utils/cron-schedule/lib.js';

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
    navigator.clipboard.writeText(text).then(() => showToast());
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
        rxHighlight.innerHTML = res.highlightedHtml + '
';
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
            tr.innerHTML = '<td><input type="text" value="' + key + '" readonly></td>' +
                           '<td><input type="text" value="' + value + '" class="param-val"></td>';
            tr.querySelector('.param-val').addEventListener('input', (e) => {
                urlInput.value = updateURLParam(urlInput.value, key, e.target.value);
            });
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
    cronNextRuns.innerHTML = runs.length ? runs.map((d, i) => '<li><span class="run-index">' + (i+1) + '.</span>' + d.toLocaleString() + '</li>').join('') : '<li>No upcoming runs</li>';
  }
  cronInputs.forEach(i => i.addEventListener('input', updateCronUI));
  updateCronUI();

})();