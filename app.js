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
const penShort = id => PEN[id] ? `${PEN[id].barn.name}, загон ${PEN[id].n}` : '';
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
  ill:{t:'Лечение', vet:1}, vac:{t:'Вакцинация', vet:1}, treat:{t:'Дегельминтизация', vet:1}, vit:{t:'Витаминизация', vet:1}, birth:{t:'Окот'},
  weight:{t:'Взвешивание'}, mating:{t:'Случка'}, shear:{t:'Стрижка'}, other:{t:'Другое'},
  dose:{t:'Процедура по схеме', hide:1}, result:{t:'Результат лечения', hide:1}
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
const SKIP_F = new Set(['scheme','outcomes','steps','course','prevCourse','schemeName','list','text','names','updated','updatedBy','updatedByEmail','created','by','byEmail','groupSince','groupAuto','demo','source','yields','rationNo','cat','motherText','fatherText']);
const FIELD = {tag:'бирка', name:'кличка', species:'вид', sex:'пол', pen:'загон', group:'группа', status:'статус', birth:'дата рождения', breed:'порода',
  motherId:'мать', fatherId:'отец', note:'заметка', outDate:'дата выбытия', since:'в загоне с', type:'событие', date:'дата', drug:'препарат', dose:'доза',
  nextDate:'повтор', doneNext:'повтор сделан', weight:'вес', sireId:'производитель', count:'приплод', animalIds:'животные', kind:'тип', qty:'количество',
  item:'позиция', vehicle:'транспорт', price:'сумма', amount:'сумма', category:'статья', liters:'литры', to:'получатель', extra:'общий надой', session:'дойка',
  label:'назначение', ration:'рацион', items:'состав', mode:'норма', unit:'единица', plate:'госномер', trailer:'номер прицепа', vtype:'тип техники', gsm:'в ГСМ', who:'кто заправлял / выдал', expiry:'годен до', min:'мин. остаток', route:'как вводить', days:'дней', info:'особенности', withdrawal:'срок ожидания', series:'серия', number:'номер', paused:'пауза', from:'с даты', skipped:'не списывать', locked:'исправлено вручную'};
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
    case 'events': return `${ET[d.type]?.t || 'Событие'}${d.scheme ? ' «' + d.scheme.name + '»' : d.type === 'dose' ? ', день ' + d.day : ''}${(d.animalIds||[]).length===1 && byId(d.animalIds[0]) ? ' · №' + byId(d.animalIds[0]).tag : (d.animalIds||[]).length > 1 ? ` · ${d.animalIds.length} гол.` : ''}`;
    case 'milk': return `Надой ${d.date ? fmtShort(d.date) : ''}, ${(SESS[d.session]||'').toLowerCase()}, ${MILKNAME[d.species]?.toLowerCase()||''}: ${num(milkTotal(d))} л`;
    case 'milkout': return `${MILKOUT[d.kind] || 'Отгрузка молока'}: ${MILKNAME[d.species]?.toLowerCase()||''} ${num(d.liters)} л`;
    case 'moves': { const it = itemById(d.item); return `${d.kind==='in' ? 'Приход' : 'Расход'}: ${it?.name || '?'} ${num(d.qty)} ${it?.unit || ''}${d.vehicle ? ' → ' + (itemById(d.vehicle)?.name || '') : ''}`; }
    case 'finance': return `${d.kind==='income' ? 'Доход' : 'Расход'}: ${d.category || ''} ${money(+d.amount||0)}`;
    case 'items': return `${d.cat==='vehicle' ? 'Техника' : d.cat==='fuel' ? 'Топливо' : d.cat==='vet' ? 'Препарат' : 'Корм'}: ${d.name || ''}`;
    case 'rations': return `Рацион «${d.name || ''}»`;
    case 'pens': return penLong(d.id || '');
    case 'settings': return d.list ? 'Схемы лечения и обработок' : d.id === 'people' || d.names ? 'Имена пользователей' : d.text != null ? 'Рационы в табеле кормления' : 'Настройки';
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
      items.push({kind:'vet', date:e.nextDate, ev:e, title:repeatTitle(e),
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
const NAV_OF = {daily:'home', events:'home', plan:'home', vet:'herd', people:'more', feedsheet:'more', log:'more', home:'home', herd:'herd', pens:'herd', milk:'milk', stock:'stock', more:'more', money:'more', stats:'more'};
function updateClock(){ const c = $('#clock'); if(!c) return; const d = new Date(); c.innerHTML = `<b>${d.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'}).replace(/\s*г\.?$/, '')}</b>${pad(d.getHours())}:${pad(d.getMinutes())}`; }
setInterval(updateClock, 30000);
function render(){
  const v = $('#view'), live = S.mode==='live';
  $('nav.tabs').hidden = !live;
  if(!live){ $('#fab').hidden = true; v.innerHTML = gateView(); bindGate(); return; }
  const plan = planItems();
  const urgent = plan.filter(i => daysBetween(today(), i.date) <= 7).length;
  const b = $('#moreBadge'); b.hidden = true;
  const ownBtn = document.querySelector(`nav.tabs button[data-tab="${S.tab}"]`), navKey = ownBtn && ownBtn.offsetParent ? S.tab : NAV_OF[S.tab];
  document.querySelectorAll('nav.tabs button').forEach(x => x.dataset.tab===navKey ? x.setAttribute('aria-current','page') : x.removeAttribute('aria-current'));
  v.classList.toggle('wide', S.tab==='home');
  { const n = todayCount(), eb = $('#evBadge'); if(eb){ eb.hidden = !n; eb.textContent = n; } }
  { const w = $('#who'); if(w){ w.hidden = !S.email; w.innerHTML = S.email ? `<b>${esc(whoName(S.email))}</b>${S.admin ? 'Администратор' : 'Сотрудник'}` : ''; } }
  updateClock();
  $('#fab').hidden = !['herd','milk','stock','plan','money'].includes(S.tab) || (S.tab==='herd' && S.herdMode==='pens');
  let html = '';
  if(S.demo) html += `<div class="banner">Демо-режим: всё хранится только в этом браузере.${S.animals.some(a => a.demo) ? ` Сейчас открыт пример хозяйства. <button class="link adm" data-act="clear-demo">Очистить пример</button>` : ''}</div>`;
  html += ({daily:dailyView, log:logView, people:peopleView, feedsheet:feedSheetView, vet:vetView, events:eventsView, home:homeView, herd:() => herdTabs() + (S.herdMode==='pens' ? pensView() : herdView()), pens:() => { S.tab='herd'; S.herdMode='pens'; return herdTabs() + pensView(); }, milk:milkView, stock:stockView, more:moreView, plan:()=>planView(plan), money:moneyView, stats:statsView})[S.tab]();
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
      <div class="loginbrand"><img src="icons/logo-round.png" alt=""><div><div class="eyebrow">Учёт овец и коз</div><h1>Берегиня</h1></div></div>
      <p>Войдите учётной записью, которую создал владелец хозяйства. Входить нужно с интернетом, дальше приложение работает и без него.</p>
      ${fld('l-email','Эл. почта',`<input id="l-email" name="email" type="email" autocomplete="username" required>`)}
      ${fld('l-pass','Пароль',`<input id="l-pass" name="password" type="password" autocomplete="current-password" required>`)}
      <p class="err" id="lerr" hidden></p>
      <button class="btn primary" type="submit">Войти</button></form>`;
    case 'noconfig': return `<div class="login"><div class="loginbrand"><img src="icons/logo-round.png" alt=""><div><div class="eyebrow">Учёт овец и коз</div><h1>Берегиня</h1></div></div>
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
  h += `<div class="field"><div class="kv"><label for="lg-who">Кто</label><button class="link" data-tab-go="people">Имена пользователей</button></div><select id="lg-who">${opt('', 'Все', logWho)}${people.map(p => opt(p, whoName(p) !== String(p).split('@')[0] ? `${whoName(p)} (${p})` : p, logWho)).join('')}</select></div>`;
  if(!list.length) return h + `<div class="empty"><p>Записей пока нет. Здесь будут появляться все добавления, изменения и удаления: кто, когда и что именно поменял.</p></div>`;
  const ACT = {create:['Добавлено','ok'], update:['Изменено','warn'], delete:['Удалено','bad']};
  let day = '';
  h += list.map(x => {
    const d = new Date(x.at), dk = iso(d), hd = dk !== day ? `<div class="eyebrow logday">${dk===today() ? 'Сегодня' : fmtD(dk)}</div>` : ''; day = dk;
    const [al, ac] = x.col==='note' ? ['Действие','ok'] : (ACT[x.action] || ['', '']);
    return hd + `<div class="logrow"><div class="logtime">${pad(d.getHours())}:${pad(d.getMinutes())}</div><div class="logmain">
      <div><span class="pill ${ac}">${al}</span> <b>${esc(x.title || '')}</b></div>
      ${(x.changes||[]).length ? `<ul>${x.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      <div class="muted">${esc(x.byEmail ? (/@/.test(x.byEmail) ? `${whoName(x.byEmail)} · ${x.byEmail}` : x.byEmail) : 'неизвестно')}</div></div></div>`;
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
/* ===== Главная (панель) ===== */
const HICON = {
  sheep:'<path d="M7 15c-2 0-3.5-1.4-3.5-3.2S5 8.6 7 8.8C7.6 7 9.2 6 11 6.2c1.2-1.2 3.6-1.2 4.8.2 1.9-.2 3.7 1.3 3.7 3.2 0 .3 0 .6-.1.9 1 .5 1.6 1.4 1.6 2.4 0 1.7-1.5 3.1-3.4 3.1"/><path d="M7 15h11M7 15v4M10 15.5V19M15 15.5V19M18 15v4"/>',
  goat:'<path d="M8 3c0 2.2 1 3.6 2 5M16 3c0 2.2-1 3.6-2 5"/><path d="M9 8h6l1.2 5-2.2 3h-4l-2.2-3z"/><path d="M10 16v2.5l2 2.5 2-2.5V16"/><path d="M7.8 10H5.5M16.2 10h2.3"/>',
  lamb:'<circle cx="9" cy="10" r="3.2"/><path d="M12 10.5c2.2-.8 5.5-.6 7 1.5 1 1.5.6 3.5-1 4.3H9.5c-1.2 0-2.2-.8-2.4-2"/><path d="M10.5 16.3V20M17 16.3V20"/><path d="M6.3 8.6 4.5 7.5"/>',
  herd:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
  syringe:'<path d="m18 2 4 4M20 4l-4 4M9.5 8.5l6 6M13 5l6 6-9.5 9.5H4v-5.5z"/><path d="m7 13 2 2M10 10l2 2"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
  report:'<path d="M5 20V11M10.5 20V5M16 20v-6M21 20H3"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'
};
const hico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HICON[k] || ICON[k] || ''}</svg>`;
const startOf = a => [a.birth, a.created ? iso(new Date(a.created)) : ''].filter(Boolean).sort()[0] || '2000-01-01';
const aliveOn = (a, d) => startOf(a) <= d && (a.status === 'active' || !a.outDate || a.outDate > d);
const youngOn = (a, d) => a.birth && daysBetween(a.birth, d) < YOUNG_DAYS && daysBetween(a.birth, d) >= 0;
function herdSeries(days){
  const t = today(), pts = Array.from({length:days}, (_, i) => addDays(t, i - days + 1));
  return pts.map(d => { const al = S.animals.filter(a => aliveOn(a, d)); return {d, sheep:al.filter(a => a.species === 'sheep' && !youngOn(a, d)).length, goat:al.filter(a => a.species === 'goat' && !youngOn(a, d)).length, young:al.filter(a => youngOn(a, d)).length}; });
}
function herdChart(days){
  const s = herdSeries(days), sm = (window.innerWidth || 800) < 700, W = sm ? 360 : 640, H = sm ? 190 : 210, L = 34, R = 22, T = 12, B = 24;
  const mx = Math.max(10, ...s.flatMap(p => [p.sheep, p.goat, p.young]));
  const step = mx > 400 ? 200 : mx > 200 ? 100 : mx > 80 ? 50 : mx > 40 ? 20 : 10, top = Math.ceil(mx / step) * step;
  const x = i => L + i * (W - L - R) / Math.max(1, s.length - 1), y = v => T + (H - T - B) * (1 - v / top);
  const line = (k, c) => `<path d="${s.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[k]).toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${s.length <= 14 ? s.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[k]).toFixed(1)}" r="3" fill="${c}"/>`).join('') : ''}`;
  const grid = Array.from({length:top / step + 1}, (_, i) => i * step).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const every = Math.ceil(s.length / 8);
  const labels = s.map((p, i) => i % every === 0 || i === s.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${p.d.slice(8)}.${p.d.slice(5, 7)}</text>` : '').join('');
  const last = s.at(-1);
  return `<svg class="hchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика поголовья: овец ${last.sheep}, коз ${last.goat}, молодняка ${last.young}">${grid}${labels}${line('sheep', 'var(--sheep)')}${line('goat', 'var(--goat)')}${line('young', 'var(--young)')}</svg>`;
}
function healthInfo(){
  const act = S.animals.filter(a => a.status === 'active');
  const treat = new Set(activeCourses().filter(c => c.sc.kind === 'ill').flatMap(c => c.animals));
  const watch = new Set(act.filter(a => PEN[a.pen]?.barn.quarantine && !treat.has(a.id)).map(a => a.id));
  const ok = act.length - treat.size - watch.size;
  return {total:act.length, ok, treat:treat.size, watch:watch.size, pct: act.length ? Math.round(ok / act.length * 100) : 100};
}
function ring(pct){
  const r = 52, c = 2 * Math.PI * r, d = c * pct / 100;
  return `<svg class="ring" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="11"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--good)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${d.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/></svg>`;
}
function calendarBox(){
  const t = today(), m = S.calMonth || t.slice(0, 7), [y, mo] = m.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), daysIn = new Date(y, mo, 0).getDate(), lead = (first.getDay() + 6) % 7;
  const monthEnd = `${m}-${pad(daysIn)}`;
  const plan = agendaItems(monthEnd > t ? monthEnd : t), planDays = new Set(plan.map(x => x.date < t ? t : x.date));
  const doneDays = new Set(S.events.filter(e => (e.date || '').startsWith(m)).map(e => e.date));
  const sel = S.calDay && S.calDay.startsWith(m) ? S.calDay : '';
  const title = first.toLocaleDateString('ru-RU', {month:'long', year:'numeric'}).replace(/\s*г\.?$/, '');
  let cells = '';
  for(let i = 0; i < lead; i++) cells += '<span></span>';
  for(let d = 1; d <= daysIn; d++){ const ds = `${m}-${pad(d)}`;
    cells += `<button class="cday${ds === t ? ' today' : ''}${ds === sel ? ' sel' : ''}" data-cday="${ds}">${d}${planDays.has(ds) ? '<i class="p"></i>' : doneDays.has(ds) ? '<i class="d"></i>' : ''}</button>`; }
  const showDay = sel || '';
  let items;
  if(showDay){
    const fut = plan.filter(x => (x.date < t ? t : x.date) === showDay);
    const past = S.events.filter(e => e.date === showDay && !['dose'].includes(e.type)).slice(0, 8).map(e => ({date:e.date, kind:'done', title:`${ET[e.type]?.t || 'Событие'}${e.scheme ? ' «' + e.scheme.name + '»' : e.drug ? ' · ' + e.drug : ''}`, sub:(e.animalIds || []).length === 1 ? animalLabel(byId(e.animalIds[0])) : heads((e.animalIds || []).length), attr:`data-evopen="${e.id}"`}));
    items = fut.concat(past);
  } else items = plan.slice(0, 4);
  const kindIco = k => k === 'birth' ? hico('lamb') : k === 'stock' ? hico('feed') : k === 'done' ? hico('edit') : hico('syringe');
  return `<div class="card calcard"><div class="card-h"><h3>Календарь событий</h3><button class="link" data-nav="events" data-aghz2="month">Все</button></div>
    <div class="calnav"><button data-calm="-1" aria-label="Предыдущий месяц">‹</button><b>${title[0].toUpperCase() + title.slice(1)}</b><button data-calm="1" aria-label="Следующий месяц">›</button></div>
    <div class="cal">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(w => `<span class="wd">${w}</span>`).join('')}${cells}</div>
    <div class="caldesc">${showDay ? `<div class="eyebrow">${fmtD(showDay)}</div>` : ''}${items.length ? items.map(x => `<button class="cev" ${x.attr}><span class="cico ${x.kind}">${kindIco(x.kind)}</span><span><b>${esc(x.title)}</b><small>${esc(x.date < t && x.kind !== 'done' ? 'просрочено · ' : '')}${fmtD(x.date)}${x.sub ? ' · ' + esc(String(x.sub).split(' · ')[0]) : ''}</small></span></button>`).join('') : `<p class="muted" style="margin:0">${showDay ? 'В этот день ничего нет.' : 'Ближайших событий нет.'}</p>`}</div></div>`;
}
function recentRows(){
  const evs = S.events.filter(e => e.type !== 'dose').slice().sort((a, b) => (b.created || 0) - (a.created || 0) || b.date.localeCompare(a.date)).slice(0, 6);
  if(!evs.length) return `<p class="muted" style="margin:0">Записей пока нет.</p>`;
  return `<div class="rtable">` + evs.map(e => {
    const ids = e.animalIds || [], a = ids.length === 1 ? byId(ids[0]) : null;
    const when = e.created ? new Date(e.created) : null;
    const desc = e.type === 'result' ? (e.schemeName || '') : e.scheme ? e.scheme.name : e.type === 'birth' ? `${e.count || 0} ${plural(+e.count || 0, 'детёныш', 'детёныша', 'детёнышей')}` : e.type === 'weight' ? `${num(e.weight)} кг` : [e.drug, e.dose, e.note].filter(Boolean).join(' · ');
    return `<button class="rrow" data-evopen="${e.id}"><span class="rd">${fmtD(e.date)}${when ? ` <small>${pad(when.getHours())}:${pad(when.getMinutes())}</small>` : ''}</span>
      <span class="ra">${a ? `№ ${esc(a.tag)} <small>(${a.species === 'goat' ? 'коза' : 'овца'})</small>` : heads(ids.length)}</span>
      <span class="rt"><i class="ev-${ET[e.type]?.vet ? 'vet' : e.type}"></i>${esc(ET[e.type]?.t || 'Событие')}</span><span class="rx">${esc(desc || '—')}</span></button>`;
  }).join('') + `</div>`;
}
function homeView(){
  if(loading('milk', 'items', 'moves', 'events')) return `<div class="empty"><p>Загружаем…</p></div>`;
  const t = today(), wk = addDays(t, -6), act = S.animals.filter(a => a.status === 'active');
  const young = act.filter(a => groupOf(a) === 'young');
  const cnt = {sheep:act.filter(a => a.species === 'sheep' && groupOf(a) !== 'young').length, goat:act.filter(a => a.species === 'goat' && groupOf(a) !== 'young').length, young:young.length, all:act.length};
  const added = f => S.animals.filter(a => f(a) && startOf(a) >= wk && a.status === 'active').length - S.animals.filter(a => f(a) && a.status !== 'active' && a.outDate >= wk).length;
  const delta = {sheep:added(a => a.species === 'sheep'), goat:added(a => a.species === 'goat'), young:S.animals.filter(a => a.birth >= wk && a.status === 'active').length, all:added(() => true)};
  const dl = n => `<span class="delta ${n < 0 ? 'neg' : ''}">${n > 0 ? '↑ +' + n : n < 0 ? '↓ ' + n : '±0'} <em>за неделю</em></span>`;
  const st = (k, ic, l, cls) => `<button class="kpi ${cls}" data-nav="herd"><span class="kico">${hico(ic)}</span><span><span class="kl">${l}</span><b>${cnt[k]}</b>${dl(delta[k])}</span></button>`;
  const hi = healthInfo(), milkDay = ['am', 'pm'].reduce((x, ss) => x + milkTotal(milkDoc(t, ss, 'goat')) + milkTotal(milkDoc(t, ss, 'sheep')), 0);
  const nToday = todayCount(), hz = S.chartDays || 8;
  return `<div class="dash"><div class="dl">
    <div class="hero-b" role="img" aria-label="Берегиня — ваш надёжный помощник в управлении поголовьем МРС"><picture><source media="(min-width:700px)" srcset="icons/hero-wide.jpg"><img src="icons/hero-phone.jpg" alt=""></picture></div>
    <div class="kpis">${st('sheep', 'sheep', 'Овцы', 'k1')}${st('goat', 'goat', 'Козы', 'k2')}${st('young', 'lamb', 'Ягнята / Козлята', 'k3')}${st('all', 'herd', 'Всего голов', 'k4')}</div>
    ${nToday ? `<button class="banner as-btn todayb" data-nav="events" data-aghz2="today">${hico('cal')}<span>События сегодня: <b>${nToday}</b> — что сделать</span><span>›</span></button>` : ''}
    <div class="duo"><div class="card chartcard"><div class="card-h"><h3>Динамика поголовья</h3><div class="legend"><span><i style="background:var(--sheep)"></i>Овцы</span><span><i style="background:var(--goat)"></i>Козы</span><span><i style="background:var(--young)"></i>Ягнята/Козлята</span></div></div>
      <div class="chips">${[[8, '8 дней'], [30, 'Месяц'], [90, '3 месяца']].map(([d, l]) => `<button class="chip" data-chd="${d}" aria-pressed="${hz === d}">${l}</button>`).join('')}</div>${herdChart(hz)}</div>
    <button class="card healthcard" data-tab-go="vet"><div class="card-h"><h3>Состояние здоровья</h3></div>
      <div class="hbody"><div class="ringw">${ring(hi.pct)}<div class="ringt">${hico('heart')}<b>${hi.pct}%</b><small>в норме</small></div></div>
      <div class="hlist"><span><i style="background:var(--good)"></i>Здоровые<b>${hi.ok}</b></span><span><i style="background:var(--warn)"></i>На лечении<b>${hi.treat}</b></span><span><i style="background:var(--bad)"></i>Под наблюдением<b>${hi.watch}</b></span></div></div></button></div>
    <div class="card recentcard"><div class="card-h"><h3>Последние записи</h3><button class="link" data-nav="events" data-aghz2="week">Все события ›</button></div>${recentRows()}</div>
    </div><div class="dr">
    ${calendarBox()}
    <div class="card quickcard"><div class="card-h"><h3>Быстрые действия</h3></div>
      <button class="qa g" data-act="add-animal">${ico('plus')}Добавить животное</button>
      <button class="qa b" data-vnew="other">${hico('cal')}Записать событие</button>
      <button class="qa t" data-act="milkquick">${ico('milk')}Записать надой${milkDay ? ` <small>сегодня ${num(milkDay)} л</small>` : ''}</button>
      <button class="qa p" data-nav="daily">${hico('report')}Отчёт за текущий день</button>
      <div class="qmini">
        <button data-vnew="ill">${hico('syringe')}Лечение</button><button data-vnew="vac">${hico('syringe')}Вакцинация</button>
        <button data-vnew="vit">${hico('syringe')}Витамини&shy;зация</button><button data-vnew="treat">${hico('syringe')}Дегельмин&shy;тизация</button>
        <button data-act="q-birth">${ico('birth')}Окот</button><button data-act="milkout">${ico('truck')}Отгрузка молока</button>
        <button data-act="q-feed">${ico('feed')}Приход корма</button><button data-act="q-fuel">${ico('fuel')}Заправка</button>
        <button data-nav="herd" data-hm2="pens">${ico('move')}По загонам</button><button data-tab-go="feedsheet">${hico('report')}Табель</button><button data-act="excel">${hico('report')}Выгрузка в Excel</button><button data-tab-go="stats">${hico('report')}Сводка за год</button>
      </div></div>
    </div>
    <div class="secs">
      <button class="sec-c" data-nav="herd"><span class="kico">${hico('sheep')}</span><span><b>Поголовье</b><small>Полный учёт и контроль всех животных</small></span></button>
      <button class="sec-c" data-tab-go="vet"><span class="kico">${hico('syringe')}</span><span><b>Ветеринария</b><small>Лечение по схемам, вакцинации, обработки</small></span></button>
      <button class="sec-c" data-nav="milk"><span class="kico">${ico('milk')}</span><span><b>Молоко</b><small>Надои утро/вечер, отгрузки</small></span></button>
      <button class="sec-c" data-nav="stock"><span class="kico">${ico('feed')}</span><span><b>Склад</b><small>Корма, ГСМ, аптека, техника</small></span></button>
      <button class="sec-c" data-nav="daily"><span class="kico">${hico('report')}</span><span><b>Отчёты</b><small>Отчёт за день, сводка, Excel</small></span></button>
    </div>
  </div>`;
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
    const vt = vetTasks().length, vc = activeCourses().length;
    return search + `<button class="banner as-btn ${vt ? '' : 'soft'}" data-tab-go="vet">Ветеринария${vt ? `: сегодня ${vt} ${plural(vt, 'процедура', 'процедуры', 'процедур')}` : vc ? `: идёт курсов ${vc}` : ' — лечение, вакцинация, схемы'} ›</button><div class="hero"><div><div class="hero-l">Всего поголовье</div><div class="bignum">${act.length}</div></div><div class="hero-r"><span><i style="background:var(--sheep)"></i>Овцы <b>${nSheep}</b></span><span><i style="background:var(--goat)"></i>Козы <b>${nGoat}</b></span></div></div>
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
      <div class="sub">${[penShort(a.pen), g ? groupName(a.species, g) : (a.cat ? a.cat + ' (без группы)' : 'без группы'), a.breed, age(a.birth)].filter(Boolean).map(esc).join(' · ')}</div></span>
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
    <p class="muted" style="margin:0">Литры. Нажмите на ячейку, чтобы записать надой по каждой голове.</p>${(() => { if(!S.admin) return '';
      const w = ['am','pm'].map(ss => { const ws = [...new Set(['goat','sheep'].map(s2 => milkDoc(d, ss, s2)).filter(Boolean).map(m => whoName(m.updatedByEmail || m.byEmail)).filter(Boolean))]; return ws.length ? `${SESS[ss].toLowerCase()} — ${ws.join(', ')}` : ''; }).filter(Boolean);
      return w.length ? `<p class="muted" style="margin:0">Записали: ${esc(w.join('; '))}</p>` : ''; })()}</div>`;
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
      <span class="main"><div class="name">${MILKOUT[o.kind]||'Отгрузка'} · ${MILKNAME[o.species]||''}</div><div class="sub">${esc([o.to, o.price?money(o.price):'', byLine(o.byEmail)].filter(Boolean).join(' · '))}</div></span>
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
// Имена пользователей: задаёт администратор (settings/people → names: {почта: имя}). Подпись «внёс» видят только администраторы.
const peopleNames = () => setting('people')?.names || {};
const whoName = e => { if(!e) return ''; const k = String(e).toLowerCase().trim(); return peopleNames()[k] || String(e).split('@')[0]; };
const byLine = (e, word='внёс') => S.admin && e ? `${word}: ${whoName(e)}` : '';
function knownEmails(){
  const set = new Set(Object.keys(peopleNames()));
  for(const col of ['moves','milk','milkout','events','animals','finance']) (S[col]||[]).forEach(d => { [d.byEmail, d.updatedByEmail].forEach(x => x && set.add(String(x).toLowerCase())); });
  (logDocs||[]).forEach(x => x.byEmail && /@/.test(x.byEmail) && set.add(String(x.byEmail).toLowerCase()));
  if(S.email) set.add(S.email.toLowerCase());
  return [...set].filter(x => /@/.test(x)).sort((a, b) => whoName(a).localeCompare(whoName(b), 'ru'));
}
function peopleView(){
  let h = backTo('Пользователи');
  if(!S.admin) return h + `<div class="empty"><p>Раздел недоступен.</p></div>`;
  const names = peopleNames(), list = knownEmails();
  h += `<p class="muted" style="margin:0">Впишите имя для каждой почты. Имя будет видно вам в журнале и в записях («внёс: Иван»). Работники эти подписи не видят. Самих пользователей добавляют в консоли Firebase (Authentication → Users).</p>
    <form id="pplf" novalidate><div class="ppl">${list.map((e, i) => `<div class="field"><label for="ppl-${i}" style="word-break:break-all">${esc(e)}</label>
      <input id="ppl-${i}" name="${esc(e)}" value="${esc(names[e] || '')}" placeholder="имя, например Иван" autocomplete="off"></div>`).join('')}</div>
    <div class="two">${fld('ppl-new','Ещё почта',`<input id="ppl-new" type="email" placeholder="ivan@mail.ru" autocomplete="off">`)}${fld('ppl-newn','Имя',`<input id="ppl-newn" placeholder="Иван" autocomplete="off">`)}</div>
    <p class="err" id="pplerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">Сохранить имена</button></div></form>`;
  return h;
}
function bindPeople(){
  const f = $('#pplf'); if(!f) return;
  f.onsubmit = ev => {
    ev.preventDefault(); const out = {};
    f.querySelectorAll('.ppl input').forEach(i => { const v = i.value.trim(); if(v) out[i.name] = v; });
    const ne = f.querySelector('#ppl-new').value.trim().toLowerCase(), nn = f.querySelector('#ppl-newn').value.trim();
    if(ne || nn){ if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ne) || !nn){ const e = f.querySelector('#pplerr'); e.hidden = false; e.textContent = 'Для новой строки укажите и почту, и имя.'; return; } out[ne] = nn; }
    store.set('settings', 'people', {names: out}); toast('Имена сохранены'); setTimeout(render, 200);
  };
}
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
      const sub2 = [it.series ? `серия ${it.series}` : '', it.number ? `№ ${it.number}` : '', usedM ? `расход за ${parse(mon+'-01').toLocaleDateString('ru-RU',{month:'long'})}: ${num(round(usedM,2))} ${it.unit}` : '', it.expiry ? `годен до ${fmtD(it.expiry)}` : ''].filter(Boolean).join(' · ') || it.unit;
      const pill = b < 0 ? `<span class="pill bad">минус</span>` : b === 0 ? `<span class="pill warn">нет</span>` : it.min > 0 && b < it.min ? `<span class="pill warn">мало</span>` : exp != null && exp < 0 ? `<span class="pill bad">просрочен</span>` : exp != null && exp < 30 ? `<span class="pill warn">срок</span>` : '';
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
  parts.push(byLine(m.byEmail));
  return `<button class="row" data-move="${m.id}"><span class="pill ${m.kind==='in'?'ok':''}">${fmtShort(m.date)}</span>
    <span class="main"><div class="name">${esc(it?.name||'удалено')}</div><div class="sub">${esc(parts.filter(Boolean).join(' · '))}</div></span>
    <span class="side"><strong class="money ${m.kind==='in'?'plus':'minus'}">${m.kind==='in'?'+':'−'}${num(m.qty)} ${esc(it?.unit||'')}</strong></span></button>`;
}

