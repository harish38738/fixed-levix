/* === security/recovery.js === */
/* ─── security/recovery.js ───────────────────────────────────────────────────
 * Levix PIN recovery & change — extracted verbatim from levix.js.
 * Refactoring step 7: recovery extraction only. Zero logic changes.
 *
 * Contains: openForgot, closeForgot, confirmForgot,
 *           openChangePin, cpPress, cpDel
 *
 * External deps (call-time only):
 *   lock, unlock, toast, showSetPin, showNav, go, showScreen — levix.js
 *   fillDots, buildPad, clearNav, shakeDots              — security/pin.js
 *   hashStr                                              — utils/helpers.js
 *   DB.users(), DB.setUsers()                            — core/storage.js
 *   SQ_LABELS                                            — levix.js state
 * State vars: pinTgt, spUser, CU, cpBuf, cpPhase, cpFirst
 *
 * Load order: after security/pin.js, after levix.js, before core/boot.js.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── FORGOT PIN (security question recovery + emergency access) ── */
let _fgAttempts=0;
const FG_MAX_ATTEMPTS=3;

function openForgot(){
  if(!pinTgt){return;}
  _fgAttempts=0;
  const q=pinTgt.sqQ;
  document.getElementById('fg-q-text').textContent=q
    ?('Security question: '+(SQ_LABELS[q]||q))
    :'Type your name to confirm identity:';
  document.getElementById('fginp').value='';
  const clrBtn=document.getElementById('fginp-clear');
  if(clrBtn)clrBtn.style.display='none';
  document.getElementById('fgerr').style.display='none';
  document.getElementById('fg-attempts-left').textContent='';
  document.getElementById('fg-emergency-btn').style.display='none';
  lock();
  showScreen('sc-forgot');
  setTimeout(()=>document.getElementById('fginp').focus(),350);
}

function closeForgot(){
  unlock();
  showScreen('sc-pin');
}

function confirmForgot(){
  const ans=document.getElementById('fginp').value.trim().toLowerCase();
  if(!pinTgt){closeForgot();return;}
  const q=pinTgt.sqQ;
  const match=q ? hashStr(ans)===pinTgt.sqA : ans===pinTgt.name.toLowerCase();
  if(!match){
    _fgAttempts++;
    const remaining=FG_MAX_ATTEMPTS-_fgAttempts;
    document.getElementById('fgerr').style.display='block';
    const attEl=document.getElementById('fg-attempts-left');
    if(remaining>0){
      attEl.textContent=remaining+' attempt'+(remaining===1?'':'s')+' left.';
    } else {
      attEl.textContent='No attempts left.';
      document.getElementById('fg-emergency-btn').style.display='block';
    }
    return;
  }
  const users=DB.users(),u=users.find(x=>x.id===pinTgt.id);
  /* Bug fix (security audit): don't advance to new PIN if user not found in DB */
  if(!u){document.getElementById('fgerr').style.display='block';document.getElementById('fgerr').textContent='Account not found. Try again.';return;}
  u.pin='';
  DB.setUsers(users);
  closeForgot();
  toast('Answer correct! Set a new PIN.');
  spUser=pinTgt;
  showSetPin(pinTgt,1);
}

/* Jump directly to emergency access when user knows they've forgotten both PIN + answer */
function openForgotDirect(){
  if(!pinTgt)return;
  lock();
  const nameEl2=document.getElementById('fg-wipe-name');
  if(nameEl2&&pinTgt)nameEl2.textContent=pinTgt.name;
  const wipeInp2=document.getElementById('fg-wipe-confirm');
  if(wipeInp2)wipeInp2.value='';
  showScreen('sc-emergency');
}

function showEmergencyAccess(){
  const nameEl=document.getElementById('fg-wipe-name');
  if(nameEl&&pinTgt)nameEl.textContent=pinTgt.name;
  const wipeInp=document.getElementById('fg-wipe-confirm');
  if(wipeInp)wipeInp.value='';
  showScreen('sc-emergency');
}

