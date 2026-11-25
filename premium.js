/* ============================================================
   premium.aibhlinn.ai: confirm your email, then subscribe.

   The one place AibhlínnAI Premium is sold (Mal, 25 Nov 2026). Every app
   sends people here; none sells in-app.

   Order of events:
     1. The buyer confirms their email with an emailed code, or with
        Google. That is a real sign-in to the shared AibhlínnAI account
        (identity/identity.js, copied unmodified from pie-timers-app), so
        the account checkout charges is provably theirs. A typed email
        with no code is never enough: a typo would take payment against
        no account, and the page would reveal whether an address has one.
        A new address becomes a new account, and the database starts its
        14-day free trial, exactly as signing up in the app does.
     2. The page reads the account's own entitlement (my_entitlement).
     3. In a free trial: the create-checkout function makes a Paddle
        transaction that already carries the right free days, and the
        overlay opens on that. Trial over: the plain price, paid today,
        tied to the account by custom_data.user_id, exactly as billing.js
        does. Already subscribed: no checkout.

   What this page needs from elsewhere before it can work (README):
     - Paddle: premium.aibhlinn.ai approved as a checkout domain.
     - Turnstile: premium.aibhlinn.ai added to the site key's hostnames.
     - The signin and create-checkout functions accepting this origin.
     - Supabase: https://premium.aibhlinn.ai/ in the redirect allow list,
       before GOOGLE_ENABLED is turned on.

   Everything below is public by design: the publishable Supabase key,
   Paddle's client-side token, price ids and the Turnstile site key. The
   same values are in pie-timers-app/app/config.js; keep them in step.
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    supabaseUrl: 'https://tgapmpbcqqnpsldehuqa.supabase.co',
    supabaseAnonKey: 'sb_publishable_WZqsLnw3OPfo6z_ou0GaYg_B8_HuNG0',
    turnstileSiteKey: '0x4AAAAAAEjN3Ts18xs7ZDpk',
    paddleToken: 'live_f40ba5ce81b1aff0afd6ab1ff86',
    annualPriceId: 'pri_01m1effmxgfb45pmtyfz1dnh77',
    monthlyPriceId: 'pri_01m1efkevnwpn0rj7g2kzjne0j'
  };

  /* Off until https://premium.aibhlinn.ai/ is in Supabase's redirect allow
     list. With it off, the Google button stays hidden: a button that
     fails is worse than one that is not there. */
  var GOOGLE_ENABLED = false;

  /* The end of 31 December 2026 anywhere on Earth. The same instant as
     OFFER_CLOSES in pie-timers-app (app/identity-bridge.js, pricing.html):
     if that moves, move this. */
  var OFFER_CLOSES = Date.UTC(2027, 0, 1, 12, 0);

  var $ = function (id) { return document.getElementById(id); };
  var identity = window.Aibhlinn && window.Aibhlinn.identity;

  function say(text, isError) {
    var s = $('status');
    s.textContent = text || '';
    s.classList.toggle('is-error', Boolean(isError));
  }

  /* moveFocus is for moves the buyer caused. On first load focus stays
     where the browser put it. */
  function show(step, moveFocus) {
    ['stepEmail', 'stepCode', 'stepBuy', 'stepDone'].forEach(function (id) {
      $(id).hidden = id !== step;
    });
    if (moveFocus) {
      var h = $(step).querySelector('h2');
      if (h) h.focus();
    }
  }

  function offerOpen() { return Date.now() < OFFER_CLOSES; }

  /* ───────────────────────── Third-party scripts ───────────────────────── */

  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = src;
      tag.async = true;
      tag.onload = function () { resolve(true); };
      tag.onerror = function () { loaded[src] = null; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(tag);
    });
    return loaded[src];
  }

  /* ───────────────────────── Bot check (Turnstile) ─────────────────────────
     The code goes out through the `signin` function, which needs a
     Turnstile token, then applies its own limits. There is no unchecked
     fallback here: Supabase's own /auth/v1/otp has no bot check, and a
     page that sends email to any address it is given needs one. */

  var widgetId = null;
  var token = '';
  function mountChallenge() {
    var host = $('challenge');
    if (widgetId !== null) return Promise.resolve(true);
    return loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
      .then(function () {
        if (!window.turnstile) return false;
        host.hidden = false;
        widgetId = window.turnstile.render(host, {
          sitekey: CFG.turnstileSiteKey,
          action: 'signin',
          theme: 'auto',
          callback: function (t) { token = t; },
          'expired-callback': function () { token = ''; },
          'error-callback': function () { token = ''; }
        });
        return true;
      })
      .catch(function () { return false; });
  }
  function waitForToken(ms) {
    var deadline = Date.now() + ms;
    return new Promise(function (resolve) {
      (function poll() {
        if (token || Date.now() > deadline) return resolve(token);
        setTimeout(poll, 200);
      }());
    });
  }
  function resetChallenge() {
    token = '';
    if (window.turnstile && widgetId !== null) {
      try { window.turnstile.reset(widgetId); } catch (e) { /* ignore */ }
    }
  }

  /* ───────────────────────── Supabase calls ───────────────────────── */

  /* Every call gives up after 15 seconds, so no button stays disabled
     on a request that never answers. Resolves {status, data}. */
  function call(url, init) {
    var timer = null;
    if (typeof AbortController === 'function') {
      var stopper = new AbortController();
      init.signal = stopper.signal;
      timer = setTimeout(function () { stopper.abort(); }, 15000);
    }
    return fetch(url, init).then(function (r) {
      return r.text().then(function (text) {
        if (timer !== null) clearTimeout(timer);
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        return { status: r.status, data: data };
      });
    }, function (err) {
      if (timer !== null) clearTimeout(timer);
      throw err;
    });
  }

  function postJson(url, body, bearer) {
    var headers = { apikey: CFG.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    return call(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  }

  /* The emailed code, through the same protected path the app uses. */
  function sendCode(email) {
    return mountChallenge().then(function (ok) {
      if (!ok) throw new Error(MESSAGES.challengeBlocked);
      return waitForToken(8000);
    }).then(function (t) {
      if (!t) throw new Error('The quick check did not finish. Please wait a moment and try again.');
      return postJson(CFG.supabaseUrl + '/functions/v1/signin', {
        email: email,
        turnstileToken: t,
        redirectTo: location.origin + '/'
      });
    }).then(function (answer) {
      resetChallenge();   // a token is single-use
      if (answer.status === 429) throw new Error('Too many codes asked for. Please wait a few minutes and try again.');
      if (answer.status < 200 || answer.status >= 300) throw new Error('We could not send a code just now. Please try again.');
    }, function (err) {
      resetChallenge();
      if (err && (err.message === MESSAGES.challengeBlocked || /quick check/.test(err.message))) throw err;
      throw new Error('We could not send a code just now. Please try again.');
    });
  }

  /* The account's own entitlement row. A failed lookup stops the sale
     rather than guessing: guessing "not in a trial" would charge today
     someone whose first payment is due later. */
  function getEntitlement() {
    return identity.validToken().then(function (t) {
      if (!t) throw signedOutError();
      return call(CFG.supabaseUrl + '/rest/v1/my_entitlement?select=*&limit=1', {
        method: 'GET',
        headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + t }
      });
    }).then(function (a) {
      if (a.status < 200 || a.status >= 300 || !Array.isArray(a.data)) throw new Error('lookup');
      return a.data[0] || { entitled: false, plan: null, status: 'none' };
    });
  }

  /* The session ended (refresh refused, or signed out elsewhere). The
     page goes back to the email step rather than offering "try again". */
  function signedOutError() {
    var e = new Error(MESSAGES.again);
    e.signedOut = true;
    return e;
  }

  /* The account the stored token actually signs in as, fresh from
     Supabase. What the page shows and what checkout is tied to both come
     from here, never from a cached copy. */
  function freshUser() {
    return identity.loadUser().then(function (u) {
      return (u && u.id && u.email) ? u : null;
    }, function () { return null; });
  }

  function inTrial(ent) { return ent.plan === 'trial' && Boolean(ent.entitled); }
  function alreadySubscribed(ent) {
    return (ent.plan === 'monthly' || ent.plan === 'annual') && !ent.complimentary &&
           Boolean(ent.entitled) && !ent.cancel_at_period_end;
  }

  /* ───────────────────────── Paddle ───────────────────────── */

  var paddleReady = null;
  function initPaddle() {
    if (paddleReady) return paddleReady;
    paddleReady = loadScript('https://cdn.paddle.com/paddle/v2/paddle.js').then(function () {
      if (!window.Paddle) { paddleReady = null; return false; }
      window.Paddle.Initialize({
        token: CFG.paddleToken,
        checkout: { settings: { displayMode: 'overlay', theme: 'light' } },
        eventCallback: function (event) {
          if (event && event.name === 'checkout.completed') {
            say('');
            show('stepDone', true);
          }
        }
      });
      return true;
    }).catch(function () { paddleReady = null; return false; });
    return paddleReady;
  }

  var MESSAGES = {
    failed: 'We could not open checkout. Please try again.',
    unchecked: 'We could not check your account just now. Please try again.',
    subscribed: "You're already on AibhlínnAI Premium. Manage or cancel from Settings in Pie Timers.",
    signin: 'Please confirm your email first.',
    again: 'Please confirm your email again.',
    changed: 'The account here changed. Check the email shown, then press Subscribe again.',
    paddleBlocked: 'Checkout could not load. Something on this device, such as a content blocker, may be stopping cdn.paddle.com. Please allow that site, or write to support@aibhlinn.ai.',
    challengeBlocked: 'The quick check could not load. Something on this device, such as a content blocker, may be stopping challenges.cloudflare.com. Please allow that site, or write to support@aibhlinn.ai.'
  };

  function trialTransaction(cadence, accessToken) {
    return postJson(CFG.supabaseUrl + '/functions/v1/create-checkout',
      { cadence: cadence === 'monthly' ? 'monthly' : 'annual' }, accessToken
    ).then(function (a) {
      var d = a.data || {};
      if (a.status === 200 && d.ok === true && /^txn_[a-z0-9]+$/.test(d.transactionId || '')) return d.transactionId;
      if (a.status === 409 && d.error === 'already_subscribed') throw new Error(MESSAGES.subscribed);
      if (a.status === 409 && d.error === 'not_in_trial') throw new Error(MESSAGES.unchecked);
      if (a.status === 401) throw new Error(MESSAGES.signin);
      throw new Error(MESSAGES.failed);
    }, function () { throw new Error(MESSAGES.failed); });
  }

  function subscribe(cadence) {
    var priceId = cadence === 'monthly' ? CFG.monthlyPriceId : CFG.annualPriceId;
    var user, ent;
    return freshUser().then(function (u) {
      if (!u) throw identity.isSignedIn() ? new Error(MESSAGES.unchecked) : signedOutError();
      if (!shownUser || u.id !== shownUser.id) {
        showSignedIn(u);
        throw new Error(MESSAGES.changed);
      }
      user = u;
      return getEntitlement().catch(function (err) {
        throw (err && err.signedOut) ? err : new Error(MESSAGES.unchecked);
      });
    }).then(function (e) {
        ent = e;
        if (alreadySubscribed(ent)) throw new Error(MESSAGES.subscribed);
        return initPaddle();
      }).then(function (ok) {
        if (!ok) throw new Error(MESSAGES.paddleBlocked);
        if (inTrial(ent)) {
          return identity.validToken().then(function (t) {
            if (!t) throw new Error(MESSAGES.signin);
            return trialTransaction(cadence, t);
          }).then(function (txn) {
            window.Paddle.Checkout.open({ transactionId: txn, customer: { email: user.email } });
          });
        }
        window.Paddle.Checkout.open({
          items: [{ priceId: priceId, quantity: 1 }],
          customer: { email: user.email },
          customData: { user_id: user.id },
          settings: { displayMode: 'overlay', theme: 'light' }
        });
      });
  }

  /* ───────────────────────── The page ───────────────────────── */

  function describeBuy() {
    var note = $('buyNote');
    note.textContent = 'Checking your account…';
    return getEntitlement().then(function (ent) {
      if (alreadySubscribed(ent)) {
        note.textContent = MESSAGES.subscribed;
      } else if (inTrial(ent)) {
        note.textContent = offerOpen()
          ? 'Your free trial is running, so you pay nothing until 2027. Your first payment is taken from 1 January 2027. Checkout shows the exact date.'
          : 'Your free trial is running, so you get more free time before your first payment. Checkout shows the exact date.';
      } else if (!ent.plan || ent.plan === 'trial') {
        note.textContent = 'Your free trial has finished, so if you subscribe now your first payment is taken today.';
      } else {
        note.textContent = 'If you subscribe now, your first payment is taken today.';
      }
      document.querySelectorAll('[data-cadence]').forEach(function (b) {
        b.hidden = alreadySubscribed(ent);
      });
    }, function (err) {
      if (err && err.signedOut) { signedOutAgain(); return; }
      note.textContent = MESSAGES.unchecked;
    });
  }

  var shownUser = null;   // the account the buy step names

  function showSignedIn(user, moveFocus) {
    shownUser = user;
    $('buyEmail').textContent = user.email;
    show('stepBuy', moveFocus);
    return describeBuy();
  }

  function showEmailStep(moveFocus) {
    shownUser = null;
    show('stepEmail');
    if (moveFocus) $('email').focus();
    mountChallenge();   // draw the check now, so the token is ready by the time they press
  }

  function signedOutAgain() {
    showEmailStep(true);
    say(MESSAGES.again, true);
  }

  /* After a sign-in: show the buy step for the account the token really
     belongs to, or go back to the email step if there is none. */
  function enterSignedIn(moveFocus) {
    return freshUser().then(function (u) {
      if (u) return showSignedIn(u, moveFocus);
      if (identity.isSignedIn()) {
        show('stepEmail');
        say(MESSAGES.unchecked, true);
        return identity.signOut().catch(function () {});
      }
      showEmailStep(moveFocus);
    });
  }

  var pendingEmail = '';

  function start() {
    if (!identity) { say(MESSAGES.failed, true); return; }
    $('offer').hidden = !offerOpen();
    $('googleBtn').hidden = !GOOGLE_ENABLED;

    /* With Google off, this page never sends anyone away to sign in, so a
       token arriving in the address is not one it asked for. A link
       carrying someone else's token must not sign the buyer in as that
       account, so drop it before identity.init() can adopt it. */
    if (!GOOGLE_ENABLED && /(^#|&)(access_token|error)=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    var redirect = identity.init({
      supabaseUrl: CFG.supabaseUrl,
      supabaseAnonKey: CFG.supabaseAnonKey,
      redirectUrl: location.origin + '/'
    });
    Promise.resolve(redirect).catch(function (e) { return { error: e && e.message }; }).then(function (r) {
      if (r && r.error) {
        showEmailStep();
        say('Signing in with Google did not finish. Please try again, or use the email code.', true);
        return;
      }
      if (identity.isSignedIn()) enterSignedIn(false);
      else showEmailStep();
    });

    /* A session ended in the background (refresh refused) while the buy
       step is up: back to the email step. Not for "Not you?", which says
       nothing. */
    var leaving = false;
    identity.onChange(function (s) {
      if (!s && !leaving && !$('stepBuy').hidden) signedOutAgain();
    });

    var typos = window.Aibhlinn && window.Aibhlinn.emailTypos;
    $('email').addEventListener('input', function () { $('typo').hidden = true; });

    $('emailForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Please type your full email address.', true); return; }
      var better = typos && typos.suggest(email);
      if (better && $('typo').hidden) {
        $('typoUse').textContent = better;
        $('typo').hidden = false;
        say('Did you mean ' + better + '? Choose the suggestion, or press Send me a code again to keep what you typed.');
        return;
      }
      var btn = $('emailSubmit');
      btn.disabled = true;
      say('Sending your code…');
      sendCode(email).then(function () {
        pendingEmail = email;
        $('codeEmail').textContent = email;
        $('code').value = '';
        say('');
        show('stepCode');
        $('code').focus();   // straight to the box the code goes in
      }, function (err) {
        say(err.message, true);
      }).then(function () { btn.disabled = false; });
    });

    $('typoUse').addEventListener('click', function () {
      $('email').value = $('typoUse').textContent;
      $('typo').hidden = true;
      say('');
    });

    $('googleBtn').addEventListener('click', function () { identity.signInWithGoogle(); });

    $('codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('code').value.replace(/\s+/g, '');
      if (!/^\d{6,10}$/.test(code)) { say('Please type the code from the email.', true); return; }
      var btn = $('codeSubmit');
      btn.disabled = true;
      say('Confirming…');
      identity.verifyEmailOtp(pendingEmail, code).then(function () {
        say('');
        return enterSignedIn(true);
      }, function () {
        say('That code did not work. Check the newest email from AibhlínnAI and try again.', true);
      }).then(function () { btn.disabled = false; });
    });

    $('codeBack').addEventListener('click', function () { say(''); showEmailStep(true); });

    $('notMe').addEventListener('click', function () {
      leaving = true;
      identity.signOut().catch(function () {}).then(function () {
        leaving = false;
        say('');
        showEmailStep(true);
      });
    });

    document.querySelectorAll('[data-cadence]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var all = document.querySelectorAll('[data-cadence]');
        all.forEach(function (b) { b.disabled = true; });
        say('Opening checkout…');
        subscribe(btn.getAttribute('data-cadence')).then(function () {
          say('');
        }, function (err) {
          if (err && err.signedOut) { signedOutAgain(); return; }
          say((err && err.message) || MESSAGES.failed, true);
        }).then(function () {
          all.forEach(function (b) { b.disabled = false; });
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
