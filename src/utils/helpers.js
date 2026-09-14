/* === utils/helpers.js === */
/* ─── utils/helpers.js ──────────────────────────────────────────────────────
 * Levix pure helpers — extracted verbatim from levix.js.
 * Refactoring step 3: utils extraction only. Zero logic changes.
 *
 * Contains:
 *   CATS          — category definitions (pure data; co-moved because gc depends on it)
 *   TODAY/CYR/CMO — date helpers
 *   fmt           — currency formatter
 *   gc            — category lookup (depends on CATS, defined above)
 *   greet         — time-of-day greeting
 *   isoD/shM/ymk  — date string builders
 *   hashStr       — djb2-variant string hash for PIN recovery
 *
 * Dependencies: none (Date, Number, String, Math — all browser globals)
 * Must load BEFORE core/storage.js and levix.js.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── CATEGORIES ── */
const CATS=[
  {id:'food',          label:'Food',           emoji:'🍛', color:'#FF6B35'},
  {id:'travel',        label:'Travel',         emoji:'🚌', color:'#2196F3'},
  {id:'home',          label:'Home',           emoji:'🏠', color:'#4CAF50'},
  {id:'bills',         label:'Bills',          emoji:'⚡', color:'#9C27B0'},
  {id:'medical',       label:'Medical',        emoji:'💊', color:'#E91E63'},
  {id:'entertainment', label:'Entertainment',  emoji:'🎬', color:'#F59E0B'},
  {id:'insurance',     label:'Insurance',      emoji:'🛡️', color:'#0EA5E9'},
  {id:'savings',       label:'Savings',        emoji:'🏦', color:'#10B981'},
  {id:'donation',      label:'Donation',       emoji:'🤲', color:'#8B5CF6'},
  {id:'shopping',      label:'Shopping',       emoji:'🛍️', color:'#EC4899'},
  {id:'education',     label:'Education',      emoji:'📚', color:'#6366F1'},
  {id:'other',         label:'Others',         emoji:'💸', color:'#FF9800'},
  {id:'income',        label:'Income',         emoji:'💰', color:'#22C55E'},
];

/* ── UTILS ── */
/* Local-date helper — avoids UTC midnight shift for users east of UTC (e.g. IST UTC+5:30).
   Using toISOString() can return yesterday's date for several hours after local midnight. */
const TODAY  =()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const dy=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dy}`;};
/* Local-date formatter for any Date object — use instead of d.toISOString().slice(0,10),
   which converts to UTC and silently shifts the date for users east of UTC (e.g. IST). */
const dISO   =d=>{const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const dy=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dy}`;};
const CYR    =()=>new Date().getFullYear();
const CMO    =()=>new Date().getMonth();
const fmt    =n=>'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:0});
const gc     =id=>{const c=CATS.find(c=>c.id===id);return c||(CATS.find(c=>c.id==='other')||CATS[CATS.length-2]);};
const greet  =()=>{const h=new Date().getHours();return h<12?'Good morning 👋':h<17?'Good afternoon 👋':'Good evening 👋';};
/* Escape user-controlled strings before inserting into innerHTML */
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function tcardSubMsg(hasToday,todayAmt,streakCount){
  const h=new Date().getHours();
  if(h<12) return hasToday?fmt(todayAmt)+' logged so far today':'Start your day — log your first expense';
  if(h<17) return hasToday?fmt(todayAmt)+' spent · '+streakCount+' day'+(streakCount===1?'':'s')+' tracked':'Afternoon check-in — any spending to log?';
  return hasToday?'Day complete ✔  '+streakCount+' day streak':'Evening reminder — log today before midnight 🔥';
}
const isoD   =(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const shM    =(y,m,d)=>{const dt=new Date(y,m+d,1);return{y:dt.getFullYear(),m:dt.getMonth()};};
const ymk    =(y,m)=>`${y}-${String(m+1).padStart(2,'0')}`;
const hashStr=s=>{let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return h.toString(36);};

