/**
 * Kager LLC — Universal Analytics Loader
 * =======================================
 * A single, self-contained script that injects Google Analytics (GA4),
 * Google Ads conversion tracking, and Google AdSense based on data
 * attributes on its own <script> tag.
 *
 * Usage (in any static HTML project):
 *
 *   <script
 *     src="analytics.js"
 *     data-ga4="G-XXXXXXXXXX"
 *     data-ads="AW-XXXXXXXXXX"
 *     data-adsense="ca-pub-XXXXXXXXXXXXXXXX"
 *   ></script>
 *
 * All three attributes are optional — omit any to skip that integration.
 * On localhost, scripts still load but GA won't send real hits by default.
 *
 * To update tracking IDs: just change the data attributes in your HTML.
 * To update the loader logic: edit this file and run sync-analytics.sh.
 */
(function () {
  'use strict';

  // Find our own <script> tag to read data attributes
  var scripts = document.getElementsByTagName('script');
  var self = scripts[scripts.length - 1]; // last script = the one currently executing

  var ga4Id = self.getAttribute('data-ga4') || '';
  var adsId = self.getAttribute('data-ads') || '';
  var adsenseId = self.getAttribute('data-adsense') || '';

  // ── Helpers ────────────────────────────────────────────────────────

  function loadScript(src, attrs) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) s.setAttribute(key, attrs[key]);
      }
    }
    document.head.appendChild(s);
  }

  function inlineScript(code) {
    var s = document.createElement('script');
    s.textContent = code;
    document.head.appendChild(s);
  }

  // ── Google Analytics (GA4) + Google Ads ────────────────────────────

  var gtagIds = [];
  if (ga4Id) gtagIds.push(ga4Id);
  if (adsId) gtagIds.push(adsId);

  if (gtagIds.length > 0) {
    // Load gtag.js once (using the first ID)
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + gtagIds[0]);

    // Configure all IDs
    var configLines = gtagIds.map(function (id) {
      return "gtag('config', '" + id + "');";
    }).join('\n');

    inlineScript(
      "window.dataLayer = window.dataLayer || [];\n" +
      "function gtag(){dataLayer.push(arguments);}\n" +
      "gtag('js', new Date());\n" +
      configLines + "\n" +
      "window.trackEvent = function(name, params) { gtag('event', name, params); };"
    );
  }

  // ── Google AdSense ────────────────────────────────────────────────

  if (adsenseId) {
    loadScript(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + adsenseId,
      { crossorigin: 'anonymous' }
    );
  }
})();
