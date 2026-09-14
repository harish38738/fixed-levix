/* === security/pin.js === */
/* ─── security/pin.js ────────────────────────────────────────────────────────
 * Levix PIN management — extracted verbatim from levix.js.
 * Refactoring step 6: PIN extraction only. Zero logic changes.
 *
 * Contains: showSetPin, spPress, spDel, saveSQ,
 *           showPin, pinPress, pinDel,
 *           fillDots, resetDots, shakeDots, buildPad
 *
 * External deps (call-time only):
 *   clearNav, showScreen, toast, enterApp  — from levix.js
 *   hashStr                                — from utils/helpers.js
 *   DB.users(), DB.setUsers()              — from core/storage.js
 * State vars: spPhase, spBuf, spUser, spFirst, pinTgt, pinBuf, cpPress, cpDel
 *
 * Load order: after levix.js, before core/boot.js.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── PIN BRUTE-FORCE LOCKOUT ──────────────────────────────────────────────
 * Storage key: lv_lo_<uid>  →  {attempts: number, lockedUntil: timestamp}
 * Max attempts: 5  |  Lockout duration: 10 minutes
 * Covers: main PIN screen (sc-pin) + in-app auto-lock overlay
 * ─────────────────────────────────────────────────────────────────────── */
const _LO_MAX=5;
const _LO_MS=10*60*1000; /* 10 minutes */
let _loPollTimer=null;

function _loKey(uid){return 'lv_lo_'+uid;}
function _loGet(uid){try{return JSON.parse(localStorage.getItem(_loKey(uid))||'null')||{attempts:0,lockedUntil:0};}catch(e){return{attempts:0,lockedUntil:0};}}
function _loSet(uid,s){localStorage.setItem(_loKey(uid),JSON.stringify(s));}
function _loClear(uid){localStorage.removeItem(_loKey(uid));}

function _loIsLocked(uid){
  const s=_loGet(uid);
  if(!s.lockedUntil)return false;
  if(Date.now()>=s.lockedUntil){_loClear(uid);return false;}
  return true;
}
function _loMinsLeft(uid){
  const s=_loGet(uid);
  return s.lockedUntil?Math.max(1,Math.ceil((s.lockedUntil-Date.now())/60000)):0;
}
function _loRecord(uid){
  const s=_loGet(uid);
  if(s.lockedUntil&&Date.now()>=s.lockedUntil){s.attempts=0;s.lockedUntil=0;}
  s.attempts=(s.attempts||0)+1;
  if(s.attempts>=_LO_MAX)s.lockedUntil=Date.now()+_LO_MS;
  _loSet(uid,s);
  return s;
}
/* Show/maintain lockout UI on any PIN numpad. Polls every 30s to auto-clear. */
function _loShowUI(uid,msgId,padId){
  const msgEl=document.getElementById(msgId);
  const pad=document.getElementById(padId);
  const _update=()=>{
    if(!_loIsLocked(uid)){
      clearInterval(_loPollTimer);_loPollTimer=null;
      if(msgEl){msgEl.textContent='';msgEl.style.display='none';}
      if(pad)pad.querySelectorAll('.nk').forEach(b=>b.style.pointerEvents='');
      return;
    }
    const m=_loMinsLeft(uid);
    if(msgEl){msgEl.textContent='🔒 Too many attempts. Try again in '+m+' min.';msgEl.style.display='block';}
    if(pad)pad.querySelectorAll('.nk:not(.del)').forEach(b=>b.style.pointerEvents='none');
  };
  _update();
  clearInterval(_loPollTimer);
  _loPollTimer=setInterval(_update,30000);
}

/* ══ SET PIN ══ */
function showSetPin(user,phase){
  spPhase=phase;spBuf='';spUser=user;if(phase===1)spFirst='';
  /* Clear any tutorial overlay so it never sits above the PIN numpad */
  if(typeof lxTutorial!=='undefined') try{ lxTutorial._hideOverlay && lxTutorial._hideOverlay(); }catch(e){}
  document.getElementById('spav').textContent=user.name[0].toUpperCase();
  const titles={1:'Set your PIN',2:'Confirm your PIN',3:'Security Question'};
  const hints={1:'Choose a 4-digit PIN',2:'Enter the same PIN again',3:'For PIN recovery'};
  document.getElementById('sptitle').textContent=titles[phase];
  document.getElementById('sphint').textContent=hints[phase];
  // show numpad or security question
  document.getElementById('sppad').style.display=phase===3?'none':'grid';
  document.getElementById('sq-box').style.display=phase===3?'flex':'none';
  if(phase!==3){fillDots('s','');buildPad('sppad','sp');}
  clearNav();showScreen('sc-setpin');
  if(phase===3)setTimeout(()=>document.getElementById('sq-a').focus(),300);
}
function spPress(d){
  if(spBuf.length>=4)return;spBuf+=d;fillDots('s',spBuf);
  if(spBuf.length===4){
    setTimeout(()=>{
      if(spPhase===1){spFirst=spBuf;showSetPin(spUser,2);}
      else if(spBuf===spFirst){showSetPin(spUser,3);}// go to security question
      else{shakeDots('spdots');toast("PINs don't match, try again");setTimeout(()=>showSetPin(spUser,1),600);}
    },200);
  }
}
function spDel(){spBuf=spBuf.slice(0,-1);fillDots('s',spBuf);}
function saveSQ(){
  const q=document.getElementById('sq-q').value;
  const a=document.getElementById('sq-a').value.trim().toLowerCase();
  if(!q){toast('Choose a security question');return;}
  if(!a){toast('Enter your answer');return;}
  spUser.pin=hashStr(spFirst);  /* store hash, never plaintext */
  spUser.sqQ=q;
  spUser.sqA=hashStr(a);

  const users=DB.users();

  /* Block duplicate names from different IDs */
  const dupIdx=users.findIndex(u=>u.name.toLowerCase()===spUser.name.toLowerCase()&&u.id!==spUser.id);
  if(dupIdx>=0){
    toast('A user named "'+spUser.name+'" already exists. Please choose a different name.');
    return;
  }

  /* Same ID already in storage — update existing record (covers double-tap and re-setup) */
  const selfIdx=users.findIndex(u=>u.id===spUser.id);
  if(selfIdx>=0){
    users[selfIdx]=spUser;        /* overwrite with updated pin/sq */
    DB.setUsers(users);
    enterApp(spUser,true);
    return;
  }

  /* Fresh user — push and save */
  users.push(spUser);
  DB.setUsers(users);
  enterApp(spUser,true);
}

