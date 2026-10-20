// Берегиня (код: Отара) — учёт овец и коз. Работает офлайн; при настроенном Firebase синхронизирует данные между телефонами.

/* ===== Помещения и загоны хозяйства (при изменении — правьте здесь) ===== */
const BARNS = [
  {id:'o1', name:'Овчарня 1', short:'О1', pens:19},
  {id:'o2', name:'Овчарня 2', short:'О2', pens:19},
  {id:'k',  name:'Козлятник', short:'К',  pens:10, extra:['1а']},
  {id:'q',  name:'Карантин',  short:'Кар', pens:10, quarantine:true},
];
// extra — дополнительные загоны с буквой (например «1а»), встают сразу после загона с тем же номером
const PENS = BARNS.flatMap(b => Array.from({length:b.pens}, (_, i) => [
  {id:`${b.id}-${i+1}`, barn:b, n:String(i+1)},
  ...(b.extra||[]).filter(x => parseInt(x)===i+1).map(x => ({id:`${b.id}-${x.replace('а','a')}`, barn:b, n:x}))
]).flat());
const PEN = Object.fromEntries(PENS.map(p => [p.id, p]));
const PEN_ORDER = Object.fromEntries(PENS.map((p, i) => [p.id, i]));
const penShort = id => PEN[id] ? `${PEN[id].barn.short}·${PEN[id].n}` : '';
const penLong = id => PEN[id] ? `${PEN[id].barn.name}, загон ${PEN[id].n}` : 'Без загона';
const penLabel = id => (S.pens.find(p => p.id===id)?.label || '').trim();

/* ===== Справочники ===== */
const SPECIES = {sheep:'Овца', goat:'Коза'};
const SPECIES_PL = {sheep:'Овцы', goat:'Козы'};
const MILKNAME = {sheep:'Овечье', goat:'Козье'};
const MALE = {sheep:'Баран', goat:'Козёл'};
const YOUNG = {sheep:'ягнёнок', goat:'козлёнок'};
const GESTATION = {sheep:147, goat:150};
const STATUS = {active:'В стаде', sold:'Продан(а)', slaughter:'Забой', dead:'Пал(а)'};
const ET = {
  vac:{t:'Вакцинация', vet:1}, treat:{t:'Обработка / дегельминтизация', vet:1}, ill:{t:'Лечение', vet:1},
  weight:{t:'Взвешивание'}, mating:{t:'Случка'}, birth:{t:'Окот'}, shear:{t:'Стрижка'}, other:{t:'Другое'}
};
const CAT = {
  expense:['Корма','ГСМ','Ветеринария','Покупка животных','Оборудование','Работа','Прочее'],
  income:['Продажа животных','Молоко','Мясо','Шерсть','Прочее']
};
const SESS = {am:'Утро', pm:'Вечер'};
const CATEGORIES = ['Дойная','Суягная','Сукозная','Холостая','Подсосная','Ярка','Молодняк','Ягнёнок','Козлёнок','Баран-производитель','Козёл-производитель','Баран-кастрат','Козёл-кастрат','Больная','Декоративная'];
const MILKOUT = {cheese:'На сыроварню', sale:'Продажа', feed:'Выпойка молодняку', waste:'Брак / списание'};
const UNITS = ['кг','т','ц','рулон','тюк','мешок','л','мл','шт','фл','уп','доза','амп'];
const STOCK = {feed:'Корма', fuel:'ГСМ', vet:'Аптека', tech:'Техника'};
const STOCK_FULL = {feed:'Корма', fuel:'ГСМ', vet:'Ветеринарная аптека', tech:'Склад техники'};
const ITEM_WORD = {feed:{one:'Корм', many:'Корма', add:'Корм'}, fuel:{one:'Топливо', many:'Топливо', add:'Топливо'}, vet:{one:'Препарат', many:'Препараты', add:'Препарат'}};
const FIN_CAT = {feed:'Корма', fuel:'ГСМ', vet:'Ветеринария'};
const EMPTY_TEXT = {feed:'Добавьте корма, которые храните: сено, зерно, комбикорм, ЗЦМ. Потом вносите приход и расход.', fuel:'Добавьте виды топлива: дизель, бензин, масло. Потом вносите приход и заправки техники.', vet:'Добавьте препараты, вакцины и расходники аптеки. Потом вносите приход и расход.'};
const DEFAULT_ITEMS = {
  feed:[['Сено','рулон'],['Солома','рулон'],['Ячмень','кг'],['Пшеница','кг'],['Кукуруза','кг'],['Овёс','кг'],['Комбикорм','кг'],['ЗЦМ','кг'],['Соль-лизунец','кг']],
  fuel:[['Бензин АИ-92','л'],['Бензин АИ-95','л'],['Дизельное топливо','л'],['Моторное масло','л']],
  vet:[]
};
const COLS = ['animals','events','finance','items','moves','rations','pens','feedauto','milk','milkout','settings'];

/* ===== Состояние и помощники ===== */
const S = {tab:'home', herdMode:'groups', filter:'',  q:'', month:null, milkDate:null, stockCat:'feed',
  uid:null, email:null, mode:'loading', local:false, demo:false, be:null, loaded:{}, pending:{}};
COLS.forEach(c => S[c] = []);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const daysBetween = (a,b) => Math.round((parse(b)-parse(a))/864e5);
const fmtD = s => s ? parse(s).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const fmtShort = s => parse(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','');
const money = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const num = (n, d=1) => (+n||0).toLocaleString('ru-RU',{maximumFractionDigits:d});
const round = (n, d=2) => Math.round((+n||0)*10**d)/10**d;
const dec = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g,'')); return isFinite(n) ? n : NaN; };
const plural = (n,a,b,c) => { n=Math.abs(n)%100; const n1=n%10; if(n>10&&n<20) return c; if(n1>1&&n1<5) return b; if(n1===1) return a; return c; };
const heads = n => `${n} ${plural(n,'голова','головы','голов')}`;
function age(birth){
  if(!birth) return '';
  const b = parse(birth), t = new Date();
  let m = (t.getFullYear()-b.getFullYear())*12 + (t.getMonth()-b.getMonth()) - (t.getDate()<b.getDate()?1:0);
  if(m < 0) return '';
  if(m < 1){ const d = daysBetween(birth, today()); return `${d} ${plural(d,'день','дня','дней')}`; }
  if(m < 12) return `${m} мес`;
  const y = Math.floor(m/12), r = m%12;
  return `${y} ${plural(y,'год','года','лет')}${r?` ${r} мес`:''}`;
}
const ageMonths = birth => birth ? daysBetween(birth, today())/30.44 : null;
/* ===== Производственные группы ===== */
const YOUNG_DAYS = 122; // молодняк до 4 месяцев, потом автоматический перевод
const GROUPS = {
  sheep:[['milk','Дойные'],['preg','Стельные'],['repl','Ремонтный молодняк'],['ram','Бараны-производители'],['meat','Бараны на мясо'],['deco','Декоративные'],['young','Молодняк до 4 мес'],['quar','Карантин']],
  goat:[['milk','Дойные'],['preg','Стельные'],['repl','Ремонтный молодняк'],['yarki','Ярки'],['meat','Козлы на мясо'],['buck','Козлы-производители'],['young','Молодняк до 4 мес'],['quar','Карантин']]
};
const groupName = (sp, g) => (GROUPS[sp] || GROUPS.sheep).find(x => x[0]===g)?.[1] || 'Без группы';
const ageDays = birth => birth ? daysBetween(birth, today()) : null;
const grownGroup = a => a.sex==='m' ? 'meat' : 'repl';
// Группа животного: заданная явно, иначе — по категории из файла и возрасту
function groupOf(a){
  // все, кто стоит в загонах карантина, — в группе «Карантин»; после перевода из карантина возвращаются в свою группу
  if(PEN[a.pen]?.barn.quarantine) return 'quar';
  const d = ageDays(a.birth);
  if(a.group==='none') return '';
  if(a.group){ if(a.group==='young' && d!=null && d >= YOUNG_DAYS) return grownGroup(a); return a.group; }
  const c = String(a.cat||'').toLowerCase().replace(/ё/g,'е');
  const isYoungCat = /ягнен|козлен|малыш|молодняк|ягнят|козлят/.test(c);
  if(d!=null && d < YOUNG_DAYS && (!c || isYoungCat || /ярк|баранчик|козлик|козочк/.test(c))) return 'young';
  if(/суягн|сукозн|стельн/.test(c)) return 'preg';
  if(/дойн/.test(c)) return 'milk';
  if(/произв/.test(c)) return a.species==='goat' ? (a.sex==='m' && !/баран/.test(c) ? 'buck' : '') : 'ram';
  if(/кастрат|мяс|валух|откорм/.test(c)) return 'meat';
  if(/декор/.test(c)) return a.species==='sheep' ? 'deco' : '';
  if(/ремонт/.test(c)) return 'repl';
  if(/ярк/.test(c)) return a.species==='goat' ? 'yarki' : 'repl';
  if(isYoungCat) return d==null ? (/ягнен|козлен|малыш/.test(c) ? 'young' : grownGroup(a)) : grownGroup(a);
  if(d!=null && d < YOUNG_DAYS) return 'young';
  return '';
}
const adult = a => { const g = groupOf(a); if(g==='young' || g==='repl' || g==='yarki') return false; const m = ageMonths(a.birth); return m != null ? m >= 8 : true; };
const tagSort = (x,y) => String(x.tag).localeCompare(String(y.tag),'ru',{numeric:true});
const penSort = (x,y) => ((PEN_ORDER[x.pen] ?? 999) - (PEN_ORDER[y.pen] ?? 999)) || tagSort(x,y);
const byId = id => S.animals.find(a => a.id === id);
const inPen = pid => S.animals.filter(a => a.status==='active' && (a.pen||'') === pid);
const itemById = id => S.items.find(i => i.id === id);
const rationById = id => S.rations.find(r => r.id === id);
const RATIONS_ON = false;
const penRation = pid => !RATIONS_ON ? null : rationById(S.pens.find(p => p.id === pid)?.ration);
const setting = id => S.settings.find(s => s.id === id);
const animalLabel = a => a ? `№${a.tag}${a.name?` «${a.name}»`:''}` : 'удалено';
const animalTitle = a => a.name || (adult(a) ? (a.sex==='m' ? MALE[a.species] : SPECIES[a.species]) : YOUNG[a.species][0].toUpperCase()+YOUNG[a.species].slice(1));
const eventsFor = id => S.events.filter(e => (e.animalIds||[]).includes(id)).sort((a,b)=> b.date.localeCompare(a.date));
const lastWeight = id => eventsFor(id).find(e => e.type==='weight' && e.weight)?.weight ?? null;
const strip = o => { const {id, ...rest} = o; return rest; };
// Администраторы перечислены в config.js (window.OTARA_ADMINS) и в правилах Firestore
// В config.js хранятся не сами почты, а их отпечатки (SHA-256), чтобы по коду нельзя было узнать, кто администратор
async function sha256(t){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join(''); }
async function isAdminEmail(e){
  const hashes = (window.OTARA_ADMIN_KEYS || []).map(x => String(x).toLowerCase());
  const plain = (window.OTARA_ADMINS || []).map(x => String(x).trim().toLowerCase()).filter(x => x && !x.includes('ваша_почта'));
  if(!hashes.length && !plain.length) return true;
  const em = String(e||'').trim().toLowerCase();
  if(plain.includes(em)) return true;
  return hashes.includes(await sha256('otara:' + em));
}
const sexIcon = s => `<span class="sex ${s}">${s==='f'?'♀':'♂'}</span>`;

/* ===== Хранилище: Firebase (синхронизация) или память телефона ===== */
const DEL = Object.freeze({__delete:true});
function firebaseBackend(fs, db){
  const conv = v => v===DEL ? fs.deleteField()
    : (v && typeof v==='object' && !Array.isArray(v)) ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, conv(x)])) : v;
  return {
    subscribe(col, next, fail){
      return fs.onSnapshot(fs.collection(db, col), {includeMetadataChanges:true},
        snap => next(snap.docs.map(d => ({id:d.id, ...d.data()})), snap.metadata.hasPendingWrites), fail);
    },
    newId(col){ return fs.doc(fs.collection(db, col)).id; },
    write(col, id, data, merge){ return merge ? fs.setDoc(fs.doc(db, col, id), conv(data), {merge:true}) : fs.setDoc(fs.doc(db, col, id), data); },
    remove(col, id){ return fs.deleteDoc(fs.doc(db, col, id)); },
    recent(col, n, next, fail){
      return fs.onSnapshot(fs.query(fs.collection(db, col), fs.orderBy('at', 'desc'), fs.limit(n)),
        snap => next(snap.docs.map(d => ({id:d.id, ...d.data()}))), fail);
    }
  };
}
function localBackend(key){
  let mem = {};
  try{ mem = JSON.parse(localStorage.getItem(key) || '{}') || {}; }catch(_){ mem = {}; }
  const subs = {};
  const list = col => Object.entries(mem[col]||{}).map(([id,v]) => ({id, ...v}));
  let saveT = 0; const dirty = new Set();
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try{ localStorage.setItem(key, JSON.stringify(mem)); }catch(_){ toast('Память браузера заполнена — сохраните резервную копию.'); } }, 60); };
  const emitNow = col => (subs[col]||[]).forEach(f => f(list(col), false));
  const emit = col => { if(dirty.has(col)) return; dirty.add(col); setTimeout(() => { dirty.delete(col); emitNow(col); }, 0); };
  const isObj = v => v && typeof v==='object' && !Array.isArray(v);
  const clean = v => isObj(v) ? Object.fromEntries(Object.entries(v).filter(([,x]) => x!==DEL && x!==undefined).map(([k,x]) => [k, clean(x)])) : v;
  const merge = (a, b) => { const o = {...(isObj(a)?a:{})}; for(const [k,v] of Object.entries(b)){ if(v===DEL) delete o[k]; else if(isObj(v)) o[k] = merge(o[k], v); else if(v!==undefined) o[k] = v; } return o; };
  return {
    isEmpty(){ return !COLS.some(c => Object.keys(mem[c]||{}).length); },
    clear(){ Object.keys(mem).forEach(k => delete mem[k]); save(); COLS.forEach(emit); },
    subscribe(col, next){ (subs[col] ||= []).push(next); setTimeout(() => next(list(col), false), 0); return () => { subs[col] = subs[col].filter(f => f!==next); }; },
    recent(col, n, next){ const f = docs => next(docs.slice().sort((a,b) => (b.at||0) - (a.at||0)).slice(0, n)); (subs[col] ||= []).push(f); setTimeout(() => f(list(col)), 0); return () => { subs[col] = subs[col].filter(x => x!==f); }; },
    newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); },
    write(col, id, data, m){ mem[col] ||= {}; mem[col][id] = m ? merge(mem[col][id], data) : clean(data); save(); emit(col); return Promise.resolve(); },
    remove(col, id){ if(mem[col]) delete mem[col][id]; save(); emit(col); return Promise.resolve(); }
  };
}
// Запись сразу попадает в память телефона; на сервер уходит, когда есть сеть.
// Промисы не ждём — иначе без интернета кнопка «Сохранить» зависнет.
const store = {
  add(col, data){ const id = S.be.newId(col); S.be.write(col, id, {...data, by:S.uid||null, byEmail:S.email||null, created:Date.now()}).catch(writeError); journal('create', col, id, null, data); return id; },
  set(col, id, data){ const before = findDoc(col, id); S.be.write(col, id, {...data, updatedBy:S.uid||null, updatedByEmail:S.email||null, updated:Date.now()}).catch(writeError); journal(before ? 'update' : 'create', col, id, before, data); },
  merge(col, id, data){ const before = findDoc(col, id); S.be.write(col, id, {...data, updatedBy:S.uid||null, updatedByEmail:S.email||null, updated:Date.now()}, true).catch(writeError); journal(before ? 'update' : 'create', col, id, before, before ? mergeView(before, data) : data); },
  del(col, id){ const before = findDoc(col, id); S.be.remove(col, id).catch(writeError); journal('delete', col, id, before, null); }
};
const findDoc = (col, id) => (S[col] || []).find(d => d.id===id) || null;
const mergeView = (a, b) => { const o = {...a}; for(const [k,v] of Object.entries(b)){ if(v===DEL) delete o[k]; else if(v && typeof v==='object' && !Array.isArray(v) && o[k] && typeof o[k]==='object') o[k] = mergeView(o[k], v); else o[k] = v; } return o; };

/* ===== Журнал изменений: кто, когда и что поменял ===== */
let quiet = 0; // автоматические действия (списание кормов, перевод молодняка, загрузка Excel) не пишутся по одному
const silently = fn => { quiet++; try{ return fn(); } finally { quiet--; } };
const SKIP_F = new Set(['updated','updatedBy','updatedByEmail','created','by','byEmail','groupSince','groupAuto','demo','source','yields','rationNo','cat','motherText','fatherText']);
const FIELD = {tag:'бирка', name:'кличка', species:'вид', sex:'пол', pen:'загон', group:'группа', status:'статус', birth:'дата рождения', breed:'порода',
  motherId:'мать', fatherId:'отец', note:'заметка', outDate:'дата выбытия', since:'в загоне с', type:'событие', date:'дата', drug:'препарат', dose:'доза',
  nextDate:'повтор', doneNext:'повтор сделан', weight:'вес', sireId:'производитель', count:'приплод', animalIds:'животные', kind:'тип', qty:'количество',
  item:'позиция', vehicle:'транспорт', price:'сумма', amount:'сумма', category:'статья', liters:'литры', to:'получатель', extra:'общий надой', session:'дойка',
  label:'назначение', ration:'рацион', items:'состав', mode:'норма', unit:'единица', plate:'госномер', trailer:'номер прицепа', vtype:'тип техники', gsm:'в ГСМ', who:'кто заправлял / выдал', expiry:'годен до', paused:'пауза', from:'с даты', skipped:'не списывать', locked:'исправлено вручную'};
function fmtVal(k, v, d){
  if(v===undefined || v===null || v==='' || v===DEL) return '—';
  if(k==='pen') return penShort(v) || '—';
  if(k==='group') return groupName(d?.species || 'sheep', v);
  if(k==='status') return STATUS[v] || v;
  if(k==='sex') return v==='f' ? 'самка' : 'самец';
  if(k==='species') return SPECIES[v] || v;
  if(['motherId','fatherId','sireId'].includes(k)) return byId(v) ? '№' + byId(v).tag : '—';
  if(k==='item' || k==='vehicle') return itemById(v)?.name || '—';
  if(k==='ration') return rationById(v)?.name || '—';
  if(k==='type') return ET[v]?.t || v;
  if(k==='session') return SESS[v] || v;
  if(k==='kind') return ({in:'приход', out:'расход', income:'доход', expense:'расход', ...MILKOUT})[v] || v;
  if(k==='animalIds') return Array.isArray(v) ? `${v.length} гол.` : '';
  if(k==='items') return Array.isArray(v) ? v.map(x => `${itemById(x.item)?.name||'?'} ${x.qty}`).join(', ') : (v && typeof v==='object' ? Object.entries(v).map(([id,q]) => `${itemById(id)?.name||'?'} ${q}`).join(', ') : String(v));
  if(typeof v==='boolean') return v ? 'да' : 'нет';
  if(/^\d{4}-\d\d-\d\d$/.test(String(v))) return fmtD(v);
  return String(v).slice(0, 60);
}
function docTitle(col, d){
  d = d || {};
  switch(col){
    case 'animals': return `Животное №${d.tag ?? '?'}`;
    case 'events': return `${ET[d.type]?.t || 'Событие'}${(d.animalIds||[]).length===1 && byId(d.animalIds[0]) ? ' · №' + byId(d.animalIds[0]).tag : (d.animalIds||[]).length > 1 ? ` · ${d.animalIds.length} гол.` : ''}`;
    case 'milk': return `Надой ${d.date ? fmtShort(d.date) : ''}, ${(SESS[d.session]||'').toLowerCase()}, ${MILKNAME[d.species]?.toLowerCase()||''}: ${num(milkTotal(d))} л`;
    case 'milkout': return `${MILKOUT[d.kind] || 'Отгрузка молока'}: ${MILKNAME[d.species]?.toLowerCase()||''} ${num(d.liters)} л`;
    case 'moves': { const it = itemById(d.item); return `${d.kind==='in' ? 'Приход' : 'Расход'}: ${it?.name || '?'} ${num(d.qty)} ${it?.unit || ''}${d.vehicle ? ' → ' + (itemById(d.vehicle)?.name || '') : ''}`; }
    case 'finance': return `${d.kind==='income' ? 'Доход' : 'Расход'}: ${d.category || ''} ${money(+d.amount||0)}`;
    case 'items': return `${d.cat==='vehicle' ? 'Техника' : d.cat==='fuel' ? 'Топливо' : d.cat==='vet' ? 'Препарат' : 'Корм'}: ${d.name || ''}`;
    case 'rations': return `Рацион «${d.name || ''}»`;
    case 'pens': return penLong(d.id || '');
    case 'settings': return 'Настройки списания кормов';
    case 'feedauto': return `Списание кормов за ${d.date ? fmtShort(d.date) : ''}`;
  }
  return col;
}
function journal(action, col, id, before, after){
  if(quiet || col==='log' || !S.be) return;
  let changes = [];
  if(action==='update' && before && after){
    const keys = new Set([...Object.keys(before), ...Object.keys(after)].filter(k => !SKIP_F.has(k) && k!=='id'));
    for(const k of keys){
      const a = JSON.stringify(before[k] ?? null), b = JSON.stringify(after[k] === DEL ? null : (after[k] ?? null));
      if(a !== b && !(after[k]===undefined)) changes.push(`${FIELD[k] || k}: ${fmtVal(k, before[k], before)} → ${fmtVal(k, after[k], after)}`);
    }
    if(col==='milk' && JSON.stringify(before.yields||{}) !== JSON.stringify(after.yields||{})) changes.push(`надой: ${num(milkTotal(before))} → ${num(milkTotal(after))} л`);
    if(!changes.length) return;
  }
  const d = action==='delete' ? before : (after || before);
  const entry = {at:Date.now(), date:today(), byEmail:S.email || (S.local ? 'это устройство' : ''), action, col, docId:id,
    title: docTitle(col, {id, ...(col==='milk' && action!=='delete' ? mergeView(before||{}, after||{}) : d)}), changes: changes.slice(0, 12)};
  S.be.write('log', S.be.newId('log'), entry).catch(() => {});
}
function journalNote(title){ if(!S.be) return; S.be.write('log', S.be.newId('log'), {at:Date.now(), date:today(), byEmail:S.email || (S.local ? 'это устройство' : ''), action:'create', col:'note', title, changes:[]}).catch(() => {}); }
function writeError(e){
  if(e && e.code==='permission-denied') toast('Нет прав на это действие.');
  else toast('Не удалось сохранить на сервере. Проверьте правила базы.');
}

/* ===== Запуск ===== */
let unsubs = [], fb = null;
async function boot(){
  render();
  if(window.OTARA_DEMO){ startLocal(true); return; }
  const cfg = window.FIREBASE_CONFIG;
  const configured = cfg && cfg.apiKey && !String(cfg.apiKey).includes('ВСТАВЬТЕ');
  if(!configured){
    let pref = null; try{ pref = localStorage.getItem('otara-mode'); }catch(_){}
    if(pref==='local') startLocal(false); else setMode('noconfig');
    return;
  }
  try{
    const V = '10.14.1', base = `https://www.gstatic.com/firebasejs/${V}/`;
    const [app, fs, au] = await Promise.all([
      import(base+'firebase-app.js'), import(base+'firebase-firestore.js'), import(base+'firebase-auth.js')
    ]);
    const fapp = app.initializeApp(cfg);
    const db = fs.initializeFirestore(fapp, {ignoreUndefinedProperties:true,
      localCache: fs.persistentLocalCache({tabManager: fs.persistentMultipleTabManager()})});
    const auth = au.getAuth(fapp);
    fb = {db, auth, fs, au};
    au.onAuthStateChanged(auth, user => {
      if(!user){ detach(); S.uid=null; S.email=null; closeSheet(); setMode('login'); return; }
      S.uid = user.uid; S.email = user.email; S.admin = false; document.body.classList.add('worker');
      isAdminEmail(user.email).then(ok => { S.admin = ok; document.body.classList.toggle('worker', !ok); render(); scheduleFeed(); scheduleGroups(); });
      attach(firebaseBackend(fs, db));
    });
  }catch(e){
    // нет интернета при самом первом запуске — библиотеки ещё не сохранены на телефоне
    setMode('nolib');
  }
}
function detach(){ unsubs.forEach(u => u()); unsubs = []; COLS.forEach(c => S[c] = []); }
function attach(be){
  detach(); S.be = be; S.loaded = {}; S.pending = {};
  for(const c of COLS){
    unsubs.push(be.subscribe(c, (docs, pend) => {
      S[c] = docs; S.loaded[c] = 1; S.pending[c] = !!pend;
      updateSync(); scheduleRender(); scheduleFeed(); if(c==='animals') scheduleGroups();
    }, err => { if(err && err.code==='permission-denied') setMode('denied'); }));
  }
  S.mode = 'live'; updateSync(); render();
}
function startLocal(demo){
  S.local = true; S.demo = demo; S.uid = null; S.email = null; S.admin = true; document.body.classList.remove('worker');
  const be = localBackend(demo ? 'otara-demo-v1' : 'otara-local-v1');
  let cleared = false; try{ cleared = localStorage.getItem('otara-demo-cleared')==='1'; }catch(_){}
  if(demo && be.isEmpty() && !cleared) seedDemo(be);
  attach(be);
}
const ready = (...cols) => cols.every(c => S.loaded[c]);
function setMode(m){ S.mode = m; updateSync(); render(); }
function updateSync(){
  const el = $('#sync'); if(!el) return;
  let cls = '', txt = '';
  if(S.mode==='live'){
    if(S.demo){ cls='off'; txt='демо'; }
    else if(S.local){ cls='off'; txt='на этом устройстве'; }
    else {
      const pend = Object.values(S.pending).some(Boolean);
      if(!navigator.onLine){ cls='off'; txt = pend ? 'офлайн · ждёт отправки' : 'офлайн'; }
      else if(pend){ cls='off'; txt='отправка…'; }
      else { cls='on'; txt='синхронизировано'; }
    }
  }
  el.innerHTML = txt ? `<span class="dot ${cls}"></span><span>${txt}</span>` : '';
}
addEventListener('online', updateSync);
addEventListener('offline', updateSync);
function toast(msg){
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
let rq = 0;
function scheduleRender(){ if(rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); refreshSheet(); }); }

/* ===== Корма: суточный расход по рационам и остатки ===== */
// Рационы и автосписание отключены: корма списываются только записями «Расход» на складе
function feedUse(){
  const use = {}, perPen = {};
  if(!RATIONS_ON) return {use, perPen};
  for(const p of PENS){
    const r = penRation(p.id); if(!r) continue;
    const n = inPen(p.id).length; if(!n) continue;
    const m = {};
    for(const row of r.items||[]){
      if(!row.item || !(+row.qty > 0)) continue;
      const q = r.mode==='pen' ? +row.qty : +row.qty * n;
      m[row.item] = (m[row.item]||0) + q; use[row.item] = (use[row.item]||0) + q;
    }
    perPen[p.id] = {heads:n, ration:r, use:m};
  }
  for(const k in use) use[k] = round(use[k], 2);
  return {use, perPen};
}
function stockBalance(){
  const bal = {};
  S.items.forEach(i => bal[i.id] = 0);
  S.moves.forEach(m => { bal[m.item] = (bal[m.item]||0) + (m.kind==='in' ? 1 : -1) * (+m.qty||0); });
  for(const k in bal) bal[k] = round(bal[k], 2);
  return bal;
}
const sameMap = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length===kb.length && ka.every(k => Math.abs((+a[k]||0) - (+b[k]||0)) < 1e-6); };
// Каждый день создаётся одна запись списания с постоянным номером d-ГГГГ-ММ-ДД,
// поэтому два телефона без связи не спишут корм дважды.
let feedTimer = 0;
function scheduleFeed(){ clearTimeout(feedTimer); feedTimer = setTimeout(processFeed, 1200); }
function processFeed(){ silently(processFeedInner); }
function processFeedInner(){
  if(!RATIONS_ON){ purgeRations(); return; }
  if(S.mode!=='live' || !ready('animals','pens','rations','feedauto','settings','items')) return;
  const st = setting('feed'); if(!st || !st.from || st.paused) return;
  const t = today(), {use} = feedUse(), has = Object.keys(use).length > 0;
  let d = st.from; const min = addDays(t, -60); if(d < min) d = min;
  for(let n = 0; d <= t && n < 70; d = addDays(d, 1)){
    const id = 'd-' + d, ex = S.feedauto.find(x => x.id===id);
    if(!ex){ if(has){ store.set('feedauto', id, {date:d, items:use}); n++; } }
    else if(S.admin && d===t && !ex.locked && !ex.skipped && !sameMap(ex.items||{}, use)){ store.set('feedauto', id, {...strip(ex), items:use}); n++; }
  }
}
function purgeRations(){
  if(S.mode!=='live' || !S.admin || !ready('pens','rations','feedauto','settings')) return;
  const nf = S.feedauto.length, nr = S.rations.length, pens = S.pens.filter(p => p.ration);
  if(!nf && !nr && !pens.length && !setting('feed')) return;
  S.feedauto.forEach(d => store.del('feedauto', d.id));
  S.rations.forEach(r => store.del('rations', r.id));
  pens.forEach(p => store.merge('pens', p.id, {ration:DEL}));
  if(setting('feed')) store.del('settings', 'feed');
  if(nf || nr) journalNote(`Рационы отключены: удалено рационов ${nr}, дней автосписания ${nf}. Остатки кормов считаются только по приходу и расходу.`);
}
// Автоперевод молодняка: явно записанная группа «Молодняк» после 4 месяцев меняется в базе
let groupTimer = 0;
function scheduleGroups(){ clearTimeout(groupTimer); groupTimer = setTimeout(processGroups, 1500); }
function processGroups(){
  if(S.mode!=='live' || !ready('animals') || !S.admin) return;
  S.animals.filter(a => a.status==='active' && a.group==='young' && ageDays(a.birth)!=null && ageDays(a.birth) >= YOUNG_DAYS)
    .slice(0, 200).forEach(a => silently(() => store.merge('animals', a.id, {group:grownGroup(a), groupSince:today(), groupAuto:true})));
}
function ensureFeedStart(){ const st = setting('feed'); if(!st || !st.from) store.set('settings', 'feed', {from:today(), paused:false}); }

