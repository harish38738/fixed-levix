/* === security/autolock.js === */
/* ─── security/autolock.js ───────────────────────────────────────────────────
 * Levix auto-lock on inactivity — extracted verbatim from levix.js.
 * Refactoring step 8: autolock extraction only. Zero logic changes.
 *
 * Contains: resetActivityTimer, triggerLock, activity event listeners
 *
 * External deps (call-time only):
 *   go, toast                     — core/navigation.js + levix.js
 *   DB.setLastScreen, DB.lastScreen, DB.clearLastScreen — core/storage.js
 * State vars: CU, currentScreen (levix.js)
 * Own state: _lastActivity, LOCK_TIMEOUT, _lockTimer (declared here)
 *
 * Load order: after levix.js, before core/boot.js.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── F25: Auto-lock after inactivity ── */
let _lastActivity=Date.now();
const LOCK_TIMEOUT=3*60*1000; // 3 minutes
let _lockTimer=null;
function resetActivityTimer(){
  _lastActivity=Date.now();
  clearTimeout(_lockTimer);
  if(!CU)return;
  _lockTimer=setTimeout(triggerLock,LOCK_TIMEOUT);
}
function triggerLock(){
  if(!CU)return;
  const overlay=document.getElementById('lock-overlay');
  if(!overlay)return;
  // P7: Store current screen before locking
  const validScreens=['home','cal','mo','rep','budget','rec','history','set','search'];
  if(validScreens.includes(currentScreen))DB.setLastScreen(currentScreen);
  // Skip lock if user has no PIN set
  if(!CU.pin){resetActivityTimer();return;}
  overlay.classList.add('show');
  // Build numpad for lock
  const pad=document.getElementById('lock-pad');
  /* Reset lockout UI */
  const _llm=document.getElementById('lock-lockout-msg');
  if(_llm){_llm.textContent='';_llm.style.display='none';}
  /* If already locked out, show UI immediately */
  if(CU&&_loIsLocked(CU.id)){_loShowUI(CU.id,'lock-lockout-msg','lock-pad');}
  if(pad){
    pad.innerHTML='';
    let lockBuf='';
    const fillLock=(buf)=>{['lk0','lk1','lk2','lk3'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.className='dot'+(i<buf.length?' on':'');});};
    [1,2,3,4,5,6,7,8,9,'',0,'⌫'].forEach(k=>{
      const b=document.createElement('button');
      if(k===''){b.className='nk';b.style.cssText='background:transparent;box-shadow:none;pointer-events:none';}
      else if(k==='⌫'){b.className='nk del';b.textContent='⌫';b.onclick=()=>{lockBuf=lockBuf.slice(0,-1);fillLock(lockBuf);};}
      else{b.className='nk';b.textContent=k;b.onclick=()=>{
        if(lockBuf.length>=4)return;
        /* Block input if locked out */
        if(CU&&_loIsLocked(CU.id)){_loShowUI(CU.id,'lock-lockout-msg','lock-pad');return;}
        lockBuf+=String(k);fillLock(lockBuf);
        if(lockBuf.length===4){
          setTimeout(()=>{
            if(hashStr(lockBuf)===CU.pin){  /* FIX: was lockBuf===CU.pin (raw vs hash) */
              _loClear(CU.id); /* clear lockout on success */
              overlay.classList.remove('show');
              fillLock('');lockBuf='';
              resetActivityTimer();
              // P7: Restore screen
              const _ls=DB.lastScreen();
              DB.clearLastScreen();
              const _validSc=['home','cal','mo','rep','budget','rec','history','set','search'];
              go(_validSc.includes(_ls)?_ls:'home');
            } else {
              const dots=document.getElementById('lock-dots');
              if(dots){dots.querySelectorAll('.dot').forEach(d=>d.classList.add('err'));dots.classList.add('shake');setTimeout(()=>{dots.classList.remove('shake');dots.querySelectorAll('.dot').forEach(d=>d.classList.remove('err'));},500);}
              lockBuf='';fillLock('');
              if(CU){
                const _los=_loRecord(CU.id);
                if(_los.lockedUntil){
                  _loShowUI(CU.id,'lock-lockout-msg','lock-pad');
                } else {
                  const _left=_LO_MAX-_los.attempts;
                  toast('Wrong PIN — '+_left+' attempt'+(_left===1?'':'s')+' left');
                }
              } else { toast('Wrong PIN'); }
            }
          },200);
        }
      };}
      pad.appendChild(b);
    });
  }
}
/* ══════════════════════════════════════════════════════════════════════════
   FEEDBACK & BUG REPORTING SYSTEM
   Users can report bugs, suggest features, or send general feedback
   Collected data includes: type, title, description, email, device info
   Reports stored locally in localStorage with timestamp
   ══════════════════════════════════════════════════════════════════════════ */

