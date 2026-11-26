'use strict';
(function () {
  // ================= الثوابت =================
  const STORE_KEY = 'gift-organizer-v1';
  const REMIND_DAYS = 7;
  const PER_PAGE = 3;

  const RELATIONS = [
    ['mom', 'الأم', '👩'], ['dad', 'الأب', '👨'],
    ['bro', 'الأخ', '🧑'], ['sis', 'الأخت', '👱‍♀️'],
    ['hus', 'الزوج', '🤵'], ['wife', 'الزوجة', '👰'],
    ['son', 'الابن', '👦'], ['dau', 'الابنة', '👧'],
    ['gpa', 'الجد', '👴'], ['gma', 'الجدة', '👵'],
    ['frm', 'صديق', '🙋‍♂️'], ['frf', 'صديقة', '🙋‍♀️'],
    ['col', 'زميل عمل', '💼'], ['oth', 'أخرى', '👤']
  ].map(([id, label, icon]) => ({ id, label, icon }));
  const REL = Object.fromEntries(RELATIONS.map(r => [r.id, r]));

  const TYPES = {
    birthday: { label: 'عيد ميلاد', icon: '🎂', code: 'b', recurring: true },
    graduation: { label: 'تخرج', icon: '🎓', code: 'g', recurring: false },
    wedding: { label: 'زواج', icon: '💍', code: 'w', recurring: false },
    other: { label: 'مناسبة أخرى', icon: '🎉', code: 'o', recurring: false }
  };

  // ================= التخزين =================
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { people: d.people || [], events: d.events || [], notified: d.notified || {} };
      }
    } catch (e) { /* التخزين غير متاح */ }
    return { people: [], events: [], notified: {} };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
  }
  let state = load();

  // ================= أدوات مساعدة =================
  const $ = (s, el = document) => el.querySelector(s);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0; };
  const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' د.أ';
  const LOCALE = 'ar-JO-u-nu-latn';

  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDate(d, withYear = true) {
    const o = { weekday: 'long', day: 'numeric', month: 'long' };
    if (withYear) o.year = 'numeric';
    return d.toLocaleDateString(LOCALE, o);
  }
  function nextDate(ev) {
    const base = parseDate(ev.date);
    if (!ev.recurring) return base;
    const t = today();
    const d = new Date(t.getFullYear(), base.getMonth(), base.getDate());
    if (d < t) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  function daysLeft(ev) { return Math.round((nextDate(ev) - today()) / 86400000); }
  function daysText(n) {
    if (n === 0) return 'اليوم 🎉';
    if (n === 1) return 'غداً';
    if (n === 2) return 'بعد يومين';
    if (n > 2 && n <= 10) return 'بعد ' + n + ' أيام';
    if (n > 10) return 'بعد ' + n + ' يوماً';
    const p = -n;
    if (p === 1) return 'كانت أمس';
    if (p === 2) return 'قبل يومين';
    return 'قبل ' + p + (p <= 10 ? ' أيام' : ' يوماً');
  }
  function chipClass(n) { return n === 0 ? 'today' : (n > 0 && n <= REMIND_DAYS ? 'soon' : ''); }

  const person = id => state.people.find(p => p.id === id);
  const eventById = id => state.events.find(e => e.id === id);
  const spent = ev => (ev.gifts || []).reduce((s, g) => s + num(g.cost), 0);
  function evName(ev) {
    const t = TYPES[ev.type] || TYPES.other;
    const p = person(ev.personId);
    const label = ev.type === 'other' && ev.title ? ev.title : t.label;
    return label + (p ? ' ' + p.name : '');
  }
  function relLabel(p) { return p && REL[p.relation] ? REL[p.relation].label : ''; }

  function upcomingEvents() {
    return state.events
      .map(ev => ({ ev, days: daysLeft(ev) }))
      .filter(x => x.days >= 0)
      .sort((a, b) => a.days - b.days);
  }
  function pastEvents() {
    return state.events
      .map(ev => ({ ev, days: daysLeft(ev) }))
      .filter(x => x.days < 0)
      .sort((a, b) => b.days - a.days);
  }

  // ================= الرسائل والنوافذ =================
  let toastTimer;
  function toast(msg, tone) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (tone ? ' ' + tone : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  let sheetOnClose = null;
  function openSheet(html, onClose) {
    $('#sheetBody').innerHTML = html;
    $('#sheetBackdrop').hidden = false;
    $('#sheet').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    sheetOnClose = onClose || null;
  }
  function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    document.body.style.overflow = '';
    const cb = sheetOnClose; sheetOnClose = null;
    if (cb) cb();
  }
  function sheetHead(title) {
    return '<div class="sheet-head"><h2>' + title + '</h2><button class="icon-btn" data-action="closeSheet" aria-label="إغلاق">✕</button></div>';
  }

  let confirmCb = null;
  function confirmSheet(title, msg, yesLabel, onYes) {
    confirmCb = onYes;
    openSheet(
      '<div class="big-alert"><div class="ba-ico">🤔</div><h2>' + title + '</h2><p class="muted">' + msg + '</p></div>' +
      '<div class="btn-row"><button class="btn btn-danger" data-action="confirmYes">' + yesLabel + '</button>' +
      '<button class="btn btn-ghost" data-action="closeSheet">إلغاء</button></div>'
    );
  }

  function overBudgetAlert(ev, then) {
    const over = spent(ev) - num(ev.budget);
    openSheet(
      '<div class="big-alert danger"><div class="ba-ico">⚠️</div><h2>تنبيه: تجاوزتِ الميزانية!</h2>' +
      '<p>مجموع تكاليف هدايا «' + esc(evName(ev)) + '» أصبح <b>' + money(spent(ev)) + '</b> ' +
      'بينما الميزانية المحددة <b>' + money(ev.budget) + '</b>.</p>' +
      '<p class="alert-over" style="justify-content:center">الزيادة: ' + money(over) + '</p></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="closeSheet">حسناً، فهمت</button></div>',
      then
    );
  }

  // ================= العرض: التبويبات =================
  let currentTab = 'home';
  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + tab; });
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    $('#todayLabel').textContent = fmtDate(today());
    if (currentTab === 'home') renderHome();
    if (currentTab === 'people') renderPeople();
    if (currentTab === 'suggest') renderSuggest();
    if (currentTab === 'budget') renderBudget();
  }

  function eventCard(ev, days) {
    const t = TYPES[ev.type] || TYPES.other;
    const p = person(ev.personId);
    const b = num(ev.budget), s = spent(ev);
    let budgetHtml = '';
    if (b > 0 || s > 0) {
      budgetHtml = '<div class="mini-budget"><div class="row"><span>المصروف ' + money(s) + '</span><span>من ' + money(b) + '</span></div>' + progressBar(s, b) + '</div>';
    }
    const overChip = b > 0 && s > b ? '<span class="chip over">تجاوز الميزانية</span>' : '';
    return '<div class="card clickable event-card" data-action="openEvent" data-id="' + ev.id + '">' +
      '<div class="ev-ico ' + ev.type + '">' + t.icon + '</div>' +
      '<div class="ev-body"><div class="ev-title">' + esc(evName(ev)) + '</div>' +
      '<div class="ev-meta">' + (p ? esc(relLabel(p)) + ' · ' : '') + fmtDate(nextDate(ev), !ev.recurring) + (ev.recurring ? ' · سنوياً' : '') + '</div>' +
      budgetHtml + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
      '<span class="chip ' + chipClass(days) + '">' + daysText(days) + '</span>' + overChip + '</div></div>';
  }

  function progressBar(s, b) {
    const pct = b > 0 ? Math.min(100, (s / b) * 100) : (s > 0 ? 100 : 0);
    const cls = b > 0 && s > b ? 'over' : (pct >= 85 ? 'warn' : '');
    return '<div class="progress ' + cls + '"><span style="width:' + pct + '%"></span></div>';
  }

  // ----- الرئيسية -----
  function renderHome() {
    const el = $('#view-home');
    const up = upcomingEvents();
    const soon = up.filter(x => x.days <= REMIND_DAYS);
    let html = '';

    if (soon.length) {
      html += '<div class="section-title">⏰ تذكيرات هذا الأسبوع</div>';
      html += soon.map(({ ev, days }) => {
        const t = TYPES[ev.type] || TYPES.other;
        return '<div class="reminder"><div class="r-ico">' + t.icon + '</div>' +
          '<div class="r-body"><div class="r-title">' + esc(evName(ev)) + ' ' + daysText(days) + '</div>' +
          '<div class="r-sub">' + fmtDate(nextDate(ev)) + (spent(ev) > 0 ? ' · تم تسجيل هدية ✅' : ' · لم تُختر هدية بعد') + '</div></div>' +
          '<button class="btn btn-primary btn-sm" data-action="suggestForEvent" data-id="' + ev.id + '">🎁 هدية</button></div>';
      }).join('');
    }

    html += '<div class="quick-actions">' +
      '<button class="quick rose" data-action="newEvent"><span class="q-ico">➕</span><strong>إضافة مناسبة</strong><span class="q-sub">عيد ميلاد، تخرج، زواج</span></button>' +
      '<button class="quick mint" data-action="goSuggest"><span class="q-ico">🎁</span><strong>اقترح هدية</strong><span class="q-sub">حسب الشخص والميزانية</span></button>' +
      '</div>';

    if (!state.people.length) {
      html += '<div class="card empty"><div class="e-ico">👨‍👩‍👧‍👦</div><h3>أهلاً بكِ!</h3>' +
        '<p class="muted">ابدئي بإضافة أفراد العائلة والأصدقاء، ثم سجّلي مناسباتهم لنذكّرك بها قبل أسبوع.</p>' +
        '<button class="btn btn-primary" data-action="newPerson">➕ إضافة أول شخص</button></div>';
    } else {
      html += '<div class="section-title">المناسبات القادمة <small>' + up.length + ' مناسبة</small></div>';
      if (up.length) html += up.map(x => eventCard(x.ev, x.days)).join('');
      else html += '<div class="card empty"><div class="e-ico">📅</div><p class="muted">لا توجد مناسبات قادمة. أضيفي مناسبة جديدة!</p></div>';

      const past = pastEvents();
      if (past.length) {
        html += '<div class="section-title">مناسبات سابقة <small>' + past.length + '</small></div>';
        html += past.map(x => eventCard(x.ev, x.days)).join('');
      }
    }
    el.innerHTML = html;
  }

  // ----- الأشخاص -----
  function renderPeople() {
    const el = $('#view-people');
    let html = '<button class="btn btn-primary btn-block" data-action="newPerson">➕ إضافة شخص</button>';
    if (!state.people.length) {
      html += '<div class="card empty"><div class="e-ico">🫶</div><h3>لا يوجد أشخاص بعد</h3><p class="muted">أضيفي الأم، الأب، الإخوة والأصدقاء لتبدئي بتنظيم مناسباتهم.</p></div>';
    } else {
      const sorted = state.people.slice().sort((a, b) => RELATIONS.findIndex(r => r.id === a.relation) - RELATIONS.findIndex(r => r.id === b.relation));
      html += sorted.map(p => {
        const evs = state.events.filter(e => e.personId === p.id);
        const r = REL[p.relation] || REL.oth;
        return '<div class="card clickable person-card" data-action="openPerson" data-id="' + p.id + '">' +
          '<div class="avatar">' + r.icon + '</div>' +
          '<div class="ev-body"><div class="ev-title">' + esc(p.name) + '</div>' +
          '<div class="ev-meta">' + esc(r.label) + ' · ' + (evs.length ? evs.length + ' مناسبة' : 'لا توجد مناسبات') + '</div></div>' +
          '<span class="chip">›</span></div>';
      }).join('');
    }
    el.innerHTML = html;
  }

  // ----- اقتراح الهدايا -----
  const sug = { personId: '', relation: '', type: 'birthday', budget: '', eventId: '', results: null, page: 0 };

  function renderSuggest() {
    const el = $('#view-suggest');
    const ctxEv = sug.eventId ? eventById(sug.eventId) : null;
    let html = '<div class="card"><div class="form">';
    if (ctxEv) {
      html += '<div class="alert-ok">🎯 اقتراحات لمناسبة: ' + esc(evName(ctxEv)) + ' <button class="btn btn-ghost btn-sm" data-action="clearSugCtx" style="margin-inline-start:8px">إلغاء الربط</button></div>';
    }
    html += '<div class="field"><label for="sugPerson">لمن الهدية؟</label><select class="input" id="sugPerson">' +
      '<option value="">— اختاري الشخص —</option>' +
      state.people.map(p => '<option value="' + p.id + '"' + (p.id === sug.personId ? ' selected' : '') + '>' + esc(p.name) + ' (' + esc(relLabel(p)) + ')</option>').join('') +
      '</select></div>';
    if (!sug.personId) {
      html += '<div class="field"><span class="label">أو اختاري صلة القرابة</span><div class="choice-grid rel">' +
        RELATIONS.map(r => '<button type="button" class="choice" data-action="sugRel" data-id="' + r.id + '" aria-pressed="' + (sug.relation === r.id) + '"><span class="c-ico">' + r.icon + '</span>' + r.label + '</button>').join('') +
        '</div></div>';
    }
    html += '<div class="field"><span class="label">نوع المناسبة</span><div class="choice-grid">' +
      Object.entries(TYPES).map(([k, t]) => '<button type="button" class="choice" data-action="sugType" data-id="' + k + '" aria-pressed="' + (sug.type === k) + '"><span class="c-ico">' + t.icon + '</span>' + t.label + '</button>').join('') +
      '</div></div>';
    html += '<div class="field"><label for="sugBudget">الميزانية المتاحة</label><div class="input-money"><input class="input" id="sugBudget" type="number" inputmode="decimal" min="0" step="0.5" placeholder="مثال: 30" value="' + esc(sug.budget) + '"><span class="cur">د.أ</span></div></div>';
    html += '<button class="btn btn-primary btn-block" data-action="runSuggest">✨ اقترح الهدايا</button>';
    html += '</div></div>';
    html += '<div id="sugResults">' + resultsHtml() + '</div>';
    el.innerHTML = html;
  }

  function scoreGifts(relation, type, budget) {
    const occ = (TYPES[type] || TYPES.other).code;
    const specificRel = relation && relation !== 'oth';
    const list = [];
    for (const g of window.GIFTS) {
      let occScore;
      if (occ !== 'o' && g.occ.includes(occ)) occScore = 3;
      else if (g.occ.includes('o')) occScore = 1;
      else continue;
      let relScore;
      if (specificRel && g.rel.includes(relation)) relScore = 3;
      else if (g.rel.includes('*') || !specificRel) relScore = 1;
      else continue;
      list.push(Object.assign({}, g, { score: occScore + relScore, relMatch: relScore === 3, occMatch: occScore === 3 }));
    }
    const within = list.filter(g => g.price <= budget)
      .sort((a, b) => b.score - a.score || b.price - a.price);
    const over = list.filter(g => g.price > budget).sort((a, b) => a.price - b.price);
    return { within, over };
  }

  function resultsHtml() {
    const r = sug.results;
    if (!r) {
      return '<div class="card empty"><div class="e-ico">💡</div><p class="muted">اختاري الشخص ونوع المناسبة وأدخلي الميزانية، وسنقترح عليكِ هدايا تناسب صلتك به.</p></div>';
    }
    const relName = r.relation && REL[r.relation] ? REL[r.relation].label : '';
    let items = r.within;
    let note = '';
    const total = items.length;
    let pageItems;
    if (total >= PER_PAGE) {
      const pages = Math.ceil(total / PER_PAGE);
      const page = sug.page % pages;
      pageItems = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
      if (pageItems.length < PER_PAGE) pageItems = pageItems.concat(items.slice(0, PER_PAGE - pageItems.length));
    } else {
      pageItems = items.concat(r.over.slice(0, PER_PAGE - total));
      note = '<div class="alert-over"><span class="a-ico">💡</span><span>الميزانية ' + money(r.budget) + ' منخفضة قليلاً لهذه المناسبة؛ أضفنا أقرب الخيارات بسعر أعلى بقليل.</span></div>';
    }
    let html = '<div class="section-title">اقتراحات ' + esc(TYPES[r.type].label) + (relName ? ' لـ' + esc(relName) : '') + ' <small>' + total + ' هدية ضمن الميزانية</small></div>';
    html += note + '<div class="gift-grid">';
    html += pageItems.map((g, i) => {
      const overBy = g.price - r.budget;
      const tags = [];
      if (g.relMatch) tags.push('<span class="chip ok">مناسبة لـ' + esc(relName) + '</span>');
      if (g.occMatch) tags.push('<span class="chip ok">' + TYPES[r.type].icon + ' ' + esc(TYPES[r.type].label) + '</span>');
      tags.push(overBy > 0 ? '<span class="chip over">أعلى بـ ' + money(overBy) + '</span>' : '<span class="chip">✔ ضمن الميزانية</span>');
      return '<div class="card gift-card"><div class="gift-ico">' + g.icon + '</div><div class="gift-body">' +
        '<span class="rank">اقتراح ' + (i + 1) + '</span>' +
        '<div class="gift-name">' + esc(g.name) + '</div>' +
        '<div class="muted small">' + esc(g.note) + '</div>' +
        '<div class="gift-price">≈ ' + money(g.price) + '</div>' +
        '<div class="gift-tags">' + tags.join('') + '</div>' +
        '<button class="btn btn-soft btn-sm" data-action="adoptGift" data-id="' + g.id + '">✅ اعتمد هذه الهدية</button>' +
        '</div></div>';
    }).join('');
    html += '</div>';
    if (total > PER_PAGE) html += '<button class="btn btn-ghost btn-block" data-action="moreSuggest">🔄 اقتراحات أخرى</button>';
    html += '<p class="hint" style="text-align:center">الأسعار تقريبية حسب السوق الأردني وقد تختلف من متجر لآخر.</p>';
    return html;
  }

  function readSugForm() {
    const ps = $('#sugPerson'); const bi = $('#sugBudget');
    if (ps) sug.personId = ps.value;
    if (bi) sug.budget = bi.value;
  }

  // ----- الميزانية -----
  function renderBudget() {
    const el = $('#view-budget');
    const up = upcomingEvents();
    const all = up.concat(pastEvents());
    if (!all.length) {
      el.innerHTML = '<div class="card empty"><div class="e-ico">💰</div><h3>لا توجد مناسبات بعد</h3><p class="muted">حدّدي ميزانية لكل مناسبة وسجّلي تكلفة الهدايا لنحسب لكِ المجموع وننبهك عند التجاوز.</p><button class="btn btn-primary" data-action="newEvent">➕ إضافة مناسبة</button></div>';
      return;
    }
    const tb = up.reduce((s, x) => s + num(x.ev.budget), 0);
    const ts = up.reduce((s, x) => s + spent(x.ev), 0);
    const overList = all.filter(x => num(x.ev.budget) > 0 && spent(x.ev) > num(x.ev.budget));
    let html = '<div class="card"><div class="section-title" style="margin:0 0 10px">ملخص المناسبات القادمة</div>' +
      '<div class="stats"><div class="stat"><div class="s-label">مجموع الميزانيات</div><div class="s-val">' + money(tb) + '</div></div>' +
      '<div class="stat ' + (ts > tb && tb > 0 ? 'over' : '') + '"><div class="s-label">مجموع التكاليف</div><div class="s-val">' + money(ts) + '</div></div>' +
      '<div class="stat ' + (tb - ts < 0 ? 'over' : 'good') + '"><div class="s-label">المتبقي</div><div class="s-val">' + money(tb - ts) + '</div></div></div>' +
      '<div style="margin-top:12px">' + progressBar(ts, tb) + '</div></div>';
    if (overList.length) {
      html += '<div class="alert-over"><span class="a-ico">⚠️</span><span>' + overList.length + ' مناسبة تجاوزت ميزانيتها: ' + overList.map(x => esc(evName(x.ev))).join('، ') + '</span></div>';
    }
    html += '<div class="section-title">الميزانية حسب المناسبة</div>';
    html += all.map(({ ev, days }) => {
      const b = num(ev.budget), s = spent(ev);
      const t = TYPES[ev.type] || TYPES.other;
      const isOver = b > 0 && s > b;
      return '<div class="card clickable" data-action="openEvent" data-id="' + ev.id + '">' +
        '<div class="event-card"><div class="ev-ico ' + ev.type + '">' + t.icon + '</div><div class="ev-body">' +
        '<div class="ev-title">' + esc(evName(ev)) + '</div><div class="ev-meta">' + (ev.gifts || []).length + ' هدية · ' + daysText(days) + '</div></div>' +
        '<span class="chip ' + (isOver ? 'over' : (b > 0 ? 'ok' : '')) + '">' + (isOver ? 'تجاوز ' + money(s - b) : (b > 0 ? 'متبقي ' + money(b - s) : 'بدون ميزانية')) + '</span></div>' +
        '<div class="mini-budget"><div class="row"><span>' + money(s) + '</span><span>' + money(b) + '</span></div>' + progressBar(s, b) + '</div></div>';
    }).join('');
    el.innerHTML = html;
  }

  // ================= نماذج الأشخاص =================
  let personDraft = null;
  let afterPersonSave = null; // 'event' لفتح نموذج مناسبة بعد الحفظ

  function personForm(p) {
    personDraft = p ? Object.assign({}, p) : { id: '', name: '', relation: '', notes: '' };
    const d = personDraft;
    openSheet(sheetHead(p ? 'تعديل بيانات الشخص' : 'إضافة شخص') +
      '<div class="form">' +
      '<div class="field"><label for="pName">الاسم</label><input class="input" id="pName" placeholder="مثال: أمي، سارة، أحمد" value="' + esc(d.name) + '" autocomplete="off"></div>' +
      '<div class="field"><span class="label">صلة القرابة</span><div class="choice-grid rel" id="relGrid">' +
      RELATIONS.map(r => '<button type="button" class="choice" data-action="pickRel" data-id="' + r.id + '" aria-pressed="' + (d.relation === r.id) + '"><span class="c-ico">' + r.icon + '</span>' + r.label + '</button>').join('') +
      '</div></div>' +
      '<div class="field"><label for="pNotes">اهتمامات وملاحظات (اختياري)</label><textarea class="input" id="pNotes" placeholder="مثال: تحب القهوة والنباتات، مقاس الحذاء 38">' + esc(d.notes) + '</textarea></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="savePerson">💾 حفظ</button>' +
      (p ? '' : '<button class="btn btn-soft" data-action="savePersonAndEvent">💾 حفظ وإضافة مناسبة</button>') + '</div>' +
      (p ? '<button class="btn btn-danger btn-block" data-action="deletePerson">🗑️ حذف الشخص</button>' : '') +
      '</div>');
  }

  function personDetails(p) {
    const r = REL[p.relation] || REL.oth;
    const evs = state.events.filter(e => e.personId === p.id).map(ev => ({ ev, days: daysLeft(ev) })).sort((a, b) => a.days - b.days);
    openSheet(sheetHead(esc(p.name)) +
      '<div class="sheet-body">' +
      '<div class="card person-card"><div class="avatar">' + r.icon + '</div><div class="ev-body"><div class="ev-title">' + esc(p.name) + '</div><div class="ev-meta">' + esc(r.label) + '</div>' +
      (p.notes ? '<div class="small" style="margin-top:4px">📝 ' + esc(p.notes) + '</div>' : '') + '</div></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="newEventFor" data-id="' + p.id + '">➕ مناسبة جديدة</button>' +
      '<button class="btn btn-soft" data-action="suggestForPerson" data-id="' + p.id + '">🎁 اقترح هدية</button></div>' +
      '<div class="section-title">مناسبات ' + esc(p.name) + '</div>' +
      (evs.length ? evs.map(x => eventCard(x.ev, x.days)).join('') : '<p class="muted">لا توجد مناسبات مسجلة.</p>') +
      '<button class="btn btn-ghost btn-block" data-action="editPerson" data-id="' + p.id + '">✏️ تعديل البيانات</button>' +
      '</div>');
  }

  function savePersonFromForm() {
    const d = personDraft;
    d.name = $('#pName').value.trim();
    d.notes = $('#pNotes').value.trim();
    if (!d.name) { toast('الرجاء كتابة الاسم', 'danger'); $('#pName').focus(); return null; }
    if (!d.relation) { toast('الرجاء اختيار صلة القرابة', 'danger'); return null; }
    if (d.id) {
      const i = state.people.findIndex(p => p.id === d.id);
      state.people[i] = d;
    } else {
      d.id = uid();
      state.people.push(d);
    }
    save();
    return d;
  }

  // ================= نماذج المناسبات =================
  let eventDraft = null;
  let pendingGift = null; // هدية تنتظر إنشاء مناسبة

  function eventForm(ev, preset) {
    if (!state.people.length) {
      eventDraft = Object.assign({ id: '', type: 'birthday', title: '', date: '', budget: '' }, preset || {});
      afterPersonSave = 'event';
      personForm(null);
      toast('أضيفي الشخص أولاً ثم مناسبته');
      return;
    }
    eventDraft = ev ? Object.assign({}, ev) : Object.assign({ id: '', personId: state.people[0].id, type: 'birthday', title: '', date: '', budget: '', recurring: true, gifts: [] }, preset || {});
    if (!ev && preset && preset.type && preset.recurring === undefined) eventDraft.recurring = TYPES[preset.type].recurring;
    const d = eventDraft;
    openSheet(sheetHead(ev ? 'تعديل المناسبة' : 'إضافة مناسبة') +
      '<div class="form">' +
      '<div class="field"><label for="ePerson">الشخص</label><select class="input" id="ePerson">' +
      state.people.map(p => '<option value="' + p.id + '"' + (p.id === d.personId ? ' selected' : '') + '>' + esc(p.name) + ' (' + esc(relLabel(p)) + ')</option>').join('') +
      '</select><button type="button" class="btn btn-ghost btn-sm" data-action="personFromEvent" style="align-self:flex-start">➕ شخص جديد</button></div>' +
      '<div class="field"><span class="label">نوع المناسبة</span><div class="choice-grid">' +
      Object.entries(TYPES).map(([k, t]) => '<button type="button" class="choice" data-action="pickType" data-id="' + k + '" aria-pressed="' + (d.type === k) + '"><span class="c-ico">' + t.icon + '</span>' + t.label + '</button>').join('') +
      '</div></div>' +
      '<div class="field" id="titleField"' + (d.type === 'other' ? '' : ' hidden') + '><label for="eTitle">اسم المناسبة</label><input class="input" id="eTitle" placeholder="مثال: مولود جديد، ترقية، عيد الأم" value="' + esc(d.title) + '"></div>' +
      '<div class="field"><label for="eDate">التاريخ</label><input class="input" id="eDate" type="date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label for="eBudget">ميزانية المناسبة</label><div class="input-money"><input class="input" id="eBudget" type="number" inputmode="decimal" min="0" step="0.5" placeholder="مثال: 50" value="' + esc(d.budget) + '"><span class="cur">د.أ</span></div></div>' +
      '<label class="check"><input type="checkbox" id="eRecurring"' + (d.recurring ? ' checked' : '') + '> تتكرر كل سنة (مثل أعياد الميلاد والذكرى السنوية)</label>' +
      '<p class="hint">🔔 سنذكّرك بالمناسبة قبل ' + REMIND_DAYS + ' أيام.</p>' +
      '<button class="btn btn-primary btn-block" data-action="saveEvent">💾 حفظ المناسبة</button>' +
      '</div>', () => { pendingGift = null; /* إغلاق بدون حفظ يلغي الهدية المعلقة */ });
  }

  function readEventForm() {
    const d = eventDraft;
    d.personId = $('#ePerson').value;
    d.title = $('#eTitle') ? $('#eTitle').value.trim() : '';
    d.date = $('#eDate').value;
    d.budget = num($('#eBudget').value);
    d.recurring = $('#eRecurring').checked;
  }

  function eventDetails(ev) {
    const p = person(ev.personId);
    const t = TYPES[ev.type] || TYPES.other;
    const b = num(ev.budget), s = spent(ev);
    const days = daysLeft(ev);
    const isOver = b > 0 && s > b;
    let html = sheetHead(t.icon + ' ' + esc(evName(ev))) + '<div class="sheet-body">';
    html += '<div class="card"><div class="ev-meta">' + (p ? esc(p.name) + ' · ' + esc(relLabel(p)) : '') + '</div>' +
      '<div class="ev-title" style="white-space:normal">' + fmtDate(nextDate(ev)) + '</div>' +
      '<div style="margin-top:6px"><span class="chip ' + chipClass(days) + '">' + daysText(days) + '</span>' + (ev.recurring ? ' <span class="chip">🔁 سنوياً</span>' : '') + '</div></div>';

    html += '<div class="stats"><div class="stat"><div class="s-label">الميزانية</div><div class="s-val">' + money(b) + '</div></div>' +
      '<div class="stat ' + (isOver ? 'over' : '') + '"><div class="s-label">مجموع التكاليف</div><div class="s-val">' + money(s) + '</div></div>' +
      '<div class="stat ' + (isOver ? 'over' : 'good') + '"><div class="s-label">' + (isOver ? 'التجاوز' : 'المتبقي') + '</div><div class="s-val">' + money(Math.abs(b - s)) + '</div></div></div>';
    html += progressBar(s, b);
    if (isOver) html += '<div class="alert-over"><span class="a-ico">⚠️</span><span>تنبيه: تجاوزتِ ميزانية هذه المناسبة بمقدار ' + money(s - b) + '</span></div>';
    else if (b > 0 && s > 0) html += '<div class="alert-ok">👍 أنتِ ضمن الميزانية، متبقي ' + money(b - s) + '</div>';

    html += '<div class="section-title">الهدايا وتكاليفها <small>' + (ev.gifts || []).length + '</small></div>';
    html += '<div class="gift-list">' + ((ev.gifts || []).length ? ev.gifts.map(g =>
      '<div class="gift-row"><span>🎁</span><span class="g-name">' + esc(g.name) + '</span><span class="g-cost">' + money(g.cost) + '</span>' +
      '<button class="del-btn" data-action="deleteGift" data-ev="' + ev.id + '" data-id="' + g.id + '" aria-label="حذف">🗑️</button></div>').join('')
      : '<p class="muted small">لم تُسجّل أي هدية بعد.</p>') + '</div>';

    html += '<div class="add-gift"><input class="input" id="gName" placeholder="اسم الهدية"><div class="input-money"><input class="input" id="gCost" type="number" inputmode="decimal" min="0" step="0.5" placeholder="التكلفة"><span class="cur">د.أ</span></div>' +
      '<button class="btn btn-mint" data-action="addGift" data-id="' + ev.id + '">➕ تسجيل الهدية وتكلفتها</button></div>';

    html += '<div class="btn-row"><button class="btn btn-primary" data-action="suggestForEvent" data-id="' + ev.id + '">🎁 اقترح هدايا</button>' +
      '<button class="btn btn-soft" data-action="downloadIcs" data-id="' + ev.id + '">📅 أضف للتقويم</button></div>';
    html += '<div class="btn-row"><button class="btn btn-ghost" data-action="editEvent" data-id="' + ev.id + '">✏️ تعديل</button>' +
      '<button class="btn btn-danger" data-action="deleteEvent" data-id="' + ev.id + '">🗑️ حذف</button></div>';
    html += '</div>';
    openSheet(html);
  }

  function addGiftTo(ev, name, cost) {
    const wasOver = num(ev.budget) > 0 && spent(ev) > num(ev.budget);
    ev.gifts = ev.gifts || [];
    ev.gifts.push({ id: uid(), name, cost });
    save();
    const nowOver = num(ev.budget) > 0 && spent(ev) > num(ev.budget);
    return nowOver && !wasOver ? 'newOver' : (nowOver ? 'over' : 'ok');
  }

  function afterGiftAdded(ev, status) {
    render();
    if (status === 'ok') {
      toast('تم تسجيل الهدية ✅');
      eventDetails(ev);
    } else {
      overBudgetAlert(ev, () => eventDetails(ev));
    }
  }

  // ================= التقويم (ICS) =================
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsDate(d) { return isoDate(d).replace(/-/g, ''); }
  function buildIcs(evs) {
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gift Organizer//AR', 'CALSCALE:GREGORIAN'];
    evs.forEach(ev => {
      const start = nextDate(ev);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const t = TYPES[ev.type] || TYPES.other;
      const name = t.icon + ' ' + evName(ev);
      lines.push('BEGIN:VEVENT', 'UID:' + ev.id + '@gift-organizer', 'DTSTAMP:' + now,
        'DTSTART;VALUE=DATE:' + icsDate(start), 'DTEND;VALUE=DATE:' + icsDate(end));
      if (ev.recurring) lines.push('RRULE:FREQ=YEARLY');
      lines.push('SUMMARY:' + icsEscape(name),
        'DESCRIPTION:' + icsEscape('الميزانية: ' + money(ev.budget) + ' — منظم الهدايا والمناسبات'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', 'DESCRIPTION:' + icsEscape('تذكير: ' + name + ' بعد أسبوع — جهّزي الهدية 🎁'), 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', 'DESCRIPTION:' + icsEscape('تذكير: ' + name + ' غداً'), 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  function downloadFile(name, content, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) { toast('تعذّر تنزيل الملف على هذا الجهاز', 'danger'); return false; }
  }

  // ================= الإشعارات =================
  function notifSupported() { return 'Notification' in window; }
  function checkReminders() {
    if (!notifSupported() || Notification.permission !== 'granted') return;
    upcomingEvents().filter(x => x.days <= REMIND_DAYS).forEach(({ ev, days }) => {
      const key = ev.id + '@' + isoDate(nextDate(ev));
      if (state.notified[key]) return;
      const title = '⏰ ' + evName(ev) + ' ' + daysText(days);
      const body = spent(ev) > 0 ? 'الهدية جاهزة؟ راجعي الميزانية في التطبيق.' : 'لم تختاري الهدية بعد — افتحي التطبيق لاقتراح هدية مناسبة 🎁';
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar', tag: key }));
        } else {
          new Notification(title, { body, dir: 'rtl', lang: 'ar', tag: key });
        }
        state.notified[key] = 1;
      } catch (e) { /* تجاهل */ }
    });
    save();
  }

  function settingsSheet() {
    let notifHtml;
    if (!notifSupported()) notifHtml = '<p class="hint">المتصفح لا يدعم الإشعارات. استخدمي زر «أضف للتقويم» لضمان التذكير.</p>';
    else if (Notification.permission === 'granted') notifHtml = '<div class="alert-ok">🔔 الإشعارات مفعّلة — سنذكّرك عند فتح التطبيق قبل المناسبة بأسبوع.</div>';
    else if (Notification.permission === 'denied') notifHtml = '<p class="hint">الإشعارات محظورة من إعدادات المتصفح. يمكنك تفعيلها من إعدادات الموقع.</p>';
    else notifHtml = '<button class="btn btn-soft" data-action="enableNotif">🔔 تفعيل إشعارات التذكير</button>';
    openSheet(sheetHead('⚙️ الإعدادات') +
      '<div class="settings-list">' +
      '<div class="section-title">التذكيرات</div>' + notifHtml +
      '<button class="btn btn-soft" data-action="icsAll">📅 إضافة كل المناسبات للتقويم (تذكير قبل أسبوع)</button>' +
      '<p class="hint">ملف التقويم يضيف المناسبات إلى تقويم هاتفك مع تنبيه قبل 7 أيام، فيصلك التذكير حتى لو لم تفتحي التطبيق.</p>' +
      '<div class="section-title">بياناتك</div>' +
      '<p class="hint">تُحفظ بياناتك على هذا الجهاز فقط، بدون حساب. لنقلها لجهاز آخر أو مشاركتها مع العائلة استخدمي النسخ الاحتياطي.</p>' +
      '<button class="btn btn-ghost" data-action="exportData">⬇️ تصدير نسخة احتياطية</button>' +
      '<button class="btn btn-ghost" data-action="importData">⬆️ استيراد نسخة احتياطية</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '<button class="btn btn-danger" data-action="clearAll">🗑️ حذف جميع البيانات</button>' +
      '</div>');
  }

  // ================= معالجة الأزرار =================
  const actions = {
    closeSheet: () => closeSheet(),
    confirmYes: () => { const cb = confirmCb; confirmCb = null; closeSheet(); if (cb) cb(); },
    openSettings: () => settingsSheet(),
    goSuggest: () => { sug.eventId = ''; showTab('suggest'); },

    // الأشخاص
    newPerson: () => { afterPersonSave = null; personForm(null); },
    openPerson: d => { const p = person(d.id); if (p) personDetails(p); },
    editPerson: d => { const p = person(d.id); if (p) personForm(p); },
    pickRel: (d, el) => {
      personDraft.relation = d.id;
      el.parentElement.querySelectorAll('.choice').forEach(c => c.setAttribute('aria-pressed', String(c === el)));
    },
    savePerson: () => {
      const p = savePersonFromForm(); if (!p) return;
      toast('تم حفظ ' + p.name + ' ✅');
      if (afterPersonSave === 'event') { afterPersonSave = null; render(); eventForm(null, Object.assign({}, eventDraftPreset(), { personId: p.id })); return; }
      closeSheet(); render();
    },
    savePersonAndEvent: () => {
      const p = savePersonFromForm(); if (!p) return;
      afterPersonSave = null; render();
      eventForm(null, Object.assign({}, eventDraftPreset(), { personId: p.id }));
    },
    deletePerson: () => {
      const p = personDraft;
      const n = state.events.filter(e => e.personId === p.id).length;
      confirmSheet('حذف ' + esc(p.name) + '؟', n ? 'سيتم حذف ' + n + ' مناسبة مرتبطة به أيضاً.' : 'لا يمكن التراجع عن الحذف.', 'نعم، احذف', () => {
        state.people = state.people.filter(x => x.id !== p.id);
        state.events = state.events.filter(e => e.personId !== p.id);
        if (sug.personId === p.id) sug.personId = '';
        save(); render(); toast('تم الحذف');
      });
    },
    personFromEvent: () => {
      readEventForm();
      afterPersonSave = 'event';
      personForm(null);
    },

    // المناسبات
    newEvent: () => { pendingGift = null; eventForm(null); },
    newEventFor: d => { pendingGift = null; eventForm(null, { personId: d.id }); },
    openEvent: d => { const ev = eventById(d.id); if (ev) eventDetails(ev); },
    editEvent: d => { const ev = eventById(d.id); if (ev) { pendingGift = null; eventForm(ev); } },
    pickType: (d, el) => {
      readEventForm();
      eventDraft.type = d.id;
      if (!eventDraft.id) { eventDraft.recurring = TYPES[d.id].recurring; $('#eRecurring').checked = eventDraft.recurring; }
      el.parentElement.querySelectorAll('.choice').forEach(c => c.setAttribute('aria-pressed', String(c === el)));
      $('#titleField').hidden = d.id !== 'other';
    },
    saveEvent: () => {
      readEventForm();
      const d = eventDraft;
      if (!d.personId) { toast('اختاري الشخص', 'danger'); return; }
      if (!d.date) { toast('الرجاء تحديد تاريخ المناسبة', 'danger'); $('#eDate').focus(); return; }
      if (d.type === 'other' && !d.title) { toast('اكتبي اسم المناسبة', 'danger'); $('#eTitle').focus(); return; }
      if (d.id) {
        const i = state.events.findIndex(e => e.id === d.id);
        state.events[i] = d;
      } else {
        d.id = uid();
        state.events.push(d);
      }
      save();
      let status = 'ok';
      if (pendingGift) { status = addGiftTo(d, pendingGift.name, pendingGift.cost); pendingGift = null; }
      render();
      const days = daysLeft(d);
      if (status !== 'ok') { overBudgetAlert(d, () => eventDetails(d)); return; }
      toast(days >= 0 && days <= REMIND_DAYS ? 'تم الحفظ — المناسبة ' + daysText(days) + ' ⏰' : 'تم حفظ المناسبة ✅');
      eventDetails(d);
      checkReminders();
    },
    deleteEvent: d => {
      const ev = eventById(d.id); if (!ev) return;
      confirmSheet('حذف المناسبة؟', 'سيتم حذف «' + esc(evName(ev)) + '» وهداياها المسجلة.', 'نعم، احذف', () => {
        state.events = state.events.filter(e => e.id !== ev.id);
        if (sug.eventId === ev.id) sug.eventId = '';
        save(); render(); toast('تم حذف المناسبة');
      });
    },
    addGift: d => {
      const ev = eventById(d.id); if (!ev) return;
      const name = $('#gName').value.trim();
      const costRaw = $('#gCost').value;
      if (!name) { toast('اكتبي اسم الهدية', 'danger'); $('#gName').focus(); return; }
      if (costRaw === '') { toast('أدخلي تكلفة الهدية', 'danger'); $('#gCost').focus(); return; }
      afterGiftAdded(ev, addGiftTo(ev, name, num(costRaw)));
    },
    deleteGift: d => {
      const ev = eventById(d.ev); if (!ev) return;
      ev.gifts = ev.gifts.filter(g => g.id !== d.id);
      save(); render(); eventDetails(ev); toast('تم حذف الهدية');
    },
    downloadIcs: d => {
      const ev = eventById(d.id); if (!ev) return;
      if (downloadFile('مناسبة-' + evName(ev).replace(/\s+/g, '-') + '.ics', buildIcs([ev]), 'text/calendar;charset=utf-8')) toast('افتحي الملف لإضافته للتقويم 📅');
    },
    icsAll: () => {
      if (!state.events.length) { toast('لا توجد مناسبات بعد', 'danger'); return; }
      if (downloadFile('مناسباتي.ics', buildIcs(state.events), 'text/calendar;charset=utf-8')) toast('افتحي الملف لإضافته للتقويم 📅');
    },

    // الاقتراحات
    suggestForEvent: d => {
      const ev = eventById(d.id); if (!ev) return;
      closeSheet();
      const remaining = num(ev.budget) - spent(ev);
      Object.assign(sug, { personId: ev.personId, relation: '', type: ev.type, budget: remaining > 0 ? String(remaining) : (ev.budget ? String(ev.budget) : ''), eventId: ev.id, results: null, page: 0 });
      showTab('suggest');
      if (sug.budget) actions.runSuggest();
    },
    suggestForPerson: d => {
      closeSheet();
      Object.assign(sug, { personId: d.id, relation: '', eventId: '', results: null, page: 0 });
      showTab('suggest');
    },
    clearSugCtx: () => { readSugForm(); sug.eventId = ''; renderSuggest(); },
    sugRel: (d) => { readSugForm(); sug.relation = sug.relation === d.id ? '' : d.id; renderSuggest(); },
    sugType: (d) => { readSugForm(); sug.type = d.id; renderSuggest(); },
    runSuggest: () => {
      readSugForm();
      const budget = num(sug.budget);
      if (!sug.budget || budget <= 0) { toast('أدخلي الميزانية المتاحة', 'danger'); const b = $('#sugBudget'); if (b) b.focus(); return; }
      const p = person(sug.personId);
      const relation = p ? p.relation : sug.relation;
      const r = scoreGifts(relation, sug.type, budget);
      sug.results = Object.assign(r, { relation, type: sug.type, budget });
      sug.page = 0;
      renderSuggest();
      const res = $('#sugResults'); if (res) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    moreSuggest: () => { readSugForm(); sug.page++; $('#sugResults').innerHTML = resultsHtml(); $('#sugResults').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    adoptGift: d => {
      const g = window.GIFTS.find(x => x.id === d.id); if (!g) return;
      const gift = { name: g.icon + ' ' + g.name, cost: g.price };
      const target = sug.eventId && eventById(sug.eventId);
      if (target) { afterGiftAdded(target, addGiftTo(target, gift.name, gift.cost)); return; }
      const candidates = state.events.filter(e => (!sug.personId || e.personId === sug.personId) && e.type === sug.type && daysLeft(e) >= 0);
      if (candidates.length === 1) { afterGiftAdded(candidates[0], addGiftTo(candidates[0], gift.name, gift.cost)); return; }
      pendingGift = gift;
      if (candidates.length > 1) {
        openSheet(sheetHead('لأي مناسبة؟') + '<div class="sheet-body">' +
          candidates.map(e => '<button class="btn btn-ghost btn-block" data-action="adoptTo" data-id="' + e.id + '">' + (TYPES[e.type] || TYPES.other).icon + ' ' + esc(evName(e)) + '</button>').join('') +
          '<button class="btn btn-soft btn-block" data-action="adoptNew">➕ مناسبة جديدة</button></div>');
        return;
      }
      actions.adoptNew();
    },
    adoptTo: d => {
      const ev = eventById(d.id); if (!ev || !pendingGift) return;
      const g = pendingGift; pendingGift = null;
      afterGiftAdded(ev, addGiftTo(ev, g.name, g.cost));
    },
    adoptNew: () => {
      const preset = { type: sug.type, budget: num(sug.budget) || '' };
      if (sug.personId) preset.personId = sug.personId;
      const g = pendingGift;
      eventForm(null, preset);
      pendingGift = g;
      if (state.people.length) toast('أكملي بيانات المناسبة لحفظ الهدية');
    },

    // الإعدادات
    enableNotif: () => {
      if (!notifSupported()) return;
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') { toast('تم تفعيل الإشعارات 🔔'); checkReminders(); }
        else toast('لم يتم السماح بالإشعارات', 'danger');
        settingsSheet();
      });
    },
    exportData: () => {
      const data = JSON.stringify({ app: 'gift-organizer', version: 1, exportedAt: new Date().toISOString(), people: state.people, events: state.events }, null, 2);
      if (downloadFile('نسخة-هداياي-' + isoDate(today()) + '.json', data, 'application/json')) toast('تم تصدير النسخة الاحتياطية ✅');
    },
    importData: () => {
      const inp = $('#importFile');
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const d = JSON.parse(reader.result);
            if (!Array.isArray(d.people) || !Array.isArray(d.events)) throw new Error('bad');
            state = { people: d.people, events: d.events, notified: state.notified };
            save(); closeSheet(); render(); toast('تم استيراد البيانات ✅');
          } catch (e) { toast('الملف غير صالح', 'danger'); }
        };
        reader.readAsText(f);
      };
      inp.click();
    },
    clearAll: () => {
      confirmSheet('حذف جميع البيانات؟', 'سيتم حذف كل الأشخاص والمناسبات والهدايا من هذا الجهاز. ننصح بتصدير نسخة احتياطية أولاً.', 'نعم، احذف الكل', () => {
        state = { people: [], events: [], notified: {} };
        Object.assign(sug, { personId: '', relation: '', eventId: '', results: null, page: 0 });
        save(); render(); toast('تم حذف جميع البيانات');
      });
    }
  };

  function eventDraftPreset() {
    if (!eventDraft || eventDraft.id) return {};
    return { type: eventDraft.type, title: eventDraft.title, date: eventDraft.date, budget: eventDraft.budget, recurring: eventDraft.recurring };
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { showTab(tab.dataset.tab); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      actions[el.dataset.action](el.dataset, el);
      return;
    }
    if (e.target.id === 'sheetBackdrop') closeSheet();
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'sugPerson') { readSugForm(); sug.relation = ''; if (sug.eventId) { const ev = eventById(sug.eventId); if (!ev || ev.personId !== sug.personId) sug.eventId = ''; } renderSuggest(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#sheetBackdrop').hidden) closeSheet();
    if (e.key === 'Enter' && (e.target.id === 'gCost' || e.target.id === 'gName')) { const b = document.querySelector('[data-action="addGift"]'); if (b) b.click(); }
    if (e.key === 'Enter' && e.target.id === 'sugBudget') actions.runSuggest();
  });

  // ================= التشغيل =================
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* غير متاح في هذه البيئة */ });
  }
  render();
  checkReminders();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkReminders(); } });

  // للاختبار
  window.__giftApp = { scoreGifts, state: () => state };
})();
