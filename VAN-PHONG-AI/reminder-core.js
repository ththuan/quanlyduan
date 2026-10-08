(function () {
  'use strict';

  const panel = document.getElementById('officeReminderPanel');
  if (!panel) return;

  const form = document.getElementById('reminderForm');
  const ids = {
    id: 'reminderId', title: 'reminderTitle', date: 'reminderDate', time: 'reminderTime', lead: 'reminderLead',
    recurrence: 'reminderRecurrence', priority: 'reminderPriority', character: 'reminderCharacter', details: 'reminderDetails'
  };
  const status = document.getElementById('reminderStatus');
  const list = document.getElementById('reminderList');
  const saveButton = document.getElementById('reminderSaveBtn');
  const toast = document.getElementById('officeReminderToast');
  const toastTitle = document.getElementById('officeReminderToastTitle');
  const toastBody = document.getElementById('officeReminderToastBody');
  const doneButton = document.getElementById('officeReminderDoneBtn');
  const snoozeButton = document.getElementById('officeReminderSnoozeBtn');
  const notificationButton = document.getElementById('reminderNotificationBtn');
  let reminders = [];
  let pendingNotifications = [];
  let activeNotification = null;
  let refreshTimer = 0;

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function api(path, options) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }, options || {}))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || 'Không kết nối được lõi lịch nhắc');
          return body;
        });
      });
  }
  function localDateValue(date) {
    const value = date || new Date();
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  function localTimeValue(date) {
    const value = date || new Date(Date.now() + 3600000);
    return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
  }
  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Chưa có thời điểm';
    return date.toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function recurrenceLabel(value) {
    return { none: 'một lần', daily: 'hàng ngày', weekdays: 'ngày làm việc', weekly: 'hàng tuần', monthly: 'hàng tháng' }[value] || value;
  }
  function statusLabel(value) {
    return { active: 'đang chờ', notified: 'đã báo', completed: 'đã xong', cancelled: 'đã hủy' }[value] || value;
  }
  function resetForm() {
    form.reset();
    byId(ids.id).value = '';
    byId(ids.date).value = localDateValue();
    byId(ids.time).value = localTimeValue();
    byId(ids.lead).value = '10';
    byId(ids.recurrence).value = 'none';
    byId(ids.priority).value = 'normal';
    byId(ids.character).value = 'AN';
    saveButton.textContent = 'Lưu lịch nhắc';
  }
  function editReminder(reminder) {
    const due = new Date(reminder.dueAt);
    byId(ids.id).value = reminder.id;
    byId(ids.title).value = reminder.title || '';
    byId(ids.date).value = localDateValue(due);
    byId(ids.time).value = localTimeValue(due);
    byId(ids.lead).value = String(reminder.leadMinutes || 0);
    byId(ids.recurrence).value = reminder.recurrence || 'none';
    byId(ids.priority).value = reminder.priority || 'normal';
    byId(ids.character).value = reminder.character || 'AN';
    byId(ids.details).value = reminder.details || '';
    saveButton.textContent = 'Cập nhật lịch nhắc';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function render() {
    const visible = reminders.filter(function (item) { return item.status !== 'cancelled'; });
    status.textContent = visible.length + ' lịch · ' + pendingNotifications.length + ' thông báo chờ';
    if (!visible.length) {
      list.innerHTML = '<div class="reminder-empty">Chưa có lịch nhắc. Tạo lịch đầu tiên ở khung phía trên.</div>';
      return;
    }
    list.innerHTML = visible.map(function (item) {
      const complete = item.status === 'completed';
      const recurrence = recurrenceLabel(item.recurrence);
      const actions = complete
        ? '<button type="button" class="secondary" data-reminder-action="activate" data-reminder-id="' + escapeHtml(item.id) + '">Mở lại</button><button type="button" class="secondary" data-reminder-action="edit" data-reminder-id="' + escapeHtml(item.id) + '">Sửa</button>'
        : '<button type="button" data-reminder-action="complete" data-reminder-id="' + escapeHtml(item.id) + '">Đã xong</button><button type="button" class="secondary" data-reminder-action="edit" data-reminder-id="' + escapeHtml(item.id) + '">Sửa</button><button type="button" class="danger" data-reminder-action="cancel" data-reminder-id="' + escapeHtml(item.id) + '">Hủy</button>';
      return '<article class="reminder-item' + (complete ? ' is-complete' : '') + '" data-priority="' + escapeHtml(item.priority) + '">' +
        '<div class="reminder-item-head"><strong>' + escapeHtml(item.title) + '</strong><span class="reminder-item-time">' + escapeHtml(formatDateTime(item.dueAt)) + '</span></div>' +
        (item.details ? '<p>' + escapeHtml(item.details) + '</p>' : '') +
        '<div class="reminder-item-meta">' + escapeHtml(statusLabel(item.status)) + ' · ' + escapeHtml(recurrence) + ' · ' + escapeHtml(item.character || 'AN') + ' sẽ nhắc</div>' +
        '<div class="reminder-item-actions">' + actions + '</div></article>';
    }).join('');
  }
  function loadReminders() {
    return api('/api/reminders?status=all').then(function (result) {
      reminders = Array.isArray(result.reminders) ? result.reminders : [];
      pendingNotifications = Array.isArray(result.notifications) ? result.notifications : [];
      if (activeNotification && !pendingNotifications.some(function (item) { return String(item.id) === String(activeNotification.id); })) {
        activeNotification = null;
        toast.classList.remove('open');
        toast.setAttribute('aria-hidden', 'true');
      }
      render();
      consumeNotifications();
    }).catch(function (error) {
      status.textContent = error.message;
    });
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(loadReminders, 160);
  }
  function showToast(delivery) {
    activeNotification = delivery;
    toastTitle.textContent = 'NHẮC VIỆC · ' + (delivery.character || 'AN');
    toastBody.textContent = delivery.title + (delivery.body ? ' · ' + delivery.body : '');
    toast.classList.add('open');
    toast.setAttribute('aria-hidden', 'false');
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification(delivery.title, { body: delivery.body || 'Đã đến thời điểm cần nhắc.' }); } catch (error) { }
    }
    window.dispatchEvent(new CustomEvent('office-reminder-fired', { detail: delivery }));
  }
  function consumeNotifications() {
    if (!pendingNotifications.length || activeNotification) return;
    showToast(pendingNotifications[0]);
  }
  function finishNotification(action, minutes) {
    if (!activeNotification) return;
    const delivery = activeNotification;
    const endpoint = '/api/reminders/notifications/' + encodeURIComponent(delivery.id) + '/' + action;
    api(endpoint, { method: 'POST', body: JSON.stringify(action === 'snooze' ? { minutes: minutes || 10 } : {}) })
      .then(function () {
        activeNotification = null;
        toast.classList.remove('open');
        toast.setAttribute('aria-hidden', 'true');
        loadReminders();
      }).catch(function (error) { toastBody.textContent = error.message; });
  }
  function reminderInput() {
    const date = byId(ids.date).value;
    const time = byId(ids.time).value;
    const local = new Date(date + 'T' + time);
    if (!date || !time || Number.isNaN(local.getTime())) throw new Error('Hãy chọn ngày và giờ hợp lệ');
    return {
      title: byId(ids.title).value.trim(), details: byId(ids.details).value.trim(), dueAt: local.toISOString(),
      leadMinutes: Number(byId(ids.lead).value), recurrence: byId(ids.recurrence).value,
      priority: byId(ids.priority).value, character: byId(ids.character).value, timezone: 'Asia/Bangkok'
    };
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    let payload;
    try { payload = reminderInput(); } catch (error) { status.textContent = error.message; return; }
    if (payload.title.length < 2) { status.textContent = 'Hãy nhập nội dung cần nhắc.'; return; }
    const id = byId(ids.id).value;
    const request = id ? api('/api/reminders/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) })
      : api('/api/reminders', { method: 'POST', body: JSON.stringify(payload) });
    request.then(function () { resetForm(); loadReminders(); }).catch(function (error) { status.textContent = error.message; });
  });
  document.getElementById('reminderResetBtn').addEventListener('click', resetForm);
  list.addEventListener('click', function (event) {
    const button = event.target.closest('[data-reminder-action]');
    if (!button) return;
    const id = button.dataset.reminderId;
    const action = button.dataset.reminderAction;
    const reminder = reminders.find(function (item) { return item.id === id; });
    if (action === 'edit' && reminder) { editReminder(reminder); return; }
    if (action === 'cancel' && !window.confirm('Hủy lịch nhắc này?')) return;
    const endpoint = action === 'cancel' ? '/api/reminders/' + encodeURIComponent(id) : '/api/reminders/' + encodeURIComponent(id) + '/' + action;
    api(endpoint, { method: action === 'cancel' ? 'DELETE' : 'POST', body: '{}' }).then(loadReminders).catch(function (error) { status.textContent = error.message; });
  });
  notificationButton.addEventListener('click', function () {
    if (!window.Notification) { notificationButton.textContent = 'Chỉ thông báo trong game'; return; }
    Notification.requestPermission().then(function (permission) {
      notificationButton.textContent = permission === 'granted' ? 'Đã bật thông báo' : 'Thông báo đang tắt';
    });
  });
  doneButton.addEventListener('click', function () { finishNotification('acknowledge'); });
  snoozeButton.addEventListener('click', function () { finishNotification('snooze', 10); });
  window.addEventListener('office-reminders-refresh', loadReminders);
  window.setInterval(loadReminders, 8000);
  resetForm();
  loadReminders();
}());
