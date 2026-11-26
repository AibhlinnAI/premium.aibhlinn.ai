/* ============================================================
   premium.aibhlinn.ai/foundation.html: the launch pie, and how many
   Foundation places are left.

   Moved here with the page from pie-timers-app/app/foundation.html on
   26 Nov 2026 (Mal). Both scripts are that page's, with the address
   and key held here instead of in config.js.

   The dates below are on the "launch dates live in several places"
   list in pie-timers-app/CLAUDE.md. If one moves there, move it here.

   Everything in CFG is public by design: the same publishable key is
   in premium.js and in pie-timers-app/app/config.js.
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    isConfigured: true,
    supabaseUrl: 'https://tgapmpbcqqnpsldehuqa.supabase.co',
    supabaseAnonKey: 'sb_publishable_WZqsLnw3OPfo6z_ou0GaYg_B8_HuNG0'
  };

  /* ── The launch pie ─────────────────────────────────────────
     Empties clockwise across the Black Friday Launch Offer: from the
     start of 22 November 2026 to the end of 31 December 2026, 40 days.
     The instants are fixed in UTC, so the result does not depend on the
     visitor's time zone. START is Adelaide midnight (+10:30). END is
     noon UTC on 1 January 2027, the end of 31 December in the last time
     zone on Earth, so the page's dates carry no time zone. END is also
     the instant Foundation closes (FOUNDATION_CLOSES below) and
     OFFER_CLOSES in premium.js.
     Without this script the page keeps the full pie and the caption
     written in the markup. Once the offer is over the hook and its
     condition come down, so the card never invites anyone to an offer
     that has ended. */
  (function () {
    var START = Date.UTC(2026, 10, 21, 13, 30); // 22 Nov 2026 00:00 +10:30
    var END = Date.UTC(2027, 0, 1, 12, 0);      // end of 31 Dec 2026 at UTC-12
    var R = 37;

    var pie = document.getElementById('launchPie');
    var caption = document.getElementById('launchCaption');
    var hook = document.getElementById('launchHook');
    var terms = document.getElementById('launchTerms');
    if (pie && caption) {
      render();
      setInterval(render, 60000);
    }

    function point(fraction) {
      var angle = fraction * 2 * Math.PI;
      return (R * Math.sin(angle)).toFixed(3) + ' ' + (-R * Math.cos(angle)).toFixed(3);
    }

    function wedge(left) {
      if (left <= 0) return '';
      if (left >= 0.99999) {
        return 'M 0 ' + -R + ' A ' + R + ' ' + R + ' 0 1 1 0 ' + R +
               ' A ' + R + ' ' + R + ' 0 1 1 0 ' + -R + ' Z';
      }
      return 'M 0 0 L ' + point(1 - left) +
             ' A ' + R + ' ' + R + ' 0 ' + (left > 0.5 ? 1 : 0) + ' 1 0 ' + -R + ' Z';
    }

    function render() {
      var now = Date.now();
      var left, text;
      if (now < START) {
        left = 1;
        text = 'The offer starts on 22 November 2026.';
      } else if (now < END) {
        left = (END - now) / (END - START);
        // Whole or part days of 24 hours left to END.
        var days = Math.ceil((END - now) / 86400000);
        text = days === 1 ? 'Last day of the offer.' : days + ' days left in the offer.';
      } else {
        left = 0;
        text = 'The offer is over. It ran to the end of 31 December 2026.';
      }
      pie.setAttribute('d', wedge(left));
      caption.textContent = text;
      if (hook) hook.hidden = now >= END;
      if (terms) terms.hidden = now >= END;
      // The owner's sentence names the offer, so it comes down with it.
      var sentence = document.getElementById('offerSentence');
      if (sentence) sentence.hidden = now >= END;
    }
  })();

  /* ── How many places are left ───────────────────────────────
     Read from the one function the public may call
     (pie-timers-app/supabase/schema-foundation.sql). */
  (function () {
    var line = document.getElementById('foundationState');
    if (!line) return;

    /* The block between the two markers is the foundation-status block
       from pie-timers-app (app/pricing.html, app/foundation.html), with
       the config read from CFG above. Keep the three in step.
       One request, to the one function the public may call. It sends
       nothing about the visitor and never a session. Anything but a
       well-formed answer is null, and null never shows a number. */
    /* foundation-status:begin */
    var FOUNDATION_CLOSES = Date.UTC(2027, 0, 1, 12, 0); // end of 31 Dec 2026 at UTC-12
    function readFoundation(waitMs) {
      var cfg = CFG;
      if (!cfg.isConfigured || !window.fetch) return Promise.resolve(null);
      var abort = window.AbortController ? new AbortController() : null;
      var timer = abort ? setTimeout(function () { abort.abort(); }, waitMs || 4000) : null;
      return fetch(cfg.supabaseUrl + '/rest/v1/rpc/foundation_status', {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: 'Bearer ' + cfg.supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: '{}',
        cache: 'no-store',
        signal: abort ? abort.signal : undefined
      }).then(function (res) { return res.ok ? res.json() : null; })
        .then(function (s) {
          var n = s && s.places_left;
          if (!s || typeof s.open !== 'boolean' || typeof n !== 'number' ||
              n !== Math.floor(n) || n < 0 || n > 100) return null;
          return { open: s.open, left: n };
        })
        .catch(function () { return null; })
        .then(function (s) { if (timer) clearTimeout(timer); return s; });
    }
    /* 'open' | 'full' | 'closed' | 'unknown'. Zero left is never 'open',
       and nothing is 'open' once this device's clock is past the closing
       instant, whatever the server said. The clock can only close. */
    function foundationState(s, now) {
      if (!s) return now >= FOUNDATION_CLOSES ? 'closed' : 'unknown';
      if (s.left === 0) return 'full';
      if (!s.open || now >= FOUNDATION_CLOSES) return 'closed';
      return 'open';
    }
    /* foundation-status:end */

    var readAt = 0;

    function show(text, withPricing) {
      line.textContent = text;
      if (withPricing) {
        line.appendChild(document.createTextNode(' '));
        var link = document.createElement('a');
        link.href = '/';
        link.textContent = 'See pricing';
        line.appendChild(link);
        line.appendChild(document.createTextNode('.'));
      }
      line.hidden = false;
    }

    function render(s) {
      var state = foundationState(s, Date.now());
      if (state === 'open') {
        show(s.left + ' of 100 places ' + (s.left === 1 ? 'is' : 'are') + ' left.');
      } else if (state === 'full') {
        show('Foundation is full. All 100 places have been taken. You can still subscribe at the same price, without the price lock.', true);
      } else if (state === 'closed') {
        show('Foundation has closed. It ran to the end of 31 December 2026.');
      } else {
        line.hidden = true;
      }
    }

    function read() { readAt = Date.now(); readFoundation().then(render); }
    read();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - readAt >= 60000) read();
    });
  })();
})();