/* ----- Ещё ----- */
function moreView(){
  const plan = planItems(), soon = plan.filter(i => daysBetween(today(), i.date) <= 7).length;
  const row = (go, t, s) => `<button class="row" data-tab-go="${go}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${t}</div><div class="sub">${s}</div></span><span class="side">›</span></button>`;
  let h = `<div><div class="eyebrow">${esc(S.demo ? 'Демо' : S.local ? 'Учёт на этом устройстве' : (S.email||'') + (S.admin ? ' · администратор' : ''))}</div><h2>Ещё</h2></div><div class="list">
    ${row('daily','Отчёт за текущий день','Поголовье по группам, молоко и средний удой, остатки кормов')}
    ${row('events','События', 'Что сделать сегодня и что впереди: уколы, ревакцинации, окоты')}
    ${row('money','Финансы','Доходы и расходы по месяцам')}
    ${row('stats','Сводка','Поголовье, приплод, молоко, деньги за год')}
    <button class="row adm" data-tab-go="people" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Пользователи и имена</div><div class="sub">Чтобы в записях было видно, кто внёс</div></span><span class="side">›</span></button>
    <button class="row adm" data-tab-go="log" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Журнал изменений</div><div class="sub">Кто, когда и что внёс, изменил или удалил</div></span><span class="side">›</span></button>
    <button class="row adm" data-act="import" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Загрузка из Excel</div><div class="sub">Список животных по загонам из вашей таблицы</div></span><span class="side">›</span></button>
 <button class="row" data-tab-go="vet" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Ветеринария</div><div class="sub">Лечение по схемам, вакцинация, дегельминтизация</div></span><span class="side">›</span></button>
    <button class="row" data-tab-go="feedsheet" style="grid-template-columns:1fr auto"><span class="main"><div class="name">Табель кормления</div><div class="sub">Бланк по загонам — скачать в Excel и распечатать</div></span><span class="side">›</span></button>
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
    <span class="main"><div class="name">${esc(r.category)}</div><div class="sub">${esc([r.note, byLine(r.byEmail)].filter(Boolean).join(' · '))}</div></span>
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
  bindPeople(); bindFeedSheet();
  on('[data-f]', b => { S.filter = b.dataset.f; if(!S.filter) S.q = ''; window.scrollTo(0,0); render(); });
  on('[data-hm]', b => { S.herdMode = b.dataset.hm; window.scrollTo(0,0); render(); });
  on('[data-nav]', b => { if(b.dataset.f2 != null) S.filter = b.dataset.f2; if(b.dataset.hm2) S.herdMode = b.dataset.hm2; if(b.dataset.aghz2) S.agHz = b.dataset.aghz2; S.tab = b.dataset.nav; window.scrollTo(0,0); render(); });
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
  on('[data-evopen]', b => { const e = S.events.find(x => x.id===b.dataset.evopen); if(!e) return; if(e.course) courseSheet(e.course); else if(e.scheme) courseSheet(e.id); else if((e.animalIds||[]).length===1) animalCard(e.animalIds[0]); else eventForm(e); });
  on('[data-cday]', b => { S.calDay = S.calDay===b.dataset.cday ? '' : b.dataset.cday; render(); });
  on('[data-calm]', b => { const [y, m] = (S.calMonth || today().slice(0,7)).split('-').map(Number); S.calMonth = iso(new Date(y, m - 1 + (+b.dataset.calm), 1)).slice(0,7); S.calDay = ''; render(); });
  on('[data-chd]', b => { S.chartDays = +b.dataset.chd; render(); });
  on('[data-vsub]', b => { S.vetSub = b.dataset.vsub; render(); });
  on('[data-aghz]', b => { S.agHz = b.dataset.aghz; render(); });
  on('[data-dd]', b => { const n = addDays(S.dailyDate || today(), +b.dataset.dd); if(n <= today()){ S.dailyDate = n; render(); } });
  on('[data-agk]', b => { S.agKind = b.dataset.agk; render(); });
  on('[data-vkind]', b => { S.vetKind = b.dataset.vkind; render(); });
  on('[data-vnew]', b => eventForm({type:b.dataset.vnew}));
  on('[data-dose]', b => { const [id, d] = b.dataset.dose.split(':'); doseSheet(id, +d); });
  on('[data-res]', b => resultSheet(b.dataset.res));
  on('[data-course]', b => courseSheet(b.dataset.course));
  on('[data-scheme]', b => schemeForm(schemeById(b.dataset.scheme)));
  on('[data-done]', b => {
    const e = S.events.find(x => x.id===b.dataset.done); if(!e) return;
    eventForm({type:e.type, drug:e.scheme ? '' : e.drug, dose:e.scheme ? '' : e.dose, animalIds:(e.animalIds||[]).filter(id => byId(id)?.status==='active'), schemeId:e.scheme?.id, schemeSnap:e.scheme, fromRepeat:e.id, repeatNo:(+e.repeatNo||0) + 1});
  });
  on('[data-birth]', b => eventForm({type:'birth', animalIds:[b.dataset.birth]}));
  on('[data-restock]', b => moveForm({cat:'feed', kind:'in', item:b.dataset.restock}));
  on('[data-act]', b => ({
    'add-animal':() => animalForm(), 'add-fin':() => financeForm(), 'add-ration':() => rationForm(),
    'add-item':() => itemForm({cat:S.stockCat}), 'daily-xl':dailyXl, 'daily-share':dailyShare, 'add-scheme':() => schemeForm(null, S.vetKind), 'seed-scheme':seedScheme, 'veh-all-gsm':allToGsm, 'seed-items':seedItems, 'milkout':() => milkOutForm(),
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

/* ===== Ветеринария: схемы, курсы по дням, результат ===== */
const SCHEME_KIND = {ill:'Лечение', vac:'Вакцинация', deworm:'Дегельминтизация', vit:'Витаминизация'};
const KIND_OF_TYPE = {ill:'ill', vac:'vac', treat:'deworm', vit:'vit'};
const TYPE_OF_KIND = {ill:'ill', vac:'vac', deworm:'treat', vit:'vit'};
const ROUTES = ['в/м','п/к','в/в','внутрь','наружно','интрацистернально','интраназально','в/матку'];
const RESULT = {ok:'Здорово', repeat:'Повторить схему', switch:'Другая схема', dead:'Пало / выбраковано'};
const schemes = () => setting('schemes')?.list || [];
const schemeById = id => schemes().find(x => x.id === id);
const sFrom = st => Math.max(1, +st.from || 1), sDays = st => Math.max(1, +st.days || 1);
const schemeLastDay = sc => Math.max(1, ...(sc.steps || []).map(st => sFrom(st) + sDays(st) - 1));
const stepsOnDay = (sc, d) => (sc.steps || []).filter(st => d >= sFrom(st) && d <= sFrom(st) + sDays(st) - 1);
const stepShort = st => [st.name, st.dose, st.route].filter(Boolean).join(' ');
const stepText = st => stepShort(st) + ` — ${sDays(st)} ${plural(sDays(st), 'день', 'дня', 'дней')}` + (sFrom(st) > 1 ? `, с ${sFrom(st)}-го дня` : '');
const schemeCheckDay = sc => sc.kind === 'ill' ? (+sc.checkDay || schemeLastDay(sc) + 1) : null;
const vetItemInfo = it => it ? [it.dose, it.route, it.days ? `курс ${it.days} ${plural(+it.days, 'день', 'дня', 'дней')}` : '', it.info, it.withdrawal ? 'ожидание: ' + it.withdrawal : ''].filter(Boolean).join(' · ') : '';
function saveSchemes(list){ store.set('settings', 'schemes', {list}); }

// Состояние курса (события лечения/вакцинации/дегельминтизации, назначенного по схеме)
function courseInfo(ev){
  const sc = ev.scheme; if(!sc) return null;
  const last = schemeLastDay(sc), check = schemeCheckDay(sc), t = today();
  const doses = S.events.filter(x => x.type === 'dose' && x.course === ev.id);
  const doneDays = new Set(doses.map(x => +x.day));
  const results = S.events.filter(x => x.type === 'result' && x.course === ev.id);
  const closed = new Set(results.flatMap(r => Object.keys(r.outcomes || {})));
  const animals = (ev.animalIds || []).filter(id => !closed.has(id) && byId(id)?.status === 'active');
  const dayNow = daysBetween(ev.date, t) + 1;
  const stepDays = []; for(let d = 1; d <= last; d++) if(stepsOnDay(sc, d).length) stepDays.push(d);
  const pending = stepDays.filter(d => !doneDays.has(d) && addDays(ev.date, d - 1) <= t).map(d => ({d, date:addDays(ev.date, d - 1), steps:stepsOnDay(sc, d)}));
  const allDone = stepDays.every(d => doneDays.has(d));
  const needResult = !!check && animals.length > 0 && t >= addDays(ev.date, check - 1);
  const active = animals.length > 0 && (check ? true : !allDone);
  return {sc, last, check, doses, doneDays, results, animals, dayNow, stepDays, pending, allDone, needResult, active};
}
const courses = () => S.events.filter(e => e.scheme && ET[e.type]?.vet).map(e => ({e, ...courseInfo(e)}));
const activeCourses = () => courses().filter(c => c.active).sort((a, b) => a.e.date.localeCompare(b.e.date));
function vetTasks(){
  const out = [];
  activeCourses().forEach(c => {
    c.pending.forEach(p => out.push({kind:'dose', c, ...p}));
    if(c.needResult) out.push({kind:'result', c, date:addDays(c.e.date, c.check - 1)});
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const tagsLine = (ids, n = 12) => { const t = ids.map(id => byId(id)?.tag).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'ru', {numeric:true})); return t.slice(0, n).join(', ') + (t.length > n ? ` и ещё ${t.length - n}` : ''); };

function vetView(){
  let h = `<button class="back" data-nav="herd">‹ Стадо</button><h2 class="page">Ветеринария</h2>`;
  if(loading('events', 'settings')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const tasks = vetTasks(), act = activeCourses(), sub = S.vetSub || 'today';
  h += `<div class="actions"><button class="btn primary" data-vnew="ill">Лечение</button><button class="btn" data-vnew="vac">Вакцинация</button><button class="btn" data-vnew="treat">Дегельминтизация</button><button class="btn" data-vnew="vit">Витаминизация</button></div>`;
  h += `<div class="segb" role="group">${[['today', `Сегодня${tasks.length ? ' · ' + tasks.length : ''}`], ['courses', `Курсы${act.length ? ' · ' + act.length : ''}`], ['schemes', 'Схемы']].map(([k, l]) => `<button data-vsub="${k}" aria-pressed="${sub === k}">${l}</button>`).join('')}</div>`;
  if(sub === 'today'){
    if(!tasks.length) return h + `<div class="empty"><p>На сегодня процедур нет.${act.length ? ` Идёт курсов: ${act.length}.` : ''}</p><p class="muted">Назначьте лечение кнопкой выше — по схеме приложение само будет показывать, кого и чем колоть каждый день, а в день оценки спросит результат.</p></div>`;
    h += `<div class="list">` + tasks.map(tk => {
      const c = tk.c, late = tk.date < today();
      if(tk.kind === 'dose') return `<button class="row vtask" data-dose="${c.e.id}:${tk.d}" style="grid-template-columns:1fr auto"><span class="main"><span class="pill ${late ? 'bad' : 'warn'}">${late ? 'пропущено · ' + fmtShort(tk.date) + ' · день ' + tk.d : 'сегодня · день ' + tk.d}</span>
        <div class="name">${esc(c.sc.name)} · ${heads(c.animals.length)}</div><div class="sub"><b>${esc(tk.steps.map(stepShort).join(' + '))}</b></div><div class="sub">№ ${esc(tagsLine(c.animals))}</div></span><span class="side">Сделано ›</span></button>`;
      return `<button class="row vtask" data-res="${c.e.id}" style="grid-template-columns:1fr auto"><span class="main"><span class="pill ok">оценить результат</span>
        <div class="name">${esc(c.sc.name)} · ${heads(c.animals.length)}</div><div class="sub">начато ${fmtD(c.e.date)} · здорово / повторить / другая схема</div><div class="sub">№ ${esc(tagsLine(c.animals))}</div></span><span class="side">›</span></button>`;
    }).join('') + `</div>`;
  } else if(sub === 'courses'){
    const done = courses().filter(c => !c.active).sort((a, b) => b.e.date.localeCompare(a.e.date)).slice(0, 30);
    const row = c => `<button class="row" data-course="${c.e.id}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${esc(c.sc.name)}</div>
      <div class="sub">${SCHEME_KIND[c.sc.kind] || ''} · с ${fmtD(c.e.date)} · ${c.active ? `день ${Math.min(c.dayNow, c.check || c.last)} из ${c.check || c.last}` : 'завершён'}</div><div class="sub">№ ${esc(tagsLine(c.active ? c.animals : c.e.animalIds || []))}</div></span>
      <span class="side"><strong>${heads((c.active ? c.animals : c.e.animalIds || []).length)}</strong></span></button>`;
    h += act.length ? `<div class="list">${act.map(row).join('')}</div>` : `<div class="empty"><p>Сейчас курсов нет.</p></div>`;
    if(done.length) h += `<div><div class="eyebrow">Завершённые</div></div><div class="list">${done.map(row).join('')}</div>`;
  } else {
    const k = S.vetKind || 'ill', list = schemes().filter(x => x.kind === k).sort((a, b) => a.name.localeCompare(b.name, 'ru', {numeric:true}));
    h += `<div class="chips" style="flex-wrap:wrap">${Object.entries(SCHEME_KIND).map(([kk, l]) => `<button class="chip" data-vkind="${kk}" aria-pressed="${k === kk}">${l}</button>`).join('')}</div>
      <div class="actions"><button class="btn primary adm" data-act="add-scheme">+ Новая схема</button></div>`;
    h += list.length ? `<div class="list">${list.map(sc => `<button class="row" data-scheme="${sc.id}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${esc(sc.name)}</div>
        ${(sc.steps || []).map(st => `<div class="sub">${esc(stepText(st))}</div>`).join('')}${sc.kind === 'ill' ? `<div class="sub">результат — на ${schemeCheckDay(sc)}-й день</div>` : sc.repeat ? `<div class="sub">повтор через ${sc.repeat} ${plural(+sc.repeat, 'день', 'дня', 'дней')}${+sc.repeatTimes > 1 ? `, ${sc.repeatTimes} раза` : ''}</div>` : ''}</span><span class="side">›</span></button>`).join('')}</div>`
      : `<div class="empty"><p>Схем «${SCHEME_KIND[k]}» пока нет.</p>${k === 'ill' ? `<p class="muted">Например: «1 Понос молодняк» — Кетопрофен 0,5 мл в/м 3 дня + Цефтонит форте 1,0 мл п/к 1 день, результат на 4-й день.</p><div class="actions"><button class="btn adm" data-act="seed-scheme">Добавить этот пример</button></div>` : ''}</div>`;
    h += `<p class="muted" style="margin:0">Дозировку и особенности каждого препарата впишите в «Склад → Аптека» — они подставляются в схему и видны при процедуре.</p>`;
  }
  return h;
}
function seedScheme(){
  const find = re => S.items.find(i => i.cat === 'vet' && re.test(norm(i.name)));
  const ket = find(/кетопрофен/), cef = find(/цефтонит/);
  const list = schemes().concat([{id:'s' + Date.now().toString(36), kind:'ill', name:'1 Понос молодняк', checkDay:4, note:'',
    steps:[{item:ket?.id || '', name:'Кетопрофен', dose:'0,5 мл', route:'в/м', from:1, days:3}, {item:cef?.id || '', name:'Цефтонит форте', dose:'1,0 мл', route:'п/к', from:1, days:1}]}]);
  saveSchemes(list); toast('Схема добавлена');
}

function schemeForm(sc, kind0){
  const isEdit = !!sc, v = sc ? JSON.parse(JSON.stringify(sc)) : {kind:kind0 || S.vetKind || 'ill', name:'', steps:[{name:'', dose:'', route:'', from:1, days:1}], checkDay:'', repeat:'', note:''};
  const drugs = itemsOf('vet');
  const stepRow = (st, i) => `<div class="panel step" data-i="${i}">
    <div class="kv"><span class="eyebrow">Препарат ${i + 1}</span>${'<button type="button" class="link" data-rm="' + i + '">убрать</button>'}</div>
    ${fld('st-item-' + i, 'Из аптеки', `<select data-k="item">${opt('', '— выбрать —', st.item || '')}${drugs.map(d => opt(d.id, d.name, st.item)).join('')}</select>`)}
    ${fld('st-name-' + i, 'Название в схеме', `<input data-k="name" value="${esc(st.name)}" placeholder="напр. Кетопрофен" autocomplete="off">`)}
    <div class="two">${fld('st-dose-' + i, 'Доза', `<input data-k="dose" value="${esc(st.dose)}" placeholder="0,5 мл" autocomplete="off">`)}${fld('st-route-' + i, 'Как вводить', `<select data-k="route">${opt('', '—', st.route || '')}${ROUTES.map(r => opt(r, r, st.route)).join('')}</select>`)}</div>
    <div class="two">${fld('st-from-' + i, 'С какого дня', `<input data-k="from" type="number" min="1" step="1" inputmode="numeric" value="${esc(st.from || 1)}">`)}${fld('st-days-' + i, 'Сколько дней', `<input data-k="days" type="number" min="1" step="1" inputmode="numeric" value="${esc(st.days || 1)}">`)}</div>
    <p class="muted" data-k="info" style="margin:0">${esc(vetItemInfo(itemById(st.item)))}</p></div>`;
  const body = `<form id="scf" novalidate>
    ${fld('sc-kind', 'Вид', `<select id="sc-kind">${Object.entries(SCHEME_KIND).map(([k, l]) => opt(k, l, v.kind)).join('')}</select>`)}
    ${fld('sc-name', 'Название схемы *', `<input id="sc-name" value="${esc(v.name)}" placeholder="напр. 1 Понос молодняк" autocomplete="off">`)}
    <div id="sc-steps">${v.steps.map(stepRow).join('')}</div>
    <button type="button" class="link" id="sc-add" style="align-self:flex-start">+ Добавить препарат</button>
    <div id="sc-ill">${fld('sc-check', 'Оценить результат на день', `<input id="sc-check" type="number" min="1" step="1" inputmode="numeric" value="${esc(v.checkDay)}" placeholder="по умолчанию — день после последнего укола">`)}</div>
    <div id="sc-rep" class="two">${fld('sc-repeat', 'Повторить через, дней', `<input id="sc-repeat" type="number" min="1" step="1" inputmode="numeric" value="${esc(v.repeat)}" placeholder="напр. 21">`)}${fld('sc-rtimes', 'Сколько раз повторить', `<input id="sc-rtimes" type="number" min="1" step="1" inputmode="numeric" value="${esc(v.repeatTimes || 1)}">`)}</div>
    ${fld('sc-note', 'Заметка', `<textarea id="sc-note">${esc(v.note)}</textarea>`)}
    <p class="muted" id="sc-sum" style="margin:0"></p>
    <p class="err" id="scerr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${isEdit ? 'Сохранить' : 'Создать схему'}</button></div>
    ${isEdit ? `<div class="actions"><button class="btn danger" type="button" id="scdel">Удалить схему</button></div><div id="scdelc"></div>` : ''}
  </form>`;
  openSheet(isEdit ? 'Схема' : 'Новая схема', body, s => {
    const f = s.querySelector('#scf'), box = s.querySelector('#sc-steps');
    const read = () => [...box.querySelectorAll('.step')].map(el => { const g = k => el.querySelector(`[data-k=${k}]`).value.trim(); return {item:g('item'), name:g('name'), dose:g('dose'), route:g('route'), from:Math.max(1, parseInt(g('from')) || 1), days:Math.max(1, parseInt(g('days')) || 1)}; });
    const sync = () => {
      const k = s.querySelector('#sc-kind').value; s.querySelector('#sc-ill').hidden = k !== 'ill'; s.querySelector('#sc-rep').hidden = k === 'ill';
      const st = read().filter(x => x.name), tmp = {kind:k, steps:st, checkDay:parseInt(s.querySelector('#sc-check').value) || ''};
      s.querySelector('#sc-sum').textContent = st.length ? `Курс ${schemeLastDay(tmp)} ${plural(schemeLastDay(tmp), 'день', 'дня', 'дней')}${k === 'ill' ? `, результат на ${schemeCheckDay(tmp)}-й день` : ''}.` : '';
    };
    const bindRows = () => {
      box.querySelectorAll('.step').forEach(el => {
        const sel = el.querySelector('[data-k=item]');
        sel.onchange = () => { const it = itemById(sel.value); if(it){ const nm = el.querySelector('[data-k=name]'); nm.value = it.name.replace(/\s*\d+\s*мл\b.*$/i, '').trim() || it.name;
          if(it.route) el.querySelector('[data-k=route]').value = it.route; if(it.days) el.querySelector('[data-k=days]').value = it.days; if(it.dose && !el.querySelector('[data-k=dose]').value) el.querySelector('[data-k=dose]').value = it.dose; }
          el.querySelector('[data-k=info]').textContent = vetItemInfo(it); sync(); };
      });
      box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const cur = read(); cur.splice(+b.dataset.rm, 1); box.innerHTML = cur.map(stepRow).join(''); bindRows(); sync(); });
    };
    bindRows(); f.oninput = sync; f.onchange = sync; sync();
    s.querySelector('#sc-add').onclick = () => { const cur = read(); cur.push({name:'', dose:'', route:'', from:1, days:1}); box.innerHTML = cur.map(stepRow).join(''); bindRows(); sync(); };
    f.onsubmit = ev => {
      ev.preventDefault();
      const err = s.querySelector('#scerr'), name = s.querySelector('#sc-name').value.trim(), steps = read().filter(x => x.name || x.item).map(x => ({...x, name: x.name || itemById(x.item)?.name || ''}));
      if(!name){ err.hidden = false; err.textContent = 'Укажите название схемы.'; return; }
      if(!steps.length){ err.hidden = false; err.textContent = 'Добавьте хотя бы один препарат.'; return; }
      const kind = s.querySelector('#sc-kind').value;
      const data = {id: v.id || 's' + Date.now().toString(36), kind, name, steps, note:s.querySelector('#sc-note').value.trim(),
        checkDay: kind === 'ill' ? (parseInt(s.querySelector('#sc-check').value) || '') : '', repeat: kind !== 'ill' ? (parseInt(s.querySelector('#sc-repeat').value) || '') : '', repeatTimes: kind !== 'ill' ? Math.max(1, parseInt(s.querySelector('#sc-rtimes').value) || 1) : ''};
      const list = schemes().filter(x => x.id !== data.id).concat([data]);
      saveSchemes(list); S.vetKind = kind; toast('Схема сохранена'); closeSheet();
    };
    const del = s.querySelector('#scdel');
    if(del) del.onclick = () => askConfirm(s.querySelector('#scdelc'), 'Удалить схему? Уже назначенные курсы продолжатся — схема в них сохранена.', () => { saveSchemes(schemes().filter(x => x.id !== v.id)); toast('Схема удалена'); closeSheet(); });
  }, 'schemeform');
}

// Отметить процедуру дня
function doseSheet(evId, day){
  const ev = S.events.find(e => e.id === evId); if(!ev) return; const c = courseInfo(ev); const steps = stepsOnDay(c.sc, day);
  const date = addDays(ev.date, day - 1);
  const list = c.animals.map(byId).filter(Boolean).sort(penSort);
  const body = `<div class="panel"><div class="eyebrow">${esc(c.sc.name)} · день ${day}${date !== today() ? ' · ' + fmtD(date) : ''}</div>
      ${steps.map(st => `<div class="kv"><span>${esc(st.name)}</span><strong>${esc([st.dose, st.route].filter(Boolean).join(' '))}</strong></div>${st.item && vetItemInfo(itemById(st.item)) ? `<p class="muted" style="margin:0 0 6px">${esc(vetItemInfo(itemById(st.item)))}</p>` : ''}`).join('')}</div>
    <div class="kv"><span class="eyebrow">Кого прокололи · <span id="dsn">${list.length}</span></span><button class="link" id="dsall">Все / никого</button></div>
    <div class="list scroll">${list.map(a => `<label class="row pickrow"><input type="checkbox" name="ds" value="${a.id}" checked><span class="tag">${esc(a.tag)}</span><span class="sub">${esc(animalTitle(a))} · ${esc(penShort(a.pen) || 'без загона')}</span></label>`).join('')}</div>
    ${fld('ds-note', 'Заметка', `<input id="ds-note" autocomplete="off" placeholder="напр. 25031 не найдена">`)}
    <div class="actions"><button class="btn primary" id="dsgo">Сделано</button></div>`;
  openSheet('Процедура', body, s => {
    const boxes = [...s.querySelectorAll('input[name=ds]')], upd = () => s.querySelector('#dsn').textContent = boxes.filter(b => b.checked).length;
    boxes.forEach(b => b.onchange = upd);
    s.querySelector('#dsall').onclick = () => { const all = boxes.every(b => b.checked); boxes.forEach(b => b.checked = !all); upd(); };
    s.querySelector('#dsgo').onclick = () => {
      const ids = boxes.filter(b => b.checked).map(b => b.value);
      if(!ids.length){ toast('Отметьте животных'); return; }
      store.add('events', {type:'dose', course:evId, day, date, animalIds:ids, steps:steps.map(stepShort), note:s.querySelector('#ds-note').value.trim()});
      toast(`День ${day} отмечен: ${heads(ids.length)}`); closeSheet();
    };
  }, 'dose');
}

// Результат лечения по каждому животному
function resultSheet(evId){
  const ev = S.events.find(e => e.id === evId); if(!ev) return; const c = courseInfo(ev);
  const list = c.animals.map(byId).filter(Boolean).sort(penSort), other = schemes().filter(x => x.kind === 'ill');
  const body = `<p class="muted" style="margin:0">${esc(c.sc.name)}, начато ${fmtD(ev.date)}. Выберите итог для каждого животного.</p>
    <div class="chips" style="flex-wrap:wrap"><span class="muted">Всем:</span>${Object.entries(RESULT).slice(0, 3).map(([k, l]) => `<button type="button" class="chip" data-allr="${k}">${l}</button>`).join('')}</div>
    <div class="list">${list.map(a => `<div class="row" style="grid-template-columns:auto 1fr;align-items:start"><span class="tag">${esc(a.tag)}</span><div class="main" style="display:grid;gap:6px">
      <select data-r="${a.id}">${Object.entries(RESULT).map(([k, l]) => opt(k, l, 'ok')).join('')}</select>
      <select data-sw="${a.id}" hidden>${other.filter(x => x.id !== c.sc.id).map(x => opt(x.id, x.name, '')).join('') || opt('', 'других схем лечения нет', '')}</select></div></div>`).join('')}</div>
    ${fld('rs-note', 'Заметка', `<input id="rs-note" autocomplete="off">`)}
    <p class="muted" style="margin:0">«Повторить» и «Другая схема» сразу назначают новый курс с сегодняшнего дня.</p>
    <div class="actions"><button class="btn primary" id="rsgo">Сохранить результат</button></div>`;
  openSheet('Результат лечения', body, s => {
    const sync = () => s.querySelectorAll('[data-r]').forEach(sel => s.querySelector(`[data-sw="${sel.dataset.r}"]`).hidden = sel.value !== 'switch');
    s.querySelectorAll('[data-r]').forEach(sel => sel.onchange = sync);
    s.querySelectorAll('[data-allr]').forEach(b => b.onclick = () => { s.querySelectorAll('[data-r]').forEach(sel => sel.value = b.dataset.allr); sync(); });
    s.querySelector('#rsgo').onclick = () => {
      const outcomes = {}, groups = {}, note = s.querySelector('#rs-note').value.trim(), t = today();
      s.querySelectorAll('[data-r]').forEach(sel => { const id = sel.dataset.r, r = sel.value, sw = s.querySelector(`[data-sw="${id}"]`).value;
        if(r === 'switch' && !sw){ outcomes[id] = {r:'repeat'}; } else outcomes[id] = r === 'switch' ? {r, scheme:sw} : {r};
        const o = outcomes[id]; if(o.r === 'repeat') (groups[c.sc.id + '|same'] ||= []).push(id); if(o.r === 'switch') (groups[o.scheme] ||= []).push(id); });
      store.add('events', {type:'result', course:evId, date:t, animalIds:Object.keys(outcomes), outcomes, note, schemeName:c.sc.name});
      let n = 0;
      for(const [k, ids] of Object.entries(groups)){
        const sc = k.endsWith('|same') ? c.sc : schemeById(k); if(!sc) continue;
        store.add('events', {type:'ill', date:t, animalIds:ids, scheme:JSON.parse(JSON.stringify(sc)), drug:sc.name, note: k.endsWith('|same') ? 'повтор схемы' : `после «${c.sc.name}»`, prevCourse:evId}); n++;
      }
      Object.entries(outcomes).forEach(([id, o]) => { if(o.r === 'dead' && S.admin) store.merge('animals', id, {status:'dead', outDate:t}); });
      const okN = Object.values(outcomes).filter(o => o.r === 'ok').length;
      toast(`Сохранено: здоровы ${okN}${n ? `, назначено курсов ${n}` : ''}`); closeSheet();
    };
  }, 'result');
}

// Карточка курса
function courseSheet(evId){
  const ev = S.events.find(e => e.id === evId); if(!ev) return; const c = courseInfo(ev);
  const days = Array.from({length:c.check || c.last}, (_, i) => i + 1);
  const body = `<div class="panel"><div class="eyebrow">${SCHEME_KIND[c.sc.kind] || ''} · начато ${fmtD(ev.date)}</div>${(c.sc.steps || []).map(st => `<div class="sub">${esc(stepText(st))}</div>`).join('')}${c.check ? `<div class="sub">результат — на ${c.check}-й день (${fmtD(addDays(ev.date, c.check - 1))})</div>` : ''}</div>
    <div class="list">${days.map(d => { const date = addDays(ev.date, d - 1), st = stepsOnDay(c.sc, d), dz = c.doses.find(x => +x.day === d);
      if(!st.length && d !== c.check) return '';
      const label = d === c.check ? 'Оценка результата' : st.map(stepShort).join(' + ');
      const state = d === c.check ? (c.results.length ? '<span class="pill ok">есть</span>' : '') : dz ? `<span class="pill ok">сделано · ${heads((dz.animalIds || []).length)}</span>` : date < today() ? '<span class="pill bad">пропущено</span>' : date === today() ? '<span class="pill warn">сегодня</span>' : '';
      const btn = d === c.check ? (c.needResult ? `data-res="${ev.id}"` : '') : (!dz && date <= today() && c.animals.length ? `data-dose="${ev.id}:${d}"` : '');
      return `<button class="row" ${btn} style="grid-template-columns:auto 1fr auto"><span class="pill">${d}-й · ${fmtShort(date)}</span><span class="main"><div class="sub">${esc(label)}</div></span><span class="side">${state}</span></button>`; }).join('')}</div>
    <div class="panel"><div class="eyebrow">Животные · ${heads((ev.animalIds || []).length)}</div>${(ev.animalIds || []).map(id => { const a = byId(id); if(!a) return ''; const r = c.results.find(x => x.outcomes?.[id]); return `<div class="kv"><button class="link" data-go="${id}">${esc(animalLabel(a))}</button><span class="muted">${r ? RESULT[r.outcomes[id].r] + (r.outcomes[id].scheme ? ': ' + esc(schemeById(r.outcomes[id].scheme)?.name || '') : '') : a.status !== 'active' ? STATUS[a.status] : 'в курсе'}</span></div>`; }).join('')}</div>
    ${ev.note ? `<p class="muted" style="margin:0">${esc(ev.note)}</p>` : ''}
    <div class="actions"><button class="btn danger adm" id="cdel">Удалить курс</button></div><div id="cdelc"></div>`;
  openSheet(c.sc.name, body, s => {
    s.querySelectorAll('[data-dose]').forEach(b => b.onclick = () => { const [id, d] = b.dataset.dose.split(':'); doseSheet(id, +d); });
    s.querySelectorAll('[data-res]').forEach(b => b.onclick = () => resultSheet(b.dataset.res));
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => animalCard(b.dataset.go));
    s.querySelector('#cdel').onclick = () => askConfirm(s.querySelector('#cdelc'), 'Удалить курс вместе с отметками процедур?', () => { c.doses.concat(c.results).forEach(x => store.del('events', x.id)); store.del('events', ev.id); toast('Курс удалён'); closeSheet(); });
  }, 'course:' + evId);
}

/* ===== События: что сделать сегодня и что впереди ===== */
const repeatTitle = e => e.scheme ? `${e.type === 'vac' ? 'Ревакцинация' : 'Повтор: ' + (ET[e.type]?.t || '').toLowerCase()} «${e.scheme.name}»` : `${ET[e.type]?.t || 'Обработка'}${e.drug ? ' · ' + e.drug : ''} — повтор`;
function agendaItems(to){
  const t = today(), out = [];
  activeCourses().forEach(c => {
    const kindT = SCHEME_KIND[c.sc.kind] || '';
    c.stepDays.forEach(d => { if(c.doneDays.has(d)) return; const date = addDays(c.e.date, d - 1); if(date > to) return;
      out.push({date, kind:'vet', title:`${kindT}: ${c.sc.name} — день ${d}`, sub:`${stepsOnDay(c.sc, d).map(stepShort).join(' + ')} · ${heads(c.animals.length)} · № ${tagsLine(c.animals, 8)}`,
        attr: date <= t ? `data-dose="${c.e.id}:${d}"` : `data-course="${c.e.id}"`, btn: date <= t ? 'Сделано' : 'Курс'}); });
    if(c.check){ const date = addDays(c.e.date, c.check - 1); if(date <= to) out.push({date, kind:'vet', title:`Результат лечения: ${c.sc.name}`, sub:`${heads(c.animals.length)} · № ${tagsLine(c.animals, 8)} · здорово / повторить / другая схема`,
      attr: date <= t ? `data-res="${c.e.id}"` : `data-course="${c.e.id}"`, btn: date <= t ? 'Итог' : 'Курс'}); }
  });
  planItems().forEach(it => {
    if(it.date > to) return;
    if(it.kind === 'vet') out.push({date:it.date, kind:'vet', title:repeatTitle(it.ev), sub:`${it.sub}${it.ev.scheme ? ' · ' + (it.ev.scheme.steps || []).map(stepShort).join(' + ') : ''} · первая была ${fmtD(it.ev.date)}`, attr:`data-done="${it.ev.id}"`, btn: it.date <= addDays(t, 3) ? 'Сделать' : 'Сделать раньше'});
    else if(it.kind === 'birth') out.push({date:it.date, kind:'birth', title:it.title, sub:it.sub, attr:`data-birth="${it.animal.id}"`, btn:'Окот'});
    else out.push({date:it.date, kind:'stock', title:it.title, sub:it.sub, attr:`data-restock="${it.item.id}"`, btn:'Приход'});
  });
  const bal = stockBalance();
  (S.items || []).filter(i => i.cat === 'vet' && i.expiry && (bal[i.id] || 0) > 0 && i.expiry <= to).forEach(i => out.push({date: i.expiry < t ? t : i.expiry, kind:'stock', title:`${i.expiry < t ? 'Просрочен' : 'Истекает срок'}: ${i.name}`, sub:`годен до ${fmtD(i.expiry)} · остаток ${num(bal[i.id])} ${i.unit}`, attr:`data-item="${i.id}"`, btn:'Открыть'}));
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'vet' ? -1 : 1));
}
const todayCount = () => agendaItems(today()).filter(x => x.kind !== 'stock').length;
function eventsView(){
  let h = `<h2 class="page" style="margin-top:4px">События</h2>`;
  if(loading('events')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const t = today(), hz = S.agHz || 'week', kf = S.agKind || '';
  const to = {today:t, week:addDays(t, 7), month:addDays(t, 31), all:addDays(t, 400)}[hz];
  const all = agendaItems(to), list = all.filter(x => !kf || x.kind === kf);
  h += `<div class="segb" role="group">${[['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё']].map(([k, l]) => `<button data-aghz="${k}" aria-pressed="${hz === k}">${l}</button>`).join('')}</div>
    <div class="chips" style="flex-wrap:wrap">${[['', 'Все', all.length], ['vet', 'Ветеринария', all.filter(x => x.kind === 'vet').length], ['birth', 'Окоты', all.filter(x => x.kind === 'birth').length], ['stock', 'Склад', all.filter(x => x.kind === 'stock').length]].map(([k, l, n]) => `<button class="chip" data-agk="${k}" aria-pressed="${kf === k}">${l}${n ? ' · ' + n : ''}</button>`).join('')}</div>`;
  if(!list.length) return h + `<div class="empty"><p>${hz === 'today' ? 'На сегодня ничего не запланировано.' : 'В этот период ничего не запланировано.'}</p><p class="muted">Сюда попадают уколы и итоги по курсам лечения, ревакцинации и повторные обработки (если в схеме указан повтор), ожидаемые окоты и корма или препараты, которые заканчиваются.</p></div>`;
  const groups = {}; list.forEach(x => { const k = x.date < t ? 'over' : x.date; (groups[k] ||= []).push(x); });
  const label = k => k === 'over' ? 'Просрочено' : k === t ? 'Сегодня, ' + parse(k).toLocaleDateString('ru-RU', {day:'numeric', month:'long'}) : k === addDays(t, 1) ? 'Завтра, ' + parse(k).toLocaleDateString('ru-RU', {day:'numeric', month:'long'}) : (s => s[0].toUpperCase() + s.slice(1))(parse(k).toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'}));
  return h + Object.keys(groups).sort((a, b) => a === 'over' ? -1 : b === 'over' ? 1 : a.localeCompare(b)).map(k => `<div><div class="eyebrow ${k === 'over' ? 'money minus' : ''}">${label(k)}</div></div>
    <div class="list">${groups[k].map(x => `<button class="row vtask" ${x.attr} style="grid-template-columns:1fr auto"><span class="main"><span class="pill ${x.kind === 'vet' ? 'ok' : x.kind === 'birth' ? 'warn' : ''}">${{vet:'ветеринария', birth:'окот', stock:'склад'}[x.kind]}${k === 'over' ? ' · ' + fmtShort(x.date) : ''}</span>
      <div class="name">${esc(x.title)}</div><div class="sub">${esc(x.sub)}</div></span><span class="side">${esc(x.btn)} ›</span></button>`).join('')}</div>`).join('');
}

/* ===== Отчёт за день ===== */
function dailyData(d){
  const act = S.animals.filter(a => a.status === 'active'), t = today();
  const herd = ['sheep', 'goat'].map(sp => {
    const l = act.filter(a => a.species === sp), cnt = {};
    l.forEach(a => { const g = groupOf(a) || ''; cnt[g] = (cnt[g] || 0) + 1; });
    return {sp, total:l.length, groups:GROUPS[sp].map(([g, n]) => [n, cnt[g] || 0]).filter(x => x[1]).concat(cnt[''] ? [['Без группы', cnt['']]] : [])};
  });
  const milk = ['goat', 'sheep'].map(sp => {
    const am = milkTotal(milkDoc(d, 'am', sp)), pm = milkTotal(milkDoc(d, 'pm', sp)), day = round(am + pm, 2);
    const dairy = act.filter(a => a.species === sp && groupOf(a) === 'milk').length;
    const heads = Math.max(milkHeads(milkDoc(d, 'am', sp)), milkHeads(milkDoc(d, 'pm', sp)));
    const n = dairy || heads;
    const out = round(S.milkout.filter(o => o.species === sp && o.date === d).reduce((x, o) => x + (+o.liters || 0), 0), 2);
    const bal = round(S.milk.filter(m => m.species === sp && m.date <= d).reduce((x, m) => x + milkTotal(m), 0) - S.milkout.filter(o => o.species === sp && o.date <= d).reduce((x, o) => x + (+o.liters || 0), 0), 2);
    return {sp, am:round(am, 2), pm:round(pm, 2), day, n, avg: n && day ? round(day / n, 2) : 0, out, bal};
  });
  const balTo = id => round(S.moves.filter(m => m.item === id && m.date <= d).reduce((x, m) => x + (m.kind === 'in' ? 1 : -1) * (+m.qty || 0), 0), 3);
  const usedDay = id => round(S.moves.filter(m => m.item === id && m.kind === 'out' && m.date === d).reduce((x, m) => x + (+m.qty || 0), 0), 3);
  const stock = cat => itemsOf(cat).map(i => ({name:i.name, unit:i.unit, bal:balTo(i.id), used:usedDay(i.id), low: i.min > 0 && balTo(i.id) < i.min}));
  const births = S.events.filter(e => e.type === 'birth' && e.date === d);
  const kids = S.animals.filter(a => a.birth === d && a.motherId).length;
  const gone = S.animals.filter(a => a.status !== 'active' && a.outDate === d);
  const hi = healthInfo();
  const vet = d === t ? agendaItems(t).filter(x => x.kind === 'vet').length : 0;
  const doneVet = S.events.filter(e => e.date === d && (ET[e.type]?.vet || e.type === 'dose')).length;
  const vetLow = itemsOf('vet').filter(i => { const b = balTo(i.id); return b <= 0 || (i.min > 0 && b < i.min) || (i.expiry && i.expiry < addDays(d, 30)); }).map(i => `${i.name}: ${num(balTo(i.id))} ${i.unit}${i.expiry && i.expiry < addDays(d, 30) ? ', годен до ' + fmtD(i.expiry) : ''}`);
  const cntG = (sp, g) => act.filter(a => a.species === sp && (groupOf(a) || '') === g).length;
  const lines = [
    ['Дойное стадо овец', cntG('sheep', 'milk'), 1], ['Дойное стадо коз', cntG('goat', 'milk'), 1],
    ['Бараны-производители', cntG('sheep', 'ram'), 1], ['Козлы-производители', cntG('goat', 'buck'), 0],
    ['Бараны на мясо', cntG('sheep', 'meat'), 1], ['Козлы на мясо', cntG('goat', 'meat'), 0],
    ['Суягные овцы', cntG('sheep', 'preg'), 0], ['Сукозные козы', cntG('goat', 'preg'), 0],
    ['Ремонтный молодняк овец', cntG('sheep', 'repl'), 0], ['Ремонтный молодняк коз', cntG('goat', 'repl'), 0], ['Ярки (козы)', cntG('goat', 'yarki'), 0],
    ['Ягнята до 4 мес', cntG('sheep', 'young'), 0], ['Козлята до 4 мес', cntG('goat', 'young'), 0],
    ['Декоративные овцы', cntG('sheep', 'deco'), 0],
    ['Овцы на карантине', cntG('sheep', 'quar'), 0], ['Козы на карантине', cntG('goat', 'quar'), 0],
    ['Овцы без группы', cntG('sheep', ''), 0], ['Козы без группы', cntG('goat', ''), 0]
  ].filter(x => x[2] || x[1]).map(x => [x[0], x[1]]);
  const totals = [['Всего овец', act.filter(a => a.species === 'sheep').length], ['Всего коз', act.filter(a => a.species === 'goat').length], ['Всего голов', act.length]];
  return {d, total:act.length, herd, lines, totals, young:act.filter(a => groupOf(a) === 'young').length, milk, feed:stock('feed'), fuel:stock('fuel'), births:births.length, kids, gone:gone.length, hi, vet, doneVet, vetLow};
}
function dailyText(r){
  const L = [`Берегиня — отчёт за ${fmtD(r.d)}`, '', 'ПОГОЛОВЬЕ'];
  r.lines.forEach(([n, c]) => L.push(`${n}: ${c}`));
  L.push(''); r.totals.forEach(([n, c]) => L.push(`${n}: ${c}`));
  if(r.births || r.gone) L.push(`За день: окотов ${r.births}${r.kids ? ` (детёнышей ${r.kids})` : ''}${r.gone ? `, выбыло ${r.gone}` : ''}`);
  L.push('', 'МОЛОКО ЗА СУТКИ');
  r.milk.forEach(m => { const w = m.sp === 'goat' ? ['коз', 'козу'] : ['овец', 'овцу'];
    L.push(`Надой ${w[0]} за сутки: ${num(m.day)} л (утро ${num(m.am)}, вечер ${num(m.pm)})`, `Средний удой на 1 ${w[1]}: ${m.avg ? num(m.avg) + ' л' : '—'}`); });
  L.push(`Всего молока за сутки: ${num(round(r.milk.reduce((x, m) => x + m.day, 0), 2))} л`);
  r.milk.forEach(m => L.push(`${MILKNAME[m.sp]}: отгружено ${num(m.out)} л, в танке ${num(m.bal)} л`));
  if(r.milk.some(m => m.am && !m.pm)) L.push('(вечерняя дойка ещё не внесена)');
  L.push('', 'КОРМА — ОСТАТОК'); r.feed.forEach(f => L.push(`  • ${f.name}: ${num(f.bal)} ${f.unit}${f.used ? ` (расход за день ${num(f.used)})` : ''}${f.low ? ' — мало!' : ''}`));
  if(r.fuel.length){ L.push('', 'ГСМ — ОСТАТОК'); r.fuel.forEach(f => L.push(`  • ${f.name}: ${num(f.bal)} ${f.unit}${f.used ? ` (выдано за день ${num(f.used)})` : ''}`)); }
  L.push('', 'ЗДОРОВЬЕ', `В норме ${r.hi.pct}%: здоровых ${r.hi.ok}, на лечении ${r.hi.treat}, под наблюдением ${r.hi.watch}`);
  if(r.doneVet) L.push(`Ветобработок за день: ${r.doneVet}`);
  if(r.vet) L.push(`Запланировано на сегодня: ${r.vet}`);
  if(r.vetLow.length){ L.push('Аптека — внимание:'); r.vetLow.forEach(x => L.push('  • ' + x)); }
  return L.join('\n');
}
function dailyView(){
  let h = `<button class="back" data-nav="home">‹ Главная</button><h2 class="page">Отчёт за день</h2>`;
  if(loading('animals', 'milk', 'moves', 'items', 'events')) return h + `<div class="empty"><p>Загружаем…</p></div>`;
  const d = S.dailyDate || today(), r = dailyData(d);
  const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><strong>${v}</strong></div>`;
  h += `<div class="monthsel"><button data-dd="-1" aria-label="Предыдущий день">‹</button><h2>${d === today() ? 'Сегодня, ' : ''}${parse(d).toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'}).replace(/\s*г\.?$/, '')}</h2><button data-dd="1" aria-label="Следующий день" ${d >= today() ? 'disabled' : ''}>›</button></div>
    <div class="actions"><button class="btn primary" data-act="daily-xl">Скачать в Excel</button><button class="btn" data-act="daily-share">Отправить текстом</button></div>
    <div class="dgrid">
    <div class="panel"><div class="eyebrow">Поголовье</div>${r.lines.map(([n, c]) => kv(n, c)).join('')}${r.totals.map(([n, c]) => kv(n, c, 'total')).join('')}
      ${r.births || r.gone ? kv('За день', `окотов ${r.births}${r.kids ? `, детёнышей ${r.kids}` : ''}${r.gone ? `, выбыло ${r.gone}` : ''}`) : ''}</div>
    <div class="panel"><div class="eyebrow">Молоко за сутки</div>${r.milk.map(m => `<div class="kv total"><span>${MILKNAME[m.sp]}</span><strong>${num(m.day)} л</strong></div>
        ${kv('Утро / вечер', `${num(m.am)} / ${num(m.pm)} л`)}${kv(`Средний удой на 1 ${m.sp === 'goat' ? 'козу' : 'овцу'}`, m.avg ? `${num(m.avg)} л` : '—')}${kv('Дойных голов', m.n || '—')}${kv('Отгружено', `${num(m.out)} л`)}${kv('В танке на конец дня', `${num(m.bal)} л`)}`).join('')}
      <div class="kv total"><span>Всего за сутки</span><strong>${num(round(r.milk.reduce((x, m) => x + m.day, 0), 2))} л</strong></div>
      ${r.milk.some(m => m.am && !m.pm) ? '<p class="muted" style="margin:0">Вечерняя дойка ещё не внесена — удой за сутки неполный.</p>' : ''}</div>
    <div class="panel"><div class="eyebrow">Корма — остаток на конец дня</div>${r.feed.length ? r.feed.map(f => kv(esc(f.name) + (f.used ? ` <span class="muted">· за день −${num(f.used)}</span>` : ''), `<span class="${f.bal < 0 || f.low ? 'money minus' : ''}">${num(f.bal)} ${esc(f.unit)}</span>`)).join('') : '<p class="muted" style="margin:0">Кормов нет.</p>'}</div>
    ${r.fuel.length ? `<div class="panel"><div class="eyebrow">ГСМ — остаток</div>${r.fuel.map(f => kv(esc(f.name) + (f.used ? ` <span class="muted">· выдано −${num(f.used)}</span>` : ''), `${num(f.bal)} ${esc(f.unit)}`)).join('')}</div>` : ''}
    <div class="panel"><div class="eyebrow">Здоровье и ветеринария</div>${kv('В норме', r.hi.pct + '%')}${kv('Здоровых', r.hi.ok)}${kv('На лечении', r.hi.treat)}${kv('Под наблюдением (карантин)', r.hi.watch)}${kv('Ветобработок за день', r.doneVet)}${d === today() ? kv('Запланировано на сегодня', r.vet) : ''}
      ${r.vetLow.length ? `<div class="eyebrow" style="margin-top:6px">Аптека — внимание</div>${r.vetLow.map(x => `<div class="sub">${esc(x)}</div>`).join('')}` : ''}</div>
    </div>
    <p class="muted" style="margin:0">Поголовье и группы — на текущий момент. Молоко, корма и ГСМ — за выбранный день. Средний удой = надой за сутки ÷ число голов в группе «Дойные».</p>`;
  return h;
}
function dailyXl(){
  const r = dailyData(S.dailyDate || today()), rows = [];
  r.lines.forEach(([n, c], i) => rows.push([i ? '' : 'Поголовье', n, c]));
  r.totals.forEach(([n, c]) => rows.push(['', n, c]));
  if(r.births || r.gone) rows.push(['Поголовье', 'За день: окотов / детёнышей / выбыло', `${r.births} / ${r.kids} / ${r.gone}`]);
  r.milk.forEach(m => { const n = MILKNAME[m.sp]; rows.push(['Молоко', `Надой ${m.sp === 'goat' ? 'коз' : 'овец'} за сутки, л`, m.day], ['', `${n}: утро, л`, m.am], ['', `${n}: вечер, л`, m.pm], ['', `Дойное стадо ${m.sp === 'goat' ? 'коз' : 'овец'}, гол.`, m.n || ''], ['', `Средний удой на 1 ${m.sp === 'goat' ? 'козу' : 'овцу'}, л`, m.avg || ''], ['', `${n}: отгружено, л`, m.out], ['', `${n}: в танке на конец дня, л`, m.bal]); });
  rows.push(['Молоко', 'Всего за сутки, л', round(r.milk.reduce((x, m) => x + m.day, 0), 2)]);
  r.feed.forEach((f, i) => rows.push([i ? '' : 'Корма — остаток', `${f.name}, ${f.unit}`, f.bal]));
  r.fuel.forEach((f, i) => rows.push([i ? '' : 'ГСМ — остаток', `${f.name}, ${f.unit}`, f.bal]));
  rows.push(['Здоровье', 'В норме, %', r.hi.pct], ['', 'Здоровых', r.hi.ok], ['', 'На лечении', r.hi.treat], ['', 'Под наблюдением', r.hi.watch], ['', 'Ветобработок за день', r.doneVet]);
  r.vetLow.forEach((x, i) => rows.push([i ? '' : 'Аптека — внимание', x, '']));
  const sh = {name:'Отчёт за день', title:`Берегиня — отчёт за ${fmtD(r.d)}`, note:'Поголовье — на момент выгрузки; молоко, корма и ГСМ — за день',
    cols:[{h:'Раздел', w:20}, {h:'Показатель', w:44}, {h:'Значение', w:14, t:'n'}], rows:rows.map(x => [x[0], x[1], typeof x[2] === 'number' ? x[2] : x[2]])};
  saveFile(`Отчёт за день ${r.d}.xlsx`, XL.build([sh])).then(ok => ok && toast('Отчёт сохранён в «Загрузки»'));
}
async function dailyShare(){
  const txt = dailyText(dailyData(S.dailyDate || today()));
  try{ if(navigator.share){ await navigator.share({title:'Отчёт за день', text:txt}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
  try{ await navigator.clipboard.writeText(txt); toast('Отчёт скопирован — вставьте в мессенджер'); }
  catch(_){ openSheet('Отчёт текстом', `<textarea style="min-height:60vh" readonly>${esc(txt)}</textarea>`, () => {}, 'dtext'); }
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
    <div class="evbtns">${a.status==='active' ? `${a.sex==='f' ? `<button class="btn ${planItems().some(i => i.kind==='birth' && i.animal.id===id) ? 'primary' : ''}" data-cev="birth">Окот</button>` : ''}<button class="btn" data-cev="ill">Лечение</button><button class="btn" data-cev="vac">Вакцинация</button><button class="btn" data-cev="treat">Дегельминтизация</button><button class="btn" data-cev="vit">Витаминизация</button><button class="btn" data-cev="">Другое…</button>` : ''}<button class="btn" id="edit">Изменить</button></div>
    ${(() => { const cs = activeCourses().filter(c => c.animals.includes(id)); return cs.length ? `<div class="panel"><div class="eyebrow">Сейчас</div>${cs.map(c => `<button class="row" data-course="${c.e.id}" style="grid-template-columns:1fr auto"><span class="main"><div class="name">${esc(c.sc.name)}</div><div class="sub">${SCHEME_KIND[c.sc.kind]} · день ${Math.min(c.dayNow, c.check || c.last)} из ${c.check || c.last}${c.pending.length ? ' · сегодня: ' + esc(c.pending.at(-1).steps.map(stepShort).join(' + ')) : c.needResult ? ' · пора оценить результат' : ''}</div></span><span class="side">›</span></button>`).join('')}</div>` : ''; })()}
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
      ${evs.length?`<div class="timeline">${evs.map(e => evRow(e, id)).join('')}</div>`:`<p class="muted" style="margin:0">Событий пока нет. Запишите вакцинацию, взвешивание, случку или окот.</p>`}</div>`;
  openSheet(animalLabel(a), body, s => {
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => animalCard(b.dataset.go));
    s.querySelectorAll('[data-pen-go]').forEach(b => b.onclick = () => penSheet(b.dataset.penGo));
    s.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { const e = S.events.find(x => x.id===b.dataset.ev); if(!e) return; if(e.course) courseSheet(e.course); else if(e.scheme) courseSheet(e.id); else eventForm(e); });
    s.querySelectorAll('[data-course]').forEach(b => b.onclick = () => courseSheet(b.dataset.course));
    s.querySelectorAll('[data-cev]').forEach(b => b.onclick = () => eventForm({animalIds:[id], type: b.dataset.cev || 'weight'}));
    s.querySelector('#edit').onclick = () => animalForm(a);
  }, 'card:'+id);
}
function evRow(e, aid){
  const bits = [];
  if(e.type==='dose'){ const ce = S.events.find(x => x.id===e.course); bits.push(`${ce?.scheme?.name || 'схема'}, день ${e.day}`); (e.steps||[]).forEach(x => bits.push(x)); if(e.note) bits.push(e.note);
    return `<button class="ev" data-ev="${e.id}"><span class="d">${fmtD(e.date)}</span><span><div class="t">Процедура</div><div class="s">${esc(bits.join(' · '))}</div>${byLine(e.byEmail, 'записал(а)') ? `<span class="by">${esc(byLine(e.byEmail, 'записал(а)'))}</span>` : ''}</span></button>`; }
  if(e.type==='result'){ const o = aid ? e.outcomes?.[aid] : null; bits.push(e.schemeName || ''); if(o) bits.push(RESULT[o.r] + (o.scheme ? ': ' + (schemeById(o.scheme)?.name || '') : '')); else bits.push(`${heads((e.animalIds||[]).length)}`); if(e.note) bits.push(e.note);
    return `<button class="ev" data-ev="${e.id}"><span class="d">${fmtD(e.date)}</span><span><div class="t">Результат лечения</div><div class="s">${esc(bits.filter(Boolean).join(' · '))}</div>${byLine(e.byEmail, 'записал(а)') ? `<span class="by">${esc(byLine(e.byEmail, 'записал(а)'))}</span>` : ''}</span></button>`; }
  if(e.scheme){ bits.push(`по схеме «${e.scheme.name}»`); (e.scheme.steps||[]).forEach(st => bits.push(stepText(st))); }
  if(e.drug && !e.scheme) bits.push(e.drug);
  if(e.dose) bits.push(e.dose);
  if(e.type==='weight' && e.weight) bits.push(`${num(e.weight)} кг`);
  if(e.type==='mating' && e.sireId) bits.push(`с ${animalLabel(byId(e.sireId))}`);
  if(e.type==='birth' && e.count != null) bits.push(`${e.count} ${plural(+e.count,'детёныш','детёныша','детёнышей')}`);
  if(e.nextDate) bits.push(`повтор ${fmtD(e.nextDate)}${e.doneNext?' ✓':''}`);
  if((e.animalIds||[]).length>1) bits.push(`группа ${e.animalIds.length} гол.`);
  if(e.note) bits.push(e.note);
  return `<button class="ev" data-ev="${e.id}"><span class="d">${fmtD(e.date)}</span>
    <span><div class="t">${ET[e.type]?.t || 'Событие'}</div>${bits.length?`<div class="s">${esc(bits.join(' · '))}</div>`:''}${byLine(e.byEmail, 'записал(а)') ? `<span class="by">${esc(byLine(e.byEmail, 'записал(а)'))}</span>` : ''}</span></button>`;
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
    ${fld('e-type','Тип события',`<select id="e-type" name="type" ${isEdit && v.scheme ? 'disabled' : ''}>${Object.entries(ET).filter(([k,o]) => !o.hide || k===v.type).map(([k,o]) => opt(k,o.t,v.type)).join('')}</select>`)}
    ${isEdit && v.scheme ? `<input type="hidden" name="type" value="${esc(v.type)}">` : ''}
    <div class="field"><label>Животные · <span id="ecount"></span></label>
      <div class="chips" style="flex-wrap:wrap"><button type="button" class="chip" data-pick="all">Всё стадо</button><button type="button" class="chip" data-pick="f">Все самки</button>${barnsHere.map(b => `<button type="button" class="chip" data-pick="b:${b.id}">${b.name}</button>`).join('')}<button type="button" class="chip" data-pick="none">Снять</button></div>
      <select id="e-penpick" aria-label="Отметить загон">${penOptions('', 'Отметить весь загон…')}</select>
      <div class="search"><input id="e-find" type="search" placeholder="Найти по номеру бирки, кличке, загону" autocomplete="off" enterkeyhint="done"></div>
      <div id="e-picked" class="picked"></div>
      <div class="list scroll" id="e-alist">${act.map(a => `<label class="row pickrow" data-s="${esc(norm([a.tag, a.name, a.breed, animalTitle(a), penShort(a.pen), penLabel(a.pen)].filter(Boolean).join(' ')))}" data-t="${esc(norm(a.tag))}"><input type="checkbox" name="aid" value="${a.id}" ${chosen.has(a.id)?'checked':''}><span class="tag">${esc(a.tag)}</span><span class="sub">${esc(animalTitle(a))} ${a.sex==='f'?'♀':'♂'}${a.pen?' · '+esc(penShort(a.pen)):''}</span></label>`).join('') || '<p class="sub" style="padding:12px;margin:0">В стаде пока нет животных.</p>'}</div></div>
    ${fld('e-date','Дата',`<input id="e-date" type="date" name="date" value="${esc(v.date)}" max="${addDays(today(),1)}" required>`)}
    <div data-for="vet">${isEdit ? (v.scheme ? `<div class="panel"><div class="eyebrow">Схема: ${esc(v.scheme.name)}</div>${(v.scheme.steps||[]).map(st => `<div class="sub">${esc(stepText(st))}</div>`).join('')}</div>` : '')
      : `${fld('e-scheme','Схема',`<select id="e-scheme" name="schemeId"></select>`)}<div id="e-sinfo"></div>
      <label class="row pickrow" id="e-day1w" style="grid-template-columns:auto 1fr"><input type="checkbox" id="e-day1" checked><span>Процедуры 1-го дня уже сделаны — отметить сразу</span></label>`}</div>
    <div data-for="vet" class="two manual">${fld('e-drug','Препарат',`<input id="e-drug" name="drug" value="${esc(v.drug)}" list="drugs">`)}${fld('e-dose','Доза',`<input id="e-dose" name="dose" value="${esc(v.dose)}" placeholder="напр. 1 мл/10 кг">`)}</div>
    <datalist id="drugs">${[...new Set(S.events.map(x => x.drug).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div data-for="vet" class="manual">${fld('e-next','Следующая обработка (напоминание)',`<input id="e-next" type="date" name="nextDate" value="${esc(v.nextDate)}">`)}</div>
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
    const scSel = s.querySelector('#e-scheme');
    const showFor = () => { const vet = ET[t.value].vet; s.querySelectorAll('[data-for]').forEach(el => el.hidden = !(el.dataset.for===t.value || (el.dataset.for==='vet' && vet)));
      if(vet && isEdit && v.scheme) s.querySelectorAll('.manual').forEach(el => el.hidden = true);
      if(vet && scSel){
        const k = KIND_OF_TYPE[t.value], list = schemes().filter(x => x.kind===k);
        if(v.schemeSnap && v.schemeSnap.kind===k && !list.some(x => x.id===v.schemeSnap.id)) list.unshift(v.schemeSnap);
        const want = v.schemeId && list.some(x => x.id===v.schemeId) ? v.schemeId : (list[0]?.id || ''), cur = scSel.dataset.kind===k ? scSel.value : want;
        if(scSel.dataset.kind!==k){ scSel.innerHTML = opt('', list.length ? '— без схемы, вписать вручную —' : 'схем пока нет — вписать вручную', cur) + list.map(x => opt(x.id, x.name, cur)).join(''); scSel.dataset.kind = k; }
        const sc = schemeById(scSel.value) || (v.schemeSnap?.id===scSel.value ? v.schemeSnap : null);
        s.querySelectorAll('.manual').forEach(el => el.hidden = !!sc);
        s.querySelector('#e-day1w').hidden = !sc;
        s.querySelector('#e-sinfo').innerHTML = sc ? `<div class="panel">${(sc.steps||[]).map(st => `<div class="sub">${esc(stepText(st))}</div>`).join('')}${sc.kind==='ill' ? `<div class="sub">результат — на ${schemeCheckDay(sc)}-й день</div>` : sc.repeat ? `<div class="sub">повтор через ${sc.repeat} дн. — появится в «Плане»</div>` : ''}</div>` : '';
      } };
    if(scSel) scSel.onchange = showFor;
    const count = () => { const ids = checked(), n = ids.length; s.querySelector('#ecount').textContent = n ? `выбрано ${n}` : 'не выбраны';
      const pk = s.querySelector('#e-picked'); if(pk) pk.innerHTML = n && n <= 30 ? ids.map(id => `<button type="button" class="ptag" data-unpick="${id}">№ ${esc(byId(id)?.tag || '')} ×</button>`).join('') : n ? `<span class="muted">${n} животных отмечено</span>` : '';
      pk?.querySelectorAll('[data-unpick]').forEach(b => b.onclick = () => { const c = f.querySelector(`input[name=aid][value="${b.dataset.unpick}"]`); if(c){ c.checked = false; count(); updateKids(); } }); };
    const findIn = s.querySelector('#e-find');
    const applyFind = () => { const q = norm(findIn.value); let shown = 0;
      s.querySelectorAll('#e-alist .pickrow').forEach(r => { const ok = !q || r.dataset.s.includes(q); r.hidden = !ok; if(ok) shown++; });
      let nf = s.querySelector('#e-nofind'); if(!shown && q){ if(!nf){ nf = document.createElement('p'); nf.id = 'e-nofind'; nf.className = 'sub'; nf.style.cssText = 'padding:12px;margin:0'; s.querySelector('#e-alist').append(nf); } nf.textContent = 'Не найдено: ' + findIn.value; nf.hidden = false; } else if(nf) nf.hidden = true; };
    if(findIn){ findIn.oninput = applyFind;
      findIn.onkeydown = ev2 => { if(ev2.key !== 'Enter') return; ev2.preventDefault(); const q = norm(findIn.value); if(!q) return;
        const rows = [...s.querySelectorAll('#e-alist .pickrow')].filter(r => !r.hidden), exact = rows.filter(r => r.dataset.t === q), pick = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
        if(pick){ pick.querySelector('input').checked = true; findIn.value = ''; applyFind(); count(); updateKids(); toast('Отмечено: № ' + pick.querySelector('.tag').textContent); } }; }
    const lastSire = (momId, date) => S.events.filter(x => x.type==='mating' && (x.animalIds||[]).includes(momId) && x.date <= date && x.sireId).sort((a,b) => b.date.localeCompare(a.date))[0]?.sireId || '';
    function updateKids(){
      if(t.value!=='birth' || isEdit){ kidsBox.innerHTML = ''; return; }
      const ids = checked();
      if(ids.length!==1){ kidsBox.innerHTML = `<p class="muted" style="margin:0">${ids.length ? 'Чтобы сразу завести карточки детёнышей, отметьте одну мать.' : 'Отметьте мать в списке выше.'}</p>`; return; }
      const mom = byId(ids[0]); const n = Math.max(0, Math.min(8, parseInt(f.querySelector('#e-count').value) || 0));
      const ks = f.querySelector('#e-ksire'); if(!ks.dataset.touched){ ks.value = lastSire(mom.id, f.querySelector('#e-date').value || today()); }
      const prev = [...kidsBox.querySelectorAll('.kidrow')].map(r => ({tag:r.querySelector('[data-k=tag]').value, sex:r.querySelector('input[type=radio]:checked')?.value, w:r.querySelector('[data-k=w]').value, br:r.querySelector('[data-k=br]').value}));
      kidsBox.innerHTML = n ? `<div class="eyebrow">${mom.species==='goat'?'Козлята':'Ягнята'} · мать ${esc(animalLabel(mom))}, ${esc(penShort(mom.pen)||'без загона')}</div>` + Array.from({length:n}, (_,i) => {
        const p = prev[i] || {}; const sx = p.sex || 'f';
        return `<div class="kidrow"><span class="kn">${i+1}</span>
          <input data-k="tag" aria-label="Номер бирки детёныша ${i+1}" placeholder="${esc(mom.tag)}-${i+1}" value="${esc(p.tag||'')}" autocomplete="off">
          <div class="seg"><label><input type="radio" name="ks-${i}" value="f" ${sx==='f'?'checked':''}>♀</label><label><input type="radio" name="ks-${i}" value="m" ${sx==='m'?'checked':''}>♂</label></div>
          <input data-k="w" aria-label="Вес при рождении, кг" placeholder="вес, кг" inputmode="decimal" value="${esc(p.w||'')}" autocomplete="off">
          <input data-k="br" class="kbr" aria-label="Порода" placeholder="порода" list="breeds" value="${esc(p.br ?? mom.breed ?? '')}" autocomplete="off"></div>`;
      }).join('') + `<datalist id="breeds">${[...new Set(S.animals.map(x => x.breed).filter(Boolean))].map(b => `<option value="${esc(b)}">`).join('')}</datalist><p class="muted" style="margin:0">Для каждого: бирка, пол, вес при рождении, порода. Мать — отмеченная, отец — выше. Бирку можно оставить пустой — номер будет как в подсказке.</p>` : '';
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
      const sc = !isEdit && ET[type].vet ? (schemeById(fd.get('schemeId')) || (v.schemeSnap?.id===fd.get('schemeId') ? v.schemeSnap : null)) : null;
      const rn = v.fromRepeat ? (+v.repeatNo || 1) : 0;
      if(sc){ data.scheme = JSON.parse(JSON.stringify(sc)); data.drug = sc.name; if(rn) data.repeatNo = rn; if(sc.repeat && rn < (+sc.repeatTimes || 1)) data.nextDate = addDays(data.date, +sc.repeat); }
      else if(isEdit && e.scheme){ data.scheme = e.scheme; data.drug = e.drug || e.scheme.name; if(e.nextDate) data.nextDate = e.nextDate; if(e.prevCourse) data.prevCourse = e.prevCourse; }
      else if(ET[type].vet){ data.drug = fd.get('drug')||''; data.dose = fd.get('dose')||''; if(fd.get('nextDate')) data.nextDate = fd.get('nextDate'); }
      if(type==='weight'){ const w = dec(fd.get('weight')); if(!(w > 0)){ err.hidden = false; err.textContent = 'Укажите вес.'; return; } data.weight = round(w,1); }
      if(type==='mating' && fd.get('sireId')) data.sireId = fd.get('sireId');
      if(type==='birth'){ data.count = parseInt(fd.get('count')) || 0; if(fd.get('kidSire')) data.sireId = fd.get('kidSire'); }
      if(isEdit && e.doneNext && data.nextDate===e.nextDate) data.doneNext = true;
      if(isEdit){ data.by = e.by||null; data.byEmail = e.byEmail||null; data.created = e.created||null; store.set('events', e.id, data); }
      else { const nid = store.add('events', data);
        if(v.fromRepeat && S.events.some(x => x.id===v.fromRepeat)) store.merge('events', v.fromRepeat, {doneNext:true});
        if(sc && s.querySelector('#e-day1')?.checked && stepsOnDay(sc, 1).length && data.date <= today()) store.add('events', {type:'dose', course:nid, day:1, date:data.date, animalIds:all, steps:stepsOnDay(sc, 1).map(stepShort)}); }
      let made = 0;
      if(type==='birth' && !isEdit && all.length===1){
        const mom = byId(all[0]);
        kidsBox.querySelectorAll('.kidrow').forEach((r, i) => {
          const tag = r.querySelector('[data-k=tag]').value.trim() || `${mom.tag}-${i+1}`;
          const sex = r.querySelector('input[type=radio]:checked')?.value || 'f';
          const kid = store.add('animals', {tag, sex, species:mom.species, breed:r.querySelector('[data-k=br]').value.trim() || mom.breed || '', birth:data.date, motherId:mom.id, fatherId:data.sireId||'', pen:mom.pen||'', status:'active', group:'young', groupSince:data.date});
          const w = dec(r.querySelector('[data-k=w]').value);
          if(w > 0) store.add('events', {animalIds:[kid], type:'weight', date:data.date, weight:round(w,2), note:'при рождении'});
          made++;
        });
      }
      toast(made ? `Окот записан, заведено карточек: ${made}` : sc ? `Курс назначен: ${sc.name}, ${heads(all.length)}` : 'Записано');
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
    ${it.cat==='vet' ? `<div class="panel"><div class="eyebrow">Как применять</div>${[['Дозировка', it.dose], ['Как вводить', it.route], ['Курс', it.days ? `${it.days} ${plural(+it.days,'день','дня','дней')}` : ''], ['Особенности', it.info], ['Срок ожидания', it.withdrawal]].filter(x => x[1]).map(([k,x]) => `<div class="kv"><span>${k}</span><strong style="text-align:right;white-space:pre-wrap">${esc(x)}</strong></div>`).join('') || '<p class="muted" style="margin:0">Не заполнено. Нажмите «Изменить», чтобы вписать дозировку, способ введения и особенности.</p>'}</div>` : ''}
    ${[['Серия', it.series], ['Номер', it.number], ['Годен до', it.expiry ? fmtD(it.expiry) : '']].some(x => x[1]) ? `<div class="panel">${[['Серия', it.series], ['Номер', it.number], ['Годен до', it.expiry ? fmtD(it.expiry) : '']].filter(x => x[1]).map(([k,x]) => `<div class="kv"><span>${k}</span><strong>${esc(x)}</strong></div>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn primary" data-k="in">Приход</button><button class="btn" data-k="out">Расход</button></div>
    <div class="actions"><button class="btn adm" id="iedit">Изменить</button><button class="btn danger adm" id="idel">Удалить</button></div><div id="idelc"></div>
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
      ${fld('it-min','Минимальный остаток (необязательно)',`<input id="it-min" name="min" inputmode="decimal" value="${esc(v.min ?? '')}" placeholder="когда показывать «мало»" autocomplete="off">`)}
      ${v.cat==='vet' ? `<div class="two">${fld('it-series','Серия',`<input id="it-series" name="series" value="${esc(v.series)}" autocomplete="off">`)}${fld('it-number','Номер',`<input id="it-number" name="number" value="${esc(v.number)}" autocomplete="off">`)}</div>
        ${fld('it-exp','Годен до (необязательно)',`<input id="it-exp" type="date" name="expiry" value="${esc(v.expiry)}">`)}
        <div class="eyebrow" style="margin-top:6px">Как применять</div>
        ${fld('it-dose','Дозировка',`<input id="it-dose" name="dose" value="${esc(v.dose)}" placeholder="напр. 1 мл на 30 кг массы" autocomplete="off">`)}
        <div class="two">${fld('it-route','Как вводить',`<select id="it-route" name="route">${opt('','—',v.route||'')}${ROUTES.map(r => opt(r,r,v.route)).join('')}</select>`)}${fld('it-days','Курс, дней',`<input id="it-days" name="days" type="number" min="1" step="1" inputmode="numeric" value="${esc(v.days)}">`)}</div>
        ${fld('it-info','Особенности',`<textarea id="it-info" name="info" placeholder="напр. пролонгированный, колется 1 раз; не смешивать с …">${esc(v.info)}</textarea>`)}
        ${fld('it-wd','Срок ожидания (молоко / мясо)',`<input id="it-wd" name="withdrawal" value="${esc(v.withdrawal)}" placeholder="напр. молоко 3 сут, мясо 28 сут" autocomplete="off">`)}` : ''}
      ${!isEdit ? `<div class="two">${fld('it-qty','Количество',`<input id="it-qty" name="qty0" inputmode="decimal" autocomplete="off" placeholder="сколько есть">`)}${fld('it-date','Дата прихода',`<input id="it-date" type="date" name="date0" value="${today()}">`)}</div>
        <p class="muted" style="margin:0">Количество запишется приходом. Можно оставить пустым и внести приход позже.</p>` : ''}`}
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
      if(!isVeh){ const mn = dec(d.min || ''); if(mn > 0) d.min = round(mn, 3); else if(isEdit) d.min = null; else delete d.min; }
      const q0 = dec(d.qty0 || ''), date0 = d.date0 || today(); delete d.qty0; delete d.date0;
      if(!isVeh && String(f.querySelector('#it-qty')?.value || '').trim() && !(q0 > 0)){ const e = s.querySelector('#iterr'); e.hidden = false; e.textContent = 'Количество — число больше нуля.'; return; }
      if(isEdit) store.set('items', it.id, {...strip(it), ...d});
      else { const nid = store.add('items', {...d, cat:v.cat}); if(q0 > 0) store.add('moves', {item:nid, kind:'in', qty:round(q0,3), date:date0, note:'начальный остаток'}); }
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
    ${isEdit ? `${S.admin ? `<p class="muted" style="margin:0">Внёс: ${esc(m.byEmail ? whoName(m.byEmail) + ' (' + m.byEmail + ')' : '—')}${m.created ? ', ' + new Date(m.created).toLocaleString('ru-RU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : ''}</p>` : ''}<div class="actions"><button class="btn danger" type="button" id="mvdel">Удалить операцию</button></div><div id="mvdelc"></div>` : ''}
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
<borders count="3"><border/><border><top style="thin"><color rgb="FF9AA89E"/></top></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
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
<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  function cell(ref, v, t, st){
    if(v === null || v === undefined || v === '') return '';
    if(t === 'd' && /^\d{4}-\d\d-\d\d$/.test(v)) return `<c r="${ref}" s="${st}"><v>${serial(v)}</v></c>`;
    if((t === 'n' || t === 'm' || t === 'i') && typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${t === 'd' || t === 'n' || t === 'm' || t === 'i' ? (st >= 6 ? 6 : 0) : st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }
  // «Свободный» лист: ячейки по адресам, объединения, рамки — для печатных бланков
  function rawSheetXml(sh){
    const byRow = {};
    for(const [ref, [v, st]] of Object.entries(sh.cells)){ const r = +ref.replace(/^[A-Z]+/, ''); (byRow[r] ||= []).push([ref, v, st]); }
    const colN = ref => { let c = 0; for(const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c; };
    const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b).map(r => `<row r="${r}"${sh.heights?.[r] ? ` ht="${sh.heights[r]}" customHeight="1"` : ''}>${byRow[r].sort((a, b) => colN(a[0]) - colN(b[0])).map(([ref, v, st]) =>
      v === '' || v == null ? `<c r="${ref}" s="${st}"/>` : typeof v === 'number' ? `<c r="${ref}" s="${st}"><v>${v}</v></c>` : `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`).join('')}</row>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="1"/>
<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="${sh.onePage ? 1 : 0}"/>
</worksheet>`;
  }
  function sheetXml(sh){
    if(sh.raw) return rawSheetXml(sh);
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
<definedNames>${sheets.map((s, i) => !s.raw && s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(names[i]).replace(/'/g, "''")}'!$A$${s.note ? 4 : 3}:$${colL(s.cols.length - 1)}$${(s.note ? 4 : 3) + s.rows.length}</definedName>` : '').join('')}</definedNames></workbook>`},
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
        e.type === 'weight' ? +e.weight : '', e.type === 'mating' ? tagOf(e.sireId) : '', e.nextDate || '', e.nextDate ? (e.doneNext ? 'да' : 'нет') : '', e.note || '', S.admin && e.byEmail ? whoName(e.byEmail) : ''];
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
      const r = [it.name, ...(cat === 'vet' ? [it.series || '', it.number || '', it.expiry || ''] : []), it.unit, start, pin, pout];
      r.push(end);
      r.push(round(inn.filter(x => x.kind === 'in').reduce((s, x) => s + (+x.price || 0), 0), 2) || '');
      return r;
    });
    const brows = bal();
    const bcols = cat !== 'fuel'
      ? [{h:X.w,w:22},...(cat === 'vet' ? [{h:'Серия',w:12},{h:'Номер',w:12},{h:'Годен до',w:12,t:'d'}] : []),{h:'Ед.',w:6},{h:'Остаток на начало',w:12,t:'n'},{h:'Приход',w:11,t:'n'},{h:'Расход',w:11,t:'n'},{h:'Остаток на конец',w:12,t:'n'},{h:'Закуплено на сумму',w:13,t:'m'}]
      : [{h:'Топливо, масла',w:22},{h:'Ед.',w:6},{h:'Остаток на начало',w:12,t:'n'},{h:'Приход',w:11,t:'n'},{h:'Расход',w:11,t:'n'},{h:'Остаток на конец',w:12,t:'n'},{h:'Закуплено на сумму',w:13,t:'m'}];
    const btot = bcols.map((c, i) => c.t === 'm' ? sum(brows, i) : null); btot[0] = null;
    out.push({name:X.n + ' — остатки', title:X.t + ': приход, расход, остаток', note:period, cols:bcols, rows:brows, total:btot});
    const kindName = {in:'Приход', out:cat === 'fuel' ? 'Заправка / расход' : 'Расход'};
    const orows = ops.filter(x => inP(x.date)).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)).map(x => [x.date, itemById(x.item)?.name || 'удалено', kindName[x.kind], x.kind === 'in' ? x.qty : -x.qty, itemById(x.item)?.unit || '',
      ...(cat === 'fuel' ? [x.veh, x.who] : cat === 'vet' ? [x.who] : []), x.kind === 'in' ? x.note : '', x.kind === 'out' ? x.note : '', x.price === '' ? '' : +x.price, S.admin && x.by ? whoName(x.by) : '']);
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


/* ===== Табель кормления (печатный бланк) ===== */
const FEEDSHEET_DEFAULT = `Рацион №1 — дойные овцы, 0,200 кг/гол
Кукуруза — 25%
Овёс — 15%
Пшеница — 10%
К/к «Капелла» — 15%
Шрот соевый — 15%
Ячмень — 20%

Рацион №2 — холостые, 0,150 кг/гол
Овёс — 30%
Пшеница — 18%
Кукуруза — 12%
К/к «Овисмикс» — 40%

Рацион №3 — молодняк овец старше 4 мес, 0,100 кг/гол
Кукуруза — 20%
Овёс — 10%
Ячмень — 20%
К/к «Капелла» — 50%

Рацион №4 — молодняк 0–3 мес
К/к «Салюс» — 95%
Кукуруза — 5%`;
const feedSheetText = () => setting('feedsheet')?.text ?? FEEDSHEET_DEFAULT;
function feedSheetView(){
  let h = backTo('Табель кормления');
  h += `<p class="muted" style="margin:0">Ваш бланк «Рационы для овец с 1.07.2026» — точно такой же файл, как в Excel: рационы, Корпус 1 (старый), Корпус 2 (новый), Загоны (улица). Скачайте и распечатайте — лист уже настроен для печати на A4.</p>
    <div class="actions"><button class="btn primary" id="fs-orig">Скачать табель в Excel</button></div>
    <details class="panel"><summary class="eyebrow">Другой вариант: табель с поголовьем по загонам</summary>
      <form id="fsf" novalidate>
        <p class="muted" style="margin:0">Собирается из данных приложения: Овчарня 1, Овчарня 2, Козлятник, Карантин — сколько голов и номер рациона в каждом загоне.</p>
        ${fld('fs-date','Дата в заголовке',`<input id="fs-date" type="date" value="${today()}">`)}
        <label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="fs-heads" checked><span>Подставить поголовье</span></label>
        <label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="fs-rat" checked><span>Подставить № рациона</span></label>
        <div class="actions"><button class="btn" type="submit">Скачать табель с поголовьем</button></div>
        ${fld('fs-text', S.admin ? 'Рационы для этого варианта (пустая строка — следующий рацион)' : 'Рационы', `<textarea id="fs-text" rows="12" ${S.admin ? '' : 'readonly'}>${esc(feedSheetText())}</textarea>`)}
        ${S.admin ? `<div class="actions"><button class="btn" type="button" id="fs-save">Сохранить рационы</button><button class="btn" type="button" id="fs-reset">Как в бланке</button></div>` : ''}
      </form></details>`;
  return h;
}
function bindFeedSheet(){
  const og = $('#fs-orig');
  if(og) og.onclick = async () => {
    og.disabled = true;
    try{ const r = await fetch('tabel.xlsx'); if(!r.ok) throw 0; if(await saveFile('Табель кормления.xlsx', await r.blob())) toast('Табель сохранён в «Загрузки»'); }
    catch(_){ toast('Не удалось открыть бланк. Откройте приложение с интернетом и попробуйте ещё раз.'); }
    og.disabled = false;
  };
  const f = $('#fsf'); if(!f) return;
  const sv = $('#fs-save'); if(sv) sv.onclick = () => { store.set('settings', 'feedsheet', {text:$('#fs-text').value.trim()}); toast('Рационы сохранены'); };
  const rs = $('#fs-reset'); if(rs) rs.onclick = () => { $('#fs-text').value = FEEDSHEET_DEFAULT; };
  f.onsubmit = async ev => {
    ev.preventDefault();
    const date = $('#fs-date').value, sh = feedSheetBuild($('#fs-text').value, date, $('#fs-heads').checked, $('#fs-rat').checked);
    if(await saveFile(`Табель кормления${date ? ' ' + date : ''}.xlsx`, XL.build([sh]))) toast('Табель сохранён в «Загрузки»');
  };
}
function feedSheetBuild(text, date, withHeads, withRation){
  const cells = {}, merges = [], heights = {1:26, 4:42};
  const L = i => { let s = ''; i++; while(i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const put = (c, r, v, st) => { cells[L(c) + r] = [v, st]; };
  const box = (c1, r1, c2, r2, v, st) => { for(let r = r1; r <= r2; r++) for(let c = c1; c <= c2; c++) put(c, r, r === r1 && c === c1 ? v : '', st); if(c1 !== c2 || r1 !== r2) merges.push(`${L(c1)}${r1}:${L(c2)}${r2}`); };
  const nCols = 2 + BARNS.length * 4, last = nCols - 1;
  box(0, 1, last, 1, `Табель кормления на ${date ? fmtD(date) : '«____» ______________ 20___ г.'}`, 10);
  box(0, 2, last, 2, withHeads ? `Поголовье по загонам — по данным «Берегини» на ${fmtD(today())}` : 'Рационы и раздача корма по загонам', 11);
  box(0, 3, 0, 4, 'Рацион: состав, %', 12); box(1, 3, 1, 4, 'Кг на 1 гол.', 12);
  // рационы слева
  const blocks = String(text || '').split(/\n\s*\n/).map(b => b.split('\n').map(x => x.trim()).filter(Boolean)).filter(b => b.length);
  const left = []; blocks.forEach((b, i) => { if(i) left.push(['', 13]); left.push([b[0], 15]); b.slice(1).forEach(x => left.push([x, 13])); });
  // загоны справа
  const cols = BARNS.map((b, bi) => {
    const c0 = 2 + bi * 4, pens = PENS.filter(p => p.barn === b);
    box(c0, 3, c0 + 3, 3, b.name, 12);
    ['Загон', 'Голов', 'Рацион №', 'Корма на загон, кг'].forEach((t, k) => put(c0 + k, 4, t, 12));
    let tot = 0;
    const rows = pens.filter(p => !(/^вместе с загоном/i.test(penLabel(p.id)) && !inPen(p.id).length)).map(p => {
      const an = inPen(p.id), n = an.length; tot += n;
      let num = p.n, lbl = penLabel(p.id); const mm = lbl.match(/^загоны\s*(\d+)\s*[–-]\s*(\d+)\s*:?\s*(.*)$/i); if(mm){ num = `${mm[1]}–${mm[2]}`; lbl = mm[3]; }
      const cnt = {}; an.forEach(a => { const r = String(a.rationNo || '').replace(/[^\d]/g, ''); if(r) cnt[r] = (cnt[r] || 0) + 1; });
      const rn = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0];
      return [num + (lbl ? ' ' + lbl : ''), withHeads ? (n || '') : '', withRation && rn ? '№' + rn : '', ''];
    });
    rows.push(['Итого', withHeads ? tot : '', '', '']);
    return {c0, rows};
  });
  const body = Math.max(left.length, ...cols.map(c => c.rows.length));
  for(let i = 0; i < body; i++){
    const r = 5 + i, lv = left[i];
    put(0, r, lv ? lv[0] : '', lv ? lv[1] : 13); put(1, r, '', 14);
    cols.forEach(({c0, rows}) => { const row = rows[i], isTot = row && row[0] === 'Итого'; for(let k = 0; k < 4; k++) put(c0 + k, r, row ? row[k] : '', isTot ? 15 : k === 0 ? 13 : 14); });
  }
  const fr = 5 + body + 1;
  box(0, fr, last, fr, 'Корм выдал: ______________________   Корм принял: ______________________   Подпись: ______________', 11);
  heights[fr] = 24;
  return {name:'Табель кормления', raw:true, rows:[], cols:[], widths:[36, 8, ...BARNS.flatMap(() => [17, 6, 7, 10])], cells, merges, heights, onePage:true};
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
  let m = t.match(/^(\d[\d\-\/]*)\s*\(\s*([^)]+?)\s*\)$/); if(m) return {tag:m[1], name:m[2].charAt(0).toUpperCase() + m[2].slice(1)};
  m = t.match(/^(\d[\d\-\/]*)\s+([А-Яа-яЁёA-Za-z]{3,}.*)$/); if(m) return {tag:m[1], name:m[2].trim()};
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
      if(om){ const rest = a.note.slice(om.index + om[0].length), kids = []; let km; const re = /([а-яё]+)?[\s,;:]*(\d{2,}[\d\-]*)/gi;
        while((km = re.exec(rest))){ const w = norm(km[1] || ''); kids.push({tag:km[2], sex: /^(козел|козлик|самец|баран|баранчик)/.test(w) ? 'm' : /^(коза|козочк|самк|ярк|ярочк|овечк)/.test(w) ? 'f' : null}); }
        births.push({motherIdx:animals.length, date:xlDate(om[1]), kids, kidTags:kids.map(k => k.tag)}); }
      animals.push(a);
    }
    if(!cols) issue('warn', sh.name, 'Не найдена строка с заголовком «№ бирки» — лист пропущен.');
  }
  // номера без бирки
  // «б/н»: сначала ищем уже заведённых в приложении (того же вида, лучше в том же загоне), иначе даём следующий номер
  const bnPool = S.animals.filter(x => x.status === 'active' && /^б\/н-\d+$/.test(x.tag)), bnUsed = new Set();
  const taken = new Set([...animals.map(a => norm(a.tag)), ...S.animals.map(a => norm(a.tag))]);
  animals.filter(a => a.noTag).forEach(a => {
    const c = bnPool.filter(x => x.species === a.species && !bnUsed.has(x.id));
    const m = c.find(x => a.pen && x.pen === a.pen) || c.find(x => norm(x.cat) === norm(a.cat)) || c[0];
    if(m){ bnUsed.add(m.id); a.tag = m.tag; issue('info', a.where, `Без номера бирки — это ${a.tag}, уже есть в приложении.`); }
    else { let k = 0; do { k++; a.tag = `б/н-${k}`; } while(taken.has(norm(a.tag))); taken.add(norm(a.tag)); issue('info', a.where, `Без номера бирки — записана как ${a.tag}.`); }
    if(!/без номера бирки/.test(a.note)) a.note = [a.note, 'в файле без номера бирки'].filter(Boolean).join('; ');
  });
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
  const inFile = new Set(animals.filter(a => !a.skip).map(a => a.species + '|' + norm(a.tag)));
  const kidTagsAll = new Set(births.flatMap(b => b.kids.map(k => norm(k.tag))));
  const missing = S.animals.filter(x => x.status === 'active' && !inFile.has(x.species + '|' + norm(x.tag)) && !kidTagsAll.has(norm(x.tag)));
  // рационы по загонам — по большинству животных
  Object.values(pens).forEach(p => { const e = Object.entries(p.rations).sort((x, y) => y[1] - x[1]); p.ration = e[0]?.[0] || null; p.mixed = e.length > 1; });
  Object.entries(pens).forEach(([id, p]) => { if(p.mixed) issue('info', penLong(id), `В загоне животные с разными рационами (${Object.entries(p.rations).map(([k, n]) => `№${k}: ${n}`).join(', ')}) — назначен №${p.ration}.`); });
  Object.values(rationsFound).forEach(r => { const sum = r.items.reduce((s, x) => s + x.g, 0); if(r.total && Math.abs(sum - r.total) > 1) issue('warn', `Рацион №${r.no}`, `Сумма кормов ${sum} г, а в итоге указано ${r.total} г на сутки. Загружено ${sum} г — проверьте состав.`); });
  const usedNos = new Set(Object.values(pens).map(p => p.ration).filter(Boolean));
  usedNos.forEach(no => { if(!rationsFound[no]) issue('info', `Рацион №${no}`, 'Состав не найден в файле — рацион не создаётся, назначьте вручную.'); });
  return {animals, issues, pens, rations:rationsFound, births, missing};
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
    if(a.existing){ if(a.sexGuess) delete data.sex; if(!a.pen) delete data.pen; else if(a.pen !== a.existing.pen && !a.since) data.since = today(); }
    for(const k of ['name','cat','birth','since','note','breed','rationNo']) if(a[k]) data[k] = a[k];
    if(a.rationNo) data.rationNo = '№' + a.rationNo;
    if(a.motherTag){ const m = findId(a.motherTag, a.species); if(m) data.motherId = m; else data.motherText = a.motherTag; }
    if(a.fatherTag){ const f = findId(a.fatherTag, a.species); if(f) data.fatherId = f; else data.fatherText = a.fatherTag; }
    if(a.existing){ store.merge('animals', ids[i], data); updated++; }
    else { store.set('animals', ids[i], {...data, by:S.uid||null, byEmail:S.email||null, created:Date.now(), source:'excel'}); created++; }
    if(a.weight > 0) store.add('events', {animalIds:[ids[i]], type:'weight', date:a.since || today(), weight:round(a.weight, 1), note:'из Excel'});
  });
  let birthsMade = 0, kidsMade = 0;
  if(opt.births) plan.births.forEach(b => {
    const mom = plan.animals[b.motherIdx]; if(mom.skip || !b.date) return;
    const mid = ids[idx.get(mom)];
    b.kids.forEach(k => {
      const li = (byTag[norm(k.tag)] || []).find(i => list[i].species === mom.species);
      if(li != null){ store.merge('animals', ids[li], {motherId:mid, ...(list[li].birth ? {} : {birth:b.date})}); return; }
      const ex = S.animals.find(x => x.species === mom.species && norm(x.tag) === norm(k.tag));
      if(ex){ if(ex.motherId !== mid || !ex.birth) store.merge('animals', ex.id, {motherId:mid, ...(ex.birth ? {} : {birth:b.date})}); return; }
      if(!k.sex) return;
      store.set('animals', S.be.newId('animals'), {tag:k.tag, species:mom.species, sex:k.sex, status:'active', pen:mom.pen || '', birth:b.date, motherId:mid, cat: mom.species === 'goat' ? 'Козлёнок' : 'Ягнёнок', note:'из примечания об окоте', by:S.uid||null, byEmail:S.email||null, created:Date.now(), source:'excel'});
      kidsMade++;
    });
    if(S.events.some(e => e.type === 'birth' && e.date === b.date && (e.animalIds||[]).includes(mid))) return;
    store.add('events', {animalIds:[mid], type:'birth', date:b.date, count:b.kids.length || b.kidTags.length, note:'из Excel: ' + mom.note});
    birthsMade++;
  });
  let missingDone = 0;
  if(opt.missing === 'nopen') (plan.missing || []).forEach(x => { if(x.pen){ store.merge('animals', x.id, {pen:''}); missingDone++; } });
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
  return {created, updated, birthsMade, rationsMade, kidsMade, missingDone};
}

/* ----- Загрузка журнала молока и склада кормов ----- */
const xlNum = v => { if(v == null || v === '') return null; const n = typeof v === 'number' ? v : dec(String(v)); return isFinite(n) ? n : null; };
const headerAt = (rows, re, maxRow = 10) => { for(let i = 0; i < Math.min(rows.length, maxRow); i++) if((rows[i] || []).some(v => re.test(norm(v)))) return i; return -1; };
const colOf = (head, re) => head.findIndex(v => re.test(norm(v)));
function fileKind(sheets){
  const names = sheets.map(s => norm(s.name));
  if(sheets.some(s => /молок/.test(norm(s.name)) && headerAt(s.rows, /утрен/) >= 0)) return 'milk';
  if(names.includes('справочник') && (names.includes('приход') || names.includes('расход'))){
    const sp = sheets.find(s => norm(s.name) === 'справочник'), txt = sheets.filter(s => ['справочник','приход','расход'].includes(norm(s.name))).flatMap(s => s.rows.slice(0, 3).flat()).map(norm).join('|');
    const pCodes = (sp?.rows || []).slice(1, 30).filter(r => /^п\d/.test(norm(r?.[0]))).length;
    return /препарат|ответствен|причин/.test(txt) || pCodes > 2 ? 'vet' : 'feed';
  }
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
function buildFeedPlan(sheets, cat = 'feed'){
  const by = n => sheets.find(s => norm(s.name) === n), issues = [], W = ITEM_WORD[cat];
  const dir = {}, sp = by('справочник');
  const codeIn = v => { const m = String(v ?? '').match(/^\s*([^\s—–-]+)\s*[—–-]\s/); return m ? m[1] : ''; };
  if(sp){ const hr = Math.max(0, headerAt(sp.rows, /наимен/)), h = sp.rows[hr] || [], cc = colOf(h, /^код/), cn = colOf(h, /наимен/), cu = colOf(h, /^ед/), cm = colOf(h, /мин/);
    for(let ri = hr + 1; ri < sp.rows.length; ri++){ const r = sp.rows[ri] || [], code = String(r[cc] ?? '').trim(), name = String(r[cn] ?? '').trim().replace(/\s+/g, ' ');
      if(code && name && name !== '0') dir[code] = {code, name, unit:String(r[cu] ?? '').trim() || (cat === 'vet' ? 'шт' : 'кг'), min: cm >= 0 ? xlNum(r[cm]) : null, exp:''}; } }
  const moves = [], keys = {};
  for(const [sheet, kind] of [['приход','in'], ['расход','out']]){
    const sh = by(sheet); if(!sh) continue;
    const hr = Math.max(0, headerAt(sh.rows, /^дата/)), h = sh.rows[hr] || [];
    const c = {date:colOf(h, /^дата/), code:colOf(h, /^код/), name:colOf(h, /препарат|наимен|корм/), qty:colOf(h, /кол-?во|количеств/), unit:colOf(h, /^ед/), sup:colOf(h, /поставщ/), doc:colOf(h, /документ/), act:colOf(h, /акт|бригадир/),
      group:colOf(h, /групп/), reason:colOf(h, /причин/), who:colOf(h, /ответствен/), exp:colOf(h, /срок/), note:colOf(h, /примеч/)};
    for(let ri = hr + 1; ri < sh.rows.length; ri++){
      const r = sh.rows[ri] || [], qty = xlNum(r[c.qty]), date = xlDate(r[c.date]);
      const code = String(r[c.code] ?? '').trim() || (c.name >= 0 ? codeIn(r[c.name]) : '');
      if(!code && qty == null) continue;
      const where = `${sh.name}, строка ${ri + 1}`;
      if(!dir[code]){ issues.push({level:'warn', where, text:`Код «${code}» не найден в справочнике — строка пропущена.`}); continue; }
      if(!(qty > 0)){ if(qty !== 0) issues.push({level:'warn', where, text:'Не указано количество — строка пропущена.'}); continue; }
      if(!date){ issues.push({level:'warn', where, text:'Не указана дата — строка пропущена.'}); continue; }
      const t = v => c[v] >= 0 ? String(r[c[v]] ?? '').trim() : '';
      const exp = c.exp >= 0 ? xlDate(r[c.exp]) : '';
      if(kind === 'in' && exp && (!dir[code].exp || exp < dir[code].exp)) dir[code].exp = exp;
      const note = (kind === 'in' ? [t('sup'), t('doc') ? '№' + t('doc') : '', exp ? 'годен до ' + fmtD(exp) : '', t('note')] : [t('group'), t('reason'), t('act') && t('act') !== t('doc') ? t('act') : t('doc'), t('note')]).filter(Boolean).join(' · ');
      let k = `${kind}-${date}-${code}-${qty}`; keys[k] = (keys[k] || 0) + 1; k += '-' + keys[k];
      moves.push({key:(cat === 'feed' ? '' : cat + '-') + k.replace(/[^\w.-]/g, '_'), kind, code, qty:round(qty, 3), date, note, who: kind === 'out' ? t('who') : ''});
    }
  }
  const items = Object.values(dir).map(d => {
    const ex = S.items.find(i => i.cat === cat && feedKey(i.name) === feedKey(d.name));
    const used = ex && (S.moves.some(m => m.item === ex.id) || S.rations.some(r => (r.items||[]).some(x => x.item === ex.id)));
    let mode = 'new';
    if(ex) mode = norm(ex.unit) === norm(d.unit) ? 'same' : used ? 'newunit' : 'relabel';
    return {...d, ex, mode, inQ:0, outQ:0};
  });
  const byCode = Object.fromEntries(items.map(i => [i.code, i]));
  moves.forEach(m => { const it = byCode[m.code]; if(m.kind === 'in') it.inQ += m.qty; else it.outQ += m.qty; m.dup = S.moves.some(x => x.id === 'xl-' + m.key); });
  items.forEach(i => { if(i.mode === 'newunit') issues.push({level:'warn', where:i.name, text:`В приложении «${i.ex.name}» ведётся в «${i.ex.unit}», а в файле — в «${i.unit}». Будет заведена отдельная позиция «${i.name} (${i.unit})».`}); });
  const os = by('остатки');
  if(os){ const hr = Math.max(0, headerAt(os.rows, /остат/)), h = os.rows[hr] || [], cc = colOf(h, /^код/), cb = colOf(h, /^остат/), ce = colOf(h, /срок годн/);
    for(let ri = hr + 1; ri < os.rows.length; ri++){ const r = os.rows[ri] || [], it = byCode[String(r[cc] ?? '').trim()], b = xlNum(r[cb]);
      if(it && ce >= 0 && xlDate(r[ce])) it.exp = xlDate(r[ce]);
      if(it && b != null && Math.abs(b - (it.inQ - it.outQ)) > 0.01) issues.push({level:'warn', where:`Остатки, ${it.name}`, text:`В листе «Остатки» ${num(b)} ${it.unit}, а по приходу и расходу выходит ${num(it.inQ - it.outQ)} ${it.unit}. Загрузится ${num(it.inQ - it.outQ)} — проверьте, не пропущена ли строка.`}); } }
  return {cat, items: items.filter(i => i.inQ || i.outQ || i.mode === 'new'), moves, issues};
}
function applyFeedPlan(plan){
  const cat = plan.cat || 'feed', idOf = {}; let made = 0, n = 0;
  plan.items.forEach(i => {
    const extra = {}; if(i.min > 0) extra.min = i.min; if(i.exp) extra.expiry = i.exp;
    if(i.mode === 'same'){ idOf[i.code] = i.ex.id; const upd = Object.fromEntries(Object.entries(extra).filter(([k, v]) => i.ex[k] !== v)); if(Object.keys(upd).length) store.merge('items', i.ex.id, upd); }
    else if(i.mode === 'relabel'){ store.merge('items', i.ex.id, {unit:i.unit, ...extra}); idOf[i.code] = i.ex.id; }
    else { const id = S.be.newId('items'); store.set('items', id, {name: i.mode === 'newunit' ? `${i.name} (${i.unit})` : i.name, unit:i.unit, cat, code:i.code, ...extra, byEmail:S.email||null}); idOf[i.code] = id; made++; }
  });
  plan.moves.forEach(m => { if(m.dup || !idOf[m.code]) return;
    const d = {item:idOf[m.code], kind:m.kind, qty:m.qty, date:m.date, note:m.note || (m.kind === 'in' ? 'из Excel' : ''), source:'excel', byEmail:S.email||null}; if(m.who) d.who = m.who;
    store.set('moves', 'xl-' + m.key, d); n++; });
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
  const cat = plan.cat || 'feed', W = ITEM_WORD[cat];
  if(!plan.moves.length && !plan.items.length){ res.innerHTML = `<p class="err">Не нашлось строк прихода или расхода. Нужны листы «Справочник», «Приход», «Расход».</p>` + issuesHtml(plan.issues); return; }
  const nNew = plan.moves.filter(m => !m.dup).length, nItems = plan.items.filter(i => i.mode === 'new' || i.mode === 'newunit').length;
  const mode = {same:'уже есть', relabel:'есть, ед. изм. поменяется', newunit:'новая', new:'новая'};
  res.innerHTML = `<div class="stats"><div class="stat"><div class="v">${plan.moves.filter(m => m.kind === 'in').length} / ${plan.moves.filter(m => m.kind === 'out').length}</div><div class="l">строк прихода / расхода${nNew < plan.moves.length ? ` · ${plan.moves.length - nNew} уже загружены` : ''}</div></div>
      <div class="stat"><div class="v">${plan.items.length}</div><div class="l">${STOCK_FULL[cat].toLowerCase()}: позиций${nItems ? ` · новых ${nItems}` : ''}</div></div></div>
    <details class="panel" ${plan.items.length <= 15 ? 'open' : ''}><summary class="eyebrow">Остаток после загрузки</summary>${plan.items.map(i => `<div class="kv"><span>${esc(i.name)} <span class="muted">· ${mode[i.mode]}${i.exp ? ' · до ' + fmtD(i.exp) : ''}</span></span><strong>${num(round(i.inQ - i.outQ, 2))} ${esc(i.unit)}</strong></div>`).join('')}</details>
    ${issuesHtml(plan.issues)}
    <div class="actions"><button class="btn primary" id="imgo" ${nNew || nItems ? '' : 'disabled'}>${nNew || nItems ? `Загрузить ${({feed:'на склад кормов', fuel:'в ГСМ', vet:'в аптеку'})[cat]}` : 'Всё уже загружено'}</button></div>`;
  res.querySelector('#imgo').onclick = () => {
    const b = res.querySelector('#imgo'); b.disabled = true; b.textContent = 'Загружаем…';
    const r = silently(() => applyFeedPlan(plan));
    journalNote(`Загрузка из Excel «${fname}» (${STOCK_FULL[cat]}): операций ${r.n}, новых позиций ${r.made}`);
    toast(`${STOCK_FULL[cat]}: операций ${r.n}${r.made ? `, новых позиций ${r.made}` : ''}`); closeSheet(); S.stockCat = cat; S.stockSub = 'bal'; go('stock');
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
        if(kind === 'feed' || kind === 'vet') return feedImportView(res, buildFeedPlan(sheets, kind), f.name);
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
          ${plan.births.length ? `<label class="row pickrow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="im-births" checked><span>Записать окоты из примечаний: ${plan.births.length}<br><span class="muted">Уже записанные окоты не повторяются. Детёныши, которых нет в списке строками, заводятся по примечанию («козел 346»).</span></span></label>` : ''}
        </div>
        ${plan.missing.length ? `<div class="panel"><div class="eyebrow">Есть в приложении, но нет в файле: ${plan.missing.length}</div>
          <p class="muted" style="margin:0">${plan.missing.slice(0, 40).map(x => `${esc(x.tag)} (${esc(penShort(x.pen) || 'без загона')})`).join(', ')}${plan.missing.length > 40 ? '…' : ''}</p>
          <div class="field"><select id="im-missing">${opt('keep', 'Оставить как есть', 'keep')}${opt('nopen', 'Перевести «Без загона» — разберусь потом', '')}</select></div></div>` : ''}
        <div class="list">
        </div>
        <div class="actions"><button class="btn primary" id="imgo">Загрузить ${heads(list.length)}</button></div>`;
      res.querySelector('#imgo').onclick = () => {
        const btn = res.querySelector('#imgo'); btn.disabled = true; btn.textContent = 'Загружаем…';
        const r = silently(() => applyImportPlan(plan, {labels:res.querySelector('#im-labels')?.checked, births:res.querySelector('#im-births')?.checked, rations:res.querySelector('#im-rations')?.checked, missing:res.querySelector('#im-missing')?.value}));
        journalNote(`Загрузка из Excel «${f.name}»: новых ${r.created}, обновлено ${r.updated}${r.birthsMade ? ', окотов ' + r.birthsMade : ''}${r.kidsMade ? ', детёнышей из примечаний ' + r.kidsMade : ''}${r.missingDone ? ', переведено «Без загона» ' + r.missingDone : ''}`);
        toast(`Загружено: новых ${r.created + r.kidsMade}, обновлено ${r.updated}${r.birthsMade ? `, окотов ${r.birthsMade}` : ''}`);
        closeSheet(); S.herdMode = 'pens'; go('herd');
      };
    };
  }, 'import');
}

/* ===== Старт ===== */
boot();
window.OTARA = {S, PEN, feedUse, byId, itemById, rationById, purgeRations}; // для отладки