function emergencyExportThenReset(){
  if(!pinTgt){closeForgot();return;}
  try{
    const uid=pinTgt.id;
    const data={
      schemaVersion:SCHEMA_VERSION,
      exportedAt:new Date().toISOString(),
      emergencyExport:true,
      user:{id:pinTgt.id,name:pinTgt.name},
      expenses:DB.exps().filter(e=>e.uid===uid),
      yearly:DB.yearly().filter(r=>r.uid===uid),
      budgets:DB.budgets(),
      recurring:DB.recur().filter(r=>r.uid===uid),
      goals:(DB.goals?DB.goals():[]).filter(g=>g.uid===uid),
      settings:{dark:DB.dark()}
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='levix-emergency-backup-'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    URL.revokeObjectURL(url);
  }catch(e){
    toast('Export failed: '+e.message);
    return;
  }
  setTimeout(()=>{
    _doWipeAccount(pinTgt.id,'Backup downloaded. Account reset — import your backup after setting a new PIN.');
  },800);
}

function emergencyWipeAccount(){
  if(!pinTgt)return;
  const typed=(document.getElementById('fg-wipe-confirm').value||'').trim();
  if(typed!=='DELETE'){
    toast('Type DELETE (in capitals) to confirm');
    document.getElementById('fg-wipe-confirm').focus();
    return;
  }
  _doWipeAccount(pinTgt.id,'Account deleted. You can start fresh.');
}

function _doWipeAccount(uid,successMsg){
  DB.setUsers(DB.users().filter(u=>u.id!==uid));
  DB.setExps(DB.exps().filter(e=>e.uid!==uid));
  DB.setYearly(DB.yearly().filter(r=>r.uid!==uid));
  DB.setRecur(DB.recur().filter(r=>r.uid!==uid));
  try{const goals=(DB.goals?DB.goals():[]).filter(g=>g.uid!==uid);if(DB.setGoals)DB.setGoals(goals);}catch(_){}
  /* Bug fix (notifications audit): same gap as confirmDelAcc() — the
     emergency wipe path also never cancelled scheduled SW reminders. */
  try{cancelAllReminders();}catch(_){}
  localStorage.removeItem('lv_s');
  toast(successMsg||'Account reset.');
  setTimeout(()=>location.reload(),1400);
}

/* ── CHANGE PIN ── */
function openChangePin(){
  if(!CU)return;cpBuf='';cpPhase=1;cpFirst='';
  document.getElementById('spav').textContent=CU.name[0].toUpperCase();
  document.getElementById('sptitle').textContent='Set New PIN';
  document.getElementById('sphint').textContent='Choose a new 4-digit PIN';
  document.getElementById('sq-box').style.display='none';
  document.getElementById('sppad').style.display='grid';
  fillDots('s','');buildPad('sppad','cp');clearNav();showScreen('sc-setpin');
}
function cpPress(d){
  if(cpBuf.length>=4)return;cpBuf+=d;fillDots('s',cpBuf);
  if(cpBuf.length===4){
    setTimeout(()=>{
      if(cpPhase===1){cpFirst=cpBuf;cpBuf='';document.getElementById('sptitle').textContent='Confirm New PIN';document.getElementById('sphint').textContent='Enter the same PIN again';fillDots('s','');cpPhase=2;}
      else if(cpBuf===cpFirst){
        const users=DB.users(),u=users.find(x=>x.id===CU.id);
        /* Bug fix (security audit): don't show success if user not found in DB */
        if(!u){toast('⚠️ Error changing PIN. Please try again.');cpBuf='';cpPhase=1;fillDots('s','');document.getElementById('sptitle').textContent='Set New PIN';return;}
        u.pin=hashStr(cpBuf);CU=u;
        DB.setUsers(users);toast('PIN changed ✓');showNav();go('set');
      }
      else{shakeDots('spdots');toast("PINs don't match, try again");cpBuf='';cpPhase=1;fillDots('s','');document.getElementById('sptitle').textContent='Set New PIN';document.getElementById('sphint').textContent='Choose a new 4-digit PIN';}
    },200);
  }
}
function cpDel(){cpBuf=cpBuf.slice(0,-1);fillDots('s',cpBuf);}

