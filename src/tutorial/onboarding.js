/* === tutorial/onboarding.js === */
/* ═══════════════════════════════════════════════════════════════
   Levix — Tutorial Onboarding        tutorial/onboarding.js
   Game-style guided first-run experience.

   State machine (localStorage):
     lv_onboard_started   — written once on first + tap  (step 0 → 1)
     lv_onboard_step      — current step integer
     lv_onboard_completed — written after first expense saved (step 4 save)

   Step map:
     0  Home   → spotlight + button
     1  sc-add → spotlight #aa  (advances only on valid numeric > 0)
     2  sc-add → spotlight #an  [skippable]
     3  sc-add → spotlight Food category button
     4  sc-add → spotlight Save button  (completion via onSaved())
     5  Full-screen celebration  [interruptible by tap — two phases]
              Phase A — fire animation  "Day 1 Streak Started!" (2.5 s or tap)
              Phase B — replaced with lightweight inline pill feedback
     6  Home   → spotlight Settings gear  [skippable]

   Public API (window.lxTutorial):
     .init()      — called by obDone(); routes fresh vs reload
     .onSaved()   — called by saveExp() after DB.setOnboarded()
     ._skip()     — skip current skippable step (bound in bubble HTML)
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY_STARTED   = 'lv_onboard_started';
  var KEY_STEP      = 'lv_onboard_step';
  var KEY_COMPLETED = 'lv_onboard_completed';
  var SPOT_PAD      = 10;
  /* Celebration constants removed — step 5 now uses lightweight inline feedback */

  var _step       = 0;
  var _listeners  = [];
  var _celTimeout = null;
  var _resizeOb   = null;

  /* ── CSS injection ────────────────────────────────────────── */
  (function _injectCSS() {
    if (document.getElementById('tut-css')) return;
    var s = document.createElement('style');
    s.id = 'tut-css';
    s.textContent = [
      '#tut-overlay{position:fixed;inset:0;z-index:200;display:none;pointer-events:none}',
      '.tut-quad{position:fixed;background:rgba(0,0,0,.68);pointer-events:all;transition:top .15s,left .15s,width .15s,height .15s}',
      '#tut-ring{position:fixed;pointer-events:none;z-index:201;border-radius:14px;display:none;box-shadow:0 0 0 3px var(--accent),0 0 0 7px rgba(255,107,53,.22);transition:top .15s,left .15s,width .15s,height .15s}',
      '@keyframes tut-pulse{0%,100%{box-shadow:0 0 0 3px var(--accent),0 0 0 7px rgba(255,107,53,.22)}50%{box-shadow:0 0 0 3px var(--accent),0 0 0 14px rgba(255,107,53,.09)}}',
      '#tut-ring{animation:tut-pulse 1.5s ease-in-out infinite}',
      '#tut-bubble{position:fixed;z-index:203;display:none;flex-direction:column;align-items:center;gap:8px;pointer-events:all;max-width:248px}',
      '.tut-msg{background:rgba(16,16,18,.97);color:#fff;padding:13px 18px;border-radius:14px;font-size:14px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.4);animation:tut-pop .22s cubic-bezier(.34,1.56,.64,1) both}',
      '.tut-skip{background:rgba(255,255,255,.11);color:rgba(255,255,255,.8);border:1.5px solid rgba(255,255,255,.18);border-radius:99px;padding:6px 20px;font-size:12px;font-weight:800;cursor:pointer;letter-spacing:.3px}',
      '.tut-skip:active{background:rgba(255,255,255,.2)}',
      '@keyframes tut-pop{from{opacity:0;transform:translateY(9px) scale(.92)}to{opacity:1;transform:none}}',
      '#tut-hand{position:fixed;z-index:204;font-size:28px;pointer-events:none;display:none;line-height:1}',
      '@keyframes tut-bd{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}',
      '@keyframes tut-bu{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}',
      '.tut-hand-down{animation:tut-bd .7s ease-in-out infinite}',
      '.tut-hand-up{animation:tut-bu .7s ease-in-out infinite}',
      '#tut-celebration{display:none;position:fixed;inset:0;z-index:210;background:rgba(0,0,0,.9);flex-direction:column;align-items:center;justify-content:center;pointer-events:all;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.tut-cel-fire{font-size:84px;line-height:1;animation:tut-fire-in .55s cubic-bezier(.34,1.56,.64,1) both}',
      '@keyframes tut-fire-in{from{transform:scale(0) rotate(-20deg)}to{transform:scale(1) rotate(0)}}',
      '.tut-cel-title{font-size:26px;font-weight:900;color:#fff;margin:20px 0 8px;letter-spacing:-.5px;text-align:center;padding:0 24px;animation:tut-pop .45s .15s cubic-bezier(.34,1.56,.64,1) both;opacity:0}',
      '.tut-cel-sub{font-size:14px;color:rgba(255,255,255,.6);font-weight:700;text-align:center;padding:0 32px;line-height:1.5;animation:tut-pop .45s .28s cubic-bezier(.34,1.56,.64,1) both;opacity:0}',
      '.tut-cel-tap{font-size:11px;color:rgba(255,255,255,.35);font-weight:700;margin-top:32px;letter-spacing:.5px;text-transform:uppercase;animation:tut-pop .3s .6s ease both;opacity:0}',
      '.tut-particles{position:absolute;inset:0;pointer-events:none;overflow:hidden}',
      '.tut-p{position:absolute;font-size:22px;animation:tut-particle 2.2s ease-out forwards}',
      '@keyframes tut-particle{0%{transform:translateY(0) rotate(0) scale(1);opacity:1}100%{transform:translateY(-280px) rotate(400deg) scale(.3);opacity:0}}',
      '@keyframes tut-fade-in{from{opacity:0}to{opacity:1}}',
      '.tut-retention{animation:tut-fade-in .35s ease both}'
    ].join('');
    document.head.appendChild(s);
  }());

  /* ── localStorage ─────────────────────────────────────────── */
  function _getStep()       { return parseInt(localStorage.getItem(KEY_STEP) || '0', 10); }
  function _setStep(n)      { localStorage.setItem(KEY_STEP, String(n)); }
  function _isStarted()     { return !!localStorage.getItem(KEY_STARTED); }
  function _isCompleted()   { return !!localStorage.getItem(KEY_COMPLETED); }
  function _markStarted()   { localStorage.setItem(KEY_STARTED, '1'); }
  function _markCompleted() { localStorage.setItem(KEY_COMPLETED, '1'); }

  /* ── spotlight ────────────────────────────────────────────── */
  function _spotlight(el) {
    if (!el) return;
    var r = el.getBoundingClientRect(), p = SPOT_PAD;
    var x = Math.max(0, r.left - p), y = Math.max(0, r.top - p);
    var w = r.width + p * 2, h = r.height + p * 2;
    var qt = document.getElementById('tut-q-top');
    var ql = document.getElementById('tut-q-left');
    var qr = document.getElementById('tut-q-right');
    var qb = document.getElementById('tut-q-bottom');
    var rg = document.getElementById('tut-ring');
    if (qt) qt.style.cssText = 'top:0;left:0;right:0;height:'+y+'px';
    if (ql) ql.style.cssText = 'top:'+y+'px;left:0;width:'+x+'px;height:'+h+'px';
    if (qr) qr.style.cssText = 'top:'+y+'px;left:'+(x+w)+'px;right:0;height:'+h+'px';
    if (qb) qb.style.cssText = 'top:'+(y+h)+'px;left:0;right:0;bottom:0';
    if (rg) { rg.style.display='block'; rg.style.top=y+'px'; rg.style.left=x+'px'; rg.style.width=w+'px'; rg.style.height=h+'px'; }
  }

  /* ── bubble ───────────────────────────────────────────────── */
  function _showBubble(el, html, skippable) {
    var b = document.getElementById('tut-bubble');
    if (!b) return;
    b.innerHTML = '<div class="tut-msg">'+html+'</div>'
      + (skippable ? '<button class="tut-skip" onclick="window.lxTutorial._skip()">Skip →</button>' : '');
    b.style.display = 'flex';
    if (!el) { b.style.top='50%'; b.style.left='50%'; b.style.transform='translate(-50%,-50%)'; return; }
    var r = el.getBoundingClientRect(), vh = window.innerHeight, bh = 96;
    var top = r.bottom + SPOT_PAD + 14;
    if (top + bh > vh - 16) top = r.top - SPOT_PAD - bh - 14;
    top = Math.max(16, Math.min(top, vh - bh - 16));
    var left = Math.max(132, Math.min(r.left + r.width / 2, window.innerWidth - 132));
    b.style.top=top+'px'; b.style.left=left+'px'; b.style.transform='translateX(-50%)';
  }

  /* ── hand ─────────────────────────────────────────────────── */
  function _showHand(el, dir) {
    var h = document.getElementById('tut-hand');
    if (!h) return;
    if (!el) { h.style.display='none'; return; }
    var r = el.getBoundingClientRect();
    /* dir='up': hand placed ABOVE element → emoji 👇 points DOWN at target  ✓
       dir='down': hand placed BELOW element → emoji 👆 points UP at target   ✓  */
    h.textContent = dir==='up' ? '👇' : '👆';
    h.className   = 'tut-hand tut-hand-'+(dir==='up'?'down':'up');
    h.style.top   = (dir==='up' ? r.top-SPOT_PAD-44 : r.bottom+SPOT_PAD+6)+'px';
    h.style.left  = (r.left+r.width/2-14)+'px';
    h.style.display = 'block';
  }

  /* ── overlay show / hide ──────────────────────────────────── */
  function _showOverlay(el, html, dir, skippable) {
    var ov = document.getElementById('tut-overlay');
    if (!ov) return;
    ov.style.display = 'block';
    ['tut-q-top','tut-q-left','tut-q-right','tut-q-bottom'].forEach(function(id){
      var q=document.getElementById(id); if(q) q.style.display=el?'block':'none';
    });
    var rg=document.getElementById('tut-ring'); if(rg) rg.style.display=el?'block':'none';
    if (el) _spotlight(el);
    _showBubble(el, html, skippable);
    _showHand(el, dir);
  }

  /* Non-blocking: ring + bubble only, no dark quads */
  function _showSoftOverlay(el, html, dir, skippable) {
    var ov = document.getElementById('tut-overlay');
    if (!ov) return;
    ov.style.display = 'block';
    ['tut-q-top','tut-q-left','tut-q-right','tut-q-bottom'].forEach(function(id){
      var q=document.getElementById(id); if(q) q.style.display='none';
    });
    var rg=document.getElementById('tut-ring'); if(rg) rg.style.display=el?'block':'none';
    if (el) _spotlight(el);
    _showBubble(el, html, skippable);
    _showHand(el, dir);
  }

  /* _hideOverlay: always hides EVERYTHING including quads */
  function _hideOverlay() {
    var ids=['tut-overlay','tut-hand','tut-ring',
             'tut-q-top','tut-q-left','tut-q-right','tut-q-bottom'];
    ids.forEach(function(id){
      var el=document.getElementById(id); if(el) el.style.display='none';
    });
    var b=document.getElementById('tut-bubble'); if(b) b.style.display='none';
  }

  /* ── resize ───────────────────────────────────────────────── */
  function _watchResize(el) {
    if (_resizeOb) { _resizeOb.disconnect(); _resizeOb=null; }
    if (!el || typeof ResizeObserver==='undefined') return;
    _resizeOb = new ResizeObserver(function(){ _spotlight(el); });
    _resizeOb.observe(document.documentElement);
  }

  /* ── listener management ──────────────────────────────────── */
  function _clearListeners() {
    _listeners.forEach(function(l){ try{ l.el.removeEventListener(l.evt,l.fn,l.opt); }catch(e){} });
    _listeners = [];
    if (_resizeOb) { _resizeOb.disconnect(); _resizeOb=null; }
    if (_celTimeout) { clearTimeout(_celTimeout); _celTimeout=null; }
  }
  function _on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts||false);
    _listeners.push({el:el, evt:evt, fn:fn, opt:opts||false});
  }

  /* ── advance ──────────────────────────────────────────────── */
  function _advance(toStep) {
    _clearListeners();
    _step = (typeof toStep==='number') ? toStep : _step+1;
    _setStep(_step);
    _runStep(_step);
  }

  /* ── waitFor ──────────────────────────────────────────────── */
  function _waitFor(selectorFn, cb, maxMs, timeoutCb) {
    var deadline = Date.now()+(maxMs||4000);
    (function poll(){
      var el=selectorFn();
      if(el){ cb(el); return; }
      if(Date.now()>deadline){
        console.warn('[lxTutorial] waitFor timed out');
        if(typeof timeoutCb==='function') timeoutCb();
        return;
      }
      setTimeout(poll,80);
    }());
  }

  /* ══════════════════════════════════════════════════════════
     STEP RUNNERS
  ══════════════════════════════════════════════════════════ */
  function _runStep(s) {
    switch(s) {
      case 0: return _step0();
      case 1: return _step1();
      case 2: return _step2();
      case 3: return _step3();
      case 4: return _step4();
      case 5: return _step5();
      case 6: return _step6();
      case 7: return _step7();
      default: return _done();
    }
  }

  function _step0() {
    _waitFor(function(){ return document.querySelector('.nb.plus'); }, function(btn) {
      _showOverlay(btn, 'Tap <strong>+</strong> to log your first expense', 'up', false);
      _watchResize(btn);
      _on(btn, 'click', function() {
        _markStarted(); _hideOverlay();
        setTimeout(function(){ _advance(1); }, 80);
      }, {once:true});
    });
  }

  /* ── scroll lock: block touchmove on overlay quads — zero layout impact ── */
  function _onTouchMove(e){ e.preventDefault(); }
  function _lockScroll() {
    var ov=document.getElementById('tut-overlay');
    if(ov) ov.addEventListener('touchmove',_onTouchMove,{passive:false});
    /* Also block on document for full coverage */
    document.addEventListener('touchmove',_onTouchMove,{passive:false});
  }
  function _unlockScroll() {
    var ov=document.getElementById('tut-overlay');
    if(ov) ov.removeEventListener('touchmove',_onTouchMove);
    document.removeEventListener('touchmove',_onTouchMove);
  }

  /* Step 1: valid numeric > 0 — debounced 900ms so user finishes typing before advancing */
  function _step1() {
    _waitFor(function(){ return document.getElementById('aa'); }, function(el) {
      _lockScroll();
      _showOverlay(el, 'Enter an amount — try <strong>10</strong>'
        +'<span style="color:rgba(255,255,255,.5);font-size:11px;display:block;margin-top:3px">Finish typing, then we\'ll continue</span>',
        'up', false);
      _watchResize(el);
      var _debounce=null;
      _on(el, 'input', function() {
        var v=parseFloat(el.value);
        if (!isNaN(v) && v > 0) {
          if(_debounce) clearTimeout(_debounce);
          _debounce=setTimeout(function(){ _advance(2); }, 900);
        } else {
          if(_debounce){ clearTimeout(_debounce); _debounce=null; }
        }
      });
      setTimeout(function(){ el.focus(); }, 120);
    });
  }

  /* Step 2: note field — optional, auto-advances 1.5s after any input, no skip needed */
  function _step2() {
    _waitFor(function(){ return document.getElementById('an'); }, function(el) {
      _lockScroll();
      _showOverlay(el,
        'Add a note — try <strong>"Tea"</strong>'
        +'<span style="color:rgba(255,255,255,.5);font-size:11px;display:block;margin-top:3px">Optional — auto-continues after you type</span>',
        'down', true);
      _watchResize(el);
      var _debounce=null;
      /* Auto-advance 800ms after any keystroke — no minimum length, truly optional */
      _on(el, 'input', function() {
        if(_debounce) clearTimeout(_debounce);
        _debounce=setTimeout(function(){ _advance(3); }, 800);
      });
      /* Also auto-advance after 4s if user ignores the field entirely */
      var _autoSkip=setTimeout(function(){ if(_step===2) _advance(3); }, 4000);
      _listeners.push({ el:{removeEventListener:function(){ clearTimeout(_autoSkip); }}, evt:'', fn:function(){}, opt:false });
    });
  }

  function _step3() {
    _waitFor(function(){ return document.querySelector('#cgrid .cbtn[data-id="food"]'); }, function(el) {
      _lockScroll();
      _showOverlay(el, 'Pick a category — tap <strong>Food 🍛</strong>', 'down', false);
      _watchResize(el);
      _on(el, 'click', function(){ setTimeout(function(){ _advance(4); }, 60); }, {once:true});
    });
  }

  /* Step 4: Save button — scroll into view, soft spotlight only (no scroll lock — user must tap) */
  function _step4() {
    _waitFor(function(){ return document.getElementById('bsave-btn'); }, function(el) {
      _unlockScroll();
      _hideOverlay();
      el.scrollIntoView({behavior:'smooth', block:'center'});
      setTimeout(function(){
        var r=el.getBoundingClientRect();
        var ov=document.getElementById('tut-overlay');
        if(ov) ov.style.display='block';
        /* Ring around Save button */
        var rg=document.getElementById('tut-ring');
        if(rg){
          rg.style.cssText='display:block;position:fixed;z-index:201;border-radius:14px;'
            +'top:'+(r.top-10)+'px;left:'+(r.left-10)+'px;'
            +'width:'+(r.width+20)+'px;height:'+(r.height+20)+'px;'
            +'box-shadow:0 0 0 3px var(--accent),0 0 0 7px rgba(255,107,53,.22);'
            +'animation:tut-pulse 1.5s ease-in-out infinite;pointer-events:none;';
        }
        /* Non-blocking label — pointer-events:none so Save button tap goes through */
        var b=document.getElementById('tut-bubble');
        if(b){
          b.innerHTML='<div class="tut-msg" style="pointer-events:none">Tap <strong>Save Expense ✓</strong></div>';
          b.style.cssText='display:flex;pointer-events:none;position:fixed;z-index:203;'
            +'top:'+Math.max(12,r.top-68)+'px;'
            +'left:'+(r.left+r.width/2)+'px;'
            +'transform:translateX(-50%);max-width:248px;';
        }
        /* Hand pointer above button pointing down */
        var h=document.getElementById('tut-hand');
        if(h){
          h.textContent='👇';
          h.className='tut-hand tut-hand-down';
          h.style.cssText='display:block;position:fixed;pointer-events:none;z-index:204;font-size:28px;'
            +'top:'+(r.top-46)+'px;left:'+(r.left+r.width/2-14)+'px;';
        }
        _watchResize(el);
      }, 600);
    });
  }

  /* Step 5: interruptible two-phase celebration */
  /* Step 5 — lightweight inline feedback. No overlay, no blocking, no "come back tomorrow".
     Three sequential toasts totalling ~1.8s, then advances to step 6. */
  function _step5() {
    _hideOverlay();
    _markCompleted();

    /* Inline streak pill pulse already handled by showStreakReward().
       We just show a fast 3-beat confirmation sequence. */
    _showFastConfirm(function(){ _done(false); });
  }

  function _showFastConfirm(onDone) {
    var TOAST_MS = 1600; /* total sequence duration */
    /* Reuse the entry-confirm pill for instant feedback */
    var pill = document.getElementById('entry-confirm');
    if (!pill) { setTimeout(onDone, TOAST_MS); return; }

    /* Beat 1 — 0ms: Expense Added */
    pill.textContent = 'Expense Added ✓';
    pill.style.cssText = 'display:block;position:fixed;bottom:calc(72px + env(safe-area-inset-bottom,8px) + 12px);'
      + 'left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;'
      + 'padding:10px 22px;border-radius:99px;font-size:13px;font-weight:800;'
      + 'z-index:500;white-space:nowrap;box-shadow:0 4px 16px rgba(255,107,53,.35);'
      + 'animation:fadeUp .15s ease both;';
    pill.style.display = 'block';

    /* Beat 2 — 700ms: Day 1 ✅ */
    setTimeout(function() {
      pill.textContent = 'Day 1 ✅  Streak started';
      pill.style.background = '#22C55E';
      pill.style.boxShadow = '0 4px 16px rgba(34,197,94,.35)';
    }, 700);

    /* Beat 3 — hide */
    setTimeout(function() {
      pill.style.opacity = '0';
      pill.style.transition = 'opacity .15s ease';
      setTimeout(function() {
        pill.style.display = 'none';
        pill.style.opacity = '';
        pill.style.transition = '';
        onDone();
      }, 160);
    }, TOAST_MS);
  }

  /* Step 6+7: removed — tutorial ends at step 5 after celebration */
  function _step6() { _done(true); return; /* removed */ 
    _waitFor(function(){
      var home=document.getElementById('sc-home');
      var isActive=home&&(home.classList.contains('active')||home.style.display==='block');
      var gear=isActive&&home.querySelector('[onclick*="go(\'set\')"]');
      return gear||null;
    }, function(gear) {
      _showSoftOverlay(gear,
        'Tap <strong>Settings ⚙️</strong>'
        +'<span style="color:rgba(255,255,255,.5);font-size:11px;display:block;margin-top:3px">Set a monthly budget to stay on track</span>',
        'up', true);
      _watchResize(gear);
      /* Auto-exit after 4s — settings is optional, never blocks progression */
      var _autoExit=setTimeout(function(){ _hideOverlay(); _done(true); },4000);
      _on(gear, 'click', function(){
        clearTimeout(_autoExit);
        _hideOverlay();
        setTimeout(function(){ _advance(7); }, 350);
      }, {once:true});
    }, 7000, function(){ _done(true); });
  }

  function _step7() { _done(true); return; /* removed */ 
    _waitFor(function(){
      var set=document.querySelector('#sc-set.active')||document.querySelector('#sc-set[style*="block"]');
      var btn=set&&set.querySelector('.srow[onclick*="budget"]');
      return btn||null;
    }, function(btn) {
      _showSoftOverlay(btn,
        'Tap <strong>Monthly Budgets 🎯</strong>'
        +'<span style="color:rgba(255,255,255,.5);font-size:11px;display:block;margin-top:3px">Optional — set limits per category</span>',
        'down', true);
      _watchResize(btn);
      /* Auto-exit after 3s — never blocks user */
      var _autoExit=setTimeout(function(){ _hideOverlay(); _done(true); },3000);
      _on(btn, 'click', function(){
        clearTimeout(_autoExit);
        _hideOverlay();
        _done(true);
      }, {once:true});
    }, 5000, function(){ _done(true); });
  }

  function _done(fromSkip) {
    _clearListeners();
    _hideOverlay();
    _unlockScroll();
    /* Always mark completed — whether skipped or finished naturally */
    _markCompleted();
    var cel=document.getElementById('tut-celebration');
    if(cel){ cel.style.display='none'; cel.innerHTML=''; }
    if(!fromSkip){
      setTimeout(function(){
        try{ if(typeof checkWeeklyBudgetGate==='function') checkWeeklyBudgetGate(); }catch(e){}
      }, 400);
    }
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  window.lxTutorial = {
    init: function() {
      if (_isCompleted()) { _done(); return; }
      if (_isStarted()) {
        _step=_getStep();
        if(_step<1||_step>4) _step=1;
        /* If resuming at step 3 or 4, restart from step 1 — amount may be empty.
           Better to re-guide through amount→note→category→save than to spotlight
           Save with an empty form the user can't interact with. */
        if(_step>=3) _step=1;
        _setStep(_step);
        _hideOverlay();
        _unlockScroll();
        try{
          if(typeof openAdd==='function') openAdd(TODAY(),'home');
        }catch(e){}
        var _resumeStep=_step;
        _waitFor(function(){
          var sc=document.getElementById('sc-add');
          return sc&&(sc.classList.contains('active')||sc.style.display==='block')?sc:null;
        }, function(){
          _runStep(_resumeStep);
        }, 3000, function(){
          _runStep(_resumeStep);
        });
      } else {
        _step=0; _setStep(0);
        setTimeout(function(){ _step0(); }, 120);
      }
    },
    onSaved: function() {
      if (_isCompleted()) return;
      _hideOverlay();
      _unlockScroll();
      /* Advance immediately — no polling delay */
      _advance(5);
    },
    _hideOverlay: function(){ _hideOverlay(); _unlockScroll(); },
    _skip: function() {
      /* Skip at any step — mark complete and exit cleanly */
      _done(true);
    }
  };

}());