/* ===== Молоко ===== */
const milkId = (d, ss, sp) => `${d}_${ss}_${sp}`;
const milkDoc = (d, ss, sp) => S.milk.find(m => m.id===milkId(d, ss, sp));
const milkTotal = m => m ? Object.values(m.yields||{}).reduce((a,b) => a + (+b||0), 0) + (+m.extra||0) : 0;
const milkHeads = m => m ? Object.values(m.yields||{}).filter(v => +v > 0).length : 0;
function milkBalance(){
  const b = {sheep:0, goat:0};
  S.milk.forEach(m => b[m.species] = (b[m.species]||0) + milkTotal(m));
  S.milkout.forEach(o => b[o.species] = (b[o.species]||0) - (+o.liters||0));
  for(const k in b) b[k] = round(b[k], 2);
  return b;
}
function milkSpecies(){
  const s = ['sheep','goat'].filter(sp => S.animals.some(a => a.species===sp && a.sex==='f' && a.status==='active') || S.milk.some(m => m.species===sp));
  return s.length ? s : ['sheep','goat'];
}
function animalMilk(id, days=7){
  const from = addDays(today(), -days+1); const byDay = {};
  S.milk.forEach(m => { if(m.date >= from && m.yields && m.yields[id] != null) byDay[m.date] = (byDay[m.date]||0) + (+m.yields[id]||0); });
  const vals = Object.values(byDay);
  return vals.length ? {avg: vals.reduce((a,b)=>a+b,0)/vals.length, days:vals.length} : null;
}
const defaultSession = () => new Date().getHours() < 14 ? 'am' : 'pm';

/* ===== План ===== */
function planItems(){
  const t = today(), items = [];
  for(const e of S.events){
    if(e.nextDate && !e.doneNext){
      const ids = (e.animalIds||[]).filter(id => byId(id)?.status==='active');
      if(!ids.length) continue;
      items.push({kind:'vet', date:e.nextDate, ev:e, title:`${ET[e.type]?.t||'Обработка'}${e.drug?` · ${e.drug}`:''}`,
        sub: ids.length>1 ? heads(ids.length) : animalLabel(byId(ids[0]))});
    }
    if(e.type==='mating'){
      for(const id of e.animalIds||[]){
        const a = byId(id); if(!a || a.status!=='active' || a.sex!=='f') continue;
        const born = S.events.some(x => x.type==='birth' && (x.animalIds||[]).includes(id) && x.date > e.date);
        const newer = S.events.some(x => x.type==='mating' && x!==e && (x.animalIds||[]).includes(id) && x.date > e.date);
        if(born || newer) continue;
        const due = addDays(e.date, GESTATION[a.species]||147);
        if(daysBetween(t, due) < -30) continue;
        items.push({kind:'birth', date:due, animal:a, title:'Ожидается окот', sub:`${animalLabel(a)} · ${penShort(a.pen)||'без загона'} · случка ${fmtD(e.date)}`});
      }
    }
  }
  const bal = stockBalance(), {use} = feedUse();
  for(const it of S.items.filter(i => i.cat==='feed')){
    const u = use[it.id], b = bal[it.id]||0;
    if(u > 0){
      const days = Math.floor(b / u);
      if(days < 10) items.push({kind:'stock', date:addDays(t, Math.max(days,0)), item:it,
        title: b <= 0 ? `Закончился корм: ${it.name}` : `Заканчивается: ${it.name}`,
        sub:`остаток ${num(b)} ${it.unit} · расход ${num(u)} ${it.unit}/сут`});
    }
  }
  return items.sort((a,b) => a.date.localeCompare(b.date));
}
const urgency = date => { const d = daysBetween(today(), date); return d < 0 ? 'over' : d <= 7 ? 'soon' : 'later'; };

/* ===== Отрисовка ===== */
const NAV_OF = {log:'more', home:'home', herd:'herd', pens:'herd', milk:'milk', stock:'stock', more:'more', plan:'more', money:'more', stats:'more'};
function render(){
  const v = $('#view'), live = S.mode==='live';
  $('nav.tabs').hidden = !live;
  if(!live){ $('#fab').hidden = true; v.innerHTML = gateView(); bindGate(); return; }
  const plan = planItems();
  const urgent = plan.filter(i => daysBetween(today(), i.date) <= 7).length;
  const b = $('#moreBadge'); b.hidden = !urgent; b.textContent = urgent;
  document.querySelectorAll('nav.tabs button').forEach(x => x.dataset.tab===NAV_OF[S.tab] ? x.setAttribute('aria-current','page') : x.removeAttribute('aria-current'));
  $('#fab').hidden = !['herd','milk','stock','plan','money'].includes(S.tab) || (S.tab==='herd' && S.herdMode==='pens');
  let html = '';
  if(S.demo) html += `<div class="banner">Демо-режим: всё хранится только в этом браузере.${S.animals.some(a => a.demo) ? ` Сейчас открыт пример хозяйства. <button class="link adm" data-act="clear-demo">Очистить пример</button>` : ''}</div>`;
  html += ({log:logView, home:homeView, herd:() => herdTabs() + (S.herdMode==='pens' ? pensView() : herdView()), pens:() => { S.tab='herd'; S.herdMode='pens'; return herdTabs() + pensView(); }, milk:milkView, stock:stockView, more:moreView, plan:()=>planView(plan), money:moneyView, stats:statsView})[S.tab]();
  const focus = document.activeElement?.id, pos = document.activeElement?.selectionStart;
  v.innerHTML = html;
  bindView();
  if(focus==='q'){ const q = $('#q'); q.focus(); try{ q.setSelectionRange(pos,pos); }catch(_){} }
}
const loading = (...c) => !ready('animals', ...c);
const backTo = title => `<button class="back" data-tab-go="more">‹ Ещё</button><h2 class="page">${title}</h2>`;

function gateView(){
  const msg = (t, p) => `<div class="empty"><h2>${t}</h2><p>${p}</p></div>`;
  switch(S.mode){
    case 'loading': return msg('Загрузка…','Открываем данные на телефоне.');
    case 'login': return `<form class="login" id="lf" novalidate>
      <div class="loginbrand"><img src="icons/logo.png" alt=""><div><div class="eyebrow">Учёт овец и коз</div><h1>Берегиня</h1></div></div>
      <p>Войдите учётной записью, которую создал владелец хозяйства. Входить нужно с интернетом, дальше приложение работает и без него.</p>
      ${fld('l-email','Эл. почта',`<input id="l-email" name="email" type="email" autocomplete="username" required>`)}
      ${fld('l-pass','Пароль',`<input id="l-pass" name="password" type="password" autocomplete="current-password" required>`)}
      <p class="err" id="lerr" hidden></p>
      <button class="btn primary" type="submit">Войти</button></form>`;
    case 'noconfig': return `<div class="login"><div class="loginbrand"><img src="icons/logo.png" alt=""><div><div class="eyebrow">Учёт овец и коз</div><h1>Берегиня</h1></div></div>
      <p>Синхронизация между телефонами ещё не настроена: в файле config.js нет данных проекта Firebase. Шаги — в инструкции README.</p>
      <p>Можно уже сейчас вести учёт на этом устройстве. Эти записи останутся только здесь и не перенесутся в общую базу автоматически.</p>
      <button class="btn primary" data-act="go-local">Работать на этом устройстве</button></div>`;
    case 'nolib': return msg('Нужен интернет для первого запуска','При первом открытии приложение загружает свои модули. Подключитесь к сети один раз и обновите страницу — после этого оно будет работать офлайн.');
    case 'denied': return msg('Нет доступа к данным','База отклонила запрос. Проверьте, что правила Firestore опубликованы по инструкции.') + `<button class="btn" data-act="logout">Выйти</button>`;
  }
  return '';
}
function bindGate(){
  const f = $('#lf');
  if(f) f.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f)), err = $('#lerr'), btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Входим…';
    try{ await fb.au.signInWithEmailAndPassword(fb.auth, d.email.trim(), d.password); }
    catch(e){
      err.hidden = false;
      err.textContent = e.code==='auth/network-request-failed' ? 'Нет интернета. Первый вход возможен только онлайн.'
        : e.code==='auth/too-many-requests' ? 'Слишком много попыток. Подождите несколько минут.' : 'Неверная почта или пароль.';
      btn.disabled = false; btn.textContent = 'Войти';
    }
  };
  const go = document.querySelector('[data-act="go-local"]');
  if(go) go.onclick = () => { try{ localStorage.setItem('otara-mode','local'); }catch(_){} startLocal(false); };
  const lo = document.querySelector('[data-act="logout"]');
  if(lo) lo.onclick = () => fb && fb.au.signOut(fb.auth);
}


/* ----- Журнал изменений (только администратору) ----- */
let logUnsub = null, logDocs = null, logWho = '';
function logView(){
  let h = backTo('Журнал изменений');
  if(!S.admin) return h + `<div class="empty"><p>Раздел недоступен.</p></div>`;
  if(!logUnsub && S.be?.recent){ logUnsub = S.be.recent('log', 600, docs => { logDocs = docs; if(S.tab==='log') render(); }, () => { logDocs = []; if(S.tab==='log') render(); }); }
  if(!logDocs) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const people = [...new Set(logDocs.map(x => x.byEmail).filter(Boolean))].sort();
  const list = logDocs.filter(x => !logWho || x.byEmail===logWho);
  h += `<div class="field"><label for="lg-who">Кто</label><select id="lg-who">${opt('', 'Все', logWho)}${people.map(p => opt(p, p, logWho)).join('')}</select></div>`;
  if(!list.length) return h + `<div class="empty"><p>Записей пока нет. Здесь будут появляться все добавления, изменения и удаления: кто, когда и что именно поменял.</p></div>`;
  const ACT = {create:['Добавлено','ok'], update:['Изменено','warn'], delete:['Удалено','bad']};
  let day = '';
  h += list.map(x => {
    const d = new Date(x.at), dk = iso(d), hd = dk !== day ? `<div class="eyebrow logday">${dk===today() ? 'Сегодня' : fmtD(dk)}</div>` : ''; day = dk;
    const [al, ac] = x.col==='note' ? ['Действие','ok'] : (ACT[x.action] || ['', '']);
    return hd + `<div class="logrow"><div class="logtime">${pad(d.getHours())}:${pad(d.getMinutes())}</div><div class="logmain">
      <div><span class="pill ${ac}">${al}</span> <b>${esc(x.title || '')}</b></div>
      ${(x.changes||[]).length ? `<ul>${x.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      <div class="muted">${esc(x.byEmail || 'неизвестно')}</div></div></div>`;
  }).join('');
  return h + `<p class="muted">Показано записей: ${list.length}.</p>`;
}

/* ----- Главная ----- */
const ICON = {
  milk:'<path d="M9 2h6M10 2v3l-3 4v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9l-3-4V2"/><path d="M7 13h10"/>',
  plus:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  birth:'<path d="M12 21c4-2.5 7-5.5 7-9.5A4.5 4.5 0 0 0 12 8a4.5 4.5 0 0 0-7 3.5c0 4 3 7 7 9.5z"/>',
  vet:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  feed:'<path d="M3 8l9-5 9 5v12H3z"/><path d="M7 20v-8h10v8"/>',
  fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5"/>',
  truck:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  move:'<path d="M4 7h13l-3-3M20 17H7l3 3"/>'
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
function homeView(){
  if(loading('milk','items','moves','events')) return `<div class="empty"><p>Загружаем…</p></div>`;
  const t = today(), act = S.animals.filter(a => a.status==='active');
  const milkDay = ['am','pm'].reduce((x, ss) => x + milkTotal(milkDoc(t, ss, 'goat')) + milkTotal(milkDoc(t, ss, 'sheep')), 0);
  const plan = planItems(), soon = plan.filter(i => daysBetween(t, i.date) <= 7);
  const bal = stockBalance(), {use} = feedUse();
  const feedDays = S.items.filter(i => i.cat==='feed' && use[i.id] > 0).map(i => ({i, d: Math.floor((bal[i.id]||0) / use[i.id])})).sort((a,b) => a.d - b.d);
  const low = feedDays[0];
  const dateLabel = new Date().toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'});
  const stat = (nav, label, value, sub, cls='') => `<button class="stile ${cls}" data-nav="${nav}"><span class="sl">${label}</span><span class="sv">${value}</span><span class="ss">${sub}</span></button>`;
  let h = `<div class="hello"><h1>${dateLabel[0].toUpperCase() + dateLabel.slice(1)}</h1></div>
    <div class="stiles">
      ${stat('herd', 'Поголовье', act.length, `овец ${act.filter(a=>a.species==='sheep').length} · коз ${act.filter(a=>a.species==='goat').length}`)}
      ${stat('milk', 'Надой сегодня', `${num(milkDay)} <small>л</small>`, milkDay ? 'нажмите, чтобы посмотреть' : 'ещё не записан')}
      ${(() => { const fi = S.items.filter(i => i.cat==='feed'), neg = fi.filter(i => (bal[i.id]||0) < 0); return stat('stock', 'Корма', `${fi.length} <small>поз.</small>`, neg.length ? `в минусе: ${esc(neg[0].name)}${neg.length > 1 ? ' и ещё ' + (neg.length - 1) : ''}` : fi.length ? 'остатки на складе' : 'склад пуст', neg.length ? 'warn' : ''); })()}
      ${stat('plan', 'Дела на неделю', soon.length, soon.length ? 'есть что сделать' : 'всё спокойно', soon.some(i => daysBetween(t, i.date) < 0) ? 'warn' : '')}
    </div>
    <h2 class="sec">Быстрые действия</h2>
    <div class="qgrid">
      <button class="qbtn" data-act="milkquick">${ico('milk')}<span>Записать надой</span></button>
      <button class="qbtn" data-act="add-animal">${ico('plus')}<span>Добавить животное</span></button>
      <button class="qbtn" data-act="q-birth">${ico('birth')}<span>Записать окот</span></button>
      <button class="qbtn" data-act="q-vet">${ico('vet')}<span>Обработка, прививка</span></button>
      <button class="qbtn" data-act="q-feed">${ico('feed')}<span>Приход корма</span></button>
      <button class="qbtn" data-act="q-fuel">${ico('fuel')}<span>Выдать топливо</span></button>
      <button class="qbtn" data-act="milkout">${ico('truck')}<span>Отгрузка молока</span></button>
      <button class="qbtn" data-nav="herd" data-hm2="pens">${ico('move')}<span>Перевести по загонам</span></button>
    </div>`;
  if(soon.length) h += `<div class="kv"><h2 class="sec">Ближайшие дела</h2><button class="link" data-nav="plan">Все</button></div>
    <div class="plan">${soon.slice(0,3).map(it => { const d = daysBetween(t, it.date); return `<div class="task ${urgency(it.date)}"><div class="when"><b>${fmtShort(it.date).split(' ')[0]}</b>${fmtShort(it.date).split(' ')[1]||''}</div><div class="what"><div class="t">${esc(it.title)}</div><div class="s">${esc(it.sub)} · ${d<0?'просрочено':d===0?'сегодня':'через '+d+' '+plural(d,'день','дня','дней')}</div></div></div>`; }).join('')}</div>`;
  return h;
}

/* ----- Стадо ----- */
const FILTERS = {
  active:['Все', a=>a.status==='active'],
  sheep:['Овцы', a=>a.status==='active'&&a.species==='sheep'],
  goat:['Козы', a=>a.status==='active'&&a.species==='goat'],
  nogroup:['Без группы', a=>a.status==='active'&&!groupOf(a)],
  quarantine:['Карантин', a=>a.status==='active'&&!!PEN[a.pen]?.barn.quarantine],
  nopen:['Без загона', a=>a.status==='active'&&!PEN[a.pen]],
  gone:['Выбывшие', a=>a.status!=='active'],
};
// фильтр вида «g:sheep:milk» — группа
function filterFn(f){
  if(f && f.startsWith('g:')){ const [, sp, g] = f.split(':'); return a => a.status==='active' && a.species===sp && groupOf(a)===g; }
  return (FILTERS[f] || FILTERS.active)[1];
}
function herdTabs(){ return `<div class="segb" role="group" aria-label="Вид"><button data-hm="groups" aria-pressed="${S.herdMode!=='pens'}">По группам</button><button data-hm="pens" aria-pressed="${S.herdMode==='pens'}">По загонам</button></div>`; }
function filterName(f){
  if(f && f.startsWith('g:')){ const [, sp, g] = f.split(':'); return `${SPECIES_PL[sp]}: ${groupName(sp, g).toLowerCase()}`; }
  return (FILTERS[f] || FILTERS.active)[0];
}
function herdView(){
  const all = S.animals, q = S.q.trim().toLowerCase(), act = all.filter(a => a.status==='active');
  const fn = filterFn(S.filter);
  const list = all.filter(fn)
    .filter(a => !q || [a.tag, a.name, a.breed, a.cat, groupName(a.species, groupOf(a)), penShort(a.pen), penLong(a.pen), penLabel(a.pen)].some(x => String(x||'').toLowerCase().includes(q)))
    .sort(tagSort);
  if(loading()) return `<div class="empty"><p>Загружаем стадо…</p></div>`;
  const listMode = !!S.filter || !!q;
  if(!all.length) return `<div class="empty"><h2>Стадо пока пустое</h2><p>Добавьте первое животное: номер бирки, вид, пол, загон и дату рождения. Мать, отца и вес можно заполнить позже.</p><div class="actions"><button class="btn primary" data-act="add-animal">Добавить животное</button><button class="btn adm" data-act="import">Загрузить из Excel</button></div></div>`;
  const cnt = {}; act.forEach(a => { const k = a.species + ':' + groupOf(a); cnt[k] = (cnt[k]||0) + 1; });
  const nSheep = act.filter(a => a.species==='sheep').length, nGoat = act.length - nSheep;
  const block = sp => !(sp==='sheep'?nSheep:nGoat) ? '' : `<div class="gblock"><div class="gtitle"><span class="lg"><i style="background:var(--${sp})"></i>${SPECIES_PL[sp]}</span><b>${sp==='sheep'?nSheep:nGoat}</b></div>
    <div class="ggrid">${GROUPS[sp].map(([g, l]) => { const f = `g:${sp}:${g}`, n = cnt[sp+':'+g]||0;
      return n ? `<button class="gbtn" data-f="${f}"><span>${l}</span><b>${n}</b></button>` : ''; }).join('')}</div></div>`;
  const search = `<div class="search"><input id="q" type="search" placeholder="Найти по номеру бирки или кличке" value="${esc(S.q)}" autocomplete="off"></div>`;
  if(!listMode){
    const extra = ['nogroup','nopen','gone'].map(k => { const n = all.filter(FILTERS[k][1]).length; return n ? `<button class="gbtn soft" data-f="${k}"><span>${FILTERS[k][0]}</span><b>${n}</b></button>` : ''; }).join('');
    return search + `<div class="hero"><div><div class="hero-l">Всего поголовье</div><div class="bignum">${act.length}</div></div><div class="hero-r"><span><i style="background:var(--sheep)"></i>Овцы <b>${nSheep}</b></span><span><i style="background:var(--goat)"></i>Козы <b>${nGoat}</b></span></div></div>
      ${block('sheep')}${block('goat')}
      ${extra ? `<div class="gblock"><div class="gtitle"><span>Требуют внимания</span></div><div class="ggrid">${extra}</div></div>` : ''}
      <button class="gbtn wide" data-f="active"><span>Весь список животных</span><b>${act.length} ›</b></button>`;
  }
  let h = `<div class="listtop"><button class="back" data-f="">‹ Стадо</button>${search}
    <div class="kv listhead"><h2>${esc(q && !S.filter ? 'Поиск' : filterName(S.filter))} · ${list.length}</h2>${S.filter!=='gone' && list.some(a => a.status==='active') ? `<button class="btn small adm" data-act="regroup">Перевести в группу</button>` : ''}</div></div>`;
  if(!list.length) return h + `<div class="empty"><p>${S.filter==='nogroup' ? 'Все животные распределены по группам.' : 'Под этот фильтр никто не подходит.'}</p></div>`;
  return h + `<div class="list">` + list.map(a => {
    const w = lastWeight(a.id), g = groupOf(a);
    return `<button class="row ${a.status!=='active'?'gone':''}" data-open="${a.id}">
      <span class="tag">${esc(a.tag)}</span>
      <span class="main"><div class="name">${esc(animalTitle(a))} ${sexIcon(a.sex)}</div>
      <div class="sub">${[penShort(a.pen) ? `загон ${penShort(a.pen)}` : '', g ? groupName(a.species, g) : (a.cat ? a.cat + ' (без группы)' : 'без группы'), a.breed, age(a.birth)].filter(Boolean).map(esc).join(' · ')}</div></span>
      <span class="side">${w?`<strong>${num(w)} кг</strong>`:''}${a.status!=='active'?`<span class="pill">${STATUS[a.status]}</span>`:''}</span></button>`;
  }).join('') + `</div>`;
}

/* ----- Перевод в группу (сразу нескольких) ----- */
function regroupSheet(ids, title){
  const list = ids.map(byId).filter(a => a && a.status==='active').sort(tagSort);
  const sps = [...new Set(list.map(a => a.species))];
  const opts = sps.length===1 ? GROUPS[sps[0]].map(([g,l]) => opt(g, l, '')).join('')
    : GROUPS.sheep.map(([g]) => g).filter((g, i, arr) => arr.indexOf(g)===i).concat(GROUPS.goat.map(([g]) => g)).filter((g, i, arr) => arr.indexOf(g)===i)
        .map(g => opt(g, `${groupName('sheep', g)}${groupName('goat', g)!==groupName('sheep', g) ? ' / ' + groupName('goat', g) : ''}`, '')).join('');
  const body = `<div class="kv"><span class="eyebrow">Отмечено: <span id="rgn">0</span> из ${list.length}</span><button class="link" id="rgall">Отметить всех</button></div>
    <div class="list scroll">${list.map(a => `<label class="row pickrow"><input type="checkbox" name="rg" value="${a.id}"><span class="tag">${esc(a.tag)}</span><span class="sub">${esc(animalTitle(a))} ${a.sex==='f'?'♀':'♂'} · ${esc(groupName(a.species, groupOf(a)))}${a.birth ? ' · ' + esc(age(a.birth)) : ''}</span></label>`).join('')}</div>
    <div class="movebar">${fld('rg-to','Перевести отмеченных в группу',`<select id="rg-to">${opt('','— выберите группу —','')}${opts}<option value="__none">Без группы</option></select>`)}<button class="btn primary" id="rggo" disabled>Перевести</button></div>
    <p class="muted" style="margin:0">Молодняк до 4 месяцев приложение переводит само: ярочек и козочек — в ремонтный молодняк, баранчиков и козликов — на мясо.</p>`;
  openSheet(title || 'Перевод в группу', body, s => {
    const boxes = [...s.querySelectorAll('input[name=rg]')], to = s.querySelector('#rg-to'), go = s.querySelector('#rggo');
    const upd = () => { const n = boxes.filter(b => b.checked).length; s.querySelector('#rgn').textContent = n; go.disabled = !n || !to.value; go.textContent = n ? `Перевести (${n})` : 'Перевести'; };
    boxes.forEach(b => b.onchange = upd); to.onchange = upd;
    s.querySelector('#rgall').onclick = () => { const all = boxes.every(b => b.checked); boxes.forEach(b => b.checked = !all); upd(); };
    go.onclick = () => {
      const g = to.value === '__none' ? 'none' : to.value, ids2 = boxes.filter(b => b.checked).map(b => b.value);
      const tags = ids2.map(id => byId(id)?.tag).filter(Boolean), sp0 = byId(ids2[0])?.species || 'sheep';
      silently(() => ids2.forEach(id => store.merge('animals', id, {group: g, groupSince: today(), groupAuto: DEL})));
      journalNote(`Перевод в группу «${g==='none' ? 'Без группы' : groupName(sp0, g)}»: ${heads(ids2.length)} (№ ${tags.slice(0, 30).join(', ')}${tags.length > 30 ? '…' : ''})`);
      toast(`Переведено: ${heads(ids2.length)}`); closeSheet();
    };
  }, 'regroup');
}

/* ----- Загоны ----- */
function rationText(r){
  const unitOf = id => itemById(id)?.unit || 'кг';
  const parts = (r.items||[]).filter(x => x.item).map(x => `${itemById(x.item)?.name || 'удалён'} ${num(x.qty,2)} ${unitOf(x.item)}`);
  return (parts.join(' · ') || 'состав не указан') + (r.mode==='pen' ? ' — на загон в сутки' : ' — на голову в сутки');
}
function pensView(){
  if(loading('pens','rations')) return `<div class="empty"><p>Загружаем…</p></div>`;
  const {perPen} = feedUse();
  let h = '';
  const loose = S.animals.filter(a => a.status==='active' && !PEN[a.pen]);
  if(loose.length) h += `<button class="banner as-btn" data-pen="">Без загона: ${heads(loose.length)}. Нажмите, чтобы распределить.</button>`;
  for(const b of BARNS){
    const pens = PENS.filter(p => p.barn===b);
    const total = pens.reduce((s,p) => s + inPen(p.id).length, 0);
    h += `<section class="barn"><div class="barn-head"><h2>${b.name}</h2><span>${heads(total)} · ${b.pens} ${plural(b.pens,'загон','загона','загонов')}</span></div>
      <div class="pens">${pens.map(p => {
        const n = inPen(p.id).length, r = penRation(p.id);
        return `<button class="pen ${n?'':'empty'} ${b.quarantine?'q':''}" data-pen="${p.id}" aria-label="${esc(penLong(p.id))}: ${heads(n)}">
          <b>${p.n}</b><span>${n ? `${n} гол.` : 'пусто'}</span>${penLabel(p.id) ? `<em>${esc(penLabel(p.id))}</em>` : ''}${r ? `<i>${esc(r.name.replace(/^рацион\s*/i, ''))}</i>` : ''}</button>`;
      }).join('')}</div></section>`;
  }
  return h;
}

/* ----- Молоко ----- */
function milkView(){
  if(!S.milkDate) S.milkDate = today();
  const d = S.milkDate, sp = milkSpecies(), bal = milkBalance();
  const label = parse(d).toLocaleDateString('ru-RU',{weekday:'short', day:'numeric', month:'long'});
  let h = `<div class="monthsel"><button data-md="-1" aria-label="Предыдущий день">‹</button><h2>${d===today()?'Сегодня, ':''}${label}</h2><button data-md="1" aria-label="Следующий день" ${d>=today()?'disabled':''}>›</button></div>`;
  if(loading('milk','milkout')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const v = (ss, s2) => milkTotal(milkDoc(d, ss, s2));
  const tot = (ss) => v(ss,'goat') + v(ss,'sheep');
  const day = tot('am') + tot('pm');
  const cell = (ss, s2) => { const m = milkDoc(d, ss, s2); return `<td><button class="mcell" data-milk="${ss}:${s2}" aria-label="${SESS[ss]}, ${SPECIES_PL[s2].toLowerCase()}">${m ? `<b>${num(milkTotal(m))}</b>${milkHeads(m) ? `<small>${milkHeads(m)} гол.</small>` : ''}` : '<em>+</em>'}</button></td>`; };
  h += `<div class="mday"><div class="mday-top"><div><div class="eyebrow">Надой за день</div><div class="bignum">${num(day)} <span>л</span></div></div>
      <button class="btn primary" data-act="milkquick">Добавить надой</button></div>
    <table class="mtable"><thead><tr><th></th><th><span class="lg"><i style="background:var(--goat)"></i>Козы</span></th><th><span class="lg"><i style="background:var(--sheep)"></i>Овцы</span></th><th>Всего</th></tr></thead>
      <tbody>${['am','pm'].map(ss => `<tr><th>${SESS[ss]}</th>${cell(ss,'goat')}${cell(ss,'sheep')}<td class="sum">${num(tot(ss))}</td></tr>`).join('')}
      <tr class="tot"><th>За день</th><td>${num(v('am','goat')+v('pm','goat'))}</td><td>${num(v('am','sheep')+v('pm','sheep'))}</td><td class="sum">${num(day)}</td></tr></tbody></table>
    <p class="muted" style="margin:0">Литры. Нажмите на ячейку, чтобы записать надой по каждой голове.</p></div>`;
  h += `<div class="panel"><div class="eyebrow">Молоко в наличии</div>${sp.map(s => `<div class="kv"><span>${MILKNAME[s]}</span><strong class="${bal[s]<0?'money minus':''}">${num(bal[s])} л</strong></div>`).join('')}
    <div class="actions"><button class="btn primary" data-act="milkout">Отгрузка на сыроварню</button></div></div>`;
  h += milkChart(d, sp);
  const mon = d.slice(0,7), monLabel = parse(mon+'-01').toLocaleDateString('ru-RU',{month:'long'});
  const prod = s => S.milk.filter(m => m.species===s && m.date.startsWith(mon)).reduce((a,m) => a + milkTotal(m), 0);
  const out = (s, k) => S.milkout.filter(o => o.species===s && (o.date||'').startsWith(mon) && (!k || o.kind===k)).reduce((a,o) => a + (+o.liters||0), 0);
  h += `<div class="panel"><div class="eyebrow">За ${monLabel}</div>${sp.map(s => `<div class="kv"><span>${MILKNAME[s]}: надоено / на сыроварню</span><strong>${num(prod(s))} / ${num(out(s,'cheese'))} л</strong></div>`).join('')}</div>`;
  const outs = S.milkout.slice().sort((a,b) => b.date.localeCompare(a.date) || (b.created||0)-(a.created||0)).slice(0, 15);
  h += `<button class="link view-link" data-act="excel" data-sec="milk,milkHeads,milkOut">Выгрузить молоко в Excel</button>`;
  if(outs.length) h += `<div><div class="eyebrow">Отгрузки и списания</div></div><div class="list">` + outs.map(o => `<button class="row" data-mo="${o.id}">
      <span class="pill">${fmtShort(o.date)}</span>
      <span class="main"><div class="name">${MILKOUT[o.kind]||'Отгрузка'} · ${MILKNAME[o.species]||''}</div><div class="sub">${esc([o.to, o.price?money(o.price):''].filter(Boolean).join(' · '))}</div></span>
      <span class="side"><strong>−${num(o.liters)} л</strong></span></button>`).join('') + `</div>`;
  return h;
}
function milkChart(end, sp){
  const days = Array.from({length:14}, (_,i) => addDays(end, i-13));
  const val = (d, s) => milkTotal(milkDoc(d,'am',s)) + milkTotal(milkDoc(d,'pm',s));
  const max = Math.max(1, ...days.flatMap(d => sp.map(s => val(d,s))));
  if(!days.some(d => sp.some(s => val(d,s)))) return '';
  const W = 340, H = 130, L = 30, B = 20, T = 10, cw = (W-L)/days.length, bw = Math.min(9, (cw-4)/sp.length);
  const y = v => T + (H-T-B) * (1 - v/max);
  let bars = '';
  days.forEach((d,i) => sp.forEach((s,j) => { const v = val(d,s); if(!v) return;
    const x = L + i*cw + (cw - bw*sp.length)/2 + j*bw;
    bars += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${(H-B-y(v)).toFixed(1)}" rx="1.5" fill="var(--${s})"><title>${fmtShort(d)}: ${MILKNAME[s]} ${num(v)} л</title></rect>`; }));
  const ticks = days.map((d,i) => i%2===(days.length-1)%2 ? `<text x="${(L+i*cw+cw/2).toFixed(1)}" y="${H-5}" text-anchor="middle">${parse(d).getDate()}</text>` : '').join('');
  const mid = max/2;
  return `<div class="panel"><div class="kv"><span class="eyebrow">Надой за 14 дней, л</span><span class="lgs">${sp.map(s => `<span class="lg"><i style="background:var(--${s})"></i>${MILKNAME[s]}</span>`).join('')}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Суточный надой за 14 дней">
      <line x1="${L}" x2="${W}" y1="${y(max)}" y2="${y(max)}" class="grid"/><line x1="${L}" x2="${W}" y1="${y(mid)}" y2="${y(mid)}" class="grid"/><line x1="${L}" x2="${W}" y1="${H-B}" y2="${H-B}" class="axis"/>
      <text x="${L-4}" y="${y(max)+4}" text-anchor="end">${num(max,0)}</text><text x="${L-4}" y="${y(mid)+4}" text-anchor="end">${num(mid,0)}</text>
      ${bars}${ticks}</svg></div>`;
}

