/* === core/boot.js === */
/* ─── core/boot.js ───────────────────────────────────────────────────────────
 * Levix startup sequencer.
 *
 * Boot decision tree:
 *
 *  1. !DB.onboarded()
 *       → sc-onboard (slides). Tutorial runs after account creation.
 *
 *  2. DB.onboarded() && !lv_onboard_completed
 *       → Account exists but tutorial not finished (reload mid-tutorial).
 *         Resume: go straight to enterApp() which fires lxTutorial.init().
 *         PIN lock is SKIPPED — onboarding must complete first.
 *
 *  3. DB.onboarded() && lv_onboard_completed && lastId found
 *       → Returning user. Show PIN screen (or setPin if no PIN yet).
 *
 *  4. DB.onboarded() && lv_onboard_completed && no session
 *       → sc-welcome (user picker).
 *
 * Safety nets: 2-second hard deadline + window.onerror → sc-welcome.
 * ──────────────────────────────────────────────────────────────────────────── */
(function(){

  function _kill(){
    var l=document.getElementById('loader');
    if(!l) return;
    l.style.cssText='display:none!important;opacity:0!important;pointer-events:none!important;';
  }

  function _show(id){
    _kill();
    try{
      var els=document.querySelectorAll('.screen,.cover');
      for(var i=0;i<els.length;i++) els[i].classList.remove('active');
      var el=document.getElementById(id)
            ||document.getElementById('sc-welcome')
            ||document.querySelector('.cover')
            ||document.querySelector('.screen');
      if(el) el.classList.add('active');
    }catch(e){ console.error('[Boot] _show failed:',e); }
  }

  var _timer=setTimeout(function(){
    console.warn('[Boot] 2s deadline — forcing sc-welcome');
    _show('sc-welcome');
    try{ renderWelcome(); }catch(e){}
  },2000);

  window.onerror=function(m,s,l){
    console.error('[Boot] onerror',m);
    clearTimeout(_timer); _show('sc-welcome'); return false;
  };

  function _boot(){
    clearTimeout(_timer);
    window.onerror=null; /* Boot complete — remove global error handler so post-boot JS errors don't redirect to welcome */
    console.log('[Boot] running, readyState='+document.readyState);

    /* Data health check — must run before any DB reads. If corruption is
       found, shows sc-recovery and halts normal boot until resolved. */
    try{
      if(!runDataHealthCheck()){
        console.warn('[Boot] data corruption detected — showing recovery screen');
        return;
      }
    }catch(e){ console.error('[Boot] health check error:',e); }

    try{ applyDark(DB.dark()); }catch(e){}

    /* Wire Enter key on welcome name input */
    try{
      var ni=document.getElementById('ni');
      if(ni) ni.addEventListener('keydown',function(e){
        if(e.key==='Enter') startUser();
      });
    }catch(e){}

    try{ archiveOld(); }catch(e){ console.warn('[Boot] archiveOld:',e.message); }

    try{

      /* ── PATH 1: Never onboarded → show slides ── */
      if(!DB.onboarded()){
        console.log('[Boot] path: first-launch onboarding');
        /* Mark as onboarded NOW so closing mid-slides never shows them again */
        DB.setOnboarded();
        _show('sc-onboard');
        var ob0=document.getElementById('ob0');
        if(ob0) ob0.classList.add('active');
        return;
      }

      var tutorialDone=!!localStorage.getItem('lv_onboard_completed');

      /* ── PATH 2: Onboarded but tutorial not complete → auto-complete if has data ──
         If user has a PIN (completed full account setup) OR already has expenses,
         mark tutorial done and route to PIN. Resume tutorial only for users
         who truly have no account setup (no PIN, no expenses).               */
      if(!tutorialDone){
        var lastId2=DB.sess();
        var user2=lastId2 ? (DB.users()||[]).filter(function(u){return u.id===lastId2;})[0] : null;
        if(user2){
          var hasPin=!!(user2.pin);
          var hasExps=(DB.exps()||[]).some(function(e){return e.uid===user2.id;});
          if(hasPin||hasExps){
            /* User completed setup (has PIN) or is actively using app (has expenses).
               Tutorial flag missing is a data inconsistency — correct it and route to PIN. */
            localStorage.setItem('lv_onboard_completed','1');
            localStorage.setItem('lv_onboard_started','1');
            console.log('[Boot] auto-completed tutorial — routing to PIN');
            setTimeout(_boot,0); return;
          }
          console.log('[Boot] path: tutorial resume for',user2.name);
          _kill();
          /* Bootstrap app state exactly as enterApp would, but call lxTutorial.init() */
          try{
            CU=user2; DB.setSess(user2.id);
            applyDark(DB.dark());
            try{ processRecurring(); }catch(e){}
            try{ processRollover(); }catch(e){}
            showNav(); go('home');
            setTimeout(function(){
              if(typeof lxTutorial!=='undefined'){
                lxTutorial.init();
              }
            },400);
          }catch(e){
            console.warn('[Boot] tutorial resume failed:',e.message);
            /* Fallback: show welcome */
            clearNav(); resetDots();
            _show('sc-welcome');
            try{ renderWelcome(); }catch(e2){}
          }
          return;
        }
        /* No session stored — user hasn't created account yet.
           Show welcome so they can create one and get the tutorial. */
        console.log('[Boot] path: tutorial pending, no session → welcome');
        clearNav(); resetDots();
        _show('sc-welcome');
        try{ renderWelcome(); }catch(e){}
        try{ var ni3=document.getElementById('ni'); if(ni3) ni3.value=''; }catch(e){}
        return;
      }

      /* ── PATH 3: Fully onboarded returning user → PIN ── */
      var lastId=DB.sess();
      if(lastId){
        var user=(DB.users()||[]).filter(function(u){return u.id===lastId;})[0];
        if(user){
          /* Grace period: if last unlock was within 30 minutes, skip PIN */
          var _lastUnlock=parseInt(localStorage.getItem('lv_last_unlock')||'0');
          var _gracePeriod=DB.gracePeriod(); /* user-configurable, default 8 hours */
          var _withinGrace=(Date.now()-_lastUnlock)<_gracePeriod;
          if(_withinGrace&&user.pin){
            console.log('[Boot] path: grace period active — skipping PIN');
            _kill();
            try{
              CU=user;DB.setSess(user.id);
              applyDark(DB.dark());
              try{processRecurring();}catch(e){}
              try{processRollover();}catch(e){}
              showNav();go('home');
              try{renderHome();}catch(e){}
              setTimeout(function(){initNotifications();},1000);
            }catch(e){_show('sc-welcome');try{renderWelcome();}catch(e2){}}
            return;
          }
          console.log('[Boot] path: returning user →',user.pin?'PIN':'setPin');
          if(!user.pin){
            spUser=user; showSetPin(user,1);
          } else {
            pinTgt=user; pinBuf='';
            var pav=document.getElementById('pinav');
            var pnm=document.getElementById('pinname');
            if(pav) pav.textContent=user.name[0].toUpperCase();
            if(pnm) pnm.textContent=user.name;
            fillDots('p',''); buildPad('pinpad','pin'); clearNav();
            _show('sc-pin');
          }
          return;
        }
      }

      /* ── PATH 4: No valid session → welcome ── */
      console.log('[Boot] path: welcome');
      clearNav(); resetDots();
      _show('sc-welcome');
      try{ renderWelcome(); }catch(e){ console.warn('[Boot] renderWelcome:',e.message); }
      try{ var ni2=document.getElementById('ni'); if(ni2) ni2.value=''; }catch(e){}

    }catch(e){
      console.error('[Boot] FATAL:',e.message);
      _show('sc-welcome');
      try{ renderWelcome(); }catch(e2){}
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_boot);
  } else {
    _boot();
  }

})();

