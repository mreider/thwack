// Thwack client: confirm dialogs + the Google Picker "Add work" flow.
(function () {
  'use strict';

  // ---- Confirm dialogs for destructive forms (block / unfollow / remove / decline) ----
  var dlg = document.getElementById('confirm');
  var pendingForm = null;
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.confirm) return;
    if (form.dataset.confirmed === '1') return; // second pass, let it through
    e.preventDefault();
    pendingForm = form;
    document.getElementById('confirm-msg').textContent = form.dataset.confirm;
    if (dlg && dlg.showModal) dlg.showModal();
    else if (window.confirm(form.dataset.confirm)) submitPending(); // fallback
  });
  function submitPending() {
    if (!pendingForm) return;
    pendingForm.dataset.confirmed = '1';
    pendingForm.submit();
    pendingForm = null;
  }
  if (dlg) {
    document.getElementById('confirm-ok').addEventListener('click', function () { dlg.close(); submitPending(); });
    document.getElementById('confirm-cancel').addEventListener('click', function () { pendingForm = null; dlg.close(); });
  }

  // ---- Guest review flow (shared-link readers) ----
  // Typing happens before sign-in; the draft rides out the OAuth round-trip
  // in localStorage and is restored into the real form afterwards.
  function draftKey(id) { return 'thwack-draft-' + id; }
  var guestForm = document.getElementById('guest-review');
  if (guestForm) {
    guestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var ta = guestForm.querySelector('textarea');
      try { if (ta && ta.value.trim()) localStorage.setItem(draftKey(guestForm.dataset.work), ta.value); } catch (err) {}
      var sd = document.getElementById('signin');
      if (sd && sd.showModal) sd.showModal();
      else location.href = '/auth/login?next=/work/' + guestForm.dataset.work;
    });
    var cancel = document.getElementById('signin-cancel');
    if (cancel) cancel.addEventListener('click', function () { document.getElementById('signin').close(); });
    // Keep the stash fresh even if they sign in via the dialog link mid-typing.
    var signinLink = document.querySelector('#signin a');
    if (signinLink) signinLink.addEventListener('click', function () {
      var ta = guestForm.querySelector('textarea');
      try { if (ta && ta.value.trim()) localStorage.setItem(draftKey(guestForm.dataset.work), ta.value); } catch (err) {}
    });
  }
  // Signed-in review form on a work page: restore any stashed draft.
  var reviewForm = document.querySelector('form[action$="/review"]');
  if (reviewForm) {
    var m = (reviewForm.getAttribute('action') || '').match(/\/works\/([a-z0-9]+)\/review/);
    if (m) {
      var key = draftKey(m[1]);
      var ta2 = reviewForm.querySelector('textarea');
      try {
        var draft = localStorage.getItem(key);
        if (draft && ta2 && !ta2.value) {
          ta2.value = draft;
          reviewForm.scrollIntoView({ block: 'center' });
          ta2.focus();
        }
      } catch (err) {}
      reviewForm.addEventListener('submit', function () {
        try { localStorage.removeItem(key); } catch (err) {}
      });
    }
  }

  // ---- Copy-link buttons ----
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-copy-link]') : null;
    if (!btn) return;
    var url = location.origin + btn.dataset.copyLink;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  });

  // ---- Add work: Google Picker ----
  var addBtn = document.getElementById('add-work');
  var msgEl = document.getElementById('add-work-msg');
  function say(text) { if (msgEl) { msgEl.textContent = text; msgEl.hidden = !text; } }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function openPicker(cfg) {
    return loadScript('https://apis.google.com/js/api.js').then(function () {
      return new Promise(function (resolve) { window.gapi.load('picker', resolve); });
    }).then(function () {
      var view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS);
      var picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(cfg.accessToken)
        .setDeveloperKey(cfg.apiKey)
        .setAppId(cfg.appId)
        .setTitle('Choose a Google Doc to share on Thwack')
        .setCallback(function (data) {
          if (data.action !== google.picker.Action.PICKED) return;
          var fileId = data.docs && data.docs[0] && data.docs[0].id;
          if (!fileId) return;
          say('Checking the document’s sharing settings…');
          fetch('/works', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fileId: fileId }),
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.ok) { location.href = '/work/' + res.work; }
            else if (res.needsAuth) { location.href = '/auth/drive'; }
            else { say(res.reason || 'That document could not be added.'); }
          }).catch(function () { say('Something went wrong. Try again.'); });
        })
        .build();
      picker.setVisible(true);
    });
  }

  function startAddWork() {
    say('');
    fetch('/api/picker-config').then(function (r) { return r.json(); }).then(function (cfg) {
      if (cfg.needsAuth) { location.href = '/auth/drive'; return; }
      if (cfg.error === 'not_configured') { say('Google Drive connection is not configured yet.'); return; }
      if (cfg.error) { say('Please sign in again.'); return; }
      openPicker(cfg).catch(function () { say('Could not load the Google Doc picker.'); });
    }).catch(function () { say('Something went wrong. Try again.'); });
  }

  if (addBtn) {
    addBtn.addEventListener('click', startAddWork);
    // Returning from the drive-consent redirect: open the picker right away.
    if (new URLSearchParams(location.search).get('picker') === '1') {
      history.replaceState(null, '', '/dashboard');
      startAddWork();
    }
  }

  // ---- Floating "Comments" pill on long reading pages ----
  // A reader deep in a long piece shouldn't have to wonder whether there's a
  // way to respond; the pill hides once the comment area is actually in view.
  var commentsAnchor = document.getElementById('comments');
  if (commentsAnchor && document.body.scrollHeight > window.innerHeight * 2.5) {
    var pill = document.createElement('a');
    pill.href = '#comments';
    pill.id = 'comment-pill';
    pill.textContent = 'Comments ↓';
    document.body.appendChild(pill);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        pill.hidden = entries[0].isIntersecting;
      }, { rootMargin: '0px 0px 200px 0px' }).observe(commentsAnchor);
    }
  }
})();