/* ----- Склад ----- */
function stockView(){
  const cat = STOCK[S.stockCat] ? S.stockCat : 'feed';
  let h = `<div class="segb" role="group" aria-label="Раздел склада">${Object.entries(STOCK).map(([k,l]) => `<button data-cat="${k}" aria-pressed="${cat===k}">${l}</button>`).join('')}</div>`;
  if(loading('items','moves')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  return h + (cat==='tech' ? techView() : stockCatView(cat));
}
const itemsOf = cat => S.items.filter(i => i.cat===cat).sort((a,b) => a.name.localeCompare(b.name,'ru'));
const whoName = e => e ? String(e).split('@')[0] : '';
const monthTitle = ym => { const s = parse(ym + '-01').toLocaleDateString('ru-RU', {month:'long', year:'numeric'}).replace(/\s*г\.?$/, ''); return s[0].toUpperCase() + s.slice(1); };
function stockCatView(cat){
  const items = itemsOf(cat), bal = stockBalance(), sub = S.stockSub || 'bal';
  let h = `<div class="sechead"><h2>${STOCK_FULL[cat]}</h2><button class="btn small adm" data-act="add-item">+ ${ITEM_WORD[cat].add}</button></div>`;
  if(!items.length) return h + `<div class="empty"><p>${EMPTY_TEXT[cat]}</p><div class="actions">${DEFAULT_ITEMS[cat]?.length ? `<button class="btn primary adm" data-act="seed-items">Добавить типовой список</button>` : ''}<button class="btn adm ${DEFAULT_ITEMS[cat]?.length ? '' : 'primary'}" data-act="add-item">+ ${ITEM_WORD[cat].add}</button></div></div>`;
  h += `<div class="segb" role="group" aria-label="Что показать">${[['bal','Остаток'],['in','Приход'],['out','Расход']].map(([k,l]) => `<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join('')}</div>`;
  if(sub==='bal'){
    const mon = today().slice(0,7);
    h += `<div class="list">` + items.map(it => {
      const b = bal[it.id]||0, usedM = S.moves.filter(m => m.item===it.id && m.kind==='out' && (m.date||'').startsWith(mon)).reduce((a,m) => a + (+m.qty||0), 0);
      const exp = it.expiry ? daysBetween(today(), it.expiry) : null;
      const sub2 = [usedM ? `расход за ${parse(mon+'-01').toLocaleDateString('ru-RU',{month:'long'})}: ${num(round(usedM,2))} ${it.unit}` : '', it.expiry ? `годен до ${fmtD(it.expiry)}` : ''].filter(Boolean).join(' · ') || it.unit;
      const pill = b < 0 ? `<span class="pill bad">минус</span>` : b === 0 ? `<span class="pill warn">нет</span>` : exp != null && exp < 0 ? `<span class="pill bad">просрочен</span>` : exp != null && exp < 30 ? `<span class="pill warn">срок</span>` : '';
      return `<button class="row" data-item="${it.id}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${esc(it.name)}</div><div class="sub">${esc(sub2)}</div></span>
        <span class="side"><strong class="${b<0?'money minus':''}">${num(b)} ${esc(it.unit)}</strong>${pill}</span></button>`;
    }).join('') + `</div>`;
  } else {
    const kind = sub, f = S.stockFilter || '';
    const ops = S.moves.filter(m => m.kind===kind && itemById(m.item)?.cat===cat && (!f || m.item===f || m.vehicle===f))
      .sort((a,b) => b.date.localeCompare(a.date) || (b.created||0)-(a.created||0));
    const vs = cat==='fuel' && kind==='out' ? vehicles().filter(v => S.moves.some(m => m.vehicle===v.id)) : [];
    h += `<div class="actions"><button class="btn primary" data-mv="${kind}">+ ${kind==='in' ? 'Приход' : cat==='fuel' ? 'Заправка техники' : 'Расход'}</button></div>
      <div class="field"><select id="sfilter" aria-label="Показать">${opt('', 'Все позиции', f)}${vs.length ? `<optgroup label="${ITEM_WORD[cat].many}">` : ''}${items.map(i => opt(i.id, i.name, f)).join('')}${vs.length ? `</optgroup><optgroup label="Техника">${vs.map(v => opt(v.id, vehLabel(v), f)).join('')}</optgroup>` : ''}</select></div>`;
    if(!ops.length) h += `<div class="empty"><p>${kind==='in' ? 'Приходов пока нет.' : 'Расходов пока нет.'}</p></div>`;
    else {
      const fi = itemById(f);
      if(fi && fi.cat===cat) h += `<div class="mbal"><div class="kv total"><span>Всего ${kind==='in' ? 'пришло' : 'израсходовано'}</span><strong>${num(round(ops.reduce((a,m) => a + (+m.qty||0), 0), 3))} ${esc(fi.unit)}</strong></div></div>`;
      const byM = {}; ops.slice(0, 400).forEach(m => (byM[(m.date||'').slice(0,7)] ||= []).push(m));
      h += Object.entries(byM).map(([ym, l]) => `<div><div class="eyebrow">${monthTitle(ym)} · ${l.length}</div></div><div class="list">${l.map(moveRow).join('')}</div>`).join('');
    }
  }
  h += `<button class="link view-link" data-act="excel" data-sec="${cat}">Выгрузить «${STOCK_FULL[cat]}» в Excel</button>`;
  return h;
}
const VEH_TYPES = ['Трактор','Автомобиль','Грузовик','Погрузчик','Комбайн','Прицеп','Генератор','Другое'];
const vehicles = () => S.items.filter(i => i.cat==='vehicle').sort((a,b) => a.name.localeCompare(b.name,'ru'));
const gsmVehicles = () => vehicles().filter(v => v.gsm !== false);
const vehLabel = v => v ? v.name + (v.plate ? ' · ' + v.plate : '') : '';
function techView(){
  const vs = vehicles(), mon = today().slice(0,7), monLabel = parse(mon+'-01').toLocaleDateString('ru-RU',{month:'long'});
  let h = `<div class="sechead"><h2>Склад техники</h2><button class="btn small adm" data-act="add-vehicle">+ Добавить технику</button></div>`;
  if(!vs.length) return h + `<div class="empty"><p>Впишите всю технику хозяйства: трактора, машины, погрузчики, генераторы — с госномером и номером прицепа. Технику, отмеченную «в ГСМ», можно выбрать при заправке.</p><div class="actions"><button class="btn primary adm" data-act="add-vehicle">+ Добавить технику</button></div></div>`;
  const off = vs.filter(v => v.gsm === false).length;
  h += `<p class="muted" style="margin:0">Всего ${vs.length} ${plural(vs.length,'единица','единицы','единиц')} · в ГСМ ${vs.length - off}</p>`;
  h += `<div class="list">` + vs.map(v => {
    const per = {}; S.moves.filter(m => m.vehicle===v.id && m.kind==='out' && (m.date||'').startsWith(mon)).forEach(m => per[m.item] = (per[m.item]||0) + (+m.qty||0));
    const parts = Object.entries(per).map(([id,q]) => `${itemById(id)?.name||'?'} ${num(q)} ${itemById(id)?.unit||''}`);
    const sub = [v.vtype, v.plate ? `госномер ${v.plate}` : '', v.trailer ? `прицеп ${v.trailer}` : '', parts.length ? `за ${monLabel}: ${parts.join(', ')}` : ''].filter(Boolean).join(' · ');
    return `<button class="row" data-veh="${v.id}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${esc(v.name)}</div><div class="sub">${esc(sub || 'без номера')}</div></span>
      <span class="side">${v.gsm === false ? '<span class="pill">не в ГСМ</span>' : '<span class="pill ok">в ГСМ</span>'}</span></button>`;
  }).join('') + `</div>`;
  if(off) h += `<div class="actions"><button class="btn adm" data-act="veh-all-gsm">Перевести всю технику в ГСМ (${off})</button></div>`;
  h += `<button class="link view-link" data-act="excel" data-sec="tech,fuel">Выгрузить технику и ГСМ в Excel</button>`;
  return h;
}
function allToGsm(){ const l = vehicles().filter(v => v.gsm === false); l.forEach(v => store.merge('items', v.id, {gsm:true})); toast(`В ГСМ переведено: ${l.length}`); }
function vehicleSheet(id){
  const v = itemById(id); if(!v) return;
  const ops = S.moves.filter(m => m.vehicle===id).sort((a,b) => b.date.localeCompare(a.date) || (b.created||0)-(a.created||0));
  const tot = {}; ops.forEach(m => { const it = itemById(m.item), k = it?.name || '?'; tot[k] = {q:(tot[k]?.q||0) + (+m.qty||0), u:it?.unit||'л'}; });
  const body = `<div class="panel">${[['Тип', v.vtype], ['Госномер', v.plate], ['Номер прицепа', v.trailer], ['Заметка', v.note]].filter(x => x[1]).map(([k,x]) => `<div class="kv"><span>${k}</span><strong>${esc(x)}</strong></div>`).join('') || '<p class="muted" style="margin:0">Номера не указаны.</p>'}</div>
    <label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="vgsm" ${v.gsm === false ? '' : 'checked'} ${S.admin ? '' : 'disabled'}><span>В ГСМ — можно выбрать при заправке</span></label>
    <div class="panel"><div class="eyebrow">Всего заправлено</div>${Object.keys(tot).length ? Object.entries(tot).map(([k,x]) => `<div class="kv"><span>${esc(k)}</span><strong>${num(round(x.q,2))} ${esc(x.u)}</strong></div>`).join('') : '<p class="muted" style="margin:0">Пока не заправлялась.</p>'}</div>
    ${v.gsm === false ? '' : `<div class="actions"><button class="btn primary" id="vfill">Заправить</button></div>`}
    <div class="actions"><button class="btn adm" id="vedit">Изменить</button><button class="btn danger adm" id="vdel">Удалить</button></div><div id="vdelc"></div>
    ${ops.length ? `<div class="list">${ops.map(moveRow).join('')}</div>` : ''}`;
  openSheet(vehLabel(v), body, s => {
    const g = s.querySelector('#vgsm'); g.onchange = () => { store.merge('items', id, {gsm:g.checked}); toast(g.checked ? 'Техника доступна в ГСМ' : 'Убрана из ГСМ'); setTimeout(() => vehicleSheet(id), 150); };
    const fl = s.querySelector('#vfill'); if(fl) fl.onclick = () => moveForm({cat:'fuel', kind:'out', vehicle:id});
    s.querySelector('#vedit').onclick = () => itemForm(v);
    s.querySelector('#vdel').onclick = () => deleteItemBox(s.querySelector('#vdelc'), v);
    s.querySelectorAll('[data-move]').forEach(b => b.onclick = () => moveForm(S.moves.find(m => m.id===b.dataset.move)));
  }, 'veh:'+id);
}
function moveRow(m){
  const it = itemById(m.item), fuel = it?.cat==='fuel', veh = itemById(m.vehicle);
  const parts = m.kind==='in'
    ? [m.note ? 'от: ' + m.note : '', m.price ? money(m.price) : '']
    : [veh ? vehLabel(veh) : '', m.who ? (fuel ? 'заправлял: ' : 'выдал: ') + m.who : '', m.note];
  parts.push(m.byEmail ? 'внёс: ' + whoName(m.byEmail) : '');
  return `<button class="row" data-move="${m.id}"><span class="pill ${m.kind==='in'?'ok':''}">${fmtShort(m.date)}</span>
    <span class="main"><div class="name">${esc(it?.name||'удалено')}</div><div class="sub">${esc(parts.filter(Boolean).join(' · '))}</div></span>
    <span class="side"><strong class="money ${m.kind==='in'?'plus':'minus'}">${m.kind==='in'?'+':'−'}${num(m.qty)} ${esc(it?.unit||'')}</strong></span></button>`;
}

/* ----- Ещё ----- */
function moreView(){
  const plan = planItems(), soon = plan.filter(i => daysBetween(today(), i.date) <= 7).length;
  const row = (go, t, s) => `<button class="row" data-tab-go="${go}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${t}</div><div class="sub">${s}</div></span><span class="side">›</span></button>`;
  let h = `<div><div class="eyebrow">${esc(S.demo ? 'Демо' : S.local ? 'Учёт на этом устройстве' : (S.email||'') + (S.admin ? ' · администратор' : ''))}</div><h2>Ещё</h2></div><div class="list">
    ${row('plan','План', soon ? `${soon} ${plural(soon,'дело','дела','дел')} на ближайшую неделю` : 'Обработки, окоты, заканчивающиеся корма')}
    ${row('money','Финансы','Доходы и расходы по месяцам')}
    ${row('stats','Сводка','Поголовье, приплод, молоко, деньги за год')}
    <button class="row adm" data-tab-go="log" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Журнал изменений</div><div class="sub">Кто, когда и что внёс, изменил или удалил</div></span><span class="side">›</span></button>
    <button class="row adm" data-act="import" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Загрузка из Excel</div><div class="sub">Список животных по загонам из вашей таблицы</div></span><span class="side">›</span></button>
    <button class="row" data-act="excel" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Выгрузка в Excel</div><div class="sub">Стадо, окоты, корма, ГСМ, молоко, финансы за период</div></span><span class="side">›</span></button></div>`;
  h += `<div class="panel"><div class="eyebrow">Резервная копия</div><p class="muted">Файл со всеми записями. Сохраняйте его раз в месяц.</p><div class="actions"><button class="btn" data-act="backup">Сохранить копию</button></div></div>`;
  if(S.local && !S.demo) h += `<div class="banner">Записи хранятся только на этом устройстве. Чтобы вести учёт вместе, настройте синхронизацию по инструкции README.</div>`;
  if(!S.local) h += `<div class="actions"><button class="btn" data-act="logout">Выйти из учётной записи</button></div>`;
  return h;
}

function planView(items){
  let h = backTo('План');
  if(loading('events')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  if(!items.length) return h + `<div class="empty"><p>Здесь появятся повторные вакцинации и обработки (если указать дату следующей), ожидаемые окоты — через ${GESTATION.sheep} дней после случки у овец и ${GESTATION.goat} у коз, — и корма, которых осталось меньше чем на 10 дней.</p></div>`;
  return h + `<div class="plan">` + items.map(it => {
    const d = daysBetween(today(), it.date);
    const rel = it.kind==='stock' ? (d<=0 ? 'сегодня' : `хватит на ${d} ${plural(d,'день','дня','дней')}`) : d<0 ? `просрочено на ${-d} ${plural(-d,'день','дня','дней')}` : d===0 ? 'сегодня' : `через ${d} ${plural(d,'день','дня','дней')}`;
    const [dd, mm] = fmtShort(it.date).split(' ');
    const btn = it.kind==='vet' ? `<button class="btn small" data-done="${it.ev.id}">Сделано</button>`
      : it.kind==='birth' ? `<button class="btn small" data-birth="${it.animal.id}">Окот</button>`
      : `<button class="btn small" data-restock="${it.item.id}">Приход</button>`;
    return `<div class="task ${urgency(it.date)}"><div class="when"><b>${dd}</b>${mm||''}</div>
      <div class="what"><div class="t">${esc(it.title)}</div><div class="s">${esc(it.sub)} · ${rel}</div></div>${btn}</div>`;
  }).join('') + `</div>`;
}

function moneyView(){
  if(!S.month) S.month = today().slice(0,7);
  const [y,m] = S.month.split('-').map(Number);
  const label = new Date(y,m-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  const rows = S.finance.filter(r => (r.date||'').startsWith(S.month)).sort((a,b)=>b.date.localeCompare(a.date));
  const inc = rows.filter(r=>r.kind==='income').reduce((s,r)=>s+(+r.amount||0),0);
  const exp = rows.filter(r=>r.kind==='expense').reduce((s,r)=>s+(+r.amount||0),0);
  let h = backTo('Финансы') + `<div class="monthsel"><button data-m="-1" aria-label="Предыдущий месяц">‹</button><h2 style="text-transform:capitalize">${label}</h2><button data-m="1" aria-label="Следующий месяц">›</button></div>
  <div class="stats"><div class="stat"><div class="v money plus">${money(inc)}</div><div class="l">Доходы</div></div>
  <div class="stat"><div class="v money minus">${money(exp)}</div><div class="l">Расходы</div></div></div>
  <div class="panel"><div class="kv"><span>Итог месяца</span><strong class="money ${inc-exp>=0?'plus':'minus'}">${inc-exp>=0?'+':'−'}${money(Math.abs(inc-exp))}</strong></div></div>`;
  if(loading('finance')) return h;
  if(!rows.length) return h + `<div class="empty"><p>За этот месяц записей нет. Покупки кормов и ГСМ с суммой и отгрузки молока с ценой попадают сюда сами.</p><button class="btn primary" data-act="add-fin">Добавить запись</button></div>`;
  return h + `<div class="list">` + rows.map(r => `<button class="row" data-fin="${r.id}">
    <span class="pill ${r.kind==='income'?'ok':'warn'}">${fmtShort(r.date)}</span>
    <span class="main"><div class="name">${esc(r.category)}</div><div class="sub">${esc(r.note||'')}</div></span>
    <span class="side"><strong class="money ${r.kind==='income'?'plus':'minus'}">${r.kind==='income'?'+':'−'}${money(+r.amount||0)}</strong></span></button>`).join('') + `</div>`;
}

function statsView(){
  let h = backTo('Сводка');
  if(loading('events','finance','milk')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const act = S.animals.filter(a=>a.status==='active'), yr = today().slice(0,4), cnt = fn => act.filter(fn).length;
  const births = S.events.filter(e=>e.type==='birth' && e.date.startsWith(yr));
  const kids = births.reduce((s,e)=>s+(+e.count||0),0);
  const gone = S.animals.filter(a=>a.status!=='active' && (a.outDate||'').startsWith(yr));
  const fin = S.finance.filter(r=>(r.date||'').startsWith(yr));
  const inc = fin.filter(r=>r.kind==='income').reduce((s,r)=>s+(+r.amount||0),0);
  const exp = fin.filter(r=>r.kind==='expense').reduce((s,r)=>s+(+r.amount||0),0);
  const byCat = {}; fin.filter(r=>r.kind==='expense').forEach(r=> byCat[r.category]=(byCat[r.category]||0)+(+r.amount||0));
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]), max = cats[0]?.[1]||1;
  const mothers = new Set(births.flatMap(e=>e.animalIds||[])).size;
  const milkY = s => S.milk.filter(m => m.species===s && m.date.startsWith(yr)).reduce((a,m)=>a+milkTotal(m),0);
  const cheeseY = s => S.milkout.filter(o => o.species===s && o.kind==='cheese' && (o.date||'').startsWith(yr)).reduce((a,o)=>a+(+o.liters||0),0);
  h += `<div><div class="eyebrow">Поголовье сейчас</div><h2>${heads(act.length)}</h2></div>
  <div class="stats">
    <div class="stat"><div class="v">${cnt(a=>a.species==='sheep')}</div><div class="l">овец · ♀ ${cnt(a=>a.species==='sheep'&&a.sex==='f')} / ♂ ${cnt(a=>a.species==='sheep'&&a.sex==='m')}</div></div>
    <div class="stat"><div class="v">${cnt(a=>a.species==='goat')}</div><div class="l">коз · ♀ ${cnt(a=>a.species==='goat'&&a.sex==='f')} / ♂ ${cnt(a=>a.species==='goat'&&a.sex==='m')}</div></div>
    <div class="stat"><div class="v">${cnt(a=>groupOf(a)==='milk')}</div><div class="l">дойных</div></div>
    <div class="stat"><div class="v">${cnt(a=>groupOf(a)==='young')}</div><div class="l">молодняк до 4 мес</div></div>
  </div>
  <div class="panel">${['sheep','goat'].map(sp => `<div class="eyebrow">${SPECIES_PL[sp]}</div>` + GROUPS[sp].map(([g,l]) => `<div class="kv"><span>${l}</span><strong>${cnt(a => a.species===sp && groupOf(a)===g)}</strong></div>`).join('') + (cnt(a => a.species===sp && !groupOf(a)) ? `<div class="kv"><span>Без группы</span><strong>${cnt(a => a.species===sp && !groupOf(a))}</strong></div>` : '')).join('')}</div>
  <div class="panel">${BARNS.map(b => `<div class="kv"><span>${b.name}</span><strong>${act.filter(a=>PEN[a.pen]?.barn===b).length}</strong></div>`).join('')}
    ${cnt(a=>!PEN[a.pen]) ? `<div class="kv"><span>Без загона</span><strong>${cnt(a=>!PEN[a.pen])}</strong></div>` : ''}</div>
  <div><div class="eyebrow">${yr} год</div><h2>Воспроизводство и выбытие</h2></div>
  <div class="panel">
    <div class="kv"><span>Окотов</span><strong>${births.length}</strong></div>
    <div class="kv"><span>Приплод, голов</span><strong>${kids}</strong></div>
    <div class="kv"><span>Выход на окотившуюся матку</span><strong>${mothers?(kids/mothers).toFixed(2):'—'}</strong></div>
    <div class="kv"><span>Продано / забой / падёж</span><strong>${gone.filter(a=>a.status==='sold').length} / ${gone.filter(a=>a.status==='slaughter').length} / ${gone.filter(a=>a.status==='dead').length}</strong></div>
  </div>
  <div><h2>Молоко за ${yr}</h2></div>
  <div class="panel">${['sheep','goat'].map(s => `<div class="kv"><span>${MILKNAME[s]}: надоено / на сыроварню</span><strong>${num(milkY(s),0)} / ${num(cheeseY(s),0)} л</strong></div>`).join('')}</div>
  <div><h2>Деньги за ${yr}</h2></div>
  <div class="panel">
    <div class="kv"><span>Доходы</span><strong class="money plus">${money(inc)}</strong></div>
    <div class="kv"><span>Расходы</span><strong class="money minus">${money(exp)}</strong></div>
    <div class="kv"><span>Итог</span><strong class="money ${inc-exp>=0?'plus':'minus'}">${inc-exp>=0?'+':'−'}${money(Math.abs(inc-exp))}</strong></div>
    ${act.length&&exp?`<div class="kv"><span>Расход на голову</span><strong>${money(exp/act.length)}</strong></div>`:''}
  </div>
  ${cats.length?`<div class="panel"><div class="eyebrow">Расходы по статьям</div>${cats.map(([c,v])=>`<div><div class="kv"><span>${esc(c)}</span><strong>${money(v)}</strong></div><div class="bar exp"><i style="width:${(v/max*100).toFixed(1)}%"></i></div></div>`).join('')}</div>`:''}`;
  return h;
}

/* ----- Обработчики главного экрана ----- */
function bindView(){
  const v = $('#view'), on = (sel, fn) => v.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b));
  const q = $('#q'); if(q) q.oninput = () => { S.q = q.value; render(); };
  const lw = $('#lg-who'); if(lw) lw.onchange = () => { logWho = lw.value; render(); };
  on('[data-f]', b => { S.filter = b.dataset.f; if(!S.filter) S.q = ''; window.scrollTo(0,0); render(); });
  on('[data-hm]', b => { S.herdMode = b.dataset.hm; window.scrollTo(0,0); render(); });
  on('[data-nav]', b => { if(b.dataset.f2 != null) S.filter = b.dataset.f2; if(b.dataset.hm2) S.herdMode = b.dataset.hm2; S.tab = b.dataset.nav; window.scrollTo(0,0); render(); });
  on('[data-open]', b => animalCard(b.dataset.open));
  on('[data-pen]', b => penSheet(b.dataset.pen));
  on('[data-ration]', b => rationForm(rationById(b.dataset.ration)));
  on('[data-cat]', b => { S.stockCat = b.dataset.cat; S.stockSub = 'bal'; S.stockFilter = ''; render(); });
  on('[data-sub]', b => { S.stockSub = b.dataset.sub; S.stockFilter = ''; render(); });
  { const sf = document.querySelector('#sfilter'); if(sf) sf.onchange = () => { S.stockFilter = sf.value; render(); }; }
  on('[data-item]', b => itemSheet(b.dataset.item));
  on('[data-veh]', b => vehicleSheet(b.dataset.veh));
  on('[data-mv]', b => moveForm({cat:S.stockCat, kind:b.dataset.mv}));
  on('[data-move]', b => moveForm(S.moves.find(m => m.id===b.dataset.move)));
  on('[data-milk]', b => { const [ss, sp] = b.dataset.milk.split(':'); milkForm(S.milkDate, ss, sp); });
  on('[data-md]', b => { const n = addDays(S.milkDate, +b.dataset.md); if(n <= today()){ S.milkDate = n; render(); } });
  on('[data-mo]', b => milkOutForm(S.milkout.find(o => o.id===b.dataset.mo)));
  on('[data-fin]', b => financeForm(S.finance.find(r => r.id===b.dataset.fin)));
  on('[data-m]', b => { const [y,m] = S.month.split('-').map(Number); S.month = iso(new Date(y, m-1+(+b.dataset.m), 1)).slice(0,7); render(); });
  on('[data-tab-go]', b => go(b.dataset.tabGo));
  on('[data-done]', b => {
    const e = S.events.find(x => x.id===b.dataset.done); if(!e) return;
    store.set('events', e.id, {...strip(e), doneNext:true});
    eventForm({type:e.type, drug:e.drug, dose:e.dose, animalIds:(e.animalIds||[]).filter(id => byId(id)?.status==='active')});
  });
  on('[data-birth]', b => eventForm({type:'birth', animalIds:[b.dataset.birth]}));
  on('[data-restock]', b => moveForm({cat:'feed', kind:'in', item:b.dataset.restock}));
  on('[data-act]', b => ({
    'add-animal':() => animalForm(), 'add-fin':() => financeForm(), 'add-ration':() => rationForm(),
    'add-item':() => itemForm({cat:S.stockCat}), 'veh-all-gsm':allToGsm, 'seed-items':seedItems, 'milkout':() => milkOutForm(),
    'feed-log':feedLogSheet, 'q-birth':() => eventForm({type:'birth'}), 'q-vet':() => eventForm({type:'vac'}), 'q-feed':() => moveForm({cat:'feed', kind:'in'}), 'q-fuel':() => moveForm({cat:'fuel', kind:'out'}), 'add-fuel':() => itemForm({cat:'fuel'}), 'add-vehicle':() => itemForm({cat:'vehicle'}), milkquick:() => milkQuickForm(S.milkDate||today(), defaultSession()), import:importSheet, regroup:() => { const q = S.q.trim().toLowerCase(); const ids = S.animals.filter(filterFn(S.filter)).filter(a => !q || [a.tag, a.name, a.breed, a.cat, penShort(a.pen), penLabel(a.pen)].some(x => String(x||'').toLowerCase().includes(q))).map(a => a.id); regroupSheet(ids, filterName(S.filter)); }, excel:() => excelSheet(b.dataset.sec ? b.dataset.sec.split(',') : null), 'feed-pause':toggleFeedPause, backup, 'clear-demo':clearDemo,
    logout:() => fb && fb.au.signOut(fb.auth)
  })[b.dataset.act]?.());
}
function go(tab){ if(tab==='herd' && S.tab==='herd'){ S.filter=''; S.q=''; } S.tab = tab; window.scrollTo(0,0); render(); }
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fab').onclick = () => ({
  herd:() => animalForm(), milk:() => milkQuickForm(S.milkDate||today(), defaultSession()),
  stock:() => S.stockCat==='tech' ? itemForm({cat:'vehicle'}) : moveForm({cat:S.stockCat, kind:S.stockSub==='out' || (S.stockSub!=='in' && S.stockCat==='fuel') ? 'out' : 'in'}), plan:() => eventForm({}), money:() => financeForm()
})[S.tab]?.();