/* ══ PIN ENTRY ══ */
function showPin(user){
  pinTgt=user;pinBuf='';
  if(!user.pin){spUser=user;showSetPin(user,1);return;}
  document.getElementById('pinav').textContent=user.name[0].toUpperCase();
  document.getElementById('pinname').textContent=user.name;
  fillDots('p','');buildPad('pinpad','pin');clearNav();showScreen('sc-pin');
  /* Reset lockout UI then re-apply if still locked */
  const lm=document.getElementById('pin-lockout-msg');
  if(lm){lm.textContent='';lm.style.display='none';}
  if(_loIsLocked(user.id))_loShowUI(user.id,'pin-lockout-msg','pinpad');
}
function pinPress(d){
  if(pinBuf.length>=4)return;
  /* Block input if locked out */
  if(pinTgt&&_loIsLocked(pinTgt.id)){_loShowUI(pinTgt.id,'pin-lockout-msg','pinpad');return;}
  pinBuf+=d;fillDots('p',pinBuf);
  if(pinBuf.length===4){
    setTimeout(()=>{
      /* Always compare against the freshest copy from storage — never stale in-memory object */
      const fresh=DB.users().find(u=>u.id===pinTgt.id)||pinTgt;
      if(hashStr(pinBuf)===fresh.pin){
        haptic('success');
        _loClear(pinTgt.id); /* clear lockout on success */
        pinTgt=fresh; /* update pinTgt so enterApp gets the fresh object */
        enterApp(pinTgt,false);
      } else {
        haptic('error');
        shakeDots('pindots');
        pinBuf='';
        setTimeout(()=>fillDots('p',''),500);
        const _los=_loRecord(pinTgt.id);
        if(_los.lockedUntil){
          _loShowUI(pinTgt.id,'pin-lockout-msg','pinpad');
        } else {
          const _left=_LO_MAX-_los.attempts;
          toast('Wrong PIN — '+_left+' attempt'+(_left===1?'':'s')+' left');
        }
      }
    },200);
  }
}
function pinDel(){pinBuf=pinBuf.slice(0,-1);fillDots('p',pinBuf);}

/* ── PIN HELPERS ── */
function fillDots(pre,buf){
  const ids=pre==='p'?['p0','p1','p2','p3']:['s0','s1','s2','s3'];
  ids.forEach((id,i)=>{const el=document.getElementById(id);if(el)el.className='dot'+(i<buf.length?' on':'');});
}
function resetDots(){fillDots('p','');fillDots('s','');}
function shakeDots(id){
  const el=document.getElementById(id);if(!el)return;
  el.querySelectorAll('.dot').forEach(d=>d.classList.add('err'));
  el.classList.add('shake');
  setTimeout(()=>{el.classList.remove('shake');el.querySelectorAll('.dot').forEach(d=>d.classList.remove('err'));},500);
}
function buildPad(cid,target){
  const c=document.getElementById(cid);c.innerHTML='';
  let pFn,dFn;
  if(target==='pin'){pFn=pinPress;dFn=pinDel;}
  else if(target==='cp'){pFn=cpPress;dFn=cpDel;}
  else{pFn=spPress;dFn=spDel;}
  [1,2,3,4,5,6,7,8,9,'',0,'⌫'].forEach(k=>{
    const b=document.createElement('button');
    if(k===''){b.className='nk';b.style.cssText='background:transparent;box-shadow:none;pointer-events:none';}
    else if(k==='⌫'){b.className='nk del';b.textContent='⌫';b.onclick=dFn;}
    else{b.className='nk';b.textContent=k;b.onclick=()=>pFn(String(k));}
    c.appendChild(b);
  });
}

