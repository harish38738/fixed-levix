/* === core/navigation.js === */
/* ─── core/navigation.js ─────────────────────────────────────────────────────
 * Levix navigation layer — extracted verbatim from levix.js.
 * Refactoring step 5: navigation extraction only. Zero logic changes.
 *
 * Contains: showNav, clearNav, go()
 *
 * External deps (resolved at call-time, not parse-time):
 *   showScreen, lxTrack, clearMoFilter, clearCalSearch
 *   renderHome, initCal, renderMo, renderRep, renderBudget,
 *   renderRec, renderHistory, updateBackupDisplay, calcStorageUsage,
 *   loadDailyLimitSetting, loadRolloverSetting
 * State vars: currentScreen, _moIconFilter, calCatFilter (in levix.js)
 *
 * Load order: must load AFTER levix.js (uses functions defined there).
 * ──────────────────────────────────────────────────────────────────────────── */

function showNav(){document.getElementById('bnav').style.display='flex';}
function clearNav(){document.getElementById('bnav').style.display='none';}

/* ── NAVIGATION ── */
function go(screen){
  if(screen==='search')_searchFrom=currentScreen==='search'?_searchFrom:currentScreen;
  currentScreen=screen;
  /* Clear any tutorial overlay when navigating — prevents quads blocking other screens */
  if(typeof lxTutorial!=='undefined'&&screen!=='add'){
    try{ lxTutorial._hideOverlay(); }catch(e){}
  }
  showScreen('sc-'+screen);
  lxTrack('screen_changed',{screen_name:screen});
  ['home','cal','mo','rep'].forEach(s=>{const b=document.getElementById('nb-'+s);if(b)b.classList.toggle('on',s===screen);});
  if(screen!=='mo'){clearMoFilter();_moIconFilter=null;}
  if(screen==='cal'){
    _calCollapsed=false;
    const wrap=document.getElementById('cal-grid-wrap');
    const strip=document.getElementById('cal-week-strip');
    const btn=document.getElementById('cal-expand-btn');
    if(wrap){wrap.style.display='block';wrap.style.maxHeight='600px';}
    if(strip) strip.style.display='none';
    if(btn) btn.style.display='none';
  }
  if(screen==='home')   renderHome();
  if(screen==='cal')    {
    try{ initCal(); }
    catch(e){ console.error('[Cal] initCal error:',e); _showRenderError('sc-cal','Calendar',()=>go('cal')); }
  }
  if(screen==='mo')     renderMo();
  if(screen==='rep')    renderRep();
  if(screen==='budget') renderBudget();
  if(screen==='rec')    renderRec();
  if(screen==='history')renderHistory();
  if(screen==='set'){
    try{
      updateBackupDisplay();calcStorageUsage();loadDailyLimitSetting();loadRolloverSetting();loadGracePeriodSetting();loadNotifSettings();
    }catch(e){
      console.error('[Settings] render error:',e);
      _showRenderError('sc-set','Settings',()=>go('set'));
    }
  }
  if(screen==='search'){
    try{
      initSearchFilters(); /* build category pills (no-op if already built) */
      _srchCat=null;_updateCatPills();
      document.getElementById('srch-from').value='';
      document.getElementById('srch-to').value='';
      const _dcb=document.getElementById('srch-date-clear-btn');if(_dcb)_dcb.style.display='none';
      const _scb=document.getElementById('srch-count-bar');if(_scb)_scb.style.display='none';
      document.getElementById('search-results').innerHTML='<div class="empty"><div class="eico">🔍</div><div class="emsg">Type to search</div><div class="esub">Category, note or amount</div></div>';
      document.getElementById('search-inp').value='';
      setTimeout(()=>document.getElementById('search-inp').focus(),200);
    }catch(e){
      console.error('[Search] render error:',e);
      _showRenderError('sc-search','Search',()=>go('search'));
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDER ERROR BOUNDARY
   Wraps all render functions so a crash shows a recoverable error card
   instead of a silent blank screen.

   How it works:
   - safeRender(fn, label, screenId) → returns a wrapped fn with try/catch
   - On crash: injects an error card into the screen div (position:absolute
     inset:0 so it covers only that screen, not nav or chrome)
   - Retry button re-calls the wrapped fn (boundary still active)
   - "Go Home" escape hatch if retry also fails
   - All 6 render functions are reassigned below — every existing call site
     is automatically protected with zero changes elsewhere
   ══════════════════════════════════════════════════════════════════════════ */
function _showRenderError(screenId, label, retryFn){
  const screen=document.getElementById(screenId);
  if(!screen)return;
  /* Remove any previous error card */
  const old=screen.querySelector('.lv-err-card');
  if(old)old.remove();
  /* Ensure screen is a positioned container */
  if(getComputedStyle(screen).position==='static')screen.style.position='relative';
  /* Build error card */
  const card=document.createElement('div');
  card.className='lv-err-card';
  card.style.cssText='position:absolute;inset:0;z-index:200;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 32px;text-align:center;gap:12px';
  const msg=document.createElement('div');
  msg.style.cssText='font-size:48px;margin-bottom:4px';
  msg.textContent='😵';
  const title=document.createElement('div');
  title.style.cssText='font-size:18px;font-weight:900;color:var(--text)';
  title.textContent=label+' couldn\'t load';
  const sub=document.createElement('div');
  sub.style.cssText='font-size:13px;color:var(--muted);font-weight:600;max-width:260px;line-height:1.6;margin-bottom:8px';
  sub.textContent='Your data is safe. This is a display error — tap Retry to reload.';
  const retryBtn=document.createElement('button');
  retryBtn.style.cssText='padding:13px 36px;background:var(--accent);color:#fff;border-radius:14px;font-size:15px;font-weight:900;font-family:var(--font);border:none;cursor:pointer';
  retryBtn.textContent='Retry';
  retryBtn.onclick=()=>{card.remove();try{retryFn();}catch(e){_showRenderError(screenId,label,retryFn);}};
  const homeBtn=document.createElement('button');
  homeBtn.style.cssText='font-size:13px;font-weight:700;color:var(--muted);background:transparent;border:none;font-family:var(--font);cursor:pointer;padding:4px';
  homeBtn.textContent='Go to Home';
  homeBtn.onclick=()=>{card.remove();go('home');};
  [msg,title,sub,retryBtn,homeBtn].forEach(el=>card.appendChild(el));
  screen.appendChild(card);
}

function safeRender(fn, label, screenId){
  const wrapped=function(){
    try{ fn.apply(this,arguments); }
    catch(err){
      console.error('[Levix] '+label+' render crashed:',err);
      _showRenderError(screenId,label,wrapped);
    }
  };
  return wrapped;
}

/* Reassign all render functions — protects every existing call site */
renderHome    = safeRender(renderHome,    'Home',      'sc-home');
renderMo      = safeRender(renderMo,      'Monthly',   'sc-mo');
renderRep     = safeRender(renderRep,     'Reports',   'sc-rep');
renderBudget  = safeRender(renderBudget,  'Budget',    'sc-budget');
renderHistory = safeRender(renderHistory, 'History',   'sc-history');
renderRec     = safeRender(renderRec,     'Recurring', 'sc-rec');