let _reportType='bug';

function openReportModal(){
  const modal=document.getElementById('report-modal');
  if(!modal)return;
  _reportType='bug';
  document.getElementById('report-title').value='';
  document.getElementById('report-desc').value='';
  document.getElementById('report-email').value='';
  document.getElementById('report-char-count').textContent='0/500';
  document.getElementById('report-status').style.display='none';
  document.getElementById('report-status').textContent='';
  document.getElementById('report-submit-btn').disabled=false;
  document.getElementById('report-submit-btn').style.opacity='1';
  
  // Reset button styles
  document.querySelectorAll('.report-type-btn').forEach(b=>{
    b.style.background='var(--surface)';
    b.style.borderColor='var(--border)';
    b.style.color='var(--text)';
  });
  document.getElementById('rt-bug').style.background='var(--accent)';
  document.getElementById('rt-bug').style.borderColor='var(--accent)';
  document.getElementById('rt-bug').style.color='white';
  
  // Populate device info
  const appVersion='1.0.0';
  const userAgent=navigator.userAgent.slice(0,60);
  const storage=DB.exps().length+' expenses';
  document.getElementById('report-device-info').innerHTML=`
Levix v${appVersion} · ${_isIOS()?'iOS':'Android'}<br>
${storage} · ${_isStandalone()?'Installed':'Browser'}
  `.trim();
  
  modal.style.display='flex';
}

function closeReportModal(){
  const modal=document.getElementById('report-modal');
  if(modal)modal.style.display='none';
  _reportType='bug';
}

function setReportType(type){
  _reportType=type;
  document.querySelectorAll('.report-type-btn').forEach(b=>{
    b.style.background='var(--surface)';
    b.style.borderColor='var(--border)';
    b.style.color='var(--text)';
  });
  const btn=document.getElementById('rt-'+type);
  if(btn){
    btn.style.background='var(--accent)';
    btn.style.borderColor='var(--accent)';
    btn.style.color='white';
  }
}

function submitReport(){
  const title=(document.getElementById('report-title').value||'').trim();
  const desc=(document.getElementById('report-desc').value||'').trim();
  const email=(document.getElementById('report-email').value||'').trim();
  
  // Validate
  if(!title){toast('⚠️ Please enter a title');return;}
  if(title.length<5){toast('⚠️ Title too short (min 5 chars)');return;}
  
  // Collect report data
  const report={
    id:DB.id(),
    type:_reportType,
    title:title,
    description:desc,
    email:email,
    deviceInfo:{
      appVersion:'1.0.0',
      platform:_isIOS()?'iOS':'Android',
      standalone:_isStandalone()?'yes':'no',
      userAgent:navigator.userAgent.slice(0,100),
      storage:DB.exps().length+' expenses',
      timestamp:Date.now()
    }
  };
  
  // Save to localStorage (up to 100 reports)
  try{
    let reports=[];
    try{reports=JSON.parse(localStorage.getItem('lv_reports')||'[]');}catch(_){}
    reports.push(report);
    if(reports.length>100)reports=reports.slice(-100); // keep last 100
    localStorage.setItem('lv_reports',JSON.stringify(reports));
  }catch(e){
    console.error('Report save failed',e);
  }
  
  // Show success
  const statusEl=document.getElementById('report-status');
  statusEl.style.display='block';
  statusEl.style.background='#D1FAE5';
  statusEl.style.color='#065F46';
  statusEl.textContent='✓ Report submitted. Thank you for your feedback!';
  
  document.getElementById('report-submit-btn').disabled=true;
  document.getElementById('report-submit-btn').style.opacity='0.5';
  
  // Close after delay
  setTimeout(()=>{
    closeReportModal();
    toast('📝 Report submitted ✓');
  },2000);
}

// Track character count
document.addEventListener('DOMContentLoaded',()=>{
  const descEl=document.getElementById('report-desc');
  if(descEl){
    descEl.addEventListener('input',()=>{
      const count=descEl.value.length;
      const countEl=document.getElementById('report-char-count');
      if(countEl)countEl.textContent=count+'/500';
    });
  }
});

