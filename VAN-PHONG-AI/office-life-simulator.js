(function () {
  'use strict';

  const STORAGE_KEY = 'ctec-ai-office-life-v1';
  const TICK_MS = 4600;
  const SYNC_MS = 24000;
  const MAX_EVENTS = 220;
  const MAX_MEMORIES = 240;
  const MAX_HOOKS = 50;
  // Làm việc 24/24: không có giờ vào/ca trưa/giờ về — nhân viên luôn hiện diện và xử lý công việc.
  const WORKDAY = { arrival: 0, workStart: 0, lunchStart: 1440, lunchEnd: 1440, regularEnd: 1440, overtimeDecision: 1440, latestEnd: 1440 };
  const ARRIVAL_OFFSETS = [8, 0, 18, 12, 5, 24, 16];
  const LUNCH_PLANS = ['coffee', 'nap', 'coffee', 'nap', 'social', 'nap', 'quiet'];

  const profiles = {
    'AN': { role: 'Trưởng nhóm AI', traits: { social: .72, careful: .84, initiative: .96 }, skills: { coordination: .98, analysis: .86, control: .86, system: .72 } },
    'HẢI': { role: 'Tiếp nhận và điều phối', traits: { social: .78, careful: .68, initiative: .82 }, skills: { coordination: .92, forms: .64, control: .62 } },
    'LONG': { role: 'Tài chính và số liệu', traits: { social: .42, careful: .91, initiative: .62 }, skills: { finance: .95, analysis: .91, control: .76 } },
    'MINH': { role: 'Biểu mẫu và tổng hợp', traits: { social: .66, careful: .86, initiative: .68 }, skills: { forms: .95, coordination: .72, records: .68 } },
    'NAM': { role: 'Lưu trữ và hệ thống', traits: { social: .54, careful: .88, initiative: .74 }, skills: { records: .94, system: .9, control: .7 } },
    'LÂM': { role: 'Khảo sát và thực hiện', traits: { social: .74, careful: .59, initiative: .88 }, skills: { sourcing: .94, coordination: .76, analysis: .61 } },
    'PHÚC': { role: 'Kiểm soát và tuân thủ', traits: { social: .38, careful: .97, initiative: .71 }, skills: { control: .98, system: .78, analysis: .82 } }
  };

  const names = Object.keys(profiles);
  const actionLabels = {
    work: 'Đang xử lý công việc', drink: 'Đi lấy nước', coffee: 'Nghỉ tại góc cà phê', rest: 'Nghỉ mắt tại khu chờ',
    talk: 'Trao đổi với đồng nghiệp', help: 'Hỗ trợ đồng nghiệp', printer: 'Kiểm tra máy in', server: 'Kiểm tra hệ thống',
    board: 'Rà bảng công việc', organize: 'Sắp xếp hồ sơ', breakfast: 'Ăn sáng tại bàn cà phê', lunch: 'Ăn trưa',
    nap: 'Ngủ trưa bằng ghế gấp', 'phone-call': 'Nghe điện thoại', 'social-feed': 'Lướt mạng xã hội', overtime: 'Đang tăng ca', offDuty: 'Đã rời văn phòng'
  };

  let bridge = null;
  let state = null;
  let tickTimer = null;
  let syncTimer = null;
  let visualActionRunning = false;
  let storyGenerationRunning = false;
  let destroyed = false;

  function clamp(value) {
    return Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 10) / 10));
  }

  function dateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }

  function minuteOfDay(date) {
    const value = date instanceof Date ? date : new Date(date);
    return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60;
  }

  function phaseForMinute(minute) {
    if (minute < WORKDAY.arrival) return 'closed';
    if (minute < WORKDAY.workStart) return 'earlyMorning';
    if (minute < WORKDAY.lunchStart) return 'morning';
    if (minute < WORKDAY.lunchEnd) return 'lunch';
    if (minute < 1020) return 'afternoon';
    if (minute < WORKDAY.regularEnd) return 'lateAfternoon';
    if (minute < WORKDAY.latestEnd) return 'overtime';
    return 'closed';
  }

  function formatMinute(value) {
    const minute = Math.max(0, Math.min(1439, Math.round(Number(value) || 0)));
    return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
  }

  function random() {
    state.seed = (Math.imul(state.seed >>> 0, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function randomId(prefix) {
    return prefix + '-' + state.dayKey.replace(/-/g, '') + '-' + state.tick + '-' + Math.floor(random() * 1000000).toString(36);
  }

  function pairKey(first, second) {
    return [String(first), String(second)].sort().join(':');
  }

  function defaultPerson(name) {
    const index = Math.max(0, names.indexOf(name));
    return {
      name: name, role: profiles[name].role, activity: 'work', location: 'desk', target: '', busyUntil: 0,
      energy: 72 + Math.round(Math.random() * 12), focus: 72, hydration: 76, social: 62,
      stress: 22, workload: name === 'HẢI' || name === 'PHÚC' ? 48 : 42,
      mood: 'ổn định', lastAction: 'work', actionCount: 0, unresolved: [], present: false,
      attendanceStatus: 'off-duty', arrivalMinute: WORKDAY.arrival + ARRIVAL_OFFSETS[index], departureMinute: WORKDAY.regularEnd,
      overtimeUntil: 0, overtimeReason: '', lunchPlan: LUNCH_PLANS[index], scheduleDayKey: ''
    };
  }

  function defaultRelationships() {
    const relations = {};
    for (let first = 0; first < names.length; first += 1) {
      for (let second = first + 1; second < names.length; second += 1) {
        const key = pairKey(names[first], names[second]);
        relations[key] = {
          key: key, personA: names[first], personB: names[second], affinity: 56,
          trust: 58, tension: 10, lastReason: 'Quan hệ làm việc ổn định', updatedAt: new Date().toISOString()
        };
      }
    }
    return relations;
  }

  function createState() {
    const people = {};
    names.forEach(function (name) { people[name] = defaultPerson(name); });
    const today = dateKey(new Date());
    return {
      version: 2, dayKey: today, tick: 0, seed: (Date.now() ^ 0x5F3759DF) >>> 0,
      updatedAt: new Date().toISOString(), people: people, relationships: defaultRelationships(),
      world: { printerHealth: 86, networkHealth: 9e1, coffeeHealth: 92, queuePressure: 32, casePressure: 20, interruptions: 0 },
      events: [], memories: [], hooks: [],
      officeSession: null,
      daily: { dayKey: today, generatedStories: 0, significantEvents: 0, visibleActions: 0, overtimeDecided: false, overtimeNames: [], phase: 'closed' }
    };
  }

  function normalizePerson(name, value) {
    const base = defaultPerson(name);
    const person = Object.assign(base, value || {});
    ['energy', 'focus', 'hydration', 'social', 'stress', 'workload'].forEach(function (key) { person[key] = clamp(person[key]); });
    person.unresolved = Array.isArray(person.unresolved) ? person.unresolved.slice(-12) : [];
    person.present = Boolean(person.present);
    person.arrivalMinute = Number.isFinite(Number(person.arrivalMinute)) ? Number(person.arrivalMinute) : WORKDAY.arrival + ARRIVAL_OFFSETS[Math.max(0, names.indexOf(name))];
    person.departureMinute = Number.isFinite(Number(person.departureMinute)) ? Number(person.departureMinute) : WORKDAY.regularEnd;
    person.overtimeUntil = Math.max(0, Number(person.overtimeUntil) || 0);
    person.lunchPlan = person.lunchPlan || LUNCH_PLANS[Math.max(0, names.indexOf(name))];
    return person;
  }

  function normalizeState(value) {
    const base = createState();
    if (!value || typeof value !== 'object') return base;
    const result = Object.assign(base, value);
    result.version = 2;
    result.people = result.people && typeof result.people === 'object' ? result.people : {};
    names.forEach(function (name) { result.people[name] = normalizePerson(name, result.people[name]); });
    result.relationships = Object.assign(defaultRelationships(), result.relationships || {});
    result.world = Object.assign(base.world, result.world || {});
    Object.keys(result.world).forEach(function (key) { result.world[key] = clamp(result.world[key]); });
    result.events = Array.isArray(result.events) ? result.events.slice(-MAX_EVENTS) : [];
    result.memories = Array.isArray(result.memories) ? result.memories.slice(-MAX_MEMORIES) : [];
    result.hooks = Array.isArray(result.hooks) ? result.hooks.slice(-MAX_HOOKS).map(function (hook, index) {
      const participants = Array.isArray(hook.participants) ? hook.participants.filter(Boolean).slice(0, 7) : [];
      return Object.assign({
        id: 'hook-loaded-' + index, kind: 'office', title: 'Tình huống văn phòng', status: 'open', score: 0,
        participants: participants, causes: [], location: 'meeting', payload: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }, hook, { participants: participants, causes: Array.isArray(hook.causes) ? hook.causes.slice(-18) : [], signature: hook.signature || hookSignature(hook.kind || 'office', participants) });
    }) : [];
    result.officeSession = result.officeSession && typeof result.officeSession === 'object' ? result.officeSession : null;
    result.daily = Object.assign(base.daily, result.daily || {});
    result.seed = Number(result.seed) >>> 0 || base.seed;
    result.tick = Math.max(0, Number(result.tick) || 0);
    return result;
  }

  function loadLocalState() {
    try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch (error) { return createState(); }
  }

  function saveLocalState() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { }
  }

  function relationship(first, second) {
    const key = pairKey(first, second);
    if (!state.relationships[key]) {
      state.relationships[key] = { key: key, personA: first, personB: second, affinity: 50, trust: 50, tension: 12, lastReason: '', updatedAt: new Date().toISOString() };
    }
    return state.relationships[key];
  }

  function updateRelationship(first, second, changes, reason) {
    if (!first || !second || first === second) return;
    const item = relationship(first, second);
    Object.keys(changes || {}).forEach(function (key) { item[key] = clamp(Number(item[key]) + Number(changes[key] || 0)); });
    item.lastReason = reason || item.lastReason;
    item.updatedAt = new Date().toISOString();
  }

  function eventRecord(kind, actor, target, location, title, detail, importance, payload) {
    const event = {
      id: randomId('life'), dayKey: state.dayKey, tick: state.tick, kind: kind || 'activity', actor: actor || '',
      target: target || '', location: location || '', title: title, detail: detail || '',
      importance: Math.max(0, Math.min(1, Number(importance) || .4)), payload: payload || {}, createdAt: new Date().toISOString()
    };
    state.events.push(event);
    state.events = state.events.slice(-MAX_EVENTS);
    if (event.importance >= .62) state.daily.significantEvents += 1;
    return event;
  }

  function memoryRecord(person, kind, summary, emotion, importance, eventIds, payload) {
    const memory = {
      id: randomId('mem-' + foldName(person)), person: person, kind: kind || 'episodic', summary: summary,
      emotion: emotion || 'neutral', importance: Math.max(0, Math.min(1, Number(importance) || .5)),
      dayKey: state.dayKey, sourceEventIds: Array.isArray(eventIds) ? eventIds.slice(-20) : [],
      payload: payload || {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    state.memories.push(memory);
    state.memories = state.memories.slice(-MAX_MEMORIES);
    compactMemories(person);
    return memory;
  }

  function foldName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  }

  function compactMemories(person) {
    const items = state.memories.filter(function (memory) { return memory.person === person && memory.kind !== 'semantic'; });
    if (items.length <= 22) return;
    const selected = items.slice().sort(function (a, b) {
      if (a.importance === b.importance) return String(a.createdAt).localeCompare(String(b.createdAt));
      return a.importance - b.importance;
    }).slice(0, 8);
    const selectedIds = selected.map(function (memory) { return memory.id; });
    const themes = [];
    selected.forEach(function (memory) {
      const theme = memory.payload && memory.payload.theme ? memory.payload.theme : memory.kind;
      if (themes.indexOf(theme) === -1) themes.push(theme);
    });
    state.memories = state.memories.filter(function (memory) { return selectedIds.indexOf(memory.id) === -1; });
    state.memories.push({
      id: randomId('summary-' + foldName(person)), person: person, kind: 'semantic',
      summary: person + ' rút ra kinh nghiệm từ ' + selected.length + ' tình huống liên quan ' + themes.slice(0, 3).join(', ') + '.',
      emotion: 'chiêm nghiệm', importance: .74, dayKey: state.dayKey, sourceEventIds: selected.reduce(function (all, memory) { return all.concat(memory.sourceEventIds || []); }, []).slice(-30),
      payload: { themes: themes, compactedMemoryIds: selectedIds }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }

  function syncDay() {
    const today = dateKey(new Date());
    if (state.dayKey === today) return;
    state.dayKey = today;
    state.daily = { dayKey: today, generatedStories: 0, significantEvents: 0, visibleActions: 0, overtimeDecided: false, overtimeNames: [], phase: 'closed' };
    names.forEach(function (name) {
      const person = state.people[name];
      person.energy = clamp(person.energy + 18);
      person.focus = clamp(person.focus + 12);
      person.hydration = clamp(person.hydration + 15);
      person.stress = clamp(person.stress * .68);
      person.workload = clamp(person.workload * .78 + 8);
      person.busyUntil = 0;
      person.present = false;
      person.attendanceStatus = 'off-duty';
      person.departureMinute = WORKDAY.regularEnd;
      person.overtimeUntil = 0;
      person.overtimeReason = '';
      person.scheduleDayKey = today;
    });
    state.hooks.forEach(function (hook) { if (hook.status === 'staged') hook.status = 'resolved'; });
    eventRecord('day', '', '', 'office', 'Bắt đầu ngày làm việc mới', 'Văn phòng tiếp tục từ ký ức và các đầu việc còn mở của ngày trước.', .64, {});
  }

  function decideOvertime(context) {
    if (state.daily.overtimeDecided) return;
    const minute = minuteOfDay(new Date());
    if (minute < WORKDAY.overtimeDecision) return;
    const openHooks = state.hooks.filter(function (hook) { return hook.status !== 'resolved' && hook.status !== 'archived'; });
    const scored = names.map(function (name) {
      const person = state.people[name];
      const hookPressure = openHooks.some(function (hook) { return hook.participants.indexOf(name) !== -1; }) ? 12 : 0;
      const casePressure = context.hasCase && context.mode !== 'complete' ? (name === 'AN' ? 18 : 7) : 0;
      const score = person.workload * .55 + person.stress * .24 + state.world.queuePressure * .16 + hookPressure + casePressure + random() * 9;
      return { name: name, score: score };
    }).sort(function (first, second) { return second.score - first.score; });
    const selected = scored.filter(function (item) { return item.score >= 58; }).slice(0, 3);
    selected.forEach(function (item) {
      const person = state.people[item.name];
      const duration = item.score >= 84 ? 180 : (item.score >= 72 ? 120 : 60);
      person.overtimeUntil = Math.min(WORKDAY.latestEnd, WORKDAY.regularEnd + duration);
      person.departureMinute = person.overtimeUntil;
      person.overtimeReason = context.hasCase && context.mode !== 'complete' ? 'Hồ sơ đang xử lý cần bàn giao đúng hạn' : (person.workload >= 65 ? 'Tải công việc trong ngày còn cao' : 'Tình huống văn phòng chưa khép lại');
    });
    state.daily.overtimeDecided = true;
    state.daily.overtimeNames = selected.map(function (item) { return item.name; });
    if (selected.length) {
      eventRecord('schedule', selected[0].name, '', 'office', 'Văn phòng phát sinh tăng ca', selected.map(function (item) {
        const person = state.people[item.name];
        return item.name + ' đến ' + formatMinute(person.overtimeUntil);
      }).join(', ') + '. Quyết định dựa trên tải việc, tình huống và các mầm câu chuyện đang mở.', .72, { theme: 'overtime', people: state.daily.overtimeNames });
    }
  }

  function lunchStatus(person, minute) {
    if (minute < WORKDAY.lunchStart + 38) return 'lunch';
    if (minute >= WORKDAY.lunchEnd - 18) return 'lunch-return';
    if (person.lunchPlan === 'nap') return 'nap';
    if (person.lunchPlan === 'coffee') return 'coffee-break';
    if (person.lunchPlan === 'social') return 'lunch-social';
    return 'quiet-break';
  }

  function synchronizeAttendance(context, initial) {
    const now = new Date();
    const minute = minuteOfDay(now);
    const phase = phaseForMinute(minute);
    state.daily.phase = phase;
    decideOvertime(context);
    const changed = [];
    names.forEach(function (name, index) {
      const person = state.people[name];
      if (person.scheduleDayKey !== state.dayKey) {
        person.scheduleDayKey = state.dayKey;
        person.arrivalMinute = WORKDAY.arrival + ARRIVAL_OFFSETS[index];
        person.departureMinute = person.overtimeUntil || WORKDAY.regularEnd;
      }
      const departure = person.overtimeUntil || person.departureMinute || WORKDAY.regularEnd;
      const present = minute >= person.arrivalMinute && minute < departure && minute < WORKDAY.latestEnd;
      let status = 'off-duty';
      if (present) {
        if (minute < WORKDAY.workStart) status = 'breakfast';
        else if (minute < WORKDAY.lunchStart) status = 'working';
        else if (minute < WORKDAY.lunchEnd) status = lunchStatus(person, minute);
        else if (minute < WORKDAY.regularEnd) status = 'working';
        else status = 'overtime';
      }
      if (person.present !== present || person.attendanceStatus !== status) changed.push({ name: name, wasPresent: person.present, present: present, status: status });
      if (person.present !== present) {
        if (present && (!initial || minute < WORKDAY.workStart)) {
          eventRecord('attendance', name, '', 'entry', name + ' đến văn phòng', name + ' mở cửa, đi vào văn phòng và bắt đầu nhịp sinh hoạt đầu ngày.', .42, { theme: 'attendance', time: formatMinute(minute) });
        } else if (!present && person.present && !initial) {
          eventRecord('attendance', name, '', 'entry', name + ' rời văn phòng', person.overtimeUntil ? name + ' kết thúc tăng ca lúc ' + formatMinute(minute) + '.' : name + ' kết thúc ngày làm việc và ra về.', .46, { theme: 'attendance', time: formatMinute(minute), overtime: Boolean(person.overtimeUntil) });
        }
      }
      person.present = present;
      person.attendanceStatus = status;
      if (!present) {
        person.activity = 'offDuty';
        person.location = 'outside';
        person.target = '';
      } else if (status === 'overtime' && person.activity === 'offDuty') {
        person.activity = 'overtime';
        person.location = 'desk';
      } else if (status === 'breakfast' && person.activity === 'offDuty') {
        person.activity = 'breakfast';
        person.location = 'coffee';
      }
    });
    const snapshot = {
      dayKey: state.dayKey, minute: minute, phase: phase, officeOpen: names.some(function (name) { return state.people[name].present; }),
      changed: changed, people: names.reduce(function (result, name) {
        const person = state.people[name];
        result[name] = { present: person.present, status: person.attendanceStatus, arrivalMinute: person.arrivalMinute, departureMinute: person.overtimeUntil || person.departureMinute, overtimeReason: person.overtimeReason, lunchPlan: person.lunchPlan };
        return result;
      }, {})
    };
    if (bridge && typeof bridge.syncPresence === 'function') Promise.resolve(bridge.syncPresence(snapshot, { initial: Boolean(initial) })).catch(function () { });
    return snapshot;
  }

  function reconcileStoryHooks() {
    const context = bridge.getContext();
    const queued = Array.isArray(context.queuedEmergentIds) ? context.queuedEmergentIds : [];
    state.hooks.forEach(function (hook) {
      if (hook.status === 'composing') hook.status = 'ready';
      if (hook.status === 'staged' && queued.indexOf(hook.id) === -1) hook.status = 'ready';
      if (hook.status === 'waiting-choice' && context.pendingEmergentId !== hook.id) hook.status = 'resolved';
    });
  }

  function updateNeeds(context) {
    const phase = context.phase || 'morning';
    names.forEach(function (name) {
      const person = state.people[name];
      if (!person.present) return;
      const working = person.activity === 'work' || person.activity === 'organize' || person.activity === 'board';
      person.energy = clamp(person.energy - (working ? .62 : .25));
      person.focus = clamp(person.focus - (working ? .48 : .12));
      person.hydration = clamp(person.hydration - .52);
      person.social = clamp(person.social - (person.activity === 'talk' || person.activity === 'help' ? -.9 : .18));
      person.stress = clamp(person.stress + (working ? person.workload / 180 : -.55));
      if (phase === 'lateAfternoon' || phase === 'overtime') person.energy = clamp(person.energy - .35);
      if (context.mode === 'waiting') person.stress = clamp(person.stress - .18);
      person.mood = person.stress >= 72 ? 'căng thẳng' : (person.energy <= 34 ? 'mệt' : (person.focus >= 72 ? 'tập trung' : 'ổn định'));
    });
  }

  function updateWorld(context) {
    const world = state.world;
    world.casePressure = clamp(context.hasCase ? (context.mode === 'waiting' ? 58 : (context.mode === 'complete' ? 18 : 72)) : 24);
    world.queuePressure = clamp(world.queuePressure + (world.casePressure > 60 ? .65 : -.35) + (random() - .5) * .9);
    world.printerHealth = clamp(world.printerHealth - random() * .22 + .04);
    world.networkHealth = clamp(world.networkHealth - random() * .17 + .035);
    world.coffeeHealth = clamp(world.coffeeHealth - random() * .08 + .025);
    if (random() < .006) world.printerHealth = clamp(world.printerHealth - 14);
    if (random() < .004) world.networkHealth = clamp(world.networkHealth - 16);
    if (random() < .003) world.coffeeHealth = clamp(world.coffeeHealth - 18);
  }

  function selectTarget(actor, purpose) {
    const candidates = names.filter(function (name) { return name !== actor && state.people[name].present; });
    if (!candidates.length) return '';
    if (purpose === 'help') {
      return candidates.sort(function (first, second) { return state.people[second].workload - state.people[first].workload; })[0];
    }
    if (purpose === 'talk') {
      return candidates.sort(function (first, second) {
        const a = relationship(actor, first);
        const b = relationship(actor, second);
        return (b.tension + (100 - b.affinity) * .25) - (a.tension + (100 - a.affinity) * .25);
      })[0];
    }
    return candidates[Math.floor(random() * candidates.length)];
  }

  function scheduleBonus(name, type, phase) {
    let bonus = 0;
    if (phase === 'earlyMorning') {
      if (type === 'breakfast' || type === 'coffee' || type === 'talk') bonus += 34;
      if (type === 'work') bonus -= 24;
    } else if (phase === 'morning') {
      if ((name === 'AN' || name === 'HẢI') && type === 'board') bonus += 18;
      if ((name === 'NAM' || name === 'PHÚC') && type === 'server') bonus += 12;
      if (name === 'MINH' && type === 'organize') bonus += 11;
      if (type === 'work') bonus += 8;
    } else if (phase === 'lunch') {
      if (type === 'lunch') bonus += 42;
      if (type === 'nap' || type === 'rest' || type === 'coffee' || type === 'talk') bonus += 30;
      if (type === 'phone-call' || type === 'social-feed') bonus += 36;
      if (type === 'work') bonus -= 55;
    } else if (phase === 'afternoon') {
      if (type === 'work' || type === 'help') bonus += 12;
      if (name === 'LÂM' && type === 'talk') bonus += 6;
    } else if (phase === 'lateAfternoon') {
      if (type === 'board' || type === 'organize' || type === 'work') bonus += 13;
    } else if (phase === 'overtime') {
      if (type === 'organize' || type === 'server' || type === 'board') bonus += 22;
      if (type === 'coffee') bonus -= 12;
      if (type === 'overtime' || type === 'work') bonus += 26;
    }
    return bonus;
  }

  function actionCandidates(name, context) {
    const person = state.people[name];
    const profile = profiles[name];
    const world = state.world;
    const lowEnergy = 100 - person.energy;
    const lowHydration = 100 - person.hydration;
    const socialNeed = 100 - person.social;
    const candidates = [
      { type: 'work', score: 32 + person.workload * .55 + person.focus * .2 + profile.traits.careful * 16 + world.casePressure * .18 },
      { type: 'breakfast', score: context.phase === 'earlyMorning' ? 66 + (100 - person.energy) * .18 : -50 },
      { type: 'lunch', score: context.phase === 'lunch' ? 68 + (100 - person.energy) * .12 : -50 },
      { type: 'nap', score: context.phase === 'lunch' && person.lunchPlan === 'nap' ? 72 + (100 - person.energy) * .45 + person.stress * .25 : -60 },
      { type: 'phone-call', score: context.phase === 'lunch' ? 34 + person.social * .22 + profiles[name].traits.social * 22 : -55 },
      { type: 'social-feed', score: context.phase === 'lunch' ? 38 + (100 - person.social) * .24 + person.stress * .18 : -55 },
      { type: 'overtime', score: context.phase === 'overtime' ? 58 + person.workload * .5 : -60 },
      { type: 'drink', score: lowHydration * .9 + person.stress * .12 },
      { type: 'coffee', score: (lowEnergy * .64 + lowHydration * .22 + (context.phase === 'morning' || context.phase === 'afternoon' ? 12 : 0)) * (world.coffeeHealth / 100) },
      { type: 'rest', score: lowEnergy * .68 + person.stress * .56 + (context.phase === 'lunch' ? 18 : 0) },
      { type: 'talk', score: socialNeed * .62 + profile.traits.social * 24 + person.stress * .16 },
      { type: 'help', score: profile.traits.initiative * 18 + Math.max.apply(null, names.filter(function (other) { return other !== name && state.people[other].present; }).map(function (other) { return state.people[other].workload; }).concat([0])) * .36 },
      { type: 'printer', score: (100 - world.printerHealth) * (profile.skills.system || .45) + (name === 'NAM' ? 24 : 0) },
      { type: 'server', score: (100 - world.networkHealth) * (profile.skills.system || .35) + (name === 'NAM' || name === 'PHÚC' ? 18 : 0) },
      { type: 'board', score: world.queuePressure * (profile.skills.coordination || .42) + (name === 'HẢI' ? 18 : 0) },
      { type: 'organize', score: person.workload * (profile.skills.records || profile.skills.forms || .35) * .42 + (name === 'MINH' || name === 'NAM' ? 14 : 0) }
    ];
    candidates.forEach(function (item) {
      item.score += scheduleBonus(name, item.type, context.phase) + random() * 14;
      if (person.lastAction === item.type) item.score -= 14;
    });
    return candidates.sort(function (first, second) { return second.score - first.score; });
  }

  function applyAction(name, action, context) {
    const person = state.people[name];
    const type = action.type;
    const target = type === 'talk' || type === 'help' ? selectTarget(name, type) : '';
    if ((type === 'talk' || type === 'help') && !target) return;
    person.activity = type;
    person.location = type === 'work' || type === 'overtime' ? 'desk' : (type === 'breakfast' || type === 'lunch' || type === 'phone-call' || type === 'social-feed' ? 'coffee' : type);
    person.target = target;
    person.lastAction = type;
    person.actionCount += 1;
    person.busyUntil = state.tick + (type === 'work' || type === 'overtime' ? 2 : (type === 'help' || type === 'talk' || type === 'nap' || type === 'phone-call' || type === 'social-feed' ? 4 : 3));
    let event = null;

    if (type === 'work' || type === 'overtime') {
      person.focus = clamp(person.focus - .7);
      person.workload = clamp(person.workload - (3.4 + profiles[name].traits.careful * 1.8));
      person.stress = clamp(person.stress + (type === 'overtime' ? 1.4 : .8));
      if (state.tick % 7 === 0 || type === 'overtime') event = eventRecord('work', name, '', 'desk', name + (type === 'overtime' ? ' tiếp tục tăng ca' : ' xử lý một phần công việc'), 'Khối lượng của ' + name + ' giảm sau một nhịp tập trung.', type === 'overtime' ? .5 : .28, { theme: type === 'overtime' ? 'overtime' : 'work' });
    } else if (type === 'breakfast') {
      person.energy = clamp(person.energy + 14);
      person.hydration = clamp(person.hydration + 8);
      person.social = clamp(person.social + 7);
      event = eventRecord('wellbeing', name, '', 'coffee', name + ' ăn sáng tại bàn cà phê', 'Bữa sáng đầu ngày giúp ' + name + ' ổn định năng lượng trước 08:00.', .38, { theme: 'morning-routine' });
    } else if (type === 'lunch') {
      person.energy = clamp(person.energy + 20);
      person.hydration = clamp(person.hydration + 15);
      person.stress = clamp(person.stress - 7);
      event = eventRecord('wellbeing', name, '', 'coffee', name + ' nghỉ ăn trưa', 'Nhịp làm việc tạm dừng để ăn trưa và phục hồi trước ca chiều.', .42, { theme: 'lunch' });
    } else if (type === 'nap') {
      person.energy = clamp(person.energy + 30);
      person.focus = clamp(person.focus + 20);
      person.stress = clamp(person.stress - 18);
      event = eventRecord('wellbeing', name, '', 'nap', name + ' lấy ghế gấp để ngủ trưa', name + ' lấy ghế từ kho nghỉ, ngủ ngắn rồi sẽ trả ghế trước 13:00.', .54, { theme: 'lunch-rest' });
    } else if (type === 'phone-call') {
      person.social = clamp(person.social + 8);
      person.stress = clamp(person.stress - 4);
      event = eventRecord('social', name, '', 'coffee', name + ' nghe điện thoại trong giờ nghỉ', name + ' rời bàn làm việc, nghe một cuộc gọi cá nhân ngắn rồi quay lại nhịp nghỉ trưa.', .42, { theme: 'personal-break', channel: 'phone' });
    } else if (type === 'social-feed') {
      person.social = clamp(person.social + 12);
      person.stress = clamp(person.stress - 5);
      person.focus = clamp(person.focus + 3);
      event = eventRecord('wellbeing', name, '', 'coffee', name + ' lướt mạng xã hội', name + ' xem tin nhắn và cập nhật mạng xã hội trong lúc uống cà phê, không ảnh hưởng ca chiều.', .38, { theme: 'personal-break', channel: 'social-feed' });
    } else if (type === 'drink') {
      person.hydration = clamp(person.hydration + 34);
      person.focus = clamp(person.focus + 4);
      event = eventRecord('wellbeing', name, '', 'coffee', name + ' đi lấy nước', 'Một khoảng nghỉ ngắn giúp ' + name + ' quay lại công việc tỉnh táo hơn.', .36, { theme: 'wellbeing' });
    } else if (type === 'coffee') {
      person.energy = clamp(person.energy + 22);
      person.hydration = clamp(person.hydration + 10);
      person.stress = clamp(person.stress - 6);
      state.world.coffeeHealth = clamp(state.world.coffeeHealth - 1.6);
      event = eventRecord('wellbeing', name, '', 'coffee', name + ' nghỉ tại góc cà phê', 'Nhịp nghỉ ngắn làm giảm căng thẳng nhưng tạm rời bàn làm việc.', .4, { theme: 'wellbeing' });
    } else if (type === 'rest') {
      person.energy = clamp(person.energy + 16);
      person.focus = clamp(person.focus + 13);
      person.stress = clamp(person.stress - 13);
      event = eventRecord('wellbeing', name, '', 'lounge', name + ' nghỉ mắt tại khu chờ', name + ' chủ động nghỉ trước khi mức tập trung giảm quá thấp.', .48, { theme: 'wellbeing' });
    } else if (type === 'talk') {
      const other = state.people[target];
      const casualLunchTalk = context.phase === 'lunch';
      person.social = clamp(person.social + 24);
      other.social = clamp(other.social + 13);
      person.stress = clamp(person.stress - 5);
      updateRelationship(name, target, { affinity: 1.4, trust: .5, tension: -1.1 }, casualLunchTalk ? 'Tán ngẫu trong giờ nghỉ trưa' : 'Trao đổi trực tiếp trong ngày làm việc');
      event = eventRecord('social', name, target, 'coffee', casualLunchTalk ? name + ' tán ngẫu với ' + target : name + ' trao đổi với ' + target,
        casualLunchTalk ? 'Hai người trò chuyện về chuyện thường ngày, cà phê và kế hoạch sau giờ làm để nạp lại năng lượng.' : 'Hai người chia sẻ tình hình công việc và làm rõ một điều còn chưa thống nhất.',
        .52, { theme: casualLunchTalk ? 'lunch-social' : 'relationship' });
    } else if (type === 'help') {
      const other = state.people[target];
      const amount = 5 + profiles[name].traits.initiative * 4;
      other.workload = clamp(other.workload - amount);
      person.workload = clamp(person.workload + amount * .38);
      person.stress = clamp(person.stress + 1.5);
      other.stress = clamp(other.stress - 3.5);
      updateRelationship(name, target, { affinity: 1.1, trust: 2.2, tension: -1.2 }, name + ' đã hỗ trợ khi ' + target + ' có tải cao');
      event = eventRecord('help', name, target, 'forms', name + ' hỗ trợ ' + target, 'Một phần việc được chia lại để tránh ' + target + ' trở thành điểm nghẽn.', .66, { theme: 'collaboration', workloadMoved: amount });
    } else if (type === 'printer') {
      const before = state.world.printerHealth;
      state.world.printerHealth = clamp(state.world.printerHealth + 18 + (profiles[name].skills.system || .3) * 15);
      person.workload = clamp(person.workload + 2);
      event = eventRecord('system', name, '', 'print', name + ' kiểm tra máy in', 'Tình trạng máy in tăng từ ' + Math.round(before) + ' lên ' + Math.round(state.world.printerHealth) + '.', before < 45 ? .82 : .55, { theme: 'printer', before: before, after: state.world.printerHealth });
    } else if (type === 'server') {
      const before = state.world.networkHealth;
      state.world.networkHealth = clamp(state.world.networkHealth + 15 + (profiles[name].skills.system || .4) * 17);
      person.workload = clamp(person.workload + 3);
      event = eventRecord('system', name, '', 'server', name + ' kiểm tra hệ thống', 'Kết nối nội bộ được rà soát sau khi sức khỏe hệ thống giảm còn ' + Math.round(before) + '.', before < 48 ? .84 : .58, { theme: 'network', before: before, after: state.world.networkHealth });
    } else if (type === 'board') {
      state.world.queuePressure = clamp(state.world.queuePressure - 9);
      names.forEach(function (other) { state.people[other].workload = clamp(state.people[other].workload + (random() - .55) * 2); });
      event = eventRecord('coordination', name, '', 'board', name + ' rà bảng công việc', 'Các đầu việc được sắp lại theo hạn và mức độ phụ thuộc.', .58, { theme: 'deadline' });
    } else if (type === 'organize') {
      person.focus = clamp(person.focus + 4);
      person.workload = clamp(person.workload - 4.5);
      event = eventRecord('records', name, '', 'records', name + ' sắp xếp lại hồ sơ', 'Phiên bản, ghi chú bàn giao và tài liệu đang làm được gom đúng nhóm.', .46, { theme: 'records' });
    }

    if (event) {
      detectCausalHooks(event, context);
      maybeShowAction(name, type, target, event);
    }
  }

  function maybeShowAction(name, type, target, event) {
    if (visualActionRunning || type === 'work' || type === 'overtime' || !bridge || typeof bridge.performAction !== 'function') return;
    const scheduleAction = type === 'breakfast' || type === 'lunch' || type === 'nap' || type === 'phone-call' || type === 'social-feed';
    if (state.daily.visibleActions >= 18 || (!scheduleAction && random() > .82)) return;
    visualActionRunning = true;
    state.daily.visibleActions += 1;
    Promise.resolve(bridge.performAction({ actor: name, type: type, target: target, title: event.title, detail: event.detail }))
      .catch(function () { return false; })
      .finally(function () { visualActionRunning = false; });
  }

  function hookSignature(kind, participants) {
    return kind + ':' + participants.slice().sort().join(':');
  }

  function addHook(kind, title, participants, event, score, location, signatureOverride) {
    const cleanParticipants = participants.filter(Boolean).filter(function (name, index, list) { return list.indexOf(name) === index; }).slice(0, 6);
    const signature = signatureOverride || hookSignature(kind, cleanParticipants);
    let hook = state.hooks.find(function (item) { return item.signature === signature && (item.status === 'open' || item.status === 'ready'); });
    if (!hook) {
      hook = {
        id: randomId('hook'), signature: signature, kind: kind, title: title, status: 'open', score: 0,
        participants: cleanParticipants, causes: [], location: location || 'meeting', payload: {},
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      state.hooks.push(hook);
    } else {
      hook.participants = hook.participants.concat(cleanParticipants).filter(function (name, index, list) { return list.indexOf(name) === index; }).slice(0, 6);
    }
    hook.score = Math.min(100, Number(hook.score || 0) + Number(score || 1));
    hook.causes.push({ eventId: event.id, title: event.title, detail: event.detail, createdAt: event.createdAt });
    hook.causes = hook.causes.slice(-18);
    hook.updatedAt = new Date().toISOString();
    if (hook.score >= 6) hook.status = 'ready';
    state.hooks = state.hooks.slice(-MAX_HOOKS);
    return hook;
  }

  function detectCausalHooks(event, context) {
    const actor = event.actor;
    if (actor && ['wellbeing', 'social', 'records', 'coordination'].indexOf(event.kind) !== -1) {
      addHook('office-rhythm', 'Nhịp sinh hoạt làm thay đổi cách phối hợp', [actor, event.target || selectTarget(actor, 'talk'), 'HẢI'], event, event.importance * 1.45, event.location || 'coffee', 'office-rhythm:team');
    }
    if (event.payload.theme === 'printer' || state.world.printerHealth < 42) {
      addHook('printer-pressure', 'Thiết bị in ảnh hưởng tiến độ', [actor || 'NAM', 'MINH', 'HẢI'], event, event.importance * 3.2, 'print');
    }
    if (event.payload.theme === 'network' || state.world.networkHealth < 44) {
      addHook('network-pressure', 'Kết nối nội bộ trở thành điểm nghẽn', [actor || 'NAM', 'PHÚC', 'HẢI'], event, event.importance * 3.3, 'server');
    }
    if (state.world.coffeeHealth < 38) {
      addHook('coffee-pressure', 'Góc nghỉ của văn phòng gặp trục trặc', ['HẢI', 'MINH', 'NAM'], event, 1.6, 'coffee');
    }
    if (event.kind === 'help') {
      addHook('collaboration', 'Một chuỗi hỗ trợ trong nhóm', [event.actor, event.target, 'HẢI'], event, event.importance * 2.2, 'forms');
    }
    if (event.payload.theme === 'deadline' || state.world.queuePressure > 68 || context.mode === 'waiting') {
      addHook('deadline', 'Áp lực đầu việc cần được điều phối', ['HẢI', 'LONG', 'MINH', 'LÂM', 'PHÚC'], event, event.importance * 1.8 + state.world.queuePressure / 45, 'meeting');
    }
    names.forEach(function (name) {
      const person = state.people[name];
      if (person.stress >= 72 || (person.energy <= 30 && person.workload >= 58)) {
        addHook('burnout', name + ' có dấu hiệu quá tải', [name, 'HẢI', selectTarget(name, 'help')], event, 2.4, 'coffee');
      }
    });
    Object.keys(state.relationships).forEach(function (key) {
      const relation = state.relationships[key];
      const first = state.people[relation.personA];
      const second = state.people[relation.personB];
      if (!first || !second) return;
      if (first.workload > 66 && second.workload > 66 && relation.tension > 32) {
        addHook('conflict', 'Căng thẳng giữa tốc độ và cách kiểm soát', [relation.personA, relation.personB, 'HẢI'], event, 2.6, 'meeting');
      }
    });
  }

  function localScene(hook) {
    const people = hook.participants.filter(function (name) { return profiles[name] && name !== 'AN'; });
    const coordinator = people.indexOf('HẢI') !== -1 ? 'HẢI' : (people[2] || 'HẢI');
    const speakers = people.filter(function (name) { return name !== coordinator; });
    const first = speakers[0] || people[0] || 'NAM';
    const second = speakers[1] || people.find(function (name) { return name !== first && name !== coordinator; }) || (first === 'MINH' ? 'NAM' : 'MINH');
    const cause = hook.causes.length ? hook.causes[hook.causes.length - 1].detail : 'Một chuỗi hoạt động trong văn phòng đã tạo ra điểm cần phối hợp.';
    const scene = {
      key: 'emergent:' + hook.id, title: hook.title, spot: hook.location || 'meeting', effects: {}, choices: [],
      narrative: { kind: 'emergent', emergentId: hook.id, hookKind: hook.kind, sourceEventIds: hook.causes.map(function (item) { return item.eventId; }) },
      lines: []
    };
    if (hook.kind === 'printer-pressure') {
      scene.lines = [
        { person: 'NAM', text: 'Máy in vừa có dấu hiệu không ổn định. Tôi đã kiểm tra hàng đợi và tình trạng thiết bị.' },
        { person: 'MINH', text: 'Phần biểu mẫu cần in đang bị chậm, tôi sẽ tiếp tục hoàn thiện bản điện tử trong lúc chờ.' },
        { person: coordinator, text: 'Ưu tiên phần sát hạn và giữ đúng phiên bản trước khi chuyển sang máy dự phòng.' }
      ];
      scene.effects = { metrics: { systemHealth: -2, workload: 2 } };
      scene.choices = [
        { id: 'repair-first', label: 'Dừng ngắn để xử lý máy chính', effects: { metrics: { systemHealth: 6, efficiency: -2 } }, followup: 'Nhóm xử lý nguyên nhân trước khi tiếp tục hàng đợi in.' },
        { id: 'reroute-jobs', label: 'Chuyển việc gấp sang máy dự phòng', effects: { metrics: { efficiency: 3, workload: 2, systemHealth: -1 } }, followup: 'Tài liệu sát hạn được chuyển sang thiết bị dự phòng.' }
      ];
    } else if (hook.kind === 'network-pressure') {
      scene.lines = [
        { person: 'NAM', text: 'Kết nối nội bộ đang giảm ổn định, tôi đã tạm dừng các lượt đồng bộ lớn.' },
        { person: 'PHÚC', text: 'Không ghi đè tệp trong lúc đường truyền chập chờn. Mọi bản local phải có danh sách chờ đồng bộ.' },
        { person: coordinator, text: 'Nhóm chuyển sang phần có thể làm ngoại tuyến và giữ nhật ký đầy đủ.' }
      ];
      scene.effects = { metrics: { systemHealth: -3, efficiency: -1 } };
    } else if (hook.kind === 'coffee-pressure') {
      scene.lines = [
        { person: 'MINH', text: 'Góc cà phê đang trục trặc đúng lúc mọi người bắt đầu xuống năng lượng.' },
        { person: 'NAM', text: 'Tôi kiểm tra nguồn và ghi lại tình trạng thiết bị, phần sửa chữa sẽ chuyển đúng đầu mối.' },
        { person: coordinator, text: 'Cả nhóm đổi sang nghỉ ngắn và lấy nước, không để một tiện ích nhỏ làm gián đoạn công việc.' }
      ];
      scene.effects = { metrics: { morale: -1, efficiency: -1 } };
    } else if (hook.kind === 'burnout') {
      scene.lines = [
        { person: first, text: 'Tôi đang đổi giữa quá nhiều đầu việc và mức tập trung bắt đầu giảm.' },
        { person: second, text: 'Tôi có thể nhận một phần việc rõ phạm vi để giảm số lần chuyển ngữ cảnh.' },
        { person: coordinator, text: 'Ta khóa ba ưu tiên chính và dời phần không cấp thiết, không để quá tải kéo thành lỗi hồ sơ.' }
      ];
      scene.effects = { metrics: { morale: -2, workload: 3, quality: -1 } };
      scene.choices = [
        { id: 'redistribute-life', label: 'Chia lại việc trong nhóm', effects: { metrics: { morale: 5, workload: -5, quality: 2 }, relations: { 'TEAM:TEAM': 2 } }, followup: 'Đầu việc được chia lại theo năng lực và tải hiện tại.' },
        { id: 'protect-priority', label: 'Chỉ giữ các việc ưu tiên', effects: { metrics: { workload: -7, efficiency: 1, quality: 2 } }, followup: 'Các việc ít cấp thiết được chuyển sang nhịp sau.' }
      ];
    } else if (hook.kind === 'conflict') {
      scene.lines = [
        { person: first, text: 'Tôi cần biết rõ điều kiện tối thiểu để không phải dừng và bổ sung nhiều vòng.' },
        { person: second, text: 'Tôi cần căn cứ được đưa thẳng vào hồ sơ, không chỉ trao đổi miệng khi sát hạn.' },
        { person: coordinator, text: 'Hai bên thống nhất đầu vào, cách phản hồi và thời điểm báo điểm nghẽn ngay trong hôm nay.' }
      ];
      scene.effects = { metrics: { morale: -3 }, relations: (function () { const value = {}; value[pairKey(first, second)] = -3; return value; }()) };
      scene.choices = [
        { id: 'shared-protocol', label: 'Lập quy ước phối hợp chung', effects: { metrics: { quality: 3, morale: 4, workload: 1 } }, followup: 'Hai bên có một quy ước chung về đầu vào và phản hồi.' },
        { id: 'separate-flow', label: 'Tạm tách luồng công việc', effects: { metrics: { efficiency: 2, morale: 1 } }, followup: 'Áp lực trực tiếp giảm nhưng nguyên nhân quan hệ vẫn cần theo dõi.' }
      ];
    } else if (hook.kind === 'collaboration') {
      scene.lines = [
        { person: first, text: 'Tôi đã nhận một phần việc để đầu mối còn lại không bị nghẽn.' },
        { person: second, text: 'Nhờ vậy tôi có thể tập trung khóa phần cần độ chính xác cao trước.' },
        { person: coordinator, text: 'Cách chia việc này được ghi lại để lần sau nhóm phản ứng sớm hơn.' }
      ];
      scene.effects = { metrics: { morale: 4, efficiency: 2, workload: -2 } };
    } else if (hook.kind === 'office-rhythm') {
      scene.lines = [
        { person: first, text: 'Mấy nhịp gần đây cho thấy cách chúng ta nghỉ, trao đổi và bàn giao đang ảnh hưởng trực tiếp đến tiến độ.' },
        { person: second, text: 'Tôi đã nhận ra phần nào nên báo sớm thay vì chờ đến lúc thành điểm nghẽn.' },
        { person: coordinator, text: 'Ta giữ các thói quen đang giúp nhóm phối hợp tốt và điều chỉnh điểm gây gián đoạn.' }
      ];
      scene.effects = { metrics: { morale: 2, efficiency: 1, workload: -1 } };
    } else {
      scene.lines = [
        { person: first, text: 'Khối lượng hiện tại đang tạo ra một điểm nghẽn cần phối hợp.' },
        { person: second, text: 'Tôi đã tách phần có thể làm ngay khỏi phần phải chờ xác nhận.' },
        { person: coordinator, text: 'Nhóm chốt người phụ trách, hạn phản hồi và dấu vết cần lưu.' }
      ];
      scene.effects = { metrics: { efficiency: 2, workload: -1 } };
    }
    scene.summary = cause;
    return scene;
  }

  async function aiScene(hook, fallback) {
    const context = bridge.getContext();
    if (!context.aiEnabled) return fallback;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(function () { controller.abort(); }, 30000) : null;
    try {
      const response = await fetch('/api/office-life/dialogue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          hook: hook,
          relationships: hook.participants.map(function (first) { return hook.participants.map(function (second) { return first !== second ? relationship(first, second) : null; }).filter(Boolean); }).flat().slice(0, 12),
          people: hook.participants.reduce(function (result, name) { if (state.people[name]) result[name] = state.people[name]; return result; }, {}),
          office: { phase: context.phase, mode: context.mode, metrics: context.metrics, world: state.world }
        })
      });
      if (!response.ok) return fallback;
      const data = await response.json();
      if (!data.scene || !Array.isArray(data.scene.lines)) return fallback;
      const allowed = hook.participants.filter(function (name) { return profiles[name] && name !== 'AN'; });
      const lines = data.scene.lines.filter(function (line) { return line && allowed.indexOf(line.person) !== -1 && line.text; }).slice(0, 18);
      if (lines.length < 2) return fallback;
      fallback.title = String(data.scene.title || fallback.title).slice(0, 140);
      fallback.summary = String(data.scene.summary || fallback.summary).slice(0, 500);
      fallback.lines = lines.map(function (line) { return { person: line.person, text: String(line.text).slice(0, 360) }; });
      fallback.narrative.aiGenerated = true;
      return fallback;
    } catch (error) {
      return fallback;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function generateReadyStory() {
    if (storyGenerationRunning || state.daily.generatedStories >= 3 || !names.some(function (name) { return state.people[name].present; })) return;
    const hook = state.hooks.filter(function (item) { return item.status === 'ready'; }).sort(function (a, b) { return b.score - a.score; })[0];
    if (!hook) return;
    storyGenerationRunning = true;
    hook.status = 'composing';
    try {
      let scene = localScene(hook);
      scene = await aiScene(hook, scene);
      const accepted = bridge.enqueueStory(scene);
      if (!accepted) { hook.status = 'ready'; return; }
      hook.status = 'staged';
      hook.updatedAt = new Date().toISOString();
      state.daily.generatedStories += 1;
      const eventIds = hook.causes.map(function (cause) { return cause.eventId; });
      hook.participants.filter(function (name) { return profiles[name]; }).forEach(function (name) {
        const relationEmotion = hook.kind === 'conflict' ? 'căng thẳng' : (hook.kind === 'collaboration' ? 'được hỗ trợ' : 'quan tâm');
        memoryRecord(name, 'episodic', 'Tham gia câu chuyện “' + scene.title + '” do ' + hook.causes.length + ' sự kiện liên tiếp tạo ra.', relationEmotion, Math.min(.95, .55 + hook.score / 30), eventIds, { theme: hook.kind, hookId: hook.id });
      });
      eventRecord('story', hook.participants[0] || '', '', hook.location, 'Câu chuyện phát sinh: ' + scene.title, scene.summary || 'Narrative Director đã nâng một chuỗi sự kiện thành câu chuyện.', .86, { theme: hook.kind, hookId: hook.id, aiGenerated: Boolean(scene.narrative.aiGenerated) });
    } finally {
      storyGenerationRunning = false;
    }
  }

  function resetFinishedActions() {
    names.forEach(function (name) {
      const person = state.people[name];
      if (!person.present) return;
      if (person.busyUntil <= state.tick && person.activity !== 'work') {
        person.activity = person.attendanceStatus === 'overtime' ? 'overtime' : (person.attendanceStatus === 'breakfast' ? 'breakfast' : (person.attendanceStatus.indexOf('lunch') !== -1 || person.attendanceStatus.indexOf('break') !== -1 || person.attendanceStatus === 'nap' ? 'rest' : 'work'));
        person.location = person.activity === 'work' || person.activity === 'overtime' ? 'desk' : (person.activity === 'breakfast' ? 'coffee' : 'lounge');
        person.target = '';
      }
    });
  }

  function render() {
    const status = document.getElementById('lifeStatus');
    const peopleRoot = document.getElementById('lifePeople');
    const relationsRoot = document.getElementById('lifeRelationships');
    const memoriesRoot = document.getElementById('lifeMemories');
    const hooksRoot = document.getElementById('lifeHooks');
    if (!status || !peopleRoot || !relationsRoot || !memoriesRoot || !hooksRoot) return;
    const presentCount = names.filter(function (name) { return state.people[name].present; }).length;
    const phaseLabels = { closed: 'VĂN PHÒNG ĐÃ ĐÓNG CỬA', earlyMorning: '07:00-08:00 · VÀO CA & ĂN SÁNG', morning: '08:00-11:00 · CA SÁNG', lunch: '11:00-13:00 · NGHỈ TRƯA', afternoon: '13:00-17:00 · CA CHIỀU', lateAfternoon: '17:00-18:00 · BÀN GIAO', overtime: '18:00-21:00 · TĂNG CA' };
    status.textContent = (phaseLabels[state.daily.phase] || 'MÔ PHỎNG ĐANG CHẠY') + ' · ' + presentCount + '/' + names.length + ' CÓ MẶT' + (storyGenerationRunning ? ' · ĐANG KẾT CẤU CÂU CHUYỆN' : '');
    peopleRoot.innerHTML = names.map(function (name) {
      const person = state.people[name];
      const pressure = Math.max(person.stress, person.workload, 100 - person.energy);
      return '<article class="life-person"><div class="life-person-head"><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(person.mood) + '</span></div>' +
        '<p>' + escapeHtml(actionLabels[person.activity] || person.activity) + (person.target ? ' · ' + escapeHtml(person.target) : '') + '</p>' +
        '<div class="life-mini-meter"><i style="width:' + clamp(pressure) + '%"></i></div><small>TẢI ' + Math.round(person.workload) + ' · STRESS ' + Math.round(person.stress) + ' · NL ' + Math.round(person.energy) + '</small></article>';
    }).join('');
    const relationItems = Object.keys(state.relationships).map(function (key) { return state.relationships[key]; }).sort(function (a, b) { return b.tension - a.tension || b.trust - a.trust; }).slice(0, 8);
    relationsRoot.innerHTML = relationItems.map(function (item) {
      return '<article class="life-list-item"><div><strong>' + escapeHtml(item.personA + ' · ' + item.personB) + '</strong><span>TIN ' + Math.round(item.trust) + ' · CĂNG ' + Math.round(item.tension) + '</span></div><p>' + escapeHtml(item.lastReason || 'Quan hệ làm việc ổn định') + '</p></article>';
    }).join('');
    const memoryItems = state.memories.slice().sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); }).slice(0, 10);
    memoriesRoot.innerHTML = memoryItems.length ? memoryItems.map(function (memory) {
      return '<article class="life-list-item"><div><strong>' + escapeHtml(memory.person + ' · ' + memory.kind) + '</strong><span>' + Math.round(memory.importance * 100) + '%</span></div><p>' + escapeHtml(memory.summary) + '</p></article>';
    }).join('') : '<div class="narrative-empty">Ký ức sẽ hình thành từ các hoạt động có ý nghĩa.</div>';
    const hookItems = state.hooks.filter(function (hook) { return hook.status !== 'resolved' && hook.status !== 'archived'; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
    hooksRoot.innerHTML = hookItems.length ? hookItems.map(function (hook) {
      return '<article class="life-list-item"><div><strong>' + escapeHtml(hook.title) + '</strong><span>' + escapeHtml(hook.status.toUpperCase()) + ' · ' + Math.round(hook.score) + '</span></div><p>' + escapeHtml(hook.participants.join(', ')) + ' · ' + hook.causes.length + ' nguyên nhân</p></article>';
    }).join('') : '<div class="narrative-empty">Chưa có chuỗi nguyên nhân đủ mạnh để thành câu chuyện.</div>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  async function syncServer() {
    if (destroyed) return;
    if (bridge && typeof bridge.getPersistenceState === 'function') state.officeSession = bridge.getPersistenceState();
    saveLocalState();
    const payload = {
      state: state, events: state.events.slice(-160), memories: state.memories.slice(-220),
      relationships: Object.keys(state.relationships).map(function (key) { return state.relationships[key]; }),
      hooks: state.hooks.slice(-80)
    };
    try {
      await fetch('/api/office-life/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) { }
  }

  function syncOnPageHide() {
    if (destroyed || !state) return;
    if (bridge && typeof bridge.getPersistenceState === 'function') state.officeSession = bridge.getPersistenceState();
    saveLocalState();
    const payload = JSON.stringify({
      state: state, events: state.events.slice(-160), memories: state.memories.slice(-220),
      relationships: Object.keys(state.relationships).map(function (key) { return state.relationships[key]; }),
      hooks: state.hooks.slice(-80)
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/office-life/sync', new Blob([payload], { type: 'application/json' }));
      else fetch('/api/office-life/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
    } catch (error) { }
  }

  function resumePersistedVisualAction(attempt) {
    if (destroyed || visualActionRunning || !bridge || typeof bridge.performAction !== 'function') return;
    const resumable = ['breakfast', 'lunch', 'nap', 'phone-call', 'social-feed', 'drink', 'coffee', 'rest', 'talk', 'help', 'printer', 'server', 'board', 'organize'];
    const candidate = names.map(function (name) { return state.people[name]; }).filter(function (person) {
      return person.present && person.busyUntil > state.tick && resumable.indexOf(person.activity) !== -1;
    }).sort(function (first, second) { return second.busyUntil - first.busyUntil; })[0];
    if (!candidate) return;
    visualActionRunning = true;
    Promise.resolve(bridge.performAction({
      actor: candidate.name, type: candidate.activity, target: candidate.target || '',
      title: actionLabels[candidate.activity] || candidate.activity, detail: 'Tiếp tục hoạt động đang diễn ra trước khi tải lại trang.'
    })).then(function (restored) {
      if (!restored && (attempt || 0) < 4) window.setTimeout(function () { resumePersistedVisualAction((attempt || 0) + 1); }, 700);
    }).catch(function () { }).finally(function () { visualActionRunning = false; });
  }

  async function hydrateServer() {
    try {
      const response = await fetch('/api/office-life', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.state && String(data.updatedAt || '') > String(state.updatedAt || '')) {
        const localOfficeSession = state.officeSession;
        state = normalizeState(data.state);
        if (!state.officeSession && localOfficeSession) state.officeSession = localOfficeSession;
        if (!state.events.length && Array.isArray(data.events)) state.events = data.events.slice().reverse().slice(-MAX_EVENTS);
        if (!state.memories.length && Array.isArray(data.memories)) state.memories = data.memories.slice().reverse().slice(-MAX_MEMORIES);
        if (!state.hooks.length && Array.isArray(data.hooks)) state.hooks = data.hooks.slice().reverse().slice(-MAX_HOOKS);
      }
      else {
        if (Array.isArray(data.events) && data.events.length > state.events.length) state.events = data.events.slice().reverse().slice(-MAX_EVENTS);
        if (Array.isArray(data.memories) && data.memories.length > state.memories.length) state.memories = data.memories.slice().reverse().slice(-MAX_MEMORIES);
      }
      if (state.officeSession && bridge && typeof bridge.restorePersistenceState === 'function') bridge.restorePersistenceState(state.officeSession);
    } catch (error) { }
  }

  async function tick() {
    if (destroyed || document.hidden) return;
    syncDay();
    const context = bridge.getContext();
    const attendance = synchronizeAttendance(context, false);
    const runtimeContext = Object.assign({}, context, { phase: attendance.phase, officeOpen: attendance.officeOpen, minute: attendance.minute });
    state.tick += 1;
    if (attendance.officeOpen) updateWorld(runtimeContext);
    updateNeeds(runtimeContext);
    resetFinishedActions();
    const presentNames = names.filter(function (name) { return state.people[name].present; });
    if (presentNames.length) {
      const actor = presentNames[state.tick % presentNames.length];
      const person = state.people[actor];
      if (person.busyUntil <= state.tick) applyAction(actor, actionCandidates(actor, runtimeContext)[0], runtimeContext);
      await generateReadyStory();
    }
    render();
    saveLocalState();
    window.dispatchEvent(new CustomEvent('office-life-updated', { detail: { tick: state.tick, hooks: state.hooks.length, memories: state.memories.length } }));
  }

  async function boot() {
    bridge = window.OfficeLifeBridge;
    if (!bridge || typeof bridge.getContext !== 'function') {
      window.setTimeout(boot, 350);
      return;
    }
    state = loadLocalState();
    await hydrateServer();
    // Khôi phục ngay cả khi máy chủ tạm thời không truy cập được; localStorage
    // vẫn chứa snapshot hình ảnh của phiên trước.
    if (state.officeSession && bridge && typeof bridge.restorePersistenceState === 'function') bridge.restorePersistenceState(state.officeSession);
    syncDay();
    reconcileStoryHooks();
    const initialContext = bridge.getContext();
    synchronizeAttendance(initialContext, true);
    window.setTimeout(function () { resumePersistedVisualAction(0); }, 900);
    render();
    saveLocalState();
    tickTimer = window.setInterval(function () { tick(); }, TICK_MS);
    syncTimer = window.setInterval(syncServer, SYNC_MS);
    window.addEventListener('pagehide', syncOnPageHide);
    window.addEventListener('beforeunload', syncOnPageHide);
    window.addEventListener('office-emergent-story-complete', function (event) {
      const detail = event.detail || {};
      const hook = state.hooks.find(function (item) { return item.id === detail.id; });
      if (!hook) return;
      hook.status = detail.choicePending ? 'waiting-choice' : 'resolved';
      hook.updatedAt = new Date().toISOString();
      saveLocalState(); render();
    });
    window.addEventListener('office-emergent-choice-resolved', function (event) {
      const detail = event.detail || {};
      const hook = state.hooks.find(function (item) { return item.id === detail.id; });
      if (!hook) return;
      hook.status = 'resolved';
      hook.updatedAt = new Date().toISOString();
      const participants = hook.participants.filter(function (name) { return state.people[name]; });
      if (participants.length >= 2) updateRelationship(participants[0], participants[1], { trust: 1.4, tension: -1.2 }, 'Đã cùng thực hiện quyết định “' + String(detail.label || detail.choiceId || '') + '”');
      participants.forEach(function (name) {
        memoryRecord(name, 'decision', 'Quyết định “' + String(detail.label || detail.choiceId || '') + '” đã khép lại câu chuyện “' + hook.title + '”.', 'đã thống nhất', .78, hook.causes.map(function (cause) { return cause.eventId; }), { theme: hook.kind, hookId: hook.id });
      });
      saveLocalState(); render(); syncServer();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) syncServer();
      else { render(); tick(); }
    });
    window.OfficeLifeSimulator = {
      getState: function () { return JSON.parse(JSON.stringify(state)); },
      forceTick: tick,
      forceStory: function () {
        const event = eventRecord('test', 'HẢI', 'MINH', 'meeting', 'Một chuỗi công việc cần điều phối', 'Nhiều đầu việc cùng tăng tải và cần một cuộc trao đổi.', .82, { theme: 'deadline' });
        const hook = addHook('deadline', 'Áp lực đầu việc cần được điều phối', ['HẢI', 'LONG', 'MINH', 'LÂM', 'PHÚC'], event, 8, 'meeting');
        hook.status = 'ready';
        return generateReadyStory();
      },
      syncNow: syncServer,
      destroy: function () {
        destroyed = true;
        clearInterval(tickTimer); clearInterval(syncTimer); syncServer();
      }
    };
  }

  boot();
}());
