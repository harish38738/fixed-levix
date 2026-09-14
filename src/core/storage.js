/* === core/storage.js === */
/* ─── core/storage.js ────────────────────────────────────────────────────────
 * Levix storage layer — extracted verbatim from levix.js.
 * Refactoring step 2: storage extraction only. No keys, types, or
 * method signatures changed. All 33 DB methods preserved as-is.
 *
 * Dependencies: none (uses only localStorage, JSON, Date, Math — all globals)
 * Consumed by: every module that reads or writes app data via DB.*
 *
 * Load order requirement: must load after utils/helpers.js and before levix.js
 * (second <script> after the CSS link, following utils/helpers.js),
 * so DB and SCHEMA_VERSION are defined when levix.js runs.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── DB ── */
const SCHEMA_VERSION=1;
let _expsCache=null; /* render-cycle cache — cleared on every write */
/* Critical keys mirrored to a backup copy on every successful write,
   so a corrupted primary key can be recovered (see runDataHealthCheck). */
const _CRITICAL_KEYS=['lv_e','lv_u','lv_y','lv_b','lv_r'];
const DB={
  get:(k,d=[])=>{try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{
    try{
      const json=JSON.stringify(v);
      localStorage.setItem(k,json);
      if(_CRITICAL_KEYS.includes(k)){
        try{
          localStorage.setItem(k+'_bak',json);
          localStorage.setItem(k+'_bak_ts',String(Date.now()));
        }catch(e){/* backup mirror is best-effort, non-fatal */}
      }
      return true;
    }catch(e){
      console.error('[DB.set] write failed for',k,e);
      try{toast('⚠️ Save failed — storage may be full. Export a backup from Settings.');}catch(e2){}
      try{haptic('error');}catch(e2){}
      return false;
    }
  },
  users:     ()=>DB.get('lv_u',[]),
  setUsers:  v=>DB.set('lv_u',v),
  exps:      ()=>{if(_expsCache!==null)return _expsCache;_expsCache=DB.get('lv_e',[]);return _expsCache;},
  setExps:   v=>{_expsCache=null;DB.set('lv_e',v);},
  yearly:    ()=>DB.get('lv_y',[]),
  setYearly: v=>DB.set('lv_y',v),
  budgets:   ()=>DB.get('lv_b',{}),
  setBudgets:v=>DB.set('lv_b',v),
  recur:     ()=>DB.get('lv_r',[]),
  setRecur:  v=>DB.set('lv_r',v),
  sess:      ()=>localStorage.getItem('lv_s')||'',
  setSess:   v=>localStorage.setItem('lv_s',v||''),
  dark:      ()=>localStorage.getItem('lv_dk')==='1',
  setDark:   v=>localStorage.setItem('lv_dk',v?'1':'0'),
  onboarded: ()=>localStorage.getItem('lv_ob')==='1',
  setOnboarded:()=>localStorage.setItem('lv_ob','1'),
  lastExport:()=>parseInt(localStorage.getItem('lv_le')||'0',10),
  setLastExport:()=>localStorage.setItem('lv_le',Date.now().toString()),
  dailyLimit:()=>parseFloat(localStorage.getItem('lv_daily_limit')||'0'),
  setDailyLimit:v=>v>0?localStorage.setItem('lv_daily_limit',String(v)):localStorage.removeItem('lv_daily_limit'),
  rollover:()=>localStorage.getItem('lv_budget_rollover')==='1',
  setRollover:v=>localStorage.setItem('lv_budget_rollover',v?'1':'0'),
  rolloverDone:()=>localStorage.getItem('lv_rollover_done')||'',
  goals:()=>{try{return JSON.parse(localStorage.getItem('lv_goals')||'[]');}catch{return[];}},
  setGoals:v=>localStorage.setItem('lv_goals',JSON.stringify(v)),
  setRolloverDone:v=>localStorage.setItem('lv_rollover_done',v),
  lastScreen:()=>localStorage.getItem('lv_last_screen')||'home',
  setLastScreen:v=>localStorage.setItem('lv_last_screen',v||'home'),
  clearLastScreen:()=>localStorage.removeItem('lv_last_screen'),
  lastRolloverMonth:()=>localStorage.getItem('lv_rom')||'',
  setLastRolloverMonth:v=>localStorage.setItem('lv_rom',v),
  gracePeriod:()=>parseInt(localStorage.getItem('lv_grace_ms')||String(8*60*60*1000),10),
  setGracePeriod:v=>localStorage.setItem('lv_grace_ms',String(v)),
  id:        ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6),
};