function seedItems(){
  const have = new Set(S.items.map(i => i.name.toLowerCase()));
  (DEFAULT_ITEMS[S.stockCat]||[]).forEach(([name, unit]) => { if(!have.has(name.toLowerCase())) store.add('items', {name, unit, cat:S.stockCat}); });
  toast('Список добавлен');
}
function toggleFeedPause(){
  const st = setting('feed') || {};
  if(st.paused) store.set('settings', 'feed', {...strip(st), paused:false, from:today()});
  else store.set('settings', 'feed', {...strip(st), paused:true});
  toast(st.paused ? 'Списание возобновлено с сегодняшнего дня' : 'Списание приостановлено');
}
function backup(){
  const data = {exported:new Date().toISOString()}; COLS.forEach(c => data[c] = S[c]);
  saveFile(`otara-${today()}.json`, new Blob([JSON.stringify(data, null, 1)], {type:'application/json'})).then(ok => ok && toast('Резервная копия сохранена'));
}
function clearDemo(){
  try{ localStorage.setItem('otara-demo-cleared','1'); }catch(_){}
  S.be.clear && S.be.clear(); S.demo = true; toast('Пример очищен — можно вносить свои данные');
}

/* ===== Листы ===== */
let sheetState = null;
function openSheet(title, body, bind, key){
  sheetState = {key};
  $('#sheetRoot').innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="x" id="x" aria-label="Закрыть">×</button></div>${body}</div></div>`;
  $('#x').onclick = closeSheet;
  $('#scrim').onclick = e => { if(e.target.id==='scrim') closeSheet(); };
  document.body.style.overflow = 'hidden';
  bind && bind($('#sheetRoot .sheet'));
  if(!S.admin) lockForWorker($('#sheetRoot .sheet'), key);
}
// Работник может вносить новые записи, но не менять и не удалять существующие
function lockForWorker(sheet, key){
  const editForm = sheet.querySelector('form') && sheet.querySelector('form .btn.danger');
  if(!(editForm || ['fdform','rform','itform'].includes(key))) return;
  if(key==='mform' || key==='mqform') return;
  sheet.querySelectorAll('form input, form select, form textarea, form button').forEach(el => { el.disabled = true; });
  sheet.querySelectorAll('form button[type=submit], form .btn.danger, #fdskip').forEach(el => el.hidden = true);
  const head = sheet.querySelector('.sheet-head');
  head.insertAdjacentHTML('afterend', '<div class="banner">Только просмотр: уже внесённые записи изменить нельзя.</div>');
}
function closeSheet(){ $('#sheetRoot').innerHTML = ''; sheetState = null; document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if(e.key==='Escape' && sheetState) closeSheet(); });
function refreshSheet(){
  const k = sheetState?.key; if(!k) return;
  const s = $('#sheetRoot .sheet'), top = s?.scrollTop || 0;
  if(k.startsWith('card:')){ const id = k.slice(5); if(byId(id)) animalCard(id); else closeSheet(); }
  else if(k.startsWith('item:')){ const id = k.slice(5); if(itemById(id)) itemSheet(id); else closeSheet(); }
  else if(k==='feedlog') feedLogSheet();
  else if(k.startsWith('veh:')){ const id = k.slice(4); if(itemById(id)) vehicleSheet(id); else closeSheet(); }
  else return;
  const n = $('#sheetRoot .sheet'); if(n) n.scrollTop = top;
}
const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(cur ?? '')===String(val)?'selected':''}>${esc(label)}</option>`;
const fld = (id, label, inner) => `<div class="field"><label for="${id}">${label}</label>${inner}</div>`;
const penOptions = (cur, emptyLabel='— без загона —') => opt('', emptyLabel, cur||'') + BARNS.map(b =>
  `<optgroup label="${esc(b.name)}">${PENS.filter(p => p.barn===b).map(p => opt(p.id, `${b.name} · загон ${p.n}${penLabel(p.id) ? ' · ' + penLabel(p.id) : ''} — ${inPen(p.id).length} гол.`, cur)).join('')}</optgroup>`).join('');
const confirmBox = (text, yesLabel='Удалить') => `<div class="confirm"><div>${text}</div><div class="actions"><button class="btn" type="button" data-c="no">Отмена</button><button class="btn danger" type="button" data-c="yes">${yesLabel}</button></div></div>`;
function askConfirm(holder, text, onYes, yesLabel){
  holder.innerHTML = confirmBox(text, yesLabel);
  holder.querySelector('[data-c=no]').onclick = () => holder.innerHTML = '';
  holder.querySelector('[data-c=yes]').onclick = onYes;
}

/* ----- Карточка животного ----- */
function lastBirth(id){
  const b = S.events.filter(e => e.type==='birth' && (e.animalIds||[]).includes(id)).sort((a,b) => b.date.localeCompare(a.date));
  if(!b.length) return null;
  const e = b[0];
  const kids = S.animals.filter(k => k.motherId===id && k.birth===e.date).sort(tagSort);
  return {ev:e, kids, total:b.length};
}
function animalCard(id){
  const a = byId(id); if(!a) return;
  const evs = eventsFor(id), mom = byId(a.motherId), dad = byId(a.fatherId);
  const kids = S.animals.filter(x => x.motherId===id || x.fatherId===id).sort((x,y)=>(y.birth||'').localeCompare(x.birth||''));
  const weights = evs.filter(e => e.type==='weight' && e.weight).slice().reverse();
  const w = weights.at(-1), lb = a.sex==='f' ? lastBirth(id) : null, mk = a.sex==='f' ? animalMilk(id) : null;
  const link = (p, txt) => p ? `<button class="link" data-go="${p.id}">${esc(animalLabel(p))}</button>` : esc(txt||'—');
  const body = `
    <div style="display:flex;align-items:center;gap:14px"><span class="tag big">${esc(a.tag)}</span>
      <div style="min-width:0"><div class="title-lg">${esc(animalTitle(a))} ${sexIcon(a.sex)}</div>
      <div class="muted">${a.status==='active' ? `<span class="pill ok">В стаде</span>` : `<span class="pill">${STATUS[a.status]}${a.outDate?' · '+fmtD(a.outDate):''}</span>`}</div></div></div>
    <div class="actions"><button class="btn primary" id="addEv">Событие</button><button class="btn" id="edit">Изменить</button></div>
    <dl class="facts">
      <div><dt>Загон</dt><dd>${a.pen && PEN[a.pen] ? `<button class="link" data-pen-go="${a.pen}">${esc(penLong(a.pen))}</button>${a.since ? `<span class="muted" style="display:block">с ${fmtD(a.since)}</span>` : ''}` : '—'}</dd></div>
      <div><dt>Группа</dt><dd>${esc(groupName(a.species, groupOf(a)))}${a.groupSince ? `<span class="muted" style="display:block">с ${fmtD(a.groupSince)}${a.groupAuto ? ', автоматически' : ''}</span>` : ''}${a.cat && !a.group ? `<span class="muted" style="display:block">в файле: ${esc(a.cat)}</span>` : ''}</dd></div>
      <div><dt>Вид, порода</dt><dd>${SPECIES[a.species]}${a.breed?', '+esc(a.breed):''}</dd></div>
      <div><dt>Дата рождения</dt><dd>${fmtD(a.birth)}</dd></div>
      <div><dt>Возраст</dt><dd>${age(a.birth)||'—'}</dd></div>
      <div><dt>Мать</dt><dd>${link(mom, a.motherText)}</dd></div>
      <div><dt>Отец</dt><dd>${link(dad, a.fatherText)}</dd></div>
      <div><dt>Последний вес</dt><dd>${w?`${num(w.weight)} кг · ${fmtShort(w.date)}`:'—'}</dd></div>
      ${a.sex==='f' ? `<div><dt>Надой, 7 дней</dt><dd>${mk ? `${num(mk.avg,2)} л/сут` : '—'}</dd></div>` : `<div><dt>Потомков</dt><dd>${kids.length}</dd></div>`}
    </dl>
    ${a.note?`<p class="muted" style="margin:0">${esc(a.note)}</p>`:''}
    ${a.sex==='f' && adult(a) ? `<div class="panel"><div class="kv"><span class="eyebrow">Последний окот</span>${lb?`<span class="muted">всего окотов: ${lb.total}</span>`:''}</div>
      ${lb ? `<div class="kv"><span>${fmtD(lb.ev.date)}</span><strong>${lb.ev.count||lb.kids.length} ${plural(+(lb.ev.count||lb.kids.length),'детёныш','детёныша','детёнышей')}</strong></div>
        ${lb.kids.length ? `<div class="kids">${lb.kids.map(k => `<button class="kid" data-go="${k.id}"><span class="tag">${esc(k.tag)}</span><span>${k.sex==='f' ? (k.species==='goat'?'♀ козочка':'♀ ярочка') : (k.species==='goat'?'♂ козлик':'♂ баранчик')}</span><span class="muted">${fmtShort(k.birth)}</span></button>`).join('')}</div>` : `<p class="muted" style="margin:0">Карточки детёнышей не заведены.</p>`}`
      : `<p class="muted" style="margin:0">Окотов ещё не было. Запишите окот кнопкой «Событие».</p>`}</div>` : ''}
    ${weights.length>1?`<div class="panel"><div class="eyebrow">Динамика веса, кг</div>${spark(weights)}</div>`:''}
    ${kids.length?`<div class="panel"><div class="eyebrow">Потомство · ${kids.length}</div><div style="display:flex;flex-wrap:wrap;gap:8px 14px">${kids.map(k=>`<button class="link" data-go="${k.id}">${esc(animalLabel(k))}</button>`).join('')}</div></div>`:''}
    <div class="panel"><div class="eyebrow">История</div>
      ${evs.length?`<div class="timeline">${evs.map(evRow).join('')}</div>`:`<p class="muted" style="margin:0">Событий пока нет. Запишите вакцинацию, взвешивание, случку или окот.</p>`}</div>`;
  openSheet(animalLabel(a), body, s => {
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => animalCard(b.dataset.go));
    s.querySelectorAll('[data-pen-go]').forEach(b => b.onclick = () => penSheet(b.dataset.penGo));
    s.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => eventForm(S.events.find(e => e.id===b.dataset.ev)));
    s.querySelector('#addEv').onclick = () => eventForm({animalIds:[id], type: a.sex==='f' && adult(a) && planItems().some(i => i.kind==='birth' && i.animal.id===id) ? 'birth' : 'vac'});
    s.querySelector('#edit').onclick = () => animalForm(a);
  }, 'card:'+id);
}
function evRow(e){
  const bits = [];
  if(e.drug) bits.push(e.drug);
  if(e.dose) bits.push(e.dose);
  if(e.type==='weight' && e.weight) bits.push(`${num(e.weight)} кг`);
  if(e.type==='mating' && e.sireId) bits.push(`с ${animalLabel(byId(e.sireId))}`);
  if(e.type==='birth' && e.count != null) bits.push(`${e.count} ${plural(+e.count,'детёныш','детёныша','детёнышей')}`);
  if(e.nextDate) bits.push(`повтор ${fmtD(e.nextDate)}${e.doneNext?' ✓':''}`);
  if((e.animalIds||[]).length>1) bits.push(`группа ${e.animalIds.length} гол.`);
  if(e.note) bits.push(e.note);
  return `<button class="ev" data-ev="${e.id}"><span class="d">${fmtD(e.date)}</span>
    <span><div class="t">${ET[e.type]?.t || 'Событие'}</div>${bits.length?`<div class="s">${esc(bits.join(' · '))}</div>`:''}${e.byEmail?`<span class="by">записал(а): ${esc(e.byEmail.split('@')[0])}</span>`:''}</span></button>`;
}
function spark(ws){
  const W=300, H=56, P=6, vals = ws.map(w => +w.weight), mn = Math.min(...vals), mx = Math.max(...vals), r = mx-mn || 1;
  const pts = vals.map((v,i) => [P + i*(W-2*P)/(vals.length-1), H-P-(v-mn)/r*(H-2*P)]);
  const d = pts.map((p,i) => (i?'L':'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), last = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Вес от ${mn} до ${mx} кг">
    <path d="${d} L${last[0]} ${H} L${pts[0][0]} ${H} Z" fill="var(--accent-soft)"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--accent)"/></svg>
    <div class="kv" style="font-size:13px"><span>${fmtShort(ws[0].date)}: ${num(vals[0])} кг</span><span>${fmtShort(ws.at(-1).date)}: <strong>${num(vals.at(-1))} кг</strong></span></div>`;
}

/* ----- Форма животного ----- */
function animalForm(a, pre){
  a = a || null; const v = {species:'sheep', sex:'f', status:'active', ...(pre||{}), ...(a||{})};
  const females = S.animals.filter(x => x.sex==='f' && x.id!==v.id), males = S.animals.filter(x => x.sex==='m' && x.id!==v.id);
  const sel = (list, cur) => opt('', '— не указано —', cur||'') + list.sort(tagSort).map(x => opt(x.id, animalLabel(x)+' · '+SPECIES[x.species], cur)).join('');
  const body = `<form id="af" novalidate>
    <div class="two">${fld('a-tag','Номер бирки *',`<input id="a-tag" name="tag" required inputmode="numeric" value="${esc(v.tag)}" autocomplete="off">`)}
      ${fld('a-name','Кличка',`<input id="a-name" name="name" value="${esc(v.name)}">`)}</div>
    <div class="field"><label>Вид</label><div class="seg">${Object.entries(SPECIES).map(([k,l]) => `<label><input type="radio" name="species" value="${k}" ${v.species===k?'checked':''}>${l}</label>`).join('')}</div></div>
    <div class="field"><label>Пол</label><div class="seg"><label><input type="radio" name="sex" value="f" ${v.sex==='f'?'checked':''}>Самка ♀</label><label><input type="radio" name="sex" value="m" ${v.sex==='m'?'checked':''}>Самец ♂</label></div></div>
    ${fld('a-group','Группа',`<select id="a-group" name="group"></select>`)}
    ${fld('a-pen','Загон',`<select id="a-pen" name="pen">${penOptions(v.pen)}</select>`)}
    ${v.cat ? `<p class="muted" style="margin:-4px 0 0">Категория из файла: ${esc(v.cat)}</p>` : ''}
    ${fld('a-birth','Дата рождения',`<input id="a-birth" type="date" name="birth" value="${esc(v.birth)}" max="${today()}">`)}
    <details class="more" ${v.breed || v.motherId || v.fatherId || v.note ? 'open' : ''}><summary>Порода, родители, заметка</summary><div class="morebody">
    ${fld('a-breed','Порода',`<input id="a-breed" name="breed" list="breeds" value="${esc(v.breed)}">`)}
    <datalist id="breeds">${[...new Set(['Романовская','Эдильбаевская','Лакон','Ассаф','Восточно-фризская','Катумская','Дорпер','Зааненская','Альпийская','Нубийская','Ламанча','Русская белая',...S.animals.map(x=>x.breed).filter(Boolean)])].map(b=>`<option value="${esc(b)}">`).join('')}</datalist>
    <div class="two">${fld('a-mother','Мать',`<select id="a-mother" name="motherId">${sel(females, v.motherId)}</select>`)}
      ${fld('a-father','Отец',`<select id="a-father" name="fatherId">${sel(males, v.fatherId)}</select>`)}</div>
    ${fld('a-note','Заметка',`<textarea id="a-note" name="note">${esc(v.note)}</textarea>`)}
    </div></details>
    <div class="two">${fld('a-status','Статус',`<select id="a-status" name="status">${Object.entries(STATUS).map(([k,l]) => opt(k,l,v.status)).join('')}</select>`)}
      <div class="field" id="outWrap" ${v.status==='active'?'hidden':''}><label for="a-out">Дата выбытия</label><input id="a-out" type="date" name="outDate" value="${esc(v.outDate||today())}"></div></div>
    <div class="field" id="priceWrap" hidden><label for="a-price">Сумма продажи, ₽ (попадёт в финансы)</label><input id="a-price" name="price" type="number" min="0" step="1" inputmode="numeric"></div>
    ${!a ? fld('a-w','Вес сейчас, кг',`<input id="a-w" name="weight" inputmode="decimal" autocomplete="off">`) : ''}
    <p class="err" id="aerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${a?'Сохранить':'Добавить в стадо'}</button></div>
    ${a ? `<div class="actions"><button class="btn danger" type="button" id="del">Удалить карточку</button></div><div id="delc"></div>` : ''}
  </form>`;
  openSheet(a ? 'Изменить ' + animalLabel(a) : 'Новое животное', body, s => {
    const f = s.querySelector('#af'), st = f.querySelector('#a-status');
    const sync = () => { s.querySelector('#outWrap').hidden = st.value==='active'; s.querySelector('#priceWrap').hidden = !(st.value==='sold' && (!a || a.status!=='sold')); };
    const gsel = f.querySelector('#a-group');
    const fillGroups = () => {
      const sp = f.querySelector('input[name=species]:checked').value, cur = gsel.value || (v.group==='none' ? '__none' : (v.group || ''));
      const auto = groupOf({...v, species:sp, group:'', sex:f.querySelector('input[name=sex]:checked').value, birth:f.querySelector('#a-birth').value});
      gsel.innerHTML = opt('', `Автоматически${auto ? ' — ' + groupName(sp, auto).toLowerCase() : ''}`, cur) + GROUPS[sp].map(([g,l]) => opt(g, l, cur)).join('') + opt('__none', 'Без группы', cur);
    };
    f.querySelectorAll('input[name=species],input[name=sex]').forEach(x => x.addEventListener('change', fillGroups));
    f.querySelector('#a-birth').addEventListener('change', fillGroups);
    fillGroups();
    st.onchange = sync; sync();
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)), err = s.querySelector('#aerr');
      d.tag = d.tag.trim();
      if(!d.tag){ err.hidden = false; err.textContent = 'Укажите номер бирки.'; return; }
      const dup = S.animals.find(x => x.id!==v.id && String(x.tag).trim().toLowerCase()===d.tag.toLowerCase() && x.status==='active');
      if(dup && d.status==='active'){ err.hidden = false; err.textContent = `Бирка №${d.tag} уже есть в стаде.`; return; }
      const price = +d.price||0, weight = dec(d.weight); delete d.price; delete d.weight;
      const data = {...(a ? strip(a) : {}), ...d};
      if(data.group === '__none') data.group = 'none';
      if(!data.group) delete data.group;
      else if(data.group !== a?.group) data.groupSince = today();
      if(data.status==='active') delete data.outDate;
      let id = a?.id;
      if(a) store.set('animals', a.id, data); else id = store.add('animals', data);
      if(price) store.add('finance', {date:d.outDate||today(), kind:'income', category:'Продажа животных', amount:price, note:`Бирка №${d.tag}`});
      if(weight > 0) store.add('events', {animalIds:[id], type:'weight', date:today(), weight:round(weight,1)});
      toast(a ? 'Сохранено' : 'Добавлено в стадо');
      setTimeout(() => animalCard(id), 120);
    };
    const del = s.querySelector('#del');
    if(del) del.onclick = () => askConfirm(s.querySelector('#delc'), `Удалить карточку №${esc(a.tag)}? История событий останется без привязки к животному. Если животное продано или пало, лучше смените статус.`,
      () => { store.del('animals', a.id); toast('Карточка удалена'); closeSheet(); });
  }, 'aform');
}

/* ----- Форма события (в т.ч. окот с ягнятами) ----- */
function eventForm(e){
  const isEdit = !!e.id;
  const v = {type:'vac', date:today(), animalIds:[], ...e};
  const act = S.animals.filter(a => a.status==='active').sort(penSort);
  const chosen = new Set(v.animalIds);
  const males = act.filter(a => a.sex==='m');
  const barnsHere = BARNS.filter(b => act.some(a => PEN[a.pen]?.barn===b));
  const body = `<form id="ef" novalidate>
    ${fld('e-type','Тип события',`<select id="e-type" name="type">${Object.entries(ET).map(([k,o]) => opt(k,o.t,v.type)).join('')}</select>`)}
    <div class="field"><label>Животные · <span id="ecount"></span></label>
      <div class="chips" style="flex-wrap:wrap"><button type="button" class="chip" data-pick="all">Всё стадо</button><button type="button" class="chip" data-pick="f">Все самки</button>${barnsHere.map(b => `<button type="button" class="chip" data-pick="b:${b.id}">${b.name}</button>`).join('')}<button type="button" class="chip" data-pick="none">Снять</button></div>
      <select id="e-penpick" aria-label="Отметить загон">${penOptions('', 'Отметить весь загон…')}</select>
      <div class="list scroll">${act.map(a => `<label class="row pickrow"><input type="checkbox" name="aid" value="${a.id}" ${chosen.has(a.id)?'checked':''}><span class="tag">${esc(a.tag)}</span><span class="sub">${esc(animalTitle(a))} ${a.sex==='f'?'♀':'♂'}${a.pen?' · '+esc(penShort(a.pen)):''}</span></label>`).join('') || '<p class="sub" style="padding:12px;margin:0">В стаде пока нет животных.</p>'}</div></div>
    ${fld('e-date','Дата',`<input id="e-date" type="date" name="date" value="${esc(v.date)}" max="${addDays(today(),1)}" required>`)}
    <div data-for="vet" class="two">${fld('e-drug','Препарат',`<input id="e-drug" name="drug" value="${esc(v.drug)}" list="drugs">`)}${fld('e-dose','Доза',`<input id="e-dose" name="dose" value="${esc(v.dose)}" placeholder="напр. 1 мл/10 кг">`)}</div>
    <datalist id="drugs">${[...new Set(S.events.map(x => x.drug).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div data-for="vet">${fld('e-next','Следующая обработка (напоминание)',`<input id="e-next" type="date" name="nextDate" value="${esc(v.nextDate)}">`)}</div>
    <div data-for="weight">${fld('e-w','Вес, кг',`<input id="e-w" name="weight" inputmode="decimal" value="${esc(v.weight)}" autocomplete="off">`)}</div>
    <div data-for="mating">${fld('e-sire','Производитель',`<select id="e-sire" name="sireId">${opt('','— не указан —',v.sireId||'')}${males.map(m => opt(m.id, animalLabel(m), v.sireId)).join('')}</select>`)}<p class="muted" style="margin:4px 0 0">Дата окота появится в «Плане».</p></div>
    <div data-for="birth" class="birth">
      <div class="two">${fld('e-count','Родилось живыми',`<input id="e-count" name="count" type="number" min="0" max="8" step="1" inputmode="numeric" value="${esc(v.count ?? (isEdit?'':1))}">`)}
        ${fld('e-ksire','Отец',`<select id="e-ksire" name="kidSire">${opt('','— не указан —','')}${males.map(m => opt(m.id, animalLabel(m), v.sireId)).join('')}</select>`)}</div>
      <div id="kids"></div>
    </div>
    ${fld('e-note','Заметка',`<textarea id="e-note" name="note">${esc(v.note)}</textarea>`)}
    <p class="err" id="eerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${isEdit?'Сохранить':'Записать'}</button></div>
    ${isEdit ? `<div class="actions"><button class="btn danger" type="button" id="edel">Удалить запись</button></div><div id="edelc"></div>` : ''}
  </form>`;
  openSheet(isEdit ? 'Изменить событие' : 'Новое событие', body, s => {
    const f = s.querySelector('#ef'), t = f.querySelector('#e-type'), kidsBox = s.querySelector('#kids');
    const boxes = () => [...f.querySelectorAll('input[name=aid]')];
    const checked = () => boxes().filter(c => c.checked).map(c => c.value);
    const showFor = () => { const vet = ET[t.value].vet; s.querySelectorAll('[data-for]').forEach(el => el.hidden = !(el.dataset.for===t.value || (el.dataset.for==='vet' && vet))); };
    const count = () => { const n = checked().length; s.querySelector('#ecount').textContent = n ? `выбрано ${n}` : 'не выбраны'; };
    const lastSire = (momId, date) => S.events.filter(x => x.type==='mating' && (x.animalIds||[]).includes(momId) && x.date <= date && x.sireId).sort((a,b) => b.date.localeCompare(a.date))[0]?.sireId || '';
    function updateKids(){
      if(t.value!=='birth' || isEdit){ kidsBox.innerHTML = ''; return; }
      const ids = checked();
      if(ids.length!==1){ kidsBox.innerHTML = `<p class="muted" style="margin:0">${ids.length ? 'Чтобы сразу завести карточки детёнышей, отметьте одну мать.' : 'Отметьте мать в списке выше.'}</p>`; return; }
      const mom = byId(ids[0]); const n = Math.max(0, Math.min(8, parseInt(f.querySelector('#e-count').value) || 0));
      const ks = f.querySelector('#e-ksire'); if(!ks.dataset.touched){ ks.value = lastSire(mom.id, f.querySelector('#e-date').value || today()); }
      const prev = [...kidsBox.querySelectorAll('.kidrow')].map(r => ({tag:r.querySelector('[data-k=tag]').value, sex:r.querySelector('input[type=radio]:checked')?.value, w:r.querySelector('[data-k=w]').value}));
      kidsBox.innerHTML = n ? `<div class="eyebrow">${mom.species==='goat'?'Козлята':'Ягнята'} · мать ${esc(animalLabel(mom))}, загон ${esc(penShort(mom.pen)||'—')}</div>` + Array.from({length:n}, (_,i) => {
        const p = prev[i] || {}; const sx = p.sex || 'f';
        return `<div class="kidrow"><span class="kn">${i+1}</span>
          <input data-k="tag" aria-label="Номер бирки детёныша ${i+1}" placeholder="${esc(mom.tag)}-${i+1}" value="${esc(p.tag||'')}" autocomplete="off">
          <div class="seg"><label><input type="radio" name="ks-${i}" value="f" ${sx==='f'?'checked':''}>♀</label><label><input type="radio" name="ks-${i}" value="m" ${sx==='m'?'checked':''}>♂</label></div>
          <input data-k="w" aria-label="Вес при рождении, кг" placeholder="вес, кг" inputmode="decimal" value="${esc(p.w||'')}" autocomplete="off"></div>`;
      }).join('') + `<p class="muted" style="margin:0">Бирку можно оставить пустой — номер будет как в подсказке.</p>` : '';
    }
    t.onchange = () => { showFor(); updateKids(); }; showFor(); count(); updateKids();
    f.querySelector('#e-count').oninput = updateKids;
    f.querySelector('#e-date').onchange = updateKids;
    f.querySelector('#e-ksire').onchange = e2 => e2.target.dataset.touched = '1';
    boxes().forEach(c => c.onchange = () => { count(); updateKids(); });
    s.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      const p = b.dataset.pick;
      boxes().forEach(c => { const a = byId(c.value);
        c.checked = p==='all' ? true : p==='none' ? false : p==='f' ? a.sex==='f' : (c.checked || PEN[a.pen]?.barn.id===p.slice(2)); });
      count(); updateKids();
    });
    const pp = s.querySelector('#e-penpick');
    pp.onchange = () => { if(!pp.value) return; boxes().forEach(c => { if(byId(c.value).pen===pp.value) c.checked = true; }); pp.value = ''; count(); updateKids(); };
    f.onsubmit = ev => {
      ev.preventDefault();
      const fd = new FormData(f), ids = fd.getAll('aid'), err = s.querySelector('#eerr');
      const kept = isEdit ? (e.animalIds||[]).filter(id => byId(id)?.status!=='active') : [];
      const all = [...new Set([...ids, ...kept])];
      if(!all.length){ err.hidden = false; err.textContent = 'Отметьте хотя бы одно животное.'; return; }
      const type = fd.get('type');
      const data = {animalIds:all, type, date:fd.get('date') || today(), note:fd.get('note') || ''};
      if(ET[type].vet){ data.drug = fd.get('drug')||''; data.dose = fd.get('dose')||''; if(fd.get('nextDate')) data.nextDate = fd.get('nextDate'); }
      if(type==='weight'){ const w = dec(fd.get('weight')); if(!(w > 0)){ err.hidden = false; err.textContent = 'Укажите вес.'; return; } data.weight = round(w,1); }
      if(type==='mating' && fd.get('sireId')) data.sireId = fd.get('sireId');
      if(type==='birth'){ data.count = parseInt(fd.get('count')) || 0; if(fd.get('kidSire')) data.sireId = fd.get('kidSire'); }
      if(isEdit && e.doneNext && data.nextDate===e.nextDate) data.doneNext = true;
      if(isEdit){ data.by = e.by||null; data.byEmail = e.byEmail||null; data.created = e.created||null; store.set('events', e.id, data); }
      else store.add('events', data);
      let made = 0;
      if(type==='birth' && !isEdit && all.length===1){
        const mom = byId(all[0]);
        kidsBox.querySelectorAll('.kidrow').forEach((r, i) => {
          const tag = r.querySelector('[data-k=tag]').value.trim() || `${mom.tag}-${i+1}`;
          const sex = r.querySelector('input[type=radio]:checked')?.value || 'f';
          const kid = store.add('animals', {tag, sex, species:mom.species, breed:mom.breed||'', birth:data.date, motherId:mom.id, fatherId:data.sireId||'', pen:mom.pen||'', status:'active', group:'young', groupSince:data.date});
          const w = dec(r.querySelector('[data-k=w]').value);
          if(w > 0) store.add('events', {animalIds:[kid], type:'weight', date:data.date, weight:round(w,2), note:'при рождении'});
          made++;
        });
      }
      toast(made ? `Окот записан, заведено карточек: ${made}` : 'Записано');
      if(all.length===1) setTimeout(() => animalCard(all[0]), 120); else closeSheet();
    };
    const del = s.querySelector('#edel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#edelc'), 'Удалить эту запись из истории? Карточки детёнышей, если они были заведены, останутся.',
      () => { store.del('events', e.id); toast('Запись удалена'); closeSheet(); });
  }, 'eform');
}

/* ----- Загон ----- */
function penSheet(pid){
  const isPen = !!PEN[pid];
  const list = isPen ? inPen(pid).sort(tagSort) : S.animals.filter(a => a.status==='active' && !PEN[a.pen]).sort(tagSort);
  const r = isPen ? penRation(pid) : null, pu = isPen ? feedUse().perPen[pid] : null;
  const body = `
    ${isPen ? `${fld('p-label','Назначение загона',`<input id="p-label" value="${esc(penLabel(pid))}" placeholder="напр. Дойные 2-разовые" autocomplete="off">`)}
` : ''}
    <div class="kv"><span class="eyebrow">Животные · ${list.length}</span>${list.length ? `<button class="link" id="pall">Отметить всех</button>` : ''}</div>
    ${list.length ? `<div class="list scroll">${list.map(a => `<label class="row pickrow"><input type="checkbox" name="pm" value="${a.id}"><span class="tag">${esc(a.tag)}</span><span class="sub">${esc(animalTitle(a))} ${a.sex==='f'?'♀':'♂'} · ${esc(age(a.birth)||SPECIES[a.species])}</span></label>`).join('')}</div>
      <div class="movebar">${fld('p-to','Переместить отмеченных в',`<select id="p-to">${penOptions('', '— выберите загон —')}</select>`)}<button class="btn primary" id="pmove" disabled>Переместить</button></div>`
      : `<div class="empty"><p>${isPen ? 'В загоне никого нет.' : 'Все животные распределены по загонам.'}</p></div>`}
    ${isPen ? `<div class="actions"><button class="btn" id="padd">Добавить животное в этот загон</button></div>` : ''}`;
  openSheet(isPen ? penLong(pid) : 'Без загона', body, s => {
    const rs = s.querySelector('#p-ration');
    if(rs) rs.onchange = () => { store.merge('pens', pid, {ration: rs.value || null}); if(rs.value) ensureFeedStart(); toast(rs.value ? 'Рацион назначен' : 'Рацион снят'); setTimeout(() => penSheet(pid), 150); };
    const nr = s.querySelector('#newRation'); if(nr) nr.onclick = () => rationForm(null, [pid]);
    if(!S.admin){ ['#p-label','#p-ration'].forEach(q => { const el = s.querySelector(q); if(el) el.disabled = true; }); }
    const pl = s.querySelector('#p-label');
    if(pl) pl.onchange = () => { const v = pl.value.trim(); if(v !== penLabel(pid)){ store.merge('pens', pid, {label:v}); toast('Назначение загона сохранено'); } };
    const pm = () => [...s.querySelectorAll('input[name=pm]:checked')].map(c => c.value);
    const to = s.querySelector('#p-to'), mv = s.querySelector('#pmove');
    const upd = () => { if(mv){ const n = pm().length; mv.disabled = !n || !to.value; mv.textContent = n ? `Переместить (${n})` : 'Переместить'; } };
    s.querySelectorAll('input[name=pm]').forEach(c => c.onchange = upd);
    if(to) to.onchange = upd;
    const pall = s.querySelector('#pall'); if(pall) pall.onclick = () => { const bs = [...s.querySelectorAll('input[name=pm]')]; const all = bs.every(c => c.checked); bs.forEach(c => c.checked = !all); upd(); };
    if(mv) mv.onclick = () => {
      const ids = pm(); if(!ids.length || !to.value) return;
      const tags = ids.map(id => byId(id)?.tag).filter(Boolean);
      silently(() => ids.forEach(id => { const a = byId(id); if(a) store.set('animals', id, {...strip(a), pen:to.value}); }));
      journalNote(`Перевод ${heads(ids.length)}: ${PEN[pid] ? penShort(pid) : 'без загона'} → ${penShort(to.value)} (№ ${tags.slice(0, 30).join(', ')}${tags.length > 30 ? '…' : ''})`);
      toast(`Перемещено в ${penLong(to.value)}: ${heads(ids.length)}`);
      setTimeout(() => penSheet(pid), 150);
    };
    const pa = s.querySelector('#padd'); if(pa) pa.onclick = () => animalForm(null, {pen:pid});
  }, 'pen:'+pid);
}

/* ----- Рацион ----- */
function rationForm(r, prePens){
  const feeds = S.items.filter(i => i.cat==='feed').sort((a,b) => a.name.localeCompare(b.name,'ru'));
  const v = {name:'', mode:'head', items:[{item:'', qty:''}], ...(r||{})};
  const assigned = new Set(r ? S.pens.filter(p => p.ration===r.id).map(p => p.id) : (prePens||[]));
  if(!feeds.length){
    openSheet('Новый рацион', `<div class="empty"><p>Сначала добавьте корма на склад — из них составляется рацион.</p><button class="btn primary" id="toStock">Перейти на склад</button></div>`,
      s => s.querySelector('#toStock').onclick = () => { closeSheet(); S.stockCat = 'feed'; go('stock'); }, 'rform');
    return;
  }
  const rowHtml = (x) => `<div class="irow"><select name="ri" aria-label="Корм">${opt('','— корм —',x.item)}${feeds.map(i => opt(i.id, `${i.name}, ${i.unit}`, x.item)).join('')}</select>
    <input name="rq" inputmode="decimal" placeholder="кол-во" value="${esc(x.qty)}" aria-label="Количество" autocomplete="off"><button type="button" class="x" data-rm aria-label="Убрать">×</button></div>`;
  const body = `<form id="rf" novalidate>
    ${fld('r-name','Название *',`<input id="r-name" name="name" value="${esc(v.name)}" placeholder="напр. Дойные козы" autocomplete="off">`)}
    <div class="field"><label>Норма считается</label><div class="seg"><label><input type="radio" name="mode" value="head" ${v.mode!=='pen'?'checked':''}>на голову в сутки</label><label><input type="radio" name="mode" value="pen" ${v.mode==='pen'?'checked':''}>на загон в сутки</label></div></div>
    <div class="field"><label>Состав</label><div id="rrows" style="display:flex;flex-direction:column;gap:6px">${(v.items.length ? v.items : [{item:'',qty:''}]).map(rowHtml).join('')}</div>
      <button type="button" class="link" id="radd" style="align-self:flex-start;margin-top:6px">+ Добавить корм</button></div>
    <div class="field"><label>Загоны с этим рационом</label>
      ${BARNS.map(b => `<div class="pgroup"><span class="muted">${b.name}</span><div class="pchips">${PENS.filter(p => p.barn===b).map(p => {
        const other = S.pens.find(x => x.id===p.id)?.ration; const otherR = other && other!==r?.id ? rationById(other) : null;
        return `<label class="pchip ${inPen(p.id).length?'':'dim'}" title="${esc(penLong(p.id))}${otherR?` — сейчас «${esc(otherR.name)}»`:''}"><input type="checkbox" name="rp" value="${p.id}" ${assigned.has(p.id)?'checked':''}>${p.n}${otherR?'<sup>•</sup>':''}</label>`;
      }).join('')}</div></div>`).join('')}
      <p class="muted" style="margin:0">Точкой отмечены загоны с другим рационом — при выборе он заменится.</p></div>
    <div class="panel" id="rsum"></div>
    <p class="err" id="rerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${r ? 'Сохранить' : 'Создать рацион'}</button></div>
    ${r ? `<div class="actions"><button class="btn danger" type="button" id="rdel">Удалить рацион</button></div><div id="rdelc"></div>` : ''}
  </form>`;
  openSheet(r ? `Рацион «${r.name}»` : 'Новый рацион', body, s => {
    const f = s.querySelector('#rf'), rows = s.querySelector('#rrows');
    const read = () => [...rows.querySelectorAll('.irow')].map(x => ({item:x.querySelector('[name=ri]').value, qty:dec(x.querySelector('[name=rq]').value)})).filter(x => x.item && x.qty > 0);
    const sum = () => {
      const its = read(), mode = f.querySelector('input[name=mode]:checked').value;
      const pens = [...f.querySelectorAll('input[name=rp]:checked')].map(c => c.value);
      const n = pens.reduce((a,p) => a + inPen(p).length, 0), used = pens.filter(p => inPen(p).length).length;
      const tot = {}; its.forEach(x => tot[x.item] = (tot[x.item]||0) + (mode==='pen' ? x.qty*used : x.qty*n));
      s.querySelector('#rsum').innerHTML = `<div class="eyebrow">Итого в сутки · ${pens.length} ${plural(pens.length,'загон','загона','загонов')}, ${heads(n)}</div>` +
        (its.length ? its.map(x => `<div class="kv"><span>${esc(itemById(x.item)?.name)}</span><strong>${num(tot[x.item])} ${esc(itemById(x.item)?.unit)}</strong></div>`).join('') : '<p class="muted" style="margin:0">Добавьте корма и количество.</p>');
    };
    const bindRows = () => rows.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if(rows.children.length > 1) b.parentElement.remove(); else { b.parentElement.querySelector('[name=ri]').value=''; b.parentElement.querySelector('[name=rq]').value=''; } sum(); });
    s.querySelector('#radd').onclick = () => { rows.insertAdjacentHTML('beforeend', rowHtml({item:'',qty:''})); bindRows(); };
    f.oninput = sum; f.onchange = sum; bindRows(); sum();
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.querySelector('#r-name').value.trim(), its = read(), err = s.querySelector('#rerr');
      if(!name){ err.hidden = false; err.textContent = 'Укажите название рациона.'; return; }
      if(!its.length){ err.hidden = false; err.textContent = 'Добавьте хотя бы один корм с количеством.'; return; }
      const data = {name, mode:f.querySelector('input[name=mode]:checked').value, items:its.map(x => ({item:x.item, qty:round(x.qty,3)}))};
      let id = r?.id;
      if(r) store.set('rations', r.id, {...strip(r), ...data}); else id = store.add('rations', data);
      const want = new Set([...f.querySelectorAll('input[name=rp]:checked')].map(c => c.value));
      PENS.forEach(p => {
        const cur = S.pens.find(x => x.id===p.id)?.ration;
        if(want.has(p.id) && cur!==id) store.merge('pens', p.id, {ration:id});
        else if(!want.has(p.id) && cur===id) store.merge('pens', p.id, {ration:null});
      });
      if(want.size) ensureFeedStart();
      toast(r ? 'Рацион сохранён' : 'Рацион создан'); closeSheet();
    };
    const del = s.querySelector('#rdel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#rdelc'), 'Удалить рацион? Загоны останутся без рациона, корм для них перестанет списываться. Прошлые списания сохранятся.',
      () => { S.pens.filter(p => p.ration===r.id).forEach(p => store.merge('pens', p.id, {ration:null})); store.del('rations', r.id); toast('Рацион удалён'); closeSheet(); });
  }, 'rform');
}

/* ----- Склад: позиция, приход/расход, журнал списаний ----- */
// Удаление позиции склада или транспорта с подтверждением прямо в листе
function deleteItemBox(holder, it){
  const ops = S.moves.filter(m => m.item===it.id || m.vehicle===it.id).length;
  const inRation = S.rations.some(r => (r.items||[]).some(x => x.item===it.id));
  const what = it.cat==='vehicle' ? 'технику' : it.cat==='fuel' ? 'топливо' : it.cat==='vet' ? 'препарат' : 'корм';
  const warn = [ops ? `по нему ${ops} ${plural(ops,'операция','операции','операций')} — они останутся в истории без названия` : '', inRation ? 'он входит в рацион — уберите его из рациона' : ''].filter(Boolean).join('; ');
  askConfirm(holder, `Удалить ${what} «${esc(it.name)}»?${warn ? ' Учтите: ' + warn + '.' : ''}`, () => { store.del('items', it.id); toast('Удалено'); closeSheet(); });
}
function itemSheet(id){
  const it = itemById(id); if(!it) return;
  const b = stockBalance()[id]||0, from30 = addDays(today(), -29);
  const out30 = round(S.moves.filter(m => m.item===id && m.kind==='out' && m.date >= from30).reduce((x, m) => x + (+m.qty||0), 0), 2);
  const hist = [
    ...S.moves.filter(m => m.item===id).map(m => ({date:m.date, sort:m.created||0, html:moveRow(m)})),
  ].sort((a,b) => b.date.localeCompare(a.date) || b.sort-a.sort).slice(0, 60);
  const body = `<div class="stats"><div class="stat"><div class="v ${b<0?'money minus':''}">${num(b)}</div><div class="l">остаток, ${esc(it.unit)}</div></div>
      <div class="stat"><div class="v">${num(out30)}</div><div class="l">расход за 30 дней, ${esc(it.unit)}</div></div></div>
    <div class="actions"><button class="btn primary" data-k="in">Приход</button><button class="btn" data-k="out">Расход</button></div>
    <div class="actions"><button class="btn adm" id="iedit">Переименовать</button><button class="btn danger adm" id="idel">Удалить</button></div><div id="idelc"></div>
    ${hist.length ? `<div class="list">${hist.map(h => h.html).join('')}</div>` : `<div class="empty"><p>Операций пока нет.</p></div>`}`;
  openSheet(it.name, body, s => {
    s.querySelectorAll('[data-k]').forEach(b2 => b2.onclick = () => moveForm({cat:it.cat, kind:b2.dataset.k, item:id}));
    s.querySelector('#iedit').onclick = () => itemForm(it);
    s.querySelector('#idel').onclick = () => deleteItemBox(s.querySelector('#idelc'), it);
    s.querySelectorAll('[data-move]').forEach(b2 => b2.onclick = () => moveForm(S.moves.find(m => m.id===b2.dataset.move)));
    s.querySelectorAll('[data-day]').forEach(b2 => b2.onclick = () => feedDayForm(S.feedauto.find(d => d.id===b2.dataset.day)));
  }, 'item:'+id);
}
function itemForm(it){
  const cat0 = it?.cat || 'feed', isEdit = !!it?.id, v = {unit: cat0==='fuel' ? 'л' : cat0==='vet' ? 'фл' : 'кг', ...it}, isVeh = v.cat==='vehicle';
  const used = isEdit && S.moves.some(m => m.item===it.id || m.vehicle===it.id);
  const units = UNITS.includes(v.unit) ? UNITS : [...UNITS, v.unit];
  const ph = {fuel:'напр. Дизельное топливо', vet:'напр. Ивермектин 1%', feed:'напр. ЗЦМ'}[v.cat] || '';
  const body = `<form id="itf" novalidate>
    ${fld('it-name','Название *',`<input id="it-name" name="name" value="${esc(v.name)}" placeholder="${isVeh ? 'напр. МТЗ-82, КамАЗ, погрузчик' : ph}" autocomplete="off" list="it-names">`)}
    ${v.cat==='fuel' ? `<datalist id="it-names">${['Бензин АИ-92','Бензин АИ-95','Дизельное топливо','Моторное масло','Масло гидравлическое','Антифриз'].map(x => `<option value="${x}">`).join('')}</datalist>` : ''}
    ${isVeh ? `${fld('it-vtype','Тип',`<select id="it-vtype" name="vtype">${opt('','—',v.vtype||'')}${VEH_TYPES.map(t => opt(t,t,v.vtype)).join('')}</select>`)}
      <div class="two">${fld('it-plate','Госномер',`<input id="it-plate" name="plate" value="${esc(v.plate)}" placeholder="А123ВС 26" autocomplete="off">`)}
        ${fld('it-trailer','Номер прицепа',`<input id="it-trailer" name="trailer" value="${esc(v.trailer)}" placeholder="если есть" autocomplete="off">`)}</div>
      ${fld('it-note','Заметка',`<input id="it-note" name="note" value="${esc(v.note)}" placeholder="напр. кто закреплён" autocomplete="off">`)}
      <label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="it-gsm" ${v.gsm === false ? '' : 'checked'}><span>В ГСМ — можно выбрать при заправке</span></label>`
    : `${fld('it-unit','Единица',`<select id="it-unit" name="unit">${units.map(u => opt(u,u,v.unit)).join('')}</select>`)}
      ${v.cat==='vet' ? fld('it-exp','Годен до (необязательно)',`<input id="it-exp" type="date" name="expiry" value="${esc(v.expiry)}">`) : ''}`}
    <p class="err" id="iterr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${isEdit?'Сохранить':'Добавить'}</button></div>
    ${isEdit ? `<div class="actions"><button class="btn danger" type="button" id="itdel">Удалить</button></div><div id="itdelc"></div>` : ''}
  </form>`;
  openSheet(isEdit ? `Изменить: ${v.name}` : `Новая позиция: ${ITEM_WORD[v.cat]?.one || 'техника'}`, body, s => {
    const f = s.querySelector('#itf');
    f.onsubmit = ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)); for(const k in d) d[k] = String(d[k]).trim();
      if(!d.name){ const e = s.querySelector('#iterr'); e.hidden = false; e.textContent = 'Укажите название.'; return; }
      if(isVeh){ d.gsm = s.querySelector('#it-gsm').checked; d.unit = ''; }
      if(isEdit) store.set('items', it.id, {...strip(it), ...d}); else store.add('items', {...d, cat:v.cat});
      toast('Сохранено'); closeSheet();
    };
    const del = s.querySelector('#itdel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#itdelc'), used ? (isVeh ? 'По этой технике есть заправки. Удалить всё равно? Заправки останутся без названия техники.' : 'По этой позиции есть операции. Удалить всё равно? Операции останутся без названия.') : 'Удалить?',
      () => { store.del('items', it.id); toast('Удалено'); closeSheet(); });
  }, 'itform');
}
function moveForm(m){
  const isEdit = !!m?.id;
  const cat = isEdit ? (itemById(m.item)?.cat || 'feed') : (m?.cat || 'feed');
  const v = {kind:'in', date:today(), ...m};
  const items = itemsOf(cat);
  if(!items.length){ itemForm({cat}); return; }
  const ofCat = x => itemById(x.item)?.cat===cat;
  const notes = k => [...new Set(S.moves.filter(x => ofCat(x) && x.kind===k && x.note).sort((a,b) => (b.created||0)-(a.created||0)).map(x => x.note))].slice(0, 30);
  const whos = [...new Set(S.moves.filter(x => ofCat(x) && x.who).sort((a,b) => (b.created||0)-(a.created||0)).map(x => x.who))].slice(0, 30);
  const vs = gsmVehicles(); if(v.vehicle && !vs.some(x => x.id===v.vehicle) && itemById(v.vehicle)) vs.push(itemById(v.vehicle));
  const W = ITEM_WORD[cat];
  const body = `<form id="mvf" novalidate>
    <div class="field"><label>Операция</label><div class="seg"><label><input type="radio" name="kind" value="in" ${v.kind==='in'?'checked':''}>Приход</label><label><input type="radio" name="kind" value="out" ${v.kind==='out'?'checked':''}>${cat==='fuel'?'Заправка / расход':'Расход'}</label></div></div>
    ${fld('mv-item', W.one, `<select id="mv-item" name="item">${items.map(i => opt(i.id, `${i.name}, ${i.unit}`, v.item || items[0].id)).join('')}</select>`)}
    <div class="two">${fld('mv-qty','Количество *',`<input id="mv-qty" name="qty" inputmode="decimal" value="${esc(v.qty != null ? String(v.qty).replace('.',',') : '')}" autocomplete="off">`)}
      ${fld('mv-date','Дата',`<input id="mv-date" type="date" name="date" value="${esc(v.date)}">`)}</div>
    <p class="muted" id="mv-bal" style="margin:0"></p>
    <div id="mv-outw">
      ${cat==='fuel' ? `<div class="field"><div class="kv"><label for="mv-veh">Какую технику заправили</label><button type="button" class="link adm" id="mv-addveh">+ Техника</button></div><select id="mv-veh" name="vehicle">${opt('','— не выбрана —', v.vehicle||'')}${vs.map(x => opt(x.id, vehLabel(x), v.vehicle)).join('')}</select></div>` : ''}
      ${cat!=='feed' ? fld('mv-who', cat==='fuel' ? 'Кто заправлял' : 'Кто выдал / применил', `<input id="mv-who" name="who" value="${esc(v.who)}" list="mv-whos" autocomplete="off" placeholder="имя">`) + `<datalist id="mv-whos">${whos.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : ''}
    </div>
    ${fld('mv-note','', `<input id="mv-note" name="note" value="${esc(v.note)}" list="mv-notes" autocomplete="off">`)}
    <datalist id="mv-notes"></datalist>
    <div class="field" id="mv-pricew">${isEdit ? '' : `<label for="mv-price">Сумма, ₽ (попадёт в расходы)</label><input id="mv-price" name="price" type="number" min="0" step="1" inputmode="numeric">`}</div>
    <p class="err" id="mverr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${isEdit?'Сохранить':'Записать'}</button></div>
    ${isEdit ? `<p class="muted" style="margin:0">Внёс: ${esc(m.byEmail || '—')}${m.created ? ', ' + new Date(m.created).toLocaleString('ru-RU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : ''}</p><div class="actions"><button class="btn danger" type="button" id="mvdel">Удалить операцию</button></div><div id="mvdelc"></div>` : ''}
  </form>`;
  openSheet(isEdit ? 'Изменить операцию' : `${STOCK_FULL[cat]}: ${v.kind==='in' ? 'приход' : cat==='fuel' ? 'заправка' : 'расход'}`, body, s => {
    const f = s.querySelector('#mvf');
    const NOTE = {in:['От кого (поставщик)', cat==='fuel' ? 'напр. АЗС Лукойл, бензовоз' : cat==='vet' ? 'напр. Ветаптека, накладная №' : 'напр. КФХ Иванов, 40 рулонов'],
      out:[cat==='fuel' ? 'Комментарий' : cat==='vet' ? 'Кому / для чего' : 'Куда / зачем', cat==='fuel' ? 'напр. пробег, моточасы' : cat==='vet' ? 'напр. обработка Овчарня 1' : 'напр. Овчарня 2']};
    let lastK = '';
    const sync = () => {
      const k = f.querySelector('input[name=kind]:checked').value, it = itemById(f.querySelector('#mv-item').value);
      s.querySelector('label[for=mv-note]').textContent = NOTE[k][0]; f.querySelector('#mv-note').placeholder = NOTE[k][1];
      if(k !== lastK){ s.querySelector('#mv-notes').innerHTML = notes(k).map(n => `<option value="${esc(n)}">`).join(''); lastK = k; }
      s.querySelector('#mv-outw').hidden = k!=='out';
      s.querySelector('#mv-pricew').hidden = k!=='in' || isEdit;
      let b = stockBalance()[it.id] || 0; if(isEdit && m.item===it.id) b -= (m.kind==='in'?1:-1) * (+m.qty||0);
      const q = dec(f.querySelector('#mv-qty').value) || 0, after = b + (k==='in' ? q : -q);
      s.querySelector('#mv-bal').innerHTML = `Остаток: ${num(b)} ${esc(it.unit)}${q ? ` → <strong class="${after<0?'money minus':''}">${num(round(after,3))} ${esc(it.unit)}</strong>` : ''}`;
    };
    f.oninput = sync; f.onchange = sync; sync();
    const av = s.querySelector('#mv-addveh'); if(av) av.onclick = () => itemForm({cat:'vehicle'});
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)), q = dec(d.qty), err = s.querySelector('#mverr');
      if(!(q > 0)){ err.hidden = false; err.textContent = 'Укажите количество больше нуля.'; return; }
      const it = itemById(d.item), price = +d.price || 0;
      const data = {item:d.item, kind:d.kind, qty:round(q,3), date:d.date || today(), note:(d.note||'').trim()};
      if(d.kind==='out' && d.vehicle) data.vehicle = d.vehicle;
      if(d.kind==='out' && (d.who||'').trim()) data.who = d.who.trim();
      if(d.kind==='in' && price) data.price = price;
      if(isEdit){ const old = strip(m); if(!data.vehicle) delete old.vehicle; if(!data.who) delete old.who; store.set('moves', m.id, {...old, ...data, price: m.price ?? null}); }
      else {
        store.add('moves', data);
        if(d.kind==='in' && price) store.add('finance', {date:data.date, kind:'expense', category: FIN_CAT[cat], amount:price, note:`${it.name}, ${num(q)} ${it.unit}${data.note ? ' · ' + data.note : ''}`});
      }
      toast(d.kind==='in' ? 'Приход записан' : cat==='fuel' ? 'Заправка записана' : 'Расход записан'); closeSheet();
    };
    const del = s.querySelector('#mvdel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#mvdelc'), 'Удалить операцию? Запись в финансах, если была, удалите отдельно.',
      () => { store.del('moves', m.id); toast('Удалено'); closeSheet(); });
  }, 'mvform');
}
function feedLogSheet(){
  const days = S.feedauto.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 60);
  const body = days.length ? `<p class="muted" style="margin:0">Каждый день корм списывается по рационам загонов и числу голов. Сегодняшняя запись пересчитывается, пока идёт день. Нажмите на день, чтобы исправить количество или отменить списание.</p>
    <div class="list">${days.map(d => {
      const parts = Object.entries(d.items||{}).map(([id,q]) => `${itemById(id)?.name||'удалён'} ${num(q)}`);
      return `<button class="row" data-day="${d.id}" style="grid-template-columns:auto 1fr auto"><span class="pill ${d.skipped?'':'ok'}">${fmtShort(d.date)}</span>
        <span class="main"><div class="name">${d.skipped ? 'Не списывалось' : parts.length + ' ' + plural(parts.length,'корм','корма','кормов')}</div><div class="sub">${esc(parts.join(' · '))}</div></span>
        <span class="side">${d.locked?'<span class="pill warn">вручную</span>':''}</span></button>`;
    }).join('')}</div>` : `<div class="empty"><p>Списаний ещё не было. Они появятся после назначения рационов загонам.</p></div>`;
  openSheet('Журнал списаний кормов', body, s => s.querySelectorAll('[data-day]').forEach(b => b.onclick = () => feedDayForm(S.feedauto.find(d => d.id===b.dataset.day))), 'feedlog');
}
function feedDayForm(d){
  if(!d) return;
  const ids = [...new Set([...Object.keys(d.items||{})])];
  const body = `<form id="fdf" novalidate>
    ${ids.map(id => { const it = itemById(id); return fld('fd-'+id, `${esc(it?.name||'удалён')}, ${esc(it?.unit||'')}`, `<input id="fd-${id}" name="${id}" inputmode="decimal" value="${esc(num(d.items[id],3).replace(/\s/g,''))}" autocomplete="off">`); }).join('')}
    <div class="actions"><button class="btn primary" type="submit">Сохранить</button></div>
    <div class="actions"><button class="btn ${d.skipped?'':'danger'}" type="button" id="fdskip">${d.skipped ? 'Вернуть списание' : 'Не кормили — не списывать'}</button></div>
  </form>`;
  openSheet(`Списание за ${fmtD(d.date)}`, body, s => {
    const f = s.querySelector('#fdf');
    f.onsubmit = ev => {
      ev.preventDefault(); const items = {};
      ids.forEach(id => { const q = dec(f.querySelector(`[name="${id}"]`).value); if(q > 0) items[id] = round(q,3); });
      store.set('feedauto', d.id, {...strip(d), items, locked:true}); toast('Списание исправлено'); feedLogSheet();
    };
    s.querySelector('#fdskip').onclick = () => { store.set('feedauto', d.id, {...strip(d), skipped:!d.skipped, locked:true}); toast(d.skipped ? 'Списание возвращено' : 'Списание за день отменено'); feedLogSheet(); };
  }, 'fdform');
}

/* ----- Молоко: надой по головам и отгрузка ----- */
function milkForm(date, ss, sp){
  const doc = milkDoc(date, ss, sp), y = doc?.yields || {};
  const prevDoc = S.milk.filter(m => m.species===sp && m.session===ss && m.date < date).sort((a,b) => b.date.localeCompare(a.date))[0];
  const prev = prevDoc?.yields || {};
  const list = S.animals.filter(a => a.species===sp && a.sex==='f' && ((a.status==='active' && adult(a)) || y[a.id] != null)).sort(penSort);
  const groups = [...new Set(list.map(a => PEN[a.pen]?.barn.id || 'none'))];
  const gname = g => g==='none' ? 'Без загона' : BARNS.find(b => b.id===g).name;
  const body = `
    <div class="segb" role="group" aria-label="Дойка">${Object.entries(SESS).map(([k,l]) => `<button type="button" data-ss="${k}" aria-pressed="${k===ss}">${l}</button>`).join('')}</div>
    <div class="segb" role="group" aria-label="Вид">${['sheep','goat'].map(k => `<button type="button" data-sp="${k}" aria-pressed="${k===sp}">${SPECIES_PL[k]}</button>`).join('')}</div>
    <div class="mtot"><span>Итого</span><strong><span id="mt">0</span> л</strong><span class="muted" id="mn"></span></div>
    ${groups.length > 1 ? `<div class="chips"><button type="button" class="chip" data-g="" aria-pressed="true">Все</button>${groups.map(g => `<button type="button" class="chip" data-g="${g}" aria-pressed="false">${gname(g)}</button>`).join('')}</div>` : ''}
    <form id="mf" novalidate>
      ${list.length ? `<div class="list">${list.map(a => `<div class="mrow" data-g="${PEN[a.pen]?.barn.id || 'none'}"><span class="tag">${esc(a.tag)}</span>
        <label class="main" for="m-${a.id}"><div class="name">${esc(animalTitle(a))}</div><div class="sub">${esc(penShort(a.pen) || 'без загона')}${prev[a.id] != null ? ` · прошлый раз ${num(prev[a.id],2)} л` : ''}</div></label>
        <input id="m-${a.id}" name="${a.id}" inputmode="decimal" autocomplete="off" enterkeyhint="next" value="${y[a.id] != null ? esc(String(y[a.id]).replace('.',',')) : ''}" placeholder="л"></div>`).join('')}</div>`
        : `<div class="empty"><p>Нет взрослых самок (${SPECIES_PL[sp].toLowerCase()}) в стаде. Можно записать общий надой ниже.</p></div>`}
      ${fld('m-extra','Без разбивки по головам, л',`<input id="m-extra" name="__extra" inputmode="decimal" autocomplete="off" value="${doc?.extra ? esc(String(doc.extra).replace('.',',')) : ''}">`)}
      <p class="err" id="merr" hidden></p>
      <div class="actions"><button class="btn primary" type="submit">Сохранить надой</button></div>
    </form>`;
  openSheet(`Надой · ${fmtShort(date)}`, body, s => {
    const f = s.querySelector('#mf'), inputs = [...f.querySelectorAll('.mrow input')];
    const total = () => {
      let t = 0, n = 0; inputs.forEach(i => { const q = dec(i.value); if(q > 0){ t += q; n++; } });
      const ex = dec(f.querySelector('#m-extra').value); if(ex > 0) t += ex;
      s.querySelector('#mt').textContent = num(t, 2); s.querySelector('#mn').textContent = n ? `${n} гол.` : '';
    };
    f.oninput = total; total();
    inputs.forEach((inp, i) => inp.onkeydown = e => { if(e.key==='Enter'){ e.preventDefault(); const nx = inputs.slice(i+1).find(x => !x.closest('.mrow').hidden); (nx || f.querySelector('#m-extra')).focus(); } });
    s.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => milkForm(date, b.dataset.ss, sp));
    s.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => milkForm(date, ss, b.dataset.sp));
    s.querySelectorAll('.chip[data-g]').forEach(b => b.onclick = () => {
      s.querySelectorAll('.chip[data-g]').forEach(x => x.setAttribute('aria-pressed', x===b));
      f.querySelectorAll('.mrow').forEach(r => r.hidden = !!b.dataset.g && r.dataset.g!==b.dataset.g);
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const yields = {}; let bad = false;
      inputs.forEach(i => {
        const raw = i.value.trim(), old = y[i.name];
        if(raw===''){ if(old != null) yields[i.name] = DEL; return; }
        const q = dec(raw); if(!(q >= 0) || q > 20){ bad = true; i.focus(); return; }
        if(old == null || Math.abs(q - old) > 1e-9) yields[i.name] = round(q, 2);
      });
      const ex = dec(f.querySelector('#m-extra').value);
      if(bad){ const e = s.querySelector('#merr'); e.hidden = false; e.textContent = 'Проверьте значение: надой одной головы за дойку — от 0 до 20 л.'; return; }
      store.merge('milk', milkId(date, ss, sp), {date, session:ss, species:sp, yields, extra: ex > 0 ? round(ex,2) : 0});
      toast(`Надой сохранён: ${s.querySelector('#mt').textContent} л`); closeSheet();
    };
  }, 'mform');
}
// Общий надой за дойку: литры козьего и овечьего без разбивки по головам
function milkQuickForm(date, ss){
  const val = (sp) => { const m = milkDoc(date, ss, sp); return m ? milkTotal(m) : ''; };
  const perHead = (sp) => { const m = milkDoc(date, ss, sp); return m ? Object.values(m.yields||{}).reduce((a,b) => a + (+b||0), 0) : 0; };
  const body = `<form id="mq" novalidate>
    <div class="two">${fld('mq-date','Дата',`<input id="mq-date" type="date" name="date" value="${date}" max="${today()}">`)}
      <div class="field"><label>Дойка</label><div class="seg">${Object.entries(SESS).map(([k,l]) => `<label><input type="radio" name="ss" value="${k}" ${k===ss?'checked':''}>${l}</label>`).join('')}</div></div></div>
    <div class="two">${fld('mq-goat','Козье молоко, л',`<input id="mq-goat" name="goat" inputmode="decimal" autocomplete="off" value="${val('goat')!=='' ? String(round(val('goat'),2)).replace('.',',') : ''}">`)}
      ${fld('mq-sheep','Овечье молоко, л',`<input id="mq-sheep" name="sheep" inputmode="decimal" autocomplete="off" value="${val('sheep')!=='' ? String(round(val('sheep'),2)).replace('.',',') : ''}">`)}</div>
    <div class="mbal"><div class="kv total"><span>Всего за дойку</span><strong><span id="mq-t">0</span> л</strong></div></div>
    <p class="muted" id="mq-ph" style="margin:0"></p>
    <p class="err" id="mqerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">Сохранить</button></div>
    <button type="button" class="link" id="mq-heads" style="align-self:flex-start">Записать по каждой голове</button>
  </form>`;
  openSheet('Надой', body, s => {
    const f = s.querySelector('#mq');
    const cur = () => ({d: f.querySelector('#mq-date').value || today(), ss: f.querySelector('input[name=ss]:checked').value});
    const sync = () => {
      const t = (dec(f.querySelector('#mq-goat').value) || 0) + (dec(f.querySelector('#mq-sheep').value) || 0);
      s.querySelector('#mq-t').textContent = num(t, 2);
      const {d, ss: s2} = cur(); const ph = ['goat','sheep'].map(sp => { const m = milkDoc(d, s2, sp); const x = m ? Object.values(m.yields||{}).reduce((a,b)=>a+(+b||0),0) : 0; return x ? `${MILKNAME[sp].toLowerCase()} ${num(x)} л` : ''; }).filter(Boolean);
      s.querySelector('#mq-ph').textContent = ph.length ? `По головам уже записано: ${ph.join(', ')}. Итог не может быть меньше этого.` : '';
    };
    const refill = () => { const {d, ss: s2} = cur(); ['goat','sheep'].forEach(sp => { const m = milkDoc(d, s2, sp); f.querySelector('#mq-' + sp).value = m ? String(round(milkTotal(m),2)).replace('.',',') : ''; }); sync(); };
    f.oninput = sync; f.querySelectorAll('input[name=ss]').forEach(x => x.onchange = refill); f.querySelector('#mq-date').onchange = refill; sync();
    s.querySelector('#mq-heads').onclick = () => { const {d, ss: s2} = cur(); milkForm(d, s2, milkSpecies().includes('goat') ? 'goat' : 'sheep'); };
    f.onsubmit = ev => {
      ev.preventDefault();
      const {d, ss: s2} = cur(), err = s.querySelector('#mqerr'); let saved = 0;
      for(const sp of ['goat','sheep']){
        const raw = f.querySelector('#mq-' + sp).value.trim(); if(raw === '' && !milkDoc(d, s2, sp)) continue;
        const total = raw === '' ? 0 : dec(raw);
        if(!(total >= 0) || total > 5000){ err.hidden = false; err.textContent = `Проверьте количество: ${MILKNAME[sp].toLowerCase()} молоко.`; return; }
        const m = milkDoc(d, s2, sp), ph = m ? Object.values(m.yields||{}).reduce((a,b)=>a+(+b||0),0) : 0;
        if(total < ph - 1e-9){ err.hidden = false; err.textContent = `${MILKNAME[sp]}: по головам уже записано ${num(ph)} л — итог не может быть меньше.`; return; }
        store.merge('milk', milkId(d, s2, sp), {date:d, session:s2, species:sp, extra: round(total - ph, 2)}); saved++;
      }
      if(!saved){ err.hidden = false; err.textContent = 'Введите литры хотя бы для одного вида.'; return; }
      S.milkDate = d; toast(`Надой сохранён: ${SESS[s2].toLowerCase()}, ${s.querySelector('#mq-t').textContent} л`); closeSheet();
    };
  }, 'mqform');
}
function milkOutForm(o){
  const isEdit = !!o?.id;
  const sp0 = milkSpecies();
  const v = {species: sp0.includes('sheep') && !sp0.includes('goat') ? 'sheep' : (o?.species || (sp0.length===1 ? sp0[0] : 'sheep')), kind:'cheese', date:today(), to:'Сыроварня', ...o};
  const recips = [...new Set(['Сыроварня', ...S.milkout.map(x => x.to).filter(Boolean)])];
  const body = `<form id="mof" novalidate>
    <div class="field"><label>Молоко</label><div class="seg">${['sheep','goat'].map(k => `<label><input type="radio" name="species" value="${k}" ${v.species===k?'checked':''}>${MILKNAME[k]}</label>`).join('')}</div></div>
    ${fld('mo-kind','Куда',`<select id="mo-kind" name="kind">${Object.entries(MILKOUT).map(([k,l]) => opt(k,l,v.kind)).join('')}</select>`)}
    <div class="two">${fld('mo-l','Литров *',`<input id="mo-l" name="liters" inputmode="decimal" value="${esc(v.liters != null ? String(v.liters).replace('.',',') : '')}" autocomplete="off">`)}
      ${fld('mo-date','Дата',`<input id="mo-date" type="date" name="date" value="${esc(v.date)}">`)}</div>
    <div class="mbal" id="mo-bal"></div>
    <div id="mo-sale">
      ${fld('mo-to','Получатель',`<input id="mo-to" name="to" value="${esc(v.to)}" list="mo-tos" autocomplete="off">`)}
      <datalist id="mo-tos">${recips.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      ${isEdit ? '' : fld('mo-price','Сумма, ₽ (попадёт в доходы)',`<input id="mo-price" name="price" type="number" min="0" step="1" inputmode="numeric">`)}
    </div>
    ${fld('mo-note','Заметка',`<input id="mo-note" name="note" value="${esc(v.note)}" autocomplete="off">`)}
    <p class="err" id="moerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${isEdit ? 'Сохранить' : 'Записать отгрузку'}</button></div>
    ${isEdit ? `<div class="actions"><button class="btn danger" type="button" id="model">Удалить</button></div><div id="modelc"></div>` : ''}
  </form>`;
  openSheet(isEdit ? 'Изменить отгрузку' : 'Отгрузка молока', body, s => {
    const f = s.querySelector('#mof');
    const sync = () => {
      const sp = f.querySelector('input[name=species]:checked').value, k = f.querySelector('#mo-kind').value;
      s.querySelector('#mo-sale').hidden = !(k==='cheese' || k==='sale');
      let have = milkBalance()[sp] || 0; if(isEdit && o.species===sp) have += +o.liters || 0;
      const q = dec(f.querySelector('#mo-l').value) || 0, left = round(have - q, 2);
      s.querySelector('#mo-bal').innerHTML = `<div class="kv"><span>Было в наличии</span><strong>${num(have)} л</strong></div><div class="kv"><span>Отгружается</span><strong>−${num(q)} л</strong></div>
        <div class="kv total"><span>Останется</span><strong class="${left<0?'money minus':''}">${num(left)} л</strong></div>${left<0?'<p class="err" style="margin:0">Отгружается больше, чем надоено. Проверьте надои за последние дни.</p>':''}`;
    };
    f.oninput = sync; f.onchange = sync; sync();
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)), q = dec(d.liters), err = s.querySelector('#moerr');
      if(!(q > 0)){ err.hidden = false; err.textContent = 'Укажите количество литров.'; return; }
      const sale = d.kind==='cheese' || d.kind==='sale', price = +d.price || 0;
      const data = {species:d.species, kind:d.kind, liters:round(q,2), date:d.date || today(), to: sale ? (d.to||'').trim() : '', note:(d.note||'').trim()};
      if(sale && price) data.price = price;
      if(isEdit) store.set('milkout', o.id, {...strip(o), ...data, price:o.price ?? null});
      else {
        store.add('milkout', data);
        if(sale && price) store.add('finance', {date:data.date, kind:'income', category:'Молоко', amount:price, note:`${MILKNAME[d.species]} ${num(q)} л${data.to ? ' · ' + data.to : ''}`});
      }
      let have = milkBalance()[d.species] || 0; if(isEdit && o.species===d.species) have += +o.liters || 0;
      toast(`Отгружено ${num(q)} л. Остаток: ${num(round(have - q, 2))} л`); closeSheet();
    };
    const del = s.querySelector('#model');
    if(del) del.onclick = () => askConfirm(s.querySelector('#modelc'), 'Удалить отгрузку? Литры вернутся в остаток. Запись в финансах, если была, удалите отдельно.',
      () => { store.del('milkout', o.id); toast('Удалено'); closeSheet(); });
  }, 'moform');
}

/* ----- Финансы ----- */
function financeForm(r){
  const v = {kind:'expense', date:today(), ...(r||{})};
  const body = `<form id="ff" novalidate>
    <div class="field"><label>Тип</label><div class="seg"><label><input type="radio" name="kind" value="expense" ${v.kind==='expense'?'checked':''}>Расход</label><label><input type="radio" name="kind" value="income" ${v.kind==='income'?'checked':''}>Доход</label></div></div>
    <div class="two">${fld('f-amt','Сумма, ₽ *',`<input id="f-amt" name="amount" type="number" min="0" step="1" inputmode="numeric" value="${esc(v.amount)}">`)}
      ${fld('f-date','Дата',`<input id="f-date" type="date" name="date" value="${esc(v.date)}">`)}</div>
    ${fld('f-cat','Статья',`<select id="f-cat" name="category"></select>`)}
    ${fld('f-note','Комментарий',`<input id="f-note" name="note" value="${esc(v.note)}" placeholder="напр. ветеринар, вакцина" autocomplete="off">`)}
    <p class="err" id="ferr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${r?'Сохранить':'Добавить'}</button></div>
    ${r ? `<div class="actions"><button class="btn danger" type="button" id="fdel">Удалить</button></div><div id="fdelc"></div>` : ''}
  </form>`;
  openSheet(r ? 'Изменить запись' : 'Новая запись', body, s => {
    const f = s.querySelector('#ff'), cat = f.querySelector('#f-cat');
    const fill = () => { const k = f.querySelector('input[name=kind]:checked').value; cat.innerHTML = CAT[k].map(c => opt(c,c,v.category)).join(''); };
    f.querySelectorAll('input[name=kind]').forEach(x => x.onchange = fill); fill();
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)); d.amount = +d.amount;
      if(!(d.amount > 0)){ const e = s.querySelector('#ferr'); e.hidden = false; e.textContent = 'Укажите сумму больше нуля.'; return; }
      if(r) store.set('finance', r.id, {...strip(r), ...d}); else store.add('finance', d);
      S.month = d.date.slice(0,7); toast('Сохранено'); closeSheet();
    };
    const del = s.querySelector('#fdel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#fdelc'), `Удалить запись на ${money(r.amount)}?`, () => { store.del('finance', r.id); toast('Удалено'); closeSheet(); });
  }, 'fform');
}

/* ===== Пример данных для демо-режима ===== */
function seedDemo(be){
  let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const r2 = (a, b) => round(a + rnd() * (b - a), 2);
  const W = (col, data, id) => { id = id || be.newId(); be.write(col, id, {...data, demo:true, created:Date.now()}); return id; };
  const t = today(), D = n => addDays(t, n);
  const it = {};
  [['hay','Сено','кг'],['barley','Ячмень дроблёный','кг'],['mix','Комбикорм для МРС','кг'],['salt','Соль-лизунец','кг']].forEach(([k,n,u]) => it[k] = W('items', {name:n, unit:u, cat:'feed'}));
  [['dt','Дизельное топливо','л'],['ai','Бензин АИ-92','л'],['oil','Моторное масло','л']].forEach(([k,n,u]) => it[k] = W('items', {name:n, unit:u, cat:'fuel'}));
  const mv = (item, kind, qty, d, note, price) => { W('moves', {item, kind, qty, date:D(d), note:note||'', ...(price?{price}:{})}); if(price) W('finance', {date:D(d), kind:'expense', category: [it.dt,it.ai,it.oil].includes(item) ? 'ГСМ' : 'Корма', amount:price, note}); };
  mv(it.hay,'in',6000,-24,'КФХ Соколов, 120 тюков',36000);
  mv(it.barley,'in',1200,-24,'Элеватор',15600);
  mv(it.mix,'in',600,-17,'Комбикорм, 15 мешков',18000);
  mv(it.salt,'in',40,-17,'Лизунцы',1200);
  mv(it.dt,'in',600,-20,'АЗС',40800);
  mv(it.dt,'out',55,-13,'МТЗ-82'); mv(it.dt,'out',40,-6,'МТЗ-82'); mv(it.dt,'out',28,-2,'ГАЗель');
  mv(it.ai,'in',60,-15,'АЗС',3540); mv(it.ai,'out',15,-5,'Генератор');
  mv(it.oil,'in',20,-15,'Масло 15W-40',4200); mv(it.oil,'out',4,-13,'МТЗ-82');
  const rat = {
    goats: W('rations', {name:'Дойные козы', mode:'head', items:[{item:it.hay,qty:2},{item:it.mix,qty:0.7}]}),
    ewes: W('rations', {name:'Овцематки', mode:'head', items:[{item:it.hay,qty:1.8},{item:it.barley,qty:0.4}]}),
    rams: W('rations', {name:'Производители', mode:'head', items:[{item:it.hay,qty:2.2},{item:it.barley,qty:0.6}]}),
    young: W('rations', {name:'Молодняк', mode:'pen', items:[{item:it.hay,qty:6},{item:it.mix,qty:3}]}),
    quar: W('rations', {name:'Карантин', mode:'head', items:[{item:it.hay,qty:1.6}]}),
  };
  [['o1-1','ewes'],['o1-2','ewes'],['o1-3','ewes'],['o1-4','young'],['o1-19','rams'],['k-1','goats'],['k-2','goats'],['k-3','goats'],['k-4','young'],['k-10','rams'],['q-1','quar']]
    .forEach(([p,r]) => W('pens', {ration:rat[r]}, p));
  W('settings', {from:D(-10), paused:false}, 'feed');
  const A = (tag, o) => W('animals', {tag:String(tag), status:'active', ...o});
  const ram1 = A(2001, {name:'Буян', sex:'m', species:'sheep', breed:'Лакон', birth:'2022-03-14', pen:'o1-19', group:'ram'});
  const ram2 = A(2002, {sex:'m', species:'sheep', breed:'Лакон', birth:'2023-02-20', pen:'o1-19', group:'ram'});
  const buck = A(3001, {name:'Граф', sex:'m', species:'goat', breed:'Зааненская', birth:'2022-04-02', pen:'k-10', group:'buck'});
  const ewes = Array.from({length:12}, (_,i) => A(2101+i, {sex:'f', species:'sheep', breed:'Лакон', birth:`${2021+i%3}-0${2+i%4}-1${i%9}`, pen:`o1-${1+Math.floor(i/4)}`, group: i >= 7 ? 'preg' : 'milk'}));
  const gnames = ['Зорька','Белка','Майка','Ночка','Дуня','Ласка','Роза','Звёздочка','Луна','Капля'];
  const goats = gnames.map((n,i) => A(3101+i, {name:n, sex:'f', species:'goat', breed:'Зааненская', birth:`${2021+i%3}-0${3+i%5}-2${i%8}`, pen:`k-${1+Math.floor(i/4)}`, group:'milk'}));
  A(4001, {sex:'f', species:'goat', breed:'Альпийская', birth:'2024-03-10', pen:'q-1', note:'Куплена, карантин 21 день'});
  A(4002, {sex:'f', species:'goat', breed:'Альпийская', birth:'2024-04-01', pen:'q-1', note:'Куплена, карантин 21 день'});
  const E = d => W('events', d);
  const birth = (mom, momTag, sp, sire, d, n, pen) => {
    E({animalIds:[mom], type:'mating', date:D(d - GESTATION[sp]), sireId:sire});
    E({animalIds:[mom], type:'birth', date:D(d), count:n, sireId:sire});
    for(let k = 1; k <= n; k++){
      const kid = A(`${momTag}-${k}`, {sex: rnd() < .5 ? 'f' : 'm', species:sp, breed: sp==='goat' ? 'Зааненская' : 'Лакон', birth:D(d), motherId:mom, fatherId:sire, pen});
      E({animalIds:[kid], type:'weight', date:D(d), weight: sp==='goat' ? r2(3,4.2) : r2(3.6,5), note:'при рождении'});
    }
  };
  ewes.slice(0,4).forEach((e,i) => birth(e, 2101+i, 'sheep', ram1, -45, 1 + (i%2), 'o1-4'));
  ewes.slice(4,7).forEach((e,i) => birth(e, 2105+i, 'sheep', ram2, -3, 2, 'o1-2'));
  ewes.slice(7).forEach(e => E({animalIds:[e], type:'mating', date:D(-128), sireId:ram1}));
  goats.slice(0,8).forEach((g,i) => birth(g, 3101+i, 'goat', buck, -70 + i, 1 + (i%3===0?1:0), 'k-4'));
  E({animalIds:[...ewes, ...goats, ram1, ram2, buck], type:'vac', date:D(-38), drug:'Клостбак-8', dose:'2 мл п/к', nextDate:D(4)});
  E({animalIds:[...goats], type:'treat', date:D(-20), drug:'Альбендазол', dose:'1 мл/10 кг', nextDate:D(25)});
  E({animalIds:[ewes[0]], type:'weight', date:D(-60), weight:58}); E({animalIds:[ewes[0]], type:'weight', date:D(-30), weight:55}); E({animalIds:[ewes[0]], type:'weight', date:D(-2), weight:57.5});
  for(let d = -9; d <= 0; d++){
    for(const ss of ['am','pm']){
      if(d===0 && ss==='pm') continue;
      const gy = {}; goats.slice(0,8).forEach(g => gy[g] = ss==='am' ? r2(1.3,1.9) : r2(1.0,1.6));
      W('milk', {date:D(d), session:ss, species:'goat', yields:gy, extra:0}, milkId(D(d), ss, 'goat'));
      const sy = {}; ewes.slice(0,4).forEach(e => sy[e] = ss==='am' ? r2(0.6,0.95) : r2(0.45,0.8));
      W('milk', {date:D(d), session:ss, species:'sheep', yields:sy, extra:0}, milkId(D(d), ss, 'sheep'));
    }
  }
  const out = (sp, l, d, price) => { W('milkout', {species:sp, kind:'cheese', liters:l, date:D(d), to:'Сыроварня', ...(price?{price}:{})}); if(price) W('finance', {date:D(d), kind:'income', category:'Молоко', amount:price, note:`${MILKNAME[sp]} ${l} л · Сыроварня`}); };
  out('goat', 100, -6, 9000); out('goat', 80, -2, 7200); out('sheep', 30, -5, 3600); out('sheep', 15, -1, 1800);
  W('milkout', {species:'goat', kind:'feed', liters:12, date:D(-4), note:'выпойка козлят'});
  W('finance', {date:D(-38), kind:'expense', category:'Ветеринария', amount:4600, note:'Вакцина, 2 флакона'});
}


/* ===== Выгрузка в Excel (.xlsx собирается прямо на телефоне, без интернета) ===== */
const XL = (() => {
  const enc = new TextEncoder();
  const crcT = (() => { const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for(let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files){
    const parts = [], central = []; let off = 0;
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF,
      dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    for(const f of files){
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  const x = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colL = i => { let s = ''; i++; while(i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const serial = s => { const [y, m, d] = String(s).split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  // стили: 0 обычный, 1 шапка, 2 дробное, 3 рубли, 4 дата, 5 целое, 6 итог-текст, 7 итог-дробное, 8 итог-рубли, 9 итог-целое, 10 заголовок листа, 11 пояснение
  const ST = {s:0, n:2, m:3, d:4, i:5};
  const TOT = {s:6, n:7, m:8, i:9, d:6};
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.0##"/><numFmt numFmtId="165" formatCode="#,##0&quot; ₽&quot;"/><numFmt numFmtId="166" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2D6748"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E8DF"/></patternFill></fill></fills>
<borders count="2"><border/><border><top style="thin"><color rgb="FF9AA89E"/></top></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="3" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  function cell(ref, v, t, st){
    if(v === null || v === undefined || v === '') return '';
    if(t === 'd' && /^\d{4}-\d\d-\d\d$/.test(v)) return `<c r="${ref}" s="${st}"><v>${serial(v)}</v></c>`;
    if((t === 'n' || t === 'm' || t === 'i') && typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${t === 'd' || t === 'n' || t === 'm' || t === 'i' ? (st >= 6 ? 6 : 0) : st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }
  function sheetXml(sh){
    const cols = sh.cols, rows = [];
    let r = 1;
    rows.push(`<row r="${r}" ht="22" customHeight="1">${cell('A' + r, sh.title, 's', 10)}</row>`); r++;
    if(sh.note){ rows.push(`<row r="${r}">${cell('A' + r, sh.note, 's', 11)}</row>`); r++; }
    r++;
    const head = r;
    rows.push(`<row r="${r}">${cols.map((c, i) => cell(colL(i) + r, c.h, 's', 1)).join('')}</row>`); r++;
    for(const row of sh.rows){ rows.push(`<row r="${r}">${cols.map((c, i) => cell(colL(i) + r, row[i], c.t || 's', ST[c.t || 's'])).join('')}</row>`); r++; }
    if(!sh.rows.length){ rows.push(`<row r="${r}">${cell('A' + r, 'Нет записей за выбранный период', 's', 11)}</row>`); r++; }
    if(sh.total && sh.rows.length){ rows.push(`<row r="${r}">${cols.map((c, i) => cell(colL(i) + r, i === 0 && sh.total[0] == null ? 'Итого' : sh.total[i], c.t || 's', TOT[c.t || 's'])).join('')}</row>`); r++; }
    const last = colL(cols.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 12}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${sh.rows.length ? `<autoFilter ref="A${head}:${last}${head + sh.rows.length}"/>` : ''}
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }
  function build(sheets){
    const used = new Set();
    const names = sheets.map(s => { let n = s.name.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31), k = 2; while(used.has(n.toLowerCase())) n = s.name.slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; });
    const files = [
      {name:'[Content_Types].xml', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
      {name:'_rels/.rels', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:'xl/workbook.xml', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${sheets.map((s, i) => s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(names[i]).replace(/'/g, "''")}'!$A$${s.note ? 4 : 3}:$${colL(s.cols.length - 1)}$${(s.note ? 4 : 3) + s.rows.length}</definedName>` : '').join('')}</definedNames></workbook>`},
      {name:'xl/_rels/workbook.xml.rels', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'xl/styles.xml', data:styles},
      ...sheets.map((s, i) => ({name:`xl/worksheets/sheet${i + 1}.xml`, data:sheetXml(s)}))
    ];
    return zip(files);
  }
  return {build};
})();

/* ----- Что попадает в файл ----- */
const XL_SECTIONS = {
  herd:'Стадо (все животные)', births:'Окоты и приплод', events:'Ветеринария и события', pens:'Загоны',
  feed:'Склад кормов', fuel:'ГСМ', vet:'Ветеринарная аптека', tech:'Склад техники', milk:'Молоко по дням', milkHeads:'Надои по головам', milkOut:'Отгрузки молока', finance:'Финансы'
};
function xlSheets(from, to, secs){
  const inP = d => d && d >= from && d <= to;
  const period = `Период: ${fmtD(from)} — ${fmtD(to)}`;
  const sum = (rows, i) => round(rows.reduce((s, r) => s + (+r[i] || 0), 0), 3);
  const tagOf = id => byId(id)?.tag || '';
  const barnOf = a => PEN[a.pen]?.barn.name || '';
  const out = [];

  if(secs.herd){
    const list = S.animals.slice().sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || penSort(a, b));
    out.push({name:'Стадо', title:'Стадо', note:`На ${fmtD(today())}. Голов в стаде: ${S.animals.filter(a => a.status === 'active').length}`,
      cols:[{h:'Бирка',w:10},{h:'Кличка',w:12},{h:'Вид',w:7},{h:'Пол',w:6},{h:'Порода',w:14},{h:'Помещение',w:12},{h:'Загон',w:7},{h:'Группа',w:18},{h:'Категория в файле',w:14},{h:'В загоне с',w:12,t:'d'},
        {h:'Дата рождения',w:12,t:'d'},{h:'Возраст',w:12},{h:'Мать',w:10},{h:'Отец',w:10},{h:'Статус',w:11},{h:'Дата выбытия',w:12,t:'d'},
        {h:'Последний вес, кг',w:10,t:'n'},{h:'Дата взвешивания',w:12,t:'d'},{h:'Последний окот',w:12,t:'d'},{h:'Детёнышей',w:9,t:'i'},{h:'Номера и пол детёнышей',w:24},
        {h:'Надой за 7 дн., л/сут',w:10,t:'n'},{h:'Заметка',w:24}],
      rows:list.map(a => {
        const w = eventsFor(a.id).find(e => e.type === 'weight' && e.weight), lb = a.sex === 'f' ? lastBirth(a.id) : null, mk = a.sex === 'f' ? animalMilk(a.id) : null;
        return [String(a.tag), a.name || '', SPECIES[a.species], a.sex === 'f' ? 'Самка' : 'Самец', a.breed || '', barnOf(a), PEN[a.pen]?.n ?? '', groupName(a.species, groupOf(a)), a.cat || '', a.since || '',
          a.birth || '', age(a.birth), tagOf(a.motherId) || a.motherText || '', tagOf(a.fatherId) || a.fatherText || '', STATUS[a.status] || '', a.outDate || '',
          w ? +w.weight : '', w ? w.date : '', lb ? lb.ev.date : '', lb ? (+lb.ev.count || lb.kids.length) : '',
          lb ? lb.kids.map(k => `${k.tag} ${k.sex === 'f' ? '♀' : '♂'}`).join(', ') : '', mk ? round(mk.avg, 2) : '', a.note || ''];
      })});
  }
  if(secs.births){
    const rows = [];
    S.events.filter(e => e.type === 'birth' && inP(e.date)).sort((a, b) => a.date.localeCompare(b.date)).forEach(e => (e.animalIds || []).forEach(mid => {
      const m = byId(mid), kids = S.animals.filter(k => k.motherId === mid && k.birth === e.date).sort(tagSort);
      const base = [e.date, m?.tag || '', m ? SPECIES[m.species] : '', m ? penLong(m.pen) : '', tagOf(e.sireId), +e.count || 0];
      if(!kids.length) rows.push([...base, '', '', '', '']);
      kids.forEach(k => { const bw = S.events.find(x => x.type === 'weight' && (x.animalIds || []).includes(k.id) && x.date === e.date);
        rows.push([...base, k.tag, k.sex === 'f' ? 'Самка' : 'Самец', bw ? +bw.weight : '', STATUS[k.status] || '']); });
    }));
    const mothers = new Set(rows.map(r => r[1] + r[0])).size, born = S.events.filter(e => e.type === 'birth' && inP(e.date)).reduce((s, e) => s + (+e.count || 0), 0);
    out.push({name:'Окоты', title:'Окоты и приплод', note:`${period}. Окотов: ${mothers}, родилось живыми: ${born}`,
      cols:[{h:'Дата окота',w:12,t:'d'},{h:'Мать',w:10},{h:'Вид',w:7},{h:'Загон матери',w:22},{h:'Отец',w:10},{h:'Родилось',w:9,t:'i'},{h:'Бирка детёныша',w:13},{h:'Пол',w:8},{h:'Вес при рождении, кг',w:11,t:'n'},{h:'Статус сейчас',w:12}],
      rows});
  }
  if(secs.events){
    const rows = S.events.filter(e => e.type !== 'birth' && inP(e.date)).sort((a, b) => a.date.localeCompare(b.date)).map(e => {
      const ids = e.animalIds || [];
      return [e.date, ET[e.type]?.t || 'Событие', e.drug || '', e.dose || '', ids.length, ids.map(tagOf).filter(Boolean).join(', '),
        e.type === 'weight' ? +e.weight : '', e.type === 'mating' ? tagOf(e.sireId) : '', e.nextDate || '', e.nextDate ? (e.doneNext ? 'да' : 'нет') : '', e.note || '', e.byEmail ? e.byEmail.split('@')[0] : ''];
    });
    out.push({name:'Ветеринария и события', title:'Ветеринария и события', note:period,
      cols:[{h:'Дата',w:12,t:'d'},{h:'Событие',w:22},{h:'Препарат',w:16},{h:'Доза',w:12},{h:'Голов',w:7,t:'i'},{h:'Бирки',w:30},{h:'Вес, кг',w:9,t:'n'},{h:'Производитель',w:12},{h:'Повтор',w:12,t:'d'},{h:'Повтор сделан',w:9},{h:'Заметка',w:24},{h:'Кто записал',w:12}],
      rows});
  }
  if(secs.pens){
    const {perPen} = feedUse();
    const rows = PENS.map(p => {
      const an = inPen(p.id), r = penRation(p.id), u = perPen[p.id]?.use || {};
      return [p.barn.name, p.n, penLabel(p.id), an.length, an.filter(a => a.species === 'sheep').length, an.filter(a => a.species === 'goat').length,
        an.filter(a => a.sex === 'f' && adult(a)).length, an.filter(a => !adult(a)).length, an.sort(tagSort).map(a => a.tag).join(', ')];
    });
    out.push({name:'Загоны', title:'Загоны', note:`На ${fmtD(today())}`,
      cols:[{h:'Помещение',w:12},{h:'Загон',w:7},{h:'Назначение',w:22},{h:'Голов',w:7,t:'i'},{h:'Овец',w:7,t:'i'},{h:'Коз',w:7,t:'i'},{h:'Маток',w:7,t:'i'},{h:'Молодняк',w:9,t:'i'},{h:'Бирки',w:60}],
      rows, total:[null, '', '', sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), sum(rows, 7)]});
  }
  if(secs.tech){
    const rows = vehicles().map(v => { const per = {}; S.moves.filter(m => m.vehicle === v.id && m.kind === 'out' && inP(m.date)).forEach(m => { const it = itemById(m.item); const k = it?.name || '?'; per[k] = (per[k] || 0) + (+m.qty || 0); });
      return [v.name, v.vtype || '', v.plate || '', v.trailer || '', v.gsm === false ? 'нет' : 'да', Object.entries(per).map(([k, q]) => `${k} ${num(round(q, 2))}`).join('; '), v.note || '']; });
    out.push({name:'Техника', title:'Склад техники', note:`На ${fmtD(today())}. Заправки — ${period.toLowerCase()}`,
      cols:[{h:'Техника',w:22},{h:'Тип',w:12},{h:'Госномер',w:13},{h:'Номер прицепа',w:14},{h:'В ГСМ',w:7},{h:'Заправлено за период',w:30},{h:'Заметка',w:24}], rows});
  }
  const XL_CAT = {feed:{n:'Корма', t:'Склад кормов', w:'Корм'}, fuel:{n:'ГСМ', t:'ГСМ', w:'Топливо'}, vet:{n:'Аптека', t:'Ветеринарная аптека', w:'Препарат'}};
  for(const cat of ['feed', 'fuel', 'vet']){
    if(!secs[cat]) continue;
    const X = XL_CAT[cat], items = S.items.filter(i => i.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'ru')), {use} = feedUse();
    const ops = [];
    S.moves.filter(m => itemById(m.item)?.cat === cat).forEach(m => ops.push({date:m.date, item:m.item, kind:m.kind, qty:+m.qty || 0, veh:vehLabel(itemById(m.vehicle)), who:m.who || '', note:m.note || '', price:m.price || '', by:m.byEmail}));
    const bal = rows => items.map(it => {
      const o = ops.filter(x => x.item === it.id), before = o.filter(x => x.date < from), inn = o.filter(x => inP(x.date));
      const start = round(before.reduce((s, x) => s + (x.kind === 'in' ? x.qty : -x.qty), 0), 3);
      const pin = round(inn.filter(x => x.kind === 'in').reduce((s, x) => s + x.qty, 0), 3);
      const pout = round(inn.filter(x => x.kind === 'out').reduce((s, x) => s + x.qty, 0), 3);
      const pauto = round(inn.filter(x => x.kind === 'auto').reduce((s, x) => s + x.qty, 0), 3);
      const end = round(start + pin - pout - pauto, 3), u = use[it.id] || 0;
      const r = [it.name, it.unit, start, pin, pout];
      r.push(end);
      r.push(round(inn.filter(x => x.kind === 'in').reduce((s, x) => s + (+x.price || 0), 0), 2) || '');
      return r;
    });
    const brows = bal();
    const bcols = cat !== 'fuel'
      ? [{h:X.w,w:22},{h:'Ед.',w:6},{h:'Остаток на начало',w:12,t:'n'},{h:'Приход',w:11,t:'n'},{h:'Расход',w:11,t:'n'},{h:'Остаток на конец',w:12,t:'n'},{h:'Закуплено на сумму',w:13,t:'m'}]
      : [{h:'Топливо, масла',w:22},{h:'Ед.',w:6},{h:'Остаток на начало',w:12,t:'n'},{h:'Приход',w:11,t:'n'},{h:'Расход',w:11,t:'n'},{h:'Остаток на конец',w:12,t:'n'},{h:'Закуплено на сумму',w:13,t:'m'}];
    const btot = bcols.map((c, i) => c.t === 'm' ? sum(brows, i) : null); btot[0] = null;
    out.push({name:X.n + ' — остатки', title:X.t + ': приход, расход, остаток', note:period, cols:bcols, rows:brows, total:btot});
    const kindName = {in:'Приход', out:cat === 'fuel' ? 'Заправка / расход' : 'Расход'};
    const orows = ops.filter(x => inP(x.date)).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)).map(x => [x.date, itemById(x.item)?.name || 'удалено', kindName[x.kind], x.kind === 'in' ? x.qty : -x.qty, itemById(x.item)?.unit || '',
      ...(cat === 'fuel' ? [x.veh, x.who] : cat === 'vet' ? [x.who] : []), x.kind === 'in' ? x.note : '', x.kind === 'out' ? x.note : '', x.price === '' ? '' : +x.price, x.by ? whoName(x.by) : '']);
    const extra = cat === 'fuel' ? [{h:'Техника',w:22},{h:'Кто заправлял',w:16}] : cat === 'vet' ? [{h:'Кто выдал / применил',w:16}] : [];
    const cols = [{h:'Дата',w:12,t:'d'},{h:X.w,w:22},{h:'Операция',w:16},{h:'Количество',w:11,t:'n'},{h:'Ед.',w:6},...extra,{h:'От кого',w:22},{h:'Комментарий',w:24},{h:'Сумма',w:11,t:'m'},{h:'Кто записал',w:12}];
    const tot = cols.map((c, k) => c.t === 'm' ? sum(orows, k) : null); tot[0] = null;
    out.push({name:X.n + ' — движение', title:'Движение — ' + X.t, note:period + '. Расход — со знаком минус', cols, rows:orows, total:tot});
  }
  if(secs.milk){
    const days = new Set(); S.milk.forEach(m => inP(m.date) && days.add(m.date)); S.milkout.forEach(o => inP(o.date) && days.add(o.date));
    const v = (d, ss, sp) => round(milkTotal(milkDoc(d, ss, sp)), 2);
    const shipped = (d, sp) => round(S.milkout.filter(o => o.date === d && o.species === sp).reduce((s, o) => s + (+o.liters || 0), 0), 2);
    const balTo = (d, sp) => round(S.milk.filter(m => m.species === sp && m.date <= d).reduce((s, m) => s + milkTotal(m), 0) - S.milkout.filter(o => o.species === sp && o.date <= d).reduce((s, o) => s + (+o.liters || 0), 0), 2);
    const rows = [...days].sort().map(d => [d, v(d, 'am', 'sheep'), v(d, 'pm', 'sheep'), round(v(d, 'am', 'sheep') + v(d, 'pm', 'sheep'), 2), v(d, 'am', 'goat'), v(d, 'pm', 'goat'), round(v(d, 'am', 'goat') + v(d, 'pm', 'goat'), 2),
      shipped(d, 'sheep'), shipped(d, 'goat'), balTo(d, 'sheep'), balTo(d, 'goat')]);
    out.push({name:'Молоко по дням', title:'Молоко по дням, литров', note:`${period}. Отгружено — на сыроварню, продажа, выпойка и списание`,
      cols:[{h:'Дата',w:12,t:'d'},{h:'Овечье утро',w:10,t:'n'},{h:'Овечье вечер',w:10,t:'n'},{h:'Овечье за день',w:10,t:'n'},{h:'Козье утро',w:10,t:'n'},{h:'Козье вечер',w:10,t:'n'},{h:'Козье за день',w:10,t:'n'},{h:'Отгружено овечьего',w:11,t:'n'},{h:'Отгружено козьего',w:11,t:'n'},{h:'Остаток овечьего',w:11,t:'n'},{h:'Остаток козьего',w:11,t:'n'}],
      rows, total:[null, sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), sum(rows, 7), sum(rows, 8), '', '']});
  }
  if(secs.milkHeads){
    const rows = [];
    S.milk.filter(m => inP(m.date)).sort((a, b) => a.date.localeCompare(b.date) || (a.session === 'am' ? -1 : 1) - (b.session === 'am' ? -1 : 1) || a.species.localeCompare(b.species)).forEach(m => {
      Object.entries(m.yields || {}).filter(([, l]) => +l > 0).map(([id, l]) => [byId(id), l]).sort((a, b) => String(a[0]?.tag || '').localeCompare(String(b[0]?.tag || ''), 'ru', {numeric:true}))
        .forEach(([a, l]) => rows.push([m.date, SESS[m.session], SPECIES[m.species], a?.tag || 'удалено', a?.name || '', a ? penLong(a.pen) : '', +l]));
      if(+m.extra > 0) rows.push([m.date, SESS[m.session], SPECIES[m.species], 'без разбивки', '', '', +m.extra]);
    });
    out.push({name:'Надои по головам', title:'Надои по головам', note:period,
      cols:[{h:'Дата',w:12,t:'d'},{h:'Дойка',w:8},{h:'Вид',w:7},{h:'Бирка',w:12},{h:'Кличка',w:12},{h:'Загон',w:22},{h:'Литров',w:9,t:'n'}],
      rows, total:[null, '', '', '', '', '', sum(rows, 6)]});
  }
  if(secs.milkOut){
    const rows = S.milkout.filter(o => inP(o.date)).sort((a, b) => a.date.localeCompare(b.date)).map(o => [o.date, MILKNAME[o.species] || '', MILKOUT[o.kind] || '', o.to || '', +o.liters || 0, o.price ? +o.price : '', o.price && o.liters ? round(o.price / o.liters, 2) : '', o.note || '']);
    out.push({name:'Отгрузки молока', title:'Отгрузки молока', note:period,
      cols:[{h:'Дата',w:12,t:'d'},{h:'Молоко',w:10},{h:'Куда',w:18},{h:'Получатель',w:16},{h:'Литров',w:9,t:'n'},{h:'Сумма',w:12,t:'m'},{h:'Цена за литр',w:11,t:'m'},{h:'Заметка',w:24}],
      rows, total:[null, '', '', '', sum(rows, 4), sum(rows, 5), '', '']});
  }
  if(secs.finance){
    const rows = S.finance.filter(r => inP(r.date)).sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.kind === 'income' ? 'Доход' : 'Расход', r.category || '', r.kind === 'income' ? +r.amount || 0 : '', r.kind === 'expense' ? +r.amount || 0 : '', r.note || '']);
    const inc = sum(rows, 3), exp = sum(rows, 4);
    out.push({name:'Финансы', title:'Финансы', note:`${period}. Итог: ${inc - exp >= 0 ? '+' : '−'}${money(Math.abs(inc - exp))}`,
      cols:[{h:'Дата',w:12,t:'d'},{h:'Тип',w:9},{h:'Статья',w:18},{h:'Доход',w:12,t:'m'},{h:'Расход',w:12,t:'m'},{h:'Комментарий',w:36}],
      rows, total:[null, '', '', inc, exp, '']});
  }
  return out;
}

/* ----- Сохранение файла ----- */
async function saveFile(name, blob){
  if(window.OTARA_DEMO && window.claude && window.claude.use){
    const dl = await window.claude.use('downloads');
    if(!dl){ toast('Скачивание недоступно в этом окне.'); return false; }
    try{ await dl.save({filename:name, data:blob}); return true; }
    catch(e){ if(e && e.code !== 'declined') toast('Не удалось сохранить файл.'); return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/* ----- Окно выгрузки ----- */
function excelSheet(only){
  const t = today(), y = t.slice(0, 4), m = t.slice(0, 7);
  const prevM = iso(new Date(+y, +m.slice(5) - 2, 1)).slice(0, 7);
  const lastDay = ym => iso(new Date(+ym.slice(0, 4), +ym.slice(5), 0));
  const PER = {
    month:['Этот месяц', m + '-01', t], prev:['Прошлый месяц', prevM + '-01', lastDay(prevM)],
    year:['Этот год', y + '-01-01', t], all:['Всё время', '2000-01-01', t], custom:['Свои даты', addDays(t, -29), t]
  };
  let saved = null; try{ saved = JSON.parse(localStorage.getItem('otara-xl') || 'null'); }catch(_){}
  const pk = saved?.p && PER[saved.p] ? saved.p : 'month';
  const sel = only ? Object.fromEntries(Object.keys(XL_SECTIONS).map(k => [k, only.includes(k)])) : (saved?.s || Object.fromEntries(Object.keys(XL_SECTIONS).map(k => [k, true])));
  const body = `<form id="xf" novalidate>
    <div class="field"><label>Период</label><div class="chips" style="flex-wrap:wrap">${Object.entries(PER).map(([k, [l]]) => `<label class="chip pchk"><input type="radio" name="p" value="${k}" ${k === pk ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    <div class="two" id="xcustom">${fld('x-from', 'С', `<input id="x-from" type="date" name="from" value="${PER.custom[1]}" max="${t}">`)}${fld('x-to', 'По', `<input id="x-to" type="date" name="to" value="${t}" max="${t}">`)}</div>
    <div class="field"><div class="kv"><label>Листы в файле</label><button type="button" class="link" id="xall">Все / ни одного</button></div>
      <div class="list">${Object.entries(XL_SECTIONS).map(([k, l]) => `<label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" name="s" value="${k}" ${sel[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <p class="muted" style="margin:0">Стадо и загоны выгружаются на сегодня, остальное — за выбранный период. Файл открывается в Excel, Google Таблицах и WPS на телефоне.</p>
    <p class="err" id="xerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">Скачать Excel</button></div>
  </form>`;
  openSheet('Выгрузка в Excel', body, s => {
    const f = s.querySelector('#xf');
    const sync = () => { s.querySelector('#xcustom').hidden = f.querySelector('input[name=p]:checked').value !== 'custom'; };
    f.onchange = sync; sync();
    s.querySelector('#xall').onclick = () => { const bs = [...f.querySelectorAll('input[name=s]')], all = bs.every(b => b.checked); bs.forEach(b => b.checked = !all); };
    f.onsubmit = async ev => {
      ev.preventDefault();
      const p = f.querySelector('input[name=p]:checked').value, err = s.querySelector('#xerr');
      let [, from, to] = PER[p];
      if(p === 'custom'){ from = f.querySelector('#x-from').value; to = f.querySelector('#x-to').value; }
      if(!from || !to || from > to){ err.hidden = false; err.textContent = 'Проверьте даты: начало должно быть раньше конца.'; return; }
      const secs = Object.fromEntries([...f.querySelectorAll('input[name=s]')].map(b => [b.value, b.checked]));
      if(!Object.values(secs).some(Boolean)){ err.hidden = false; err.textContent = 'Отметьте хотя бы один лист.'; return; }
      if(!only) try{ localStorage.setItem('otara-xl', JSON.stringify({p, s:secs})); }catch(_){}
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Готовим файл…';
      try{
        const blob = XL.build(xlSheets(from, to, secs));
        const name = p === 'all' ? `Берегиня ${t}.xlsx` : `Берегиня ${from === to ? from : from + ' — ' + to}.xlsx`;
        if(await saveFile(name, blob)){ toast('Файл Excel сохранён в «Загрузки»'); closeSheet(); }
      }catch(e){ err.hidden = false; err.textContent = 'Не удалось собрать файл: ' + (e && e.message || 'ошибка'); }
      btn.disabled = false; btn.textContent = 'Скачать Excel';
    };
  }, 'xlform');
}


/* ===== Загрузка стада из Excel ===== */
// Чтение .xlsx прямо в браузере: zip + XML, без внешних библиотек.
async function readXlsx(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
  let eocd = -1;
  for(let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if(eocd < 0) throw new Error('not_xlsx');
  const files = {}; let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for(let k = 0; k < n; k++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    files[name] = {method, data:u8.subarray(start, start + csize)};
    p += 46 + nl + xl + cl;
  }
  const text = async name => {
    const f = files[name] || files[name.replace(/^\//, '')]; if(!f) return null;
    if(f.method === 0) return dec.decode(f.data);
    const ds = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(ds).arrayBuffer());
  };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const wb = await text('xl/workbook.xml'); if(!wb) throw new Error('not_xlsx');
  const rels = xml(await text('xl/_rels/workbook.xml.rels') || '<r/>');
  const relMap = {}; [...rels.getElementsByTagName('Relationship')].forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const ssDoc = await text('xl/sharedStrings.xml');
  const shared = ssDoc ? [...xml(ssDoc).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const colIdx = ref => { let c = 0; for(const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
  const sheets = [];
  for(const sh of xml(wb).getElementsByTagName('sheet')){
    const rid = sh.getAttribute('r:id') || [...sh.attributes].find(a => a.name.endsWith(':id'))?.value;
    let target = relMap[rid] || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const src = await text(target); if(!src) continue;
    const rows = [];
    for(const r of xml(src).getElementsByTagName('row')){
      const ri = (+r.getAttribute('r') || rows.length + 1) - 1, row = [];
      for(const c of r.getElementsByTagName('c')){
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent;
        let val = null;
        if(t === 's') val = shared[+v] ?? null;
        else if(t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if(t === 'str' || t === 'e') val = v ?? null;
        else if(t === 'b') val = v === '1';
        else if(v != null && v !== '') val = +v;
        if(val !== null && val !== '') row[colIdx(c.getAttribute('r') || 'A1')] = val;
      }
      rows[ri] = row;
    }
    sheets.push({name:sh.getAttribute('name'), rows:Array.from(rows, r => r || [])});
  }
  return sheets;
}

const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
function xlDate(v){
  if(v == null || v === '') return '';
  if(typeof v === 'number' && v > 20000 && v < 80000){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10); }
  const m = String(v).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/); if(m){ const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  const m2 = String(v).match(/(\d{4})-(\d\d)-(\d\d)/); return m2 ? m2[0] : '';
}
const HEAD = {
  tag:/бирк|инв\.?\s*№|^номер$|^№ ?животн/, cat:/категор|группа/, sex:/^пол$|^пол\b/, species:/^вид/, birth:/рожд/, since:/постанов|в загоне с/,
  note:/примеч|коммент|замет/, ration:/рацион/, name:/кличк/, breed:/пород/, mother:/мать|матер/, father:/отец|отца/, weight:/вес/,
  pen:/^загон/, barn:/помещ|корпус|ферма/
};
const barnByText = t => { const x = norm(t).replace(/\s/g, ''); return BARNS.find(b => norm(b.name).replace(/\s/g, '') === x || x.startsWith(norm(b.name).replace(/\s/g, ''))); };
function parsePenText(t){
  const m = norm(t).match(/загон\w*\s*№?\s*(\d+)\s*([а-яa-z])?(?![а-яa-z])(?:\s*[-–—]\s*(\d+))?[\s,.:;]*(.*)$/);
  if(!m) return null;
  return {n:+m[1], letter:m[2] || '', to:m[3] ? +m[3] : null, label:String(t).replace(/^[^№\d]*№?\s*\d+\s*[а-яa-z]?(?![а-яa-z])(\s*[-–—]\s*\d+)?[\s,.:;]*/i, '').trim()};
}
function penIdFor(barn, n, letter){
  if(!barn) return null;
  const want = String(n) + (letter ? letter.replace('a', 'а') : '');
  return PENS.find(p => p.barn === barn && norm(p.n) === norm(want))?.id || null;
}
function sexSpecies(sexText, catText){
  const s = norm(sexText), c = norm(catText); let sex = null, sp = null;
  if(/^(овца|ярка|ярочка|овцематка)/.test(s)){ sex = 'f'; sp = 'sheep'; }
  else if(/^(баран|баранчик)/.test(s)){ sex = 'm'; sp = 'sheep'; }
  else if(/^(коза|козочка|козоматка)/.test(s)){ sex = 'f'; sp = 'goat'; }
  else if(/^(козел|козлик)/.test(s)){ sex = 'm'; sp = 'goat'; }
  else if(/^(ж|самка|f)/.test(s)) sex = 'f';
  else if(/^(м|самец|m)/.test(s)) sex = 'm';
  if(!sex){ if(/баран|козел|производ|кастрат|баранчик|козлик/.test(c)) sex = 'm'; else if(/дойн|суягн|сукозн|холост|подсос|ярк|матк|козочк|ярочк/.test(c)) sex = 'f'; }
  if(!sp){ if(/суягн|ярк|ягнен|баран/.test(c)) sp = 'sheep'; else if(/сукозн|козлен|козел|коз/.test(c)) sp = 'goat'; }
  return {sex, sp};
}
function splitTag(raw){
  let t = String(raw ?? '').trim(); if(typeof raw === 'number') t = String(Math.round(raw));
  if(!t) return {tag:'', name:''};
  if(/^б\/?н$|^без ном/i.test(t)) return {tag:'', name:'', noTag:true};
  let m = t.match(/^(\d[\d\-\/]*)\s+([А-Яа-яЁёA-Za-z]{3,}.*)$/); if(m) return {tag:m[1], name:m[2].trim()};
  m = t.match(/^([А-Яа-яЁёA-Za-z]{3,}[А-Яа-яЁёA-Za-z ]*)\s+(\d[\d\-\/]*)$/); if(m) return {tag:m[2], name:m[1].trim()};
  return {tag:t, name:''};
}

// Разбор книги в план загрузки (ничего не записывает)
function buildImportPlan(sheets){
  const animals = [], issues = [], pens = {}, rationsFound = {}, births = [];
  const issue = (level, where, text) => issues.push({level, where, text});
  for(const sh of sheets){
    let barn = barnByText(sh.name), pen = null, penInfo = null, cols = null, headerRow = -1;
    // таблицы рационов: «Рацион №N», ниже строки «корм | % | г», в конце «… г на сутки»
    sh.rows.forEach((row, ri) => row.forEach((v, ci) => {
      const m = typeof v === 'string' && v.match(/^\s*рацион\s*№\s*(\d+)\s*$/i); if(!m) return;
      const head = sh.rows[ri + 1] || []; let gCol = -1;
      for(let k = ci; k <= ci + 4; k++) if(norm(head[k]) === 'г' || norm(head[k]) === 'гр') { gCol = k; break; }
      const items = []; let total = null;
      for(let rr = ri + 2; rr < ri + 20; rr++){
        const name = (sh.rows[rr] || [])[ci]; if(name == null || name === '') break;
        const tm = String(name).match(/(\d+[.,]?\d*)\s*(г|кг)\s*(в|на)\s*сут/i);
        if(tm){ total = parseFloat(tm[1].replace(',', '.')) * (tm[2].toLowerCase() === 'кг' ? 1000 : 1); break; }
        const g = gCol >= 0 ? +((sh.rows[rr] || [])[gCol]) : NaN;
        if(g > 0) items.push({name:String(name).trim(), g});
      }
      if(items.length && !rationsFound[m[1]]) rationsFound[m[1]] = {no:m[1], items, total, where:sh.name};
    }));
    for(let ri = 0; ri < sh.rows.length; ri++){
      const row = sh.rows[ri], where = `${sh.name}, строка ${ri + 1}`;
      const texts = row.map(v => v == null ? '' : String(v).trim());
      const filled = texts.filter(Boolean);
      if(!cols){
        const tagCol = texts.findIndex(t => HEAD.tag.test(norm(t)));
        if(tagCol >= 0){
          cols = {}; headerRow = ri;
          texts.forEach((t, ci) => { const x = norm(t); if(!x) return; for(const [k, re] of Object.entries(HEAD)) if(cols[k] == null && re.test(x)){ cols[k] = ci; break; } });
          cols.tag = tagCol;
        } else if(filled.length === 1 && barnByText(filled[0])) barn = barnByText(filled[0]);
        continue;
      }
      if(!filled.length) continue;
      const tagVal = row[cols.tag];
      // строка-раздел: «Загон № 3 Ярки» или «Карантин»
      if(tagVal == null || tagVal === ''){
        const first = filled[0];
        const b = barnByText(first);
        if(b && filled.length === 1){ barn = b; pen = null; penInfo = null; continue; }
        const pi = /загон/i.test(first) ? parsePenText(first) : null;
        if(pi){
          penInfo = pi; pen = penIdFor(barn, pi.n, pi.letter);
          if(!barn) issue('warn', where, `«${first}»: не понятно, к какому помещению относится загон — животные попадут «Без загона».`);
          else if(!pen) issue('warn', where, `${barn.name}: загона «${pi.n}${pi.letter}» нет в приложении — животные попадут «Без загона».`);
          else {
            const lbl = (pi.to ? `загоны ${pi.n}–${pi.to}` : '') + (pi.label ? (pi.to ? ': ' : '') + pi.label : '');
            pens[pen] = {label:lbl, rations:{}, heads:0};
            if(pi.to) for(let k = pi.n + 1; k <= pi.to; k++){ const other = penIdFor(barn, k, ''); if(other) pens[other] = {label:`вместе с загоном ${pi.n}`, rations:{}, heads:0, merged:true}; }
          }
          continue;
        }
        if(filled.some(t => /\d/.test(t)) && cols.cat != null && row[cols.cat]) issue('warn', where, 'Нет номера бирки — строка пропущена.');
        continue;
      }
      const {tag, name, noTag} = splitTag(tagVal);
      const catText = cols.cat != null ? String(row[cols.cat] ?? '').trim() : '';
      const sexText = cols.sex != null ? row[cols.sex] : '';
      let {sex, sp} = sexSpecies(sexText, catText);
      if(!sp && cols.species != null){ const v = norm(row[cols.species]); sp = /коз/.test(v) ? 'goat' : /овц|баран/.test(v) ? 'sheep' : null; }
      if(!sp) sp = barn?.id === 'k' ? 'goat' : 'sheep';
      const a = {
        tag, name: name || (cols.name != null ? String(row[cols.name] ?? '').trim() : ''), noTag, species:sp, sex:sex || 'f', sexGuess:!sex,
        cat:catText, birth: cols.birth != null ? xlDate(row[cols.birth]) : '', since: cols.since != null ? xlDate(row[cols.since]) : '',
        note: cols.note != null ? String(row[cols.note] ?? '').trim() : '', breed: cols.breed != null ? String(row[cols.breed] ?? '').trim() : '',
        motherTag: cols.mother != null ? String(row[cols.mother] ?? '').trim() : '', fatherTag: cols.father != null ? String(row[cols.father] ?? '').trim() : '',
        weight: cols.weight != null ? dec(row[cols.weight]) : NaN, rationNo: cols.ration != null ? String(row[cols.ration] ?? '').replace(/[^\d]/g, '') : '',
        pen, barn: barn?.name || '', where, sheet: sh.name, row: ri + 1
      };
      if(cols.pen != null && row[cols.pen] != null){ const pi = parsePenText('загон ' + row[cols.pen]); if(pi){ a.pen = penIdFor(barn, pi.n, pi.letter); } }
      if(cols.barn != null && row[cols.barn]){ const b = barnByText(row[cols.barn]); if(b && cols.pen != null){ const pi = parsePenText('загон ' + row[cols.pen]); if(pi) a.pen = penIdFor(b, pi.n, pi.letter); } }
      if(a.pen && pens[a.pen]){ pens[a.pen].heads++; if(a.rationNo) pens[a.pen].rations[a.rationNo] = (pens[a.pen].rations[a.rationNo] || 0) + 1; }
      const om = a.note.match(/окот\w*\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/i);
      if(om) births.push({motherIdx:animals.length, date:xlDate(om[1]), kidTags:(a.note.slice(om.index + om[0].length).match(/\d{2,}[\d\-]*/g) || [])});
      animals.push(a);
    }
    if(!cols) issue('warn', sh.name, 'Не найдена строка с заголовком «№ бирки» — лист пропущен.');
  }
  // номера без бирки
  let bn = 0; const used = new Set([...animals.map(a => norm(a.tag)), ...S.animals.map(a => norm(a.tag))]);
  animals.filter(a => a.noTag).forEach(a => { do { bn++; a.tag = `б/н-${bn}`; } while(used.has(norm(a.tag))); used.add(norm(a.tag)); a.note = [a.note, 'в файле без номера бирки'].filter(Boolean).join('; '); issue('info', a.where, `Без номера бирки — записана как ${a.tag}.`); });
  // повторы в файле
  const seen = {};
  animals.forEach(a => {
    const key = a.species + '|' + norm(a.tag), other = seen[key];
    if(other){ a.skip = true; issue('warn', a.where, `Бирка ${a.tag} (${SPECIES[a.species].toLowerCase()}) уже есть: ${other.where}${other.pen ? ' — ' + penLong(other.pen) : ''}. Повтор пропущен, проверьте, где животное на самом деле.`); }
    else seen[key] = a;
  });
  const bySpeciesTag = {}; animals.filter(a => !a.skip).forEach(a => (bySpeciesTag[norm(a.tag)] ||= []).push(a));
  Object.values(bySpeciesTag).filter(l => l.length > 1).forEach(l => issue('info', l.map(a => a.where).join(' и '), `Бирка ${l[0].tag} есть и у овцы, и у козы — загружены оба животных.`));
  animals.filter(a => !a.skip && a.sexGuess).forEach(a => issue('info', a.where, `Бирка ${a.tag}: пол не указан — записана как самка, поправьте при необходимости.`));
  animals.filter(a => !a.skip && !a.pen).forEach(a => issue('warn', a.where, `Бирка ${a.tag}: загон не определён — попадёт «Без загона».`));
  // совпадения с тем, что уже есть в приложении
  animals.filter(a => !a.skip).forEach(a => { a.existing = S.animals.find(x => x.status === 'active' && x.species === a.species && norm(x.tag) === norm(a.tag)) || null; });
  // рационы по загонам — по большинству животных
  Object.values(pens).forEach(p => { const e = Object.entries(p.rations).sort((x, y) => y[1] - x[1]); p.ration = e[0]?.[0] || null; p.mixed = e.length > 1; });
  Object.entries(pens).forEach(([id, p]) => { if(p.mixed) issue('info', penLong(id), `В загоне животные с разными рационами (${Object.entries(p.rations).map(([k, n]) => `№${k}: ${n}`).join(', ')}) — назначен №${p.ration}.`); });
  Object.values(rationsFound).forEach(r => { const sum = r.items.reduce((s, x) => s + x.g, 0); if(r.total && Math.abs(sum - r.total) > 1) issue('warn', `Рацион №${r.no}`, `Сумма кормов ${sum} г, а в итоге указано ${r.total} г на сутки. Загружено ${sum} г — проверьте состав.`); });
  const usedNos = new Set(Object.values(pens).map(p => p.ration).filter(Boolean));
  usedNos.forEach(no => { if(!rationsFound[no]) issue('info', `Рацион №${no}`, 'Состав не найден в файле — рацион не создаётся, назначьте вручную.'); });
  return {animals, issues, pens, rations:rationsFound, births};
}

// Запись плана в базу
function applyImportPlan(plan, opt){
  const list = plan.animals.filter(a => !a.skip);
  const ids = list.map(a => a.existing ? a.existing.id : S.be.newId('animals'));
  const idx = new Map(list.map((a, i) => [a, i]));
  const byTag = {}; list.forEach((a, i) => (byTag[norm(a.tag)] ||= []).push(i));
  const findId = (t, sp) => { const l = byTag[norm(t)] || []; const i = l.find(k => list[k].species === sp) ?? l[0]; if(i != null) return ids[i]; return S.animals.find(x => norm(x.tag) === norm(t))?.id || ''; };
  let created = 0, updated = 0;
  list.forEach((a, i) => {
    const data = {tag:a.tag, species:a.species, sex:a.sex, status:'active', pen:a.pen || ''};
    for(const k of ['name','cat','birth','since','note','breed','rationNo']) if(a[k]) data[k] = a[k];
    if(a.rationNo) data.rationNo = '№' + a.rationNo;
    if(a.motherTag){ const m = findId(a.motherTag, a.species); if(m) data.motherId = m; else data.motherText = a.motherTag; }
    if(a.fatherTag){ const f = findId(a.fatherTag, a.species); if(f) data.fatherId = f; else data.fatherText = a.fatherTag; }
    if(a.existing){ store.merge('animals', ids[i], data); updated++; }
    else { store.set('animals', ids[i], {...data, by:S.uid||null, byEmail:S.email||null, created:Date.now(), source:'excel'}); created++; }
    if(a.weight > 0) store.add('events', {animalIds:[ids[i]], type:'weight', date:a.since || today(), weight:round(a.weight, 1), note:'из Excel'});
  });
  let birthsMade = 0;
  if(opt.births) plan.births.forEach(b => {
    const mom = plan.animals[b.motherIdx]; if(mom.skip || !b.date) return;
    const mid = ids[idx.get(mom)], kids = b.kidTags.map(t => { const l = byTag[norm(t)] || []; return l.find(k => list[k].species === mom.species); }).filter(k => k != null);
    store.add('events', {animalIds:[mid], type:'birth', date:b.date, count:kids.length || b.kidTags.length, note:'из Excel: ' + mom.note});
    kids.forEach(k => store.merge('animals', ids[k], {motherId:mid, ...(list[k].birth ? {} : {birth:b.date})}));
    birthsMade++;
  });
  if(opt.labels) Object.entries(plan.pens).forEach(([pid, p]) => { if(p.label) store.merge('pens', pid, {label:p.label}); });
  let rationsMade = 0;
  if(opt.rations){
    const items = [...S.items]; const itemId = name => {
      const nn = norm(name).replace(/[^a-zа-я0-9 ]/g, '');
      const ex = items.find(i => i.cat === 'feed' && norm(i.name).replace(/[^a-zа-я0-9 ]/g, '') === nn); if(ex) return ex.id;
      const id = store.add('items', {name:name.charAt(0).toUpperCase() + name.slice(1), unit:'кг', cat:'feed'}); items.push({id, name, cat:'feed'}); return id;
    };
    const rid = {};
    Object.values(plan.rations).forEach(r => {
      const name = `Рацион №${r.no}`, data = {name, mode:'head', items:r.items.map(x => ({item:itemId(x.name), qty:round(x.g / 1000, 3)})), note:'из Excel'};
      const ex = S.rations.find(x => norm(x.name) === norm(name));
      if(ex){ store.set('rations', ex.id, {...strip(ex), ...data}); rid[r.no] = ex.id; } else rid[r.no] = store.add('rations', data);
      rationsMade++;
    });
    let any = false;
    Object.entries(plan.pens).forEach(([pid, p]) => { if(p.ration && rid[p.ration]){ store.merge('pens', pid, {ration:rid[p.ration]}); any = true; } });
    if(any) ensureFeedStart();
  }
  return {created, updated, birthsMade, rationsMade};
}

/* ----- Загрузка журнала молока и склада кормов ----- */
const xlNum = v => { if(v == null || v === '') return null; const n = typeof v === 'number' ? v : dec(String(v)); return isFinite(n) ? n : null; };
const headerAt = (rows, re, maxRow = 10) => { for(let i = 0; i < Math.min(rows.length, maxRow); i++) if((rows[i] || []).some(v => re.test(norm(v)))) return i; return -1; };
const colOf = (head, re) => head.findIndex(v => re.test(norm(v)));
function fileKind(sheets){
  const names = sheets.map(s => norm(s.name));
  if(sheets.some(s => /молок/.test(norm(s.name)) && headerAt(s.rows, /утрен/) >= 0)) return 'milk';
  if(names.includes('справочник') && (names.includes('приход') || names.includes('расход'))) return 'feed';
  return 'herd';
}
// Журнал молока: листы «Козье молоко» / «Овечье молоко», столбцы Дата | Утренний | Вечерний | Выпойка | Забрано | Остаток
function buildMilkPlan(sheets){
  const sp = [], issues = [];
  for(const sh of sheets){
    const n = norm(sh.name), species = /коз/.test(n) ? 'goat' : /овеч|овц/.test(n) ? 'sheep' : null;
    const hr = headerAt(sh.rows, /утрен/); if(!species || hr < 0) continue;
    const h = sh.rows[hr], c = {date:colOf(h, /^дата/), am:colOf(h, /утрен/), pm:colOf(h, /вечер/), feed:colOf(h, /выпойк/), out:colOf(h, /забран|отгруж|сдан/), bal:colOf(h, /остат/), note:colOf(h, /примеч/)};
    const days = []; let open = null, ya = 0, oa = 0;
    for(let ri = hr + 1; ri < sh.rows.length; ri++){
      const r = sh.rows[ri] || [], date = xlDate(r[c.date]); if(!date) continue;
      const g = k => c[k] >= 0 ? xlNum(r[c[k]]) : null;
      const d = {date, am:g('am'), pm:g('pm'), feed:g('feed'), out:g('out'), note:c.note >= 0 ? String(r[c.note] ?? '').trim() : ''};
      if(d.am == null && d.pm == null && !d.feed && !d.out) continue;
      days.push(d); ya += (d.am||0) + (d.pm||0); oa += (d.feed||0) + (d.out||0);
      const bal = g('bal'); if(open == null && bal != null) open = round(bal - ya + oa, 2);
      d.bal = bal;
    }
    if(!days.length) continue;
    days.sort((a, b) => a.date.localeCompare(b.date));
    const yieldSum = round(days.reduce((s, d) => s + (d.am||0) + (d.pm||0), 0), 2), outSum = round(days.reduce((s, d) => s + (d.out||0), 0), 2), feedSum = round(days.reduce((s, d) => s + (d.feed||0), 0), 2);
    open = open != null && open > 0.05 ? open : 0;
    const last = days.filter(d => d.bal != null).pop(), calc = round(open + yieldSum - outSum - feedSum, 2);
    if(last && Math.abs(last.bal - calc) > 0.2) issues.push({level:'warn', where:sh.name, text:`По файлу в танке на ${fmtD(last.date)} — ${num(last.bal)} л, а по надоям и отгрузкам выходит ${num(calc)} л.`});
    days.forEach(d => { for(const ss of ['am','pm']){ const m = milkDoc(d.date, ss, species); if(!m || d[ss] == null) continue;
      const ph = Object.values(m.yields||{}).reduce((a, b) => a + (+b||0), 0), cur = milkTotal(m);
      if(ph > d[ss] + 1e-9) issues.push({level:'warn', where:`${sh.name}, ${fmtD(d.date)}`, text:`${SESS[ss]}: в приложении по головам уже ${num(ph)} л, в файле ${num(d[ss])} л — эта дойка не меняется.`});
      else if(Math.abs(cur - d[ss]) > 1e-9) issues.push({level:'info', where:`${sh.name}, ${fmtD(d.date)}`, text:`${SESS[ss]}: в приложении было ${num(cur)} л, станет ${num(d[ss])} л, как в файле.`}); } });
    sp.push({species, sheet:sh.name, days, open, yieldSum, outSum, feedSum, end:calc, from:days[0].date, to:days[days.length-1].date});
  }
  return {sp, issues};
}
function applyMilkPlan(plan){
  let docs = 0, outs = 0;
  for(const s of plan.sp){
    if(s.open > 0){ const d0 = addDays(s.from, -1), id = milkId(d0, 'am', s.species), m = milkDoc(d0, 'am', s.species);
      if(!m || Math.abs(milkTotal(m) - s.open) > 1e-9){ store.merge('milk', id, {date:d0, session:'am', species:s.species, extra:s.open, note:'Остаток в танке на начало (из Excel)'}); docs++; } }
    for(const d of s.days){
      for(const ss of ['am','pm']){
        if(d[ss] == null) continue;
        const m = milkDoc(d.date, ss, s.species), ph = m ? Object.values(m.yields||{}).reduce((a, b) => a + (+b||0), 0) : 0;
        if(ph > d[ss] + 1e-9 || (m && Math.abs(milkTotal(m) - d[ss]) < 1e-9)) continue;
        store.merge('milk', milkId(d.date, ss, s.species), {date:d.date, session:ss, species:s.species, extra:round(d[ss] - ph, 2)}); docs++;
      }
      for(const [k, kind] of [['out','cheese'], ['feed','feed']]){
        if(!(d[k] > 0)) continue;
        const id = `xl-${s.species}-${d.date}-${kind}`, q = round(d[k], 2);
        const dup = S.milkout.find(o => o.id === id || (o.species === s.species && o.date === d.date && o.kind === kind && Math.abs(+o.liters - q) < 1e-9));
        if(dup) continue;
        store.set('milkout', id, {species:s.species, kind, liters:q, date:d.date, to: kind === 'cheese' ? 'Сыроварня' : '', note:[d.note, 'из Excel'].filter(Boolean).join(' · '), byEmail:S.email||null}); outs++;
      }
    }
  }
  return {docs, outs};
}
// Склад кормов: листы «Справочник» (Код | Наименование | Ед. изм.), «Приход», «Расход», «Остатки»
const feedKey = s => norm(s).replace(/^(к-к|комбикорм)\s*/, '').replace(/[^a-zа-я0-9]/g, '').replace(/(.)\1+/g, '$1');
function buildFeedPlan(sheets){
  const by = n => sheets.find(s => norm(s.name) === n), issues = [];
  const dir = {}, sp = by('справочник');
  if(sp){ const hr = Math.max(0, headerAt(sp.rows, /наимен/)), h = sp.rows[hr] || [], cc = colOf(h, /^код/), cn = colOf(h, /наимен/), cu = colOf(h, /ед/);
    for(let ri = hr + 1; ri < sp.rows.length; ri++){ const r = sp.rows[ri] || [], code = String(r[cc] ?? '').trim(), name = String(r[cn] ?? '').trim();
      if(code && name && name !== '0') dir[code] = {code, name, unit:String(r[cu] ?? '').trim() || 'кг'}; } }
  const moves = [], keys = {};
  for(const [sheet, kind] of [['приход','in'], ['расход','out']]){
    const sh = by(sheet); if(!sh) continue;
    const hr = Math.max(0, headerAt(sh.rows, /^дата/)), h = sh.rows[hr] || [];
    const c = {date:colOf(h, /^дата/), code:colOf(h, /^код/), qty:colOf(h, /кол-?во|количеств/), unit:colOf(h, /^ед/), sup:colOf(h, /поставщ/), doc:colOf(h, /документ/), act:colOf(h, /акт|бригадир/), group:colOf(h, /групп/), note:colOf(h, /примеч/)};
    for(let ri = hr + 1; ri < sh.rows.length; ri++){
      const r = sh.rows[ri] || [], code = String(r[c.code] ?? '').trim(), qty = xlNum(r[c.qty]), date = xlDate(r[c.date]);
      if(!code && qty == null) continue;
      const where = `${sh.name}, строка ${ri + 1}`;
      if(!dir[code]){ issues.push({level:'warn', where, text:`Код «${code}» не найден в справочнике — строка пропущена.`}); continue; }
      if(!(qty > 0)){ if(qty !== 0) issues.push({level:'warn', where, text:'Не указано количество — строка пропущена.'}); continue; }
      if(!date){ issues.push({level:'warn', where, text:'Не указана дата — строка пропущена.'}); continue; }
      const t = v => c[v] >= 0 ? String(r[c[v]] ?? '').trim() : '';
      const note = (kind === 'in' ? [t('sup'), t('doc') ? '№' + t('doc') : '', t('note')] : [t('group'), t('act'), t('note')]).filter(Boolean).join(' · ');
      let k = `${kind}-${date}-${code}-${qty}`; keys[k] = (keys[k] || 0) + 1; k += '-' + keys[k];
      moves.push({key:k.replace(/[^\w.-]/g, '_'), kind, code, qty:round(qty, 3), date, note});
    }
  }
  // сопоставление с кормами в приложении
  const items = Object.values(dir).map(d => {
    const ex = S.items.find(i => i.cat === 'feed' && feedKey(i.name) === feedKey(d.name));
    const used = ex && (S.moves.some(m => m.item === ex.id) || S.rations.some(r => (r.items||[]).some(x => x.item === ex.id)) || S.feedauto.some(f => f.items && f.items[ex.id]));
    let mode = 'new';
    if(ex) mode = norm(ex.unit) === norm(d.unit) ? 'same' : used ? 'newunit' : 'relabel';
    return {...d, ex, mode, inQ:0, outQ:0};
  });
  const byCode = Object.fromEntries(items.map(i => [i.code, i]));
  moves.forEach(m => { const it = byCode[m.code]; if(m.kind === 'in') it.inQ += m.qty; else it.outQ += m.qty; m.dup = S.moves.some(x => x.id === 'xl-' + m.key); });
  items.forEach(i => { if(i.mode === 'newunit') issues.push({level:'warn', where:i.name, text:`В приложении «${i.ex.name}» ведётся в «${i.ex.unit}», а в файле — в «${i.unit}». Будет заведён отдельный корм «${i.name} (${i.unit})».`}); });
  const os = by('остатки');
  if(os){ const hr = Math.max(0, headerAt(os.rows, /остат/)), h = os.rows[hr] || [], cc = colOf(h, /^код/), cb = colOf(h, /^остат/);
    for(let ri = hr + 1; ri < os.rows.length; ri++){ const r = os.rows[ri] || [], it = byCode[String(r[cc] ?? '').trim()], b = xlNum(r[cb]);
      if(it && b != null && Math.abs(b - (it.inQ - it.outQ)) > 0.01) issues.push({level:'warn', where:`Остатки, ${it.name}`, text:`В листе «Остатки» ${num(b)} ${it.unit}, а по приходу и расходу выходит ${num(it.inQ - it.outQ)} ${it.unit}. Загрузится ${num(it.inQ - it.outQ)} — проверьте, не пропущена ли строка.`}); } }
  const dates = moves.filter(m => m.kind === 'out').map(m => m.date).sort(), from = dates[0], to = dates[dates.length - 1];
  const autoDays = from ? S.feedauto.filter(f => !f.skipped && f.date >= from && f.date <= to && Object.keys(f.items||{}).length).map(f => f.date).sort() : [];
  if(RATIONS_ON && autoDays.length) issues.push({level:'warn', where:'Автосписание', text:`За ${autoDays.map(fmtShort).join(', ')} приложение уже списало корма по рационам, а в файле есть расход за эти же дни. Если это один и тот же корм, отмените автосписание за эти дни в «Склад → Журнал списаний».`});
  return {items: items.filter(i => i.inQ || i.outQ || i.mode === 'new'), moves, issues};
}
function applyFeedPlan(plan){
  const idOf = {}; let made = 0, n = 0;
  plan.items.forEach(i => {
    if(i.mode === 'same') idOf[i.code] = i.ex.id;
    else if(i.mode === 'relabel'){ store.merge('items', i.ex.id, {unit:i.unit}); idOf[i.code] = i.ex.id; }
    else { const id = S.be.newId('items'); store.set('items', id, {name: i.mode === 'newunit' ? `${i.name} (${i.unit})` : i.name, unit:i.unit, cat:'feed', code:i.code, byEmail:S.email||null}); idOf[i.code] = id; made++; }
  });
  plan.moves.forEach(m => { if(m.dup || !idOf[m.code]) return; store.set('moves', 'xl-' + m.key, {item:idOf[m.code], kind:m.kind, qty:m.qty, date:m.date, note:m.note || (m.kind === 'in' ? 'из Excel' : ''), source:'excel', byEmail:S.email||null}); n++; });
  return {made, n};
}
const issuesHtml = issues => { const w = issues.filter(i => i.level === 'warn'), f = issues.filter(i => i.level !== 'warn');
  return (w.length ? `<details class="issues" open><summary>Проверьте: ${w.length}</summary><ul>${w.map(i => `<li><b>${esc(i.where)}</b> — ${esc(i.text)}</li>`).join('')}</ul></details>` : '')
    + (f.length ? `<details class="issues info"><summary>Замечания: ${f.length}</summary><ul>${f.map(i => `<li><b>${esc(i.where)}</b> — ${esc(i.text)}</li>`).join('')}</ul></details>` : ''); };
function milkImportView(res, plan, fname){
  if(!plan.sp.length){ res.innerHTML = `<p class="err">Не нашлось листов «Козье молоко» / «Овечье молоко» со столбцами «Утренний надой» и «Вечерний надой».</p>`; return; }
  res.innerHTML = plan.sp.map(s => `<div class="panel"><div class="eyebrow">${MILKNAME[s.species]} молоко · ${fmtShort(s.from)} – ${fmtShort(s.to)}</div>
      <div class="kv"><span>Дней</span><strong>${s.days.length}</strong></div>
      ${s.open ? `<div class="kv"><span>В танке на начало</span><strong>${num(s.open)} л</strong></div>` : ''}
      <div class="kv"><span>Надоено</span><strong>${num(s.yieldSum)} л</strong></div>
      <div class="kv"><span>Отгружено на сыроварню</span><strong>−${num(s.outSum)} л</strong></div>
      ${s.feedSum ? `<div class="kv"><span>Выпойка молодняку</span><strong>−${num(s.feedSum)} л</strong></div>` : ''}
      <div class="kv total"><span>Остаток на ${fmtShort(s.to)}</span><strong>${num(s.end)} л</strong></div></div>`).join('')
    + issuesHtml(plan.issues)
    + `<p class="muted" style="margin:0">Надои записываются общими литрами за утро и вечер. Повторная загрузка того же файла ничего не задвоит.</p>
    <div class="actions"><button class="btn primary" id="imgo">Загрузить молоко</button></div>`;
  res.querySelector('#imgo').onclick = () => {
    const b = res.querySelector('#imgo'); b.disabled = true; b.textContent = 'Загружаем…';
    const r = silently(() => applyMilkPlan(plan));
    journalNote(`Загрузка молока из Excel «${fname}»: доек ${r.docs}, отгрузок ${r.outs}`);
    toast(`Молоко загружено: доек ${r.docs}, отгрузок ${r.outs}`); closeSheet(); S.milkDate = plan.sp[0].to; go('milk');
  };
}
function feedImportView(res, plan, fname){
  if(!plan.moves.length){ res.innerHTML = `<p class="err">Не нашлось строк прихода или расхода. Нужны листы «Справочник», «Приход», «Расход».</p>` + issuesHtml(plan.issues); return; }
  const nNew = plan.moves.filter(m => !m.dup).length, mode = {same:'уже есть', relabel:'есть, ед. изм. поменяется', newunit:'новый', new:'новый'};
  res.innerHTML = `<div class="stats"><div class="stat"><div class="v">${plan.moves.filter(m => m.kind === 'in').length} / ${plan.moves.filter(m => m.kind === 'out').length}</div><div class="l">строк прихода / расхода${nNew < plan.moves.length ? ` · ${plan.moves.length - nNew} уже загружены` : ''}</div></div>
      <div class="stat"><div class="v">${plan.items.length}</div><div class="l">кормов</div></div></div>
    <div class="panel"><div class="eyebrow">Остаток после загрузки</div>${plan.items.map(i => `<div class="kv"><span>${esc(i.name)} <span class="muted">· ${mode[i.mode]}</span></span><strong>${num(round(i.inQ - i.outQ, 2))} ${esc(i.unit)}</strong></div>`).join('')}</div>
    ${issuesHtml(plan.issues)}
    <div class="actions"><button class="btn primary" id="imgo" ${nNew ? '' : 'disabled'}>${nNew ? `Загрузить ${nNew} ${plural(nNew, 'запись', 'записи', 'записей')}` : 'Всё уже загружено'}</button></div>`;
  res.querySelector('#imgo').onclick = () => {
    const b = res.querySelector('#imgo'); b.disabled = true; b.textContent = 'Загружаем…';
    const r = silently(() => applyFeedPlan(plan));
    journalNote(`Загрузка склада кормов из Excel «${fname}»: операций ${r.n}, новых кормов ${r.made}`);
    toast(`Склад загружен: операций ${r.n}${r.made ? `, новых кормов ${r.made}` : ''}`); closeSheet(); S.stockCat = 'feed'; go('stock');
  };
}

function importSheet(){
  const body = `<p class="muted" style="margin:0">Можно загрузить три вида файлов: список животных, журнал молока (листы «Козье молоко», «Овечье молоко») и склад кормов (листы «Справочник», «Приход», «Расход»). Приложение само поймёт, что за файл.</p>
    <p class="muted" style="margin:0">Для списка животных приложение само найдёт столбцы «№ бирки», «Категория», «Пол», «Дата рождения», «Примечание» и строки «Загон № …». Листы называйте как помещения: «Овчарня 1», «Овчарня 2», «Козлятник»; раздел «Карантин» можно вести внутри листа.</p>
    <label class="btn primary filebtn"><input type="file" id="imf" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">Выбрать файл</label>
    <div id="imres"></div>`;
  openSheet('Загрузка из Excel', body, s => {
    const inp = s.querySelector('#imf'), res = s.querySelector('#imres');
    inp.onchange = async () => {
      const f = inp.files[0]; if(!f) return;
      res.innerHTML = `<p class="muted">Читаем «${esc(f.name)}»…</p>`;
      let plan;
      try{
        if(!/\.xlsx$/i.test(f.name)) throw new Error('ext');
        const sheets = await readXlsx(await f.arrayBuffer()), kind = fileKind(sheets);
        if(kind === 'milk') return milkImportView(res, buildMilkPlan(sheets), f.name);
        if(kind === 'feed') return feedImportView(res, buildFeedPlan(sheets), f.name);
        plan = buildImportPlan(sheets);
      }catch(e){
        res.innerHTML = `<p class="err">${e.message === 'ext' || e.message === 'not_xlsx' ? 'Это не файл .xlsx. Откройте его в Excel и сохраните как «Книга Excel (.xlsx)».' : 'Не удалось прочитать файл: ' + esc(e.message || 'ошибка')}</p>`;
        return;
      }
      const list = plan.animals.filter(a => !a.skip);
      if(!list.length){ res.innerHTML = `<p class="err">В файле не нашлось животных. Нужна строка заголовков со столбцом «№ бирки».</p>`; return; }
      const nNew = list.filter(a => !a.existing).length, nUpd = list.length - nNew;
      const byPen = {}; list.forEach(a => { const k = a.pen || ''; byPen[k] = (byPen[k] || 0) + 1; });
      const warns = plan.issues.filter(i => i.level === 'warn'), infos = plan.issues.filter(i => i.level === 'info');
      const rCount = Object.keys(plan.rations).length;
      res.innerHTML = `
        <div class="stats"><div class="stat"><div class="v">${list.length}</div><div class="l">животных в файле${nUpd ? ` · ${nUpd} уже есть, обновятся` : ''}</div></div>
          <div class="stat"><div class="v">${list.filter(a => a.species === 'sheep').length} / ${list.filter(a => a.species === 'goat').length}</div><div class="l">овец / коз</div></div></div>
        <div class="panel"><div class="eyebrow">Куда попадут</div>
          ${BARNS.map(b => { const ps = PENS.filter(p => p.barn === b && byPen[p.id]); if(!ps.length) return ''; return `<div class="kv"><span>${b.name}</span><strong>${heads(ps.reduce((x, p) => x + byPen[p.id], 0))}</strong></div><p class="muted" style="margin:0 0 4px">${ps.map(p => `${p.n}${plan.pens[p.id]?.label ? ' (' + esc(plan.pens[p.id].label) + ')' : ''} — ${byPen[p.id]}`).join(' · ')}</p>`; }).join('')}
          ${byPen[''] ? `<div class="kv"><span>Без загона</span><strong>${heads(byPen[''])}</strong></div>` : ''}
        </div>
        ${warns.length ? `<details class="issues" open><summary>Проверьте: ${warns.length}</summary><ul>${warns.map(i => `<li><b>${esc(i.where)}</b> — ${esc(i.text)}</li>`).join('')}</ul></details>` : ''}
        ${infos.length ? `<details class="issues info"><summary>Замечания: ${infos.length}</summary><ul>${infos.map(i => `<li><b>${esc(i.where)}</b> — ${esc(i.text)}</li>`).join('')}</ul></details>` : ''}
        <div class="list">
          <label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="im-labels" checked><span>Подписать загоны названиями из файла <span class="muted">(«Дойные», «Ярки»…)</span></span></label>
          ${plan.births.length ? `<label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="im-births" checked><span>Записать окоты из примечаний: ${plan.births.length}</span></label>` : ''}
        </div>
        <div class="actions"><button class="btn primary" id="imgo">Загрузить ${heads(list.length)}</button></div>`;
      res.querySelector('#imgo').onclick = () => {
        const btn = res.querySelector('#imgo'); btn.disabled = true; btn.textContent = 'Загружаем…';
        const r = silently(() => applyImportPlan(plan, {labels:res.querySelector('#im-labels')?.checked, births:res.querySelector('#im-births')?.checked, rations:res.querySelector('#im-rations')?.checked}));
        journalNote(`Загрузка из Excel «${f.name}»: новых ${r.created}, обновлено ${r.updated}${r.birthsMade ? ', окотов ' + r.birthsMade : ''}${r.rationsMade ? ', рационов ' + r.rationsMade : ''}`);
        toast(`Загружено: новых ${r.created}, обновлено ${r.updated}${r.birthsMade ? `, окотов ${r.birthsMade}` : ''}${r.rationsMade ? `, рационов ${r.rationsMade}` : ''}`);
        closeSheet(); S.herdMode = 'pens'; go('herd');
      };
    };
  }, 'import');
}

/* ===== Старт ===== */
boot();
window.OTARA = {S, PEN, feedUse, byId, itemById, rationById, purgeRations}; // для отладки
