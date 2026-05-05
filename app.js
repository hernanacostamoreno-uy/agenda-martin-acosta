const STORAGE_KEY = "martin-acosta-agenda-v2";
const LEGACY_STORAGE_KEY = "agenda-notarial-v1";

const services = [
  { id: "compraventa", title: "Compraventa", detail: "Escrituras, boletos, senas y documentacion", icon: "CV" },
  { id: "certificacion", title: "Certificacion de firmas", detail: "Firma presencial con documento vigente", icon: "CF" },
  { id: "poder", title: "Poder notarial", detail: "General, especial o para uso en el exterior", icon: "PN" },
  { id: "sociedades", title: "Sociedades", detail: "Constituciones, actas y certificaciones", icon: "SA" },
  { id: "sucesiones", title: "Sucesiones", detail: "Consulta, inicio o seguimiento", icon: "SX" },
  { id: "consulta", title: "Consulta notarial", detail: "Asesoramiento con Martin Acosta", icon: "CO" },
];

const cashCategories = {
  income: ["Honorarios", "Firma", "Certificacion", "Escritura", "Consulta", "Anticipo", "Otro ingreso"],
  expense: ["Tasas y timbres", "Alquiler", "Servicios", "Insumos", "Traslados", "Honorarios externos", "Impuestos", "Otro gasto"],
};

const defaultSettings = {
  startHour: "09:00",
  endHour: "17:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  weekdays: [1, 2, 3, 4, 5],
  blocked: [],
};

let state = {
  settings: { ...defaultSettings },
  appointments: [],
  reminders: [],
  cashTransactions: [],
  monthlyClosures: [],
  meta: {},
};
let selectedService = services[0].id;
let selectedSlot = "";
let selectedAgendaDate = "";
let formDirty = false;
let isSaving = false;
const notifiedThisSession = new Set();

const elements = {
  navTabs: document.querySelectorAll(".nav-tab"),
  views: document.querySelectorAll(".view"),
  viewTitle: document.getElementById("viewTitle"),
  todayLabel: document.getElementById("todayLabel"),
  todayCount: document.getElementById("todayCount"),
  pendingStat: document.getElementById("pendingStat"),
  weekStat: document.getElementById("weekStat"),
  totalStat: document.getElementById("totalStat"),
  serviceGrid: document.getElementById("serviceGrid"),
  slotGrid: document.getElementById("slotGrid"),
  bookingForm: document.getElementById("bookingForm"),
  bookingDate: document.getElementById("bookingDate"),
  duration: document.getElementById("duration"),
  clientName: document.getElementById("clientName"),
  clientPhone: document.getElementById("clientPhone"),
  clientEmail: document.getElementById("clientEmail"),
  clientDocument: document.getElementById("clientDocument"),
  notes: document.getElementById("notes"),
  formMessage: document.getElementById("formMessage"),
  agendaDate: document.getElementById("agendaDate"),
  weekLabel: document.getElementById("weekLabel"),
  weekCalendar: document.getElementById("weekCalendar"),
  selectedDayTitle: document.getElementById("selectedDayTitle"),
  statusFilter: document.getElementById("statusFilter"),
  agendaSearch: document.getElementById("agendaSearch"),
  previousWeek: document.getElementById("previousWeek"),
  currentWeek: document.getElementById("currentWeek"),
  nextWeek: document.getElementById("nextWeek"),
  agendaList: document.getElementById("agendaList"),
  exportCsv: document.getElementById("exportCsv"),
  enableNotifications: document.getElementById("enableNotifications"),
  reminderForm: document.getElementById("reminderForm"),
  reminderTitle: document.getElementById("reminderTitle"),
  reminderDueAt: document.getElementById("reminderDueAt"),
  reminderMessage: document.getElementById("reminderMessage"),
  createReminder: document.getElementById("createReminder"),
  reminderList: document.getElementById("reminderList"),
  clearForm: document.getElementById("clearForm"),
  createAppointment: document.getElementById("createAppointment"),
  agentSidebarTitle: document.getElementById("agentSidebarTitle"),
  agentSidebarText: document.getElementById("agentSidebarText"),
  agentMessage: document.getElementById("agentMessage"),
  selectionSummary: document.getElementById("selectionSummary"),
  agentChecklist: document.getElementById("agentChecklist"),
  findNextSlot: document.getElementById("findNextSlot"),
  copyReminder: document.getElementById("copyReminder"),
  startHour: document.getElementById("startHour"),
  endHour: document.getElementById("endHour"),
  breakStart: document.getElementById("breakStart"),
  breakEnd: document.getElementById("breakEnd"),
  saveSettings: document.getElementById("saveSettings"),
  blockDate: document.getElementById("blockDate"),
  blockTime: document.getElementById("blockTime"),
  addBlock: document.getElementById("addBlock"),
  blockedList: document.getElementById("blockedList"),
  databaseStatus: document.getElementById("databaseStatus"),
  dataPath: document.getElementById("dataPath"),
  backupPath: document.getElementById("backupPath"),
  backupNow: document.getElementById("backupNow"),
  cashForm: document.getElementById("cashForm"),
  cashType: document.getElementById("cashType"),
  cashDate: document.getElementById("cashDate"),
  cashAmount: document.getElementById("cashAmount"),
  cashMethod: document.getElementById("cashMethod"),
  cashCategory: document.getElementById("cashCategory"),
  cashParty: document.getElementById("cashParty"),
  cashConcept: document.getElementById("cashConcept"),
  cashNotes: document.getElementById("cashNotes"),
  saveCashTransaction: document.getElementById("saveCashTransaction"),
  clearCashForm: document.getElementById("clearCashForm"),
  cashMessage: document.getElementById("cashMessage"),
  cashMonth: document.getElementById("cashMonth"),
  cashFilterType: document.getElementById("cashFilterType"),
  cashSummary: document.getElementById("cashSummary"),
  cashTransactionList: document.getElementById("cashTransactionList"),
  closeCashMonth: document.getElementById("closeCashMonth"),
  closureList: document.getElementById("closureList"),
  dashboardMonth: document.getElementById("dashboardMonth"),
  dashboardKpis: document.getElementById("dashboardKpis"),
  cashFlowChart: document.getElementById("cashFlowChart"),
  serviceChart: document.getElementById("serviceChart"),
  statusDashboard: document.getElementById("statusDashboard"),
  dashboardInsights: document.getElementById("dashboardInsights"),
};

init();

async function init() {
  const today = toDateInput(new Date());
  elements.bookingDate.min = today;
  elements.bookingDate.value = today;
  elements.agendaDate.value = today;
  selectedAgendaDate = today;
  elements.blockDate.value = today;
  elements.reminderDueAt.value = toDateTimeInput(addMinutes(new Date(), 60));
  elements.cashDate.value = today;
  elements.cashMonth.value = toMonthInput(new Date());
  elements.dashboardMonth.value = toMonthInput(new Date());
  renderCashCategories();

  bindEvents();
  renderServices();
  await loadStateFromDatabase();
  await migrateLocalStorageIfNeeded();
  elements.blockTime.value = state.settings.startHour;
  hydrateSettings();
  renderAll();
  startReminderWatcher();
}

async function loadStateFromDatabase() {
  try {
    const data = await api("/api/state");
    state = normalizeState(data);
  } catch (error) {
    state = {
      settings: { ...defaultSettings },
      appointments: [],
      reminders: [],
      cashTransactions: [],
      monthlyClosures: [],
      meta: {},
    };
    showMessage(`No pude conectar con la base: ${error.message}`, "error");
  }
}

async function migrateLocalStorageIfNeeded() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored || state.appointments.length > 0) return;

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.appointments) || parsed.appointments.length === 0) return;
    await api("/api/import", {
      method: "POST",
      body: parsed,
    });
    localStorage.setItem(`${STORAGE_KEY}-migrated`, new Date().toISOString());
    await loadStateFromDatabase();
  } catch {
    showMessage("No pude migrar los datos del navegador a la base.", "error");
  }
}

function normalizeState(data) {
  return {
    settings: { ...defaultSettings, ...(data.settings || {}) },
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    reminders: Array.isArray(data.reminders) ? data.reminders : [],
    cashTransactions: Array.isArray(data.cashTransactions) ? data.cashTransactions : [],
    monthlyClosures: Array.isArray(data.monthlyClosures) ? data.monthlyClosures : [],
    meta: data.meta || {},
  };
}

async function api(path, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("Abre la app usando iniciar-agenda.bat, no el archivo HTML directo.");
  }

  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("No hay conexion con el servidor local. Deja abierta la ventana de iniciar-agenda.bat.");
  }

  if (!response.ok) {
    const message = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = null;
    }
    if (parsed?.error) throw new Error(parsed.error);
    if (message) throw new Error(message);
    throw new Error(`Error ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function bindEvents() {
  elements.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  [elements.bookingDate, elements.duration].forEach((input) => {
    input.addEventListener("change", () => {
      formDirty = true;
      selectedSlot = "";
      renderAll();
    });
  });

  [elements.clientName, elements.clientPhone, elements.clientEmail, elements.clientDocument, elements.notes].forEach(
    (input) =>
      input.addEventListener("input", () => {
        formDirty = true;
        renderAgent();
      }),
  );
  [elements.reminderTitle, elements.reminderMessage, elements.reminderDueAt].forEach((input) => {
    input.addEventListener("input", () => {
      formDirty = true;
    });
  });
  [
    elements.cashType,
    elements.cashDate,
    elements.cashAmount,
    elements.cashMethod,
    elements.cashCategory,
    elements.cashParty,
    elements.cashConcept,
    elements.cashNotes,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      formDirty = true;
    });
    input.addEventListener("change", () => {
      formDirty = true;
    });
  });
  elements.cashType.addEventListener("change", renderCashCategories);
  [elements.startHour, elements.endHour, elements.breakStart, elements.breakEnd].forEach((input) => {
    input.addEventListener("change", () => {
      formDirty = true;
    });
  });
  document.querySelectorAll(".weekdays input").forEach((input) => {
    input.addEventListener("change", () => {
      formDirty = true;
    });
  });

  elements.bookingForm.addEventListener("submit", submitBooking);
  elements.agendaDate.addEventListener("change", () => {
    selectedAgendaDate = elements.agendaDate.value;
    renderAll();
  });
  elements.statusFilter.addEventListener("change", renderAll);
  elements.agendaSearch.addEventListener("input", renderAll);
  elements.previousWeek.addEventListener("click", () => moveAgendaWeek(-7));
  elements.currentWeek.addEventListener("click", () => setAgendaDate(toDateInput(new Date())));
  elements.nextWeek.addEventListener("click", () => moveAgendaWeek(7));
  elements.exportCsv.addEventListener("click", exportCsv);
  elements.clearForm.addEventListener("click", clearBookingForm);
  elements.findNextSlot.addEventListener("click", selectNextAvailableSlot);
  elements.copyReminder.addEventListener("click", copyReminderText);
  elements.enableNotifications.addEventListener("click", requestNotificationPermission);
  elements.reminderForm.addEventListener("submit", submitReminder);
  elements.cashForm.addEventListener("submit", submitCashTransaction);
  elements.clearCashForm.addEventListener("click", clearCashForm);
  elements.cashMonth.addEventListener("change", () => {
    elements.dashboardMonth.value = elements.cashMonth.value;
    renderAll();
  });
  elements.cashFilterType.addEventListener("change", renderAll);
  elements.closeCashMonth.addEventListener("click", closeCashMonth);
  elements.dashboardMonth.addEventListener("change", renderAll);
  elements.saveSettings.addEventListener("click", saveSettings);
  elements.addBlock.addEventListener("click", addBlockedSlot);
  elements.backupNow.addEventListener("click", createBackupNow);
  window.addEventListener("beforeunload", warnBeforeClose);
}

function switchView(viewName) {
  const titles = {
    booking: "Nueva cita",
    agenda: "Agenda",
    cash: "Caja",
    dashboard: "Dashboard",
    settings: "Horarios",
  };
  elements.navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
  elements.views.forEach((view) => view.classList.remove("active"));
  document.getElementById(`${viewName}View`).classList.add("active");
  elements.viewTitle.textContent = titles[viewName];
}

function renderAll() {
  renderSlots();
  renderWeekCalendar();
  renderAgenda();
  renderReminders();
  renderBlockedSlots();
  renderStats();
  renderAgent();
  renderDataStatus();
  renderCash();
  renderDashboard();
  updateNotificationButton();
}

function renderServices() {
  elements.serviceGrid.innerHTML = services
    .map(
      (service) => `
        <button class="service-button ${service.id === selectedService ? "active" : ""}" type="button" data-service="${service.id}">
          <span class="service-icon" aria-hidden="true">${service.icon}</span>
          <span>
            <strong>${escapeHtml(service.title)}</strong>
            <small>${escapeHtml(service.detail)}</small>
          </span>
        </button>
      `,
    )
    .join("");

  elements.serviceGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedService = button.dataset.service;
      renderServices();
      renderAgent();
    });
  });
}

function renderSlots() {
  const date = elements.bookingDate.value;
  const duration = Number(elements.duration.value);

  if (!isWorkingDay(date)) {
    elements.slotGrid.innerHTML = `<div class="empty-state">No hay atencion configurada para ese dia.</div>`;
    return;
  }

  const slots = buildSlots(date, duration);
  elements.slotGrid.innerHTML = slots
    .map((slot) => {
      const disabled = slot.busy ? "disabled" : "";
      const active = selectedSlot === slot.time ? "active" : "";
      return `<button class="slot-button ${active}" type="button" data-time="${slot.time}" ${disabled}>${slot.time}</button>`;
    })
    .join("");

  elements.slotGrid.querySelectorAll("button:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSlot = button.dataset.time;
      renderSlots();
      renderAgent();
    });
  });
}

function buildSlots(date, duration) {
  const settings = state.settings;
  const slots = [];
  let cursor = timeToMinutes(settings.startHour);
  const end = timeToMinutes(settings.endHour);
  const breakStart = timeToMinutes(settings.breakStart);
  const breakEnd = timeToMinutes(settings.breakEnd);

  while (cursor + duration <= end) {
    const time = minutesToTime(cursor);
    const inBreak = cursor < breakEnd && cursor + duration > breakStart;
    const busy = inBreak || isPastSlot(date, time) || isSlotBusy(date, time);
    slots.push({ time, busy });
    cursor += 30;
  }

  return slots;
}

function isSlotBusy(date, time) {
  const appointmentBusy = state.appointments.some(
    (appointment) =>
      appointment.date === date &&
      appointment.time === time &&
      appointment.status !== "cancelled",
  );
  const manuallyBlocked = state.settings.blocked.some(
    (blocked) => blocked.date === date && blocked.time === time,
  );
  return appointmentBusy || manuallyBlocked;
}

function isPastSlot(date, time) {
  const today = toDateInput(new Date());
  if (date !== today) return false;
  const now = new Date();
  return timeToMinutes(time) <= now.getHours() * 60 + now.getMinutes();
}

function isWorkingDay(dateValue) {
  if (!dateValue) return false;
  const day = new Date(`${dateValue}T12:00:00`).getDay();
  return state.settings.weekdays.includes(day);
}

async function submitBooking(event) {
  event.preventDefault();
  elements.formMessage.textContent = "";

  if (!selectedSlot) {
    showMessage("Selecciona un horario disponible.", "error");
    return;
  }

  if (isSlotBusy(elements.bookingDate.value, selectedSlot)) {
    showMessage("Ese horario acaba de ocuparse. Elige otro.", "error");
    renderSlots();
    return;
  }

  const data = new FormData(elements.bookingForm);
  const appointment = {
    serviceId: selectedService,
    date: data.get("date"),
    time: selectedSlot,
    duration: Number(data.get("duration")),
    clientName: clean(data.get("clientName")),
    clientPhone: clean(data.get("clientPhone")),
    clientEmail: clean(data.get("clientEmail")),
    clientDocument: clean(data.get("clientDocument")),
    notes: clean(data.get("notes")),
    status: "pending",
  };

  try {
    isSaving = true;
    elements.createAppointment.disabled = true;
    elements.createAppointment.textContent = "Guardando...";
    const saved = await api("/api/appointments", { method: "POST", body: appointment });
    state.appointments.push(saved);
    clearBookingForm({ keepDate: saved.date, keepDuration: saved.duration });
    elements.agendaDate.value = saved.date;
    showMessage("Cita creada y guardada en la base de datos.", "success");
    await loadStateFromDatabase();
    formDirty = false;
    renderAll();
  } catch (error) {
    showMessage(`No pude guardar: ${error.message}`, "error");
  } finally {
    isSaving = false;
    elements.createAppointment.disabled = false;
    elements.createAppointment.textContent = "Crear cita";
  }
}

function clearBookingForm(options = {}) {
  const keepDate = options.keepDate || elements.bookingDate.value;
  const keepDuration = options.keepDuration || elements.duration.value;
  elements.bookingForm.reset();
  elements.bookingDate.value = keepDate;
  elements.duration.value = String(keepDuration);
  selectedSlot = "";
  formDirty = false;
  elements.formMessage.textContent = "";
  renderAll();
}

function showMessage(text, type) {
  elements.formMessage.style.color = type === "error" ? "var(--rose)" : "var(--green)";
  elements.formMessage.textContent = text;
}

function renderWeekCalendar() {
  const baseDate = elements.agendaDate.value || toDateInput(new Date());
  const weekDates = getWeekDates(baseDate);
  const status = elements.statusFilter.value;
  const query = clean(elements.agendaSearch.value).toLowerCase();
  const startLabel = formatDate(weekDates[0]);
  const endLabel = formatDate(weekDates[6]);

  elements.weekLabel.textContent = `${startLabel} - ${endLabel}`;
  elements.weekCalendar.innerHTML = weekDates
    .map((dateValue) => {
      const dayAppointments = state.appointments
        .filter((appointment) => appointment.date === dateValue)
        .filter((appointment) => status === "all" || appointment.status === status)
        .filter((appointment) => matchesAppointmentSearch(appointment, query))
        .sort((a, b) => a.time.localeCompare(b.time));
      const dayReminders = state.reminders.filter(
        (reminder) => reminder.status === "active" && reminder.dueAt.slice(0, 10) === dateValue,
      );
      const active = dateValue === selectedAgendaDate ? "active" : "";
      const today = dateValue === toDateInput(new Date()) ? "today" : "";

      return `
        <button class="week-day ${active} ${today}" type="button" data-date="${dateValue}">
          <span class="week-day-name">${formatWeekday(dateValue)}</span>
          <strong>${formatShortDate(dateValue)}</strong>
          <small>${dayAppointments.length} citas · ${dayReminders.length} record.</small>
          <div class="week-day-items">
            ${
              dayAppointments.length
                ? dayAppointments.slice(0, 5).map(renderWeekAppointment).join("")
                : `<span class="week-empty">Sin citas</span>`
            }
            ${dayAppointments.length > 5 ? `<span class="week-more">+${dayAppointments.length - 5} mas</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");

  elements.weekCalendar.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => setAgendaDate(button.dataset.date));
  });
}

function renderWeekAppointment(appointment) {
  const service = getService(appointment.serviceId);
  return `
    <span class="week-appointment ${appointment.status}">
      <strong>${appointment.time}</strong>
      ${escapeHtml(appointment.clientName)} · ${escapeHtml(service.title)}
    </span>
  `;
}

function renderAgenda() {
  const selectedDate = selectedAgendaDate || elements.agendaDate.value;
  const status = elements.statusFilter.value;
  const query = clean(elements.agendaSearch.value).toLowerCase();
  const appointments = state.appointments
    .filter((appointment) => appointment.date === selectedDate)
    .filter((appointment) => status === "all" || appointment.status === status)
    .filter((appointment) => matchesAppointmentSearch(appointment, query))
    .sort((a, b) => a.time.localeCompare(b.time));

  elements.selectedDayTitle.textContent = `Citas de ${formatDate(selectedDate)}`;

  if (!appointments.length) {
    elements.agendaList.innerHTML = `<div class="empty-state">No hay reservas para la seleccion actual.</div>`;
    return;
  }

  elements.agendaList.innerHTML = appointments.map(renderAppointmentCard).join("");
  elements.agendaList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => updateAppointment(button.dataset.id, button.dataset.action));
  });
}

function renderAppointmentCard(appointment) {
  const service = getService(appointment.serviceId);
  const statusLabel = { pending: "Pendiente", confirmed: "Confirmada", cancelled: "Cancelada" }[
    appointment.status
  ];

  return `
    <article class="appointment-card ${appointment.status}">
      <div class="appointment-time">${appointment.time}</div>
      <div class="appointment-meta">
        <strong>${escapeHtml(appointment.clientName)}</strong>
        <span>${escapeHtml(service.title)} - ${appointment.duration} min</span>
        <span>${escapeHtml(appointment.clientPhone)}${appointment.clientEmail ? ` - ${escapeHtml(appointment.clientEmail)}` : ""}</span>
        ${appointment.clientDocument ? `<span>Doc. ${escapeHtml(appointment.clientDocument)}</span>` : ""}
        ${appointment.notes ? `<span>${escapeHtml(appointment.notes)}</span>` : ""}
        <span class="status-pill">${statusLabel}</span>
      </div>
      <div class="card-actions">
        <button class="small-action" type="button" data-action="confirmed" data-id="${appointment.id}">Confirmar</button>
        <button class="small-action" type="button" data-action="cancelled" data-id="${appointment.id}">Cancelar</button>
        <button class="small-action" type="button" data-action="delete" data-id="${appointment.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function setAgendaDate(dateValue) {
  selectedAgendaDate = dateValue;
  elements.agendaDate.value = dateValue;
  renderAll();
}

function moveAgendaWeek(days) {
  const date = new Date(`${elements.agendaDate.value || toDateInput(new Date())}T12:00:00`);
  date.setDate(date.getDate() + days);
  setAgendaDate(toDateInput(date));
}

async function updateAppointment(id, action) {
  try {
    if (action === "delete") {
      await api(`/api/appointments/${id}`, { method: "DELETE" });
    } else {
      await api(`/api/appointments/${id}`, { method: "PATCH", body: { status: action } });
    }
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    showMessage(`No pude actualizar la cita: ${error.message}`, "error");
  }
}

function matchesAppointmentSearch(appointment, query) {
  if (!query) return true;
  const service = getService(appointment.serviceId);
  return [
    appointment.clientName,
    appointment.clientPhone,
    appointment.clientEmail,
    appointment.clientDocument,
    appointment.notes,
    service.title,
    appointment.time,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function renderAgent() {
  const service = getService(selectedService);
  const nextSlot = findNextAvailableSlot(elements.bookingDate.value, Number(elements.duration.value));
  const selectedDateText = elements.bookingDate.value ? formatDate(elements.bookingDate.value) : "sin fecha";
  const checklist = [
    { label: "Tramite seleccionado", done: Boolean(selectedService) },
    { label: "Horario disponible elegido", done: Boolean(selectedSlot) },
    { label: "Nombre del cliente", done: Boolean(clean(elements.clientName.value)) },
    { label: "Telefono de contacto", done: Boolean(clean(elements.clientPhone.value)) },
  ];

  elements.agentMessage.textContent = selectedSlot
    ? `Tengo una cita lista para ${service.title} el ${selectedDateText} a las ${selectedSlot}. Faltaria confirmar los datos y crear la reserva.`
    : nextSlot
      ? `El proximo horario disponible para ${service.title} es ${formatDate(nextSlot.date)} a las ${nextSlot.time}.`
      : "No encontre horarios disponibles con la configuracion actual. Revisa los dias habiles o bloqueos.";

  elements.selectionSummary.textContent = selectedSlot
    ? `${service.title} - ${selectedDateText} - ${selectedSlot}`
    : `${service.title} - esperando horario`;

  elements.agentChecklist.innerHTML = checklist
    .map(
      (item) => `
        <div class="agent-check ${item.done ? "complete" : ""}">
          <span>${item.done ? "OK" : "!"}</span>
          ${item.label}
        </div>
      `,
    )
    .join("");

  const pendingToday = state.appointments.filter(
    (appointment) => appointment.date === toDateInput(new Date()) && appointment.status === "pending",
  ).length;
  elements.agentSidebarTitle.textContent = pendingToday
    ? `${pendingToday} pendientes para revisar`
    : "Agenda bajo control";
  elements.agentSidebarText.textContent = nextSlot
    ? `Siguiente hueco: ${formatDate(nextSlot.date)} a las ${nextSlot.time}.`
    : "Sin huecos disponibles con los filtros actuales.";
}

function selectNextAvailableSlot() {
  const nextSlot = findNextAvailableSlot(elements.bookingDate.value, Number(elements.duration.value));
  if (!nextSlot) {
    showMessage("No encontre horarios disponibles.", "error");
    return;
  }

  elements.bookingDate.value = nextSlot.date;
  selectedSlot = nextSlot.time;
  renderAll();
  showMessage(`Horario sugerido: ${formatDate(nextSlot.date)} a las ${nextSlot.time}.`, "success");
}

function findNextAvailableSlot(startDate, duration) {
  const cursor = startDate ? new Date(`${startDate}T12:00:00`) : new Date();

  for (let offset = 0; offset < 45; offset += 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + offset);
    const dateValue = toDateInput(date);
    if (!isWorkingDay(dateValue)) continue;

    const slot = buildSlots(dateValue, duration).find((item) => !item.busy);
    if (slot) return { date: dateValue, time: slot.time };
  }

  return null;
}

async function copyReminderText() {
  const service = getService(selectedService);
  const date = elements.bookingDate.value;
  const suggestedSlot = selectedSlot
    ? { date, time: selectedSlot }
    : findNextAvailableSlot(date, Number(elements.duration.value));
  const client = clean(elements.clientName.value) || "cliente";

  if (!suggestedSlot?.date || !suggestedSlot?.time) {
    showMessage("Primero selecciona o busca un horario.", "error");
    return;
  }

  const text = `Hola ${client}. Te recordamos tu cita con el Escribano Martin Acosta por ${service.title} el ${formatDate(suggestedSlot.date)} a las ${suggestedSlot.time}. Por favor trae documento vigente y la documentacion relacionada al tramite.`;

  try {
    await navigator.clipboard.writeText(text);
    showMessage("Recordatorio copiado.", "success");
  } catch {
    elements.notes.value = `${elements.notes.value}\n\n${text}`.trim();
    showMessage("No pude copiarlo; deje el recordatorio en observaciones.", "success");
  }
}

async function submitReminder(event) {
  event.preventDefault();
  const title = clean(elements.reminderTitle.value);
  const message = clean(elements.reminderMessage.value);
  const dueAt = elements.reminderDueAt.value;

  if (!title || !dueAt) {
    showMessage("Completa titulo y fecha del recordatorio.", "error");
    return;
  }

  try {
    isSaving = true;
    elements.createReminder.disabled = true;
    elements.createReminder.textContent = "Guardando...";
    const reminder = await api("/api/reminders", {
      method: "POST",
      body: { title, message, dueAt, status: "active" },
    });
    state.reminders.push(reminder);
    elements.reminderForm.reset();
    elements.reminderDueAt.value = toDateTimeInput(addMinutes(new Date(), 60));
    formDirty = false;
    showMessage("Recordatorio guardado.", "success");
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    showMessage(`No pude guardar el recordatorio: ${error.message}`, "error");
  } finally {
    isSaving = false;
    elements.createReminder.disabled = false;
    elements.createReminder.textContent = "Crear recordatorio";
  }
}

function renderReminders() {
  const now = new Date();
  const reminders = state.reminders
    .slice()
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .filter((reminder) => reminder.status !== "dismissed")
    .slice(0, 20);

  if (!reminders.length) {
    elements.reminderList.innerHTML = `<div class="empty-state">No hay recordatorios activos.</div>`;
    return;
  }

  elements.reminderList.innerHTML = reminders
    .map((reminder) => {
      const dueDate = new Date(reminder.dueAt);
      const dueClass = reminder.status === "done" ? "done" : dueDate <= now ? "due" : "";
      return `
        <article class="reminder-item ${dueClass}">
          <div>
            <strong>${escapeHtml(reminder.title)}</strong>
            <span>${formatDateTime(reminder.dueAt)}</span>
            ${reminder.message ? `<p>${escapeHtml(reminder.message)}</p>` : ""}
          </div>
          <div class="card-actions">
            <button class="small-action" type="button" data-reminder-action="done" data-id="${reminder.id}">Hecho</button>
            <button class="small-action" type="button" data-reminder-action="dismissed" data-id="${reminder.id}">Ocultar</button>
            <button class="small-action" type="button" data-reminder-action="delete" data-id="${reminder.id}">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join("");

  elements.reminderList.querySelectorAll("[data-reminder-action]").forEach((button) => {
    button.addEventListener("click", () => updateReminder(button.dataset.id, button.dataset.reminderAction));
  });
}

async function updateReminder(id, action) {
  try {
    if (action === "delete") {
      await api(`/api/reminders/${id}`, { method: "DELETE" });
    } else {
      await api(`/api/reminders/${id}`, {
        method: "PATCH",
        body: { status: action, notifiedAt: action === "done" ? new Date().toISOString() : undefined },
      });
    }
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    showMessage(`No pude actualizar el recordatorio: ${error.message}`, "error");
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showMessage("Este equipo no soporta notificaciones del navegador.", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationButton();
  if (permission === "granted") {
    showMessage("Notificaciones activadas.", "success");
  } else {
    showMessage("Windows o el navegador no permitieron las notificaciones.", "error");
  }
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    elements.enableNotifications.textContent = "Notificaciones no disponibles";
    elements.enableNotifications.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    elements.enableNotifications.textContent = "Notificaciones activas";
  } else if (Notification.permission === "denied") {
    elements.enableNotifications.textContent = "Notificaciones bloqueadas";
  } else {
    elements.enableNotifications.textContent = "Activar notificaciones";
  }
}

function startReminderWatcher() {
  checkDueReminders();
  window.setInterval(checkDueReminders, 30000);
}

async function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const dueReminders = state.reminders.filter(
    (reminder) =>
      reminder.status === "active" &&
      !reminder.notifiedAt &&
      !notifiedThisSession.has(reminder.id) &&
      new Date(reminder.dueAt) <= now,
  );

  for (const reminder of dueReminders) {
    notifiedThisSession.add(reminder.id);
    new Notification(reminder.title, {
      body: reminder.message || "Recordatorio de Agenda Martin Acosta",
      tag: reminder.id,
      requireInteraction: true,
    });
    try {
      await api(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        body: { notifiedAt: new Date().toISOString() },
      });
    } catch {
      // Si no se pudo marcar, la sesion actual evita repetir la misma notificacion.
    }
  }

  if (dueReminders.length) {
    await loadStateFromDatabase();
    renderAll();
  }
}

function hydrateSettings() {
  elements.startHour.value = state.settings.startHour;
  elements.endHour.value = state.settings.endHour;
  elements.breakStart.value = state.settings.breakStart;
  elements.breakEnd.value = state.settings.breakEnd;
  document.querySelectorAll(".weekdays input").forEach((input) => {
    input.checked = state.settings.weekdays.includes(Number(input.value));
  });
}

async function saveSettings() {
  const settings = {
    ...state.settings,
    startHour: elements.startHour.value,
    endHour: elements.endHour.value,
    breakStart: elements.breakStart.value,
    breakEnd: elements.breakEnd.value,
    weekdays: [...document.querySelectorAll(".weekdays input:checked")].map((input) => Number(input.value)),
  };

  try {
    state.settings = await api("/api/settings", { method: "PUT", body: settings });
    formDirty = false;
    selectedSlot = "";
    renderAll();
    showMessage("Horarios guardados en la base de datos.", "success");
  } catch (error) {
    showMessage(`No pude guardar los horarios: ${error.message}`, "error");
  }
}

async function addBlockedSlot() {
  const date = elements.blockDate.value;
  const time = elements.blockTime.value;
  if (!date || !time) return;

  try {
    const blocked = await api("/api/blocked", { method: "POST", body: { date, time } });
    state.settings.blocked = blocked;
    selectedSlot = "";
    renderAll();
  } catch (error) {
    showMessage(`No pude bloquear ese horario: ${error.message}`, "error");
  }
}

async function createBackupNow() {
  try {
    elements.backupNow.disabled = true;
    elements.backupNow.textContent = "Creando backup...";
    const backup = await api("/api/backup", { method: "POST" });
    showMessage(`Backup creado: ${backup.fileName}`, "success");
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    showMessage(`No pude crear el backup: ${error.message}`, "error");
  } finally {
    elements.backupNow.disabled = false;
    elements.backupNow.textContent = "Crear backup ahora";
  }
}

function renderCashCategories() {
  const type = elements.cashType.value || "income";
  const categories = cashCategories[type] || cashCategories.income;
  const current = elements.cashCategory.value;
  elements.cashCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  if (categories.includes(current)) {
    elements.cashCategory.value = current;
  }
}

async function submitCashTransaction(event) {
  event.preventDefault();
  setCashMessage("", "success");

  const data = new FormData(elements.cashForm);
  const transaction = {
    type: data.get("type"),
    date: data.get("date"),
    amount: Number(data.get("amount")),
    category: clean(data.get("category")),
    concept: clean(data.get("concept")),
    paymentMethod: clean(data.get("paymentMethod")),
    party: clean(data.get("party")),
    notes: clean(data.get("notes")),
  };

  if (!transaction.date || !transaction.amount || transaction.amount <= 0 || !transaction.concept) {
    setCashMessage("Completa fecha, importe y concepto.", "error");
    return;
  }

  try {
    isSaving = true;
    elements.saveCashTransaction.disabled = true;
    elements.saveCashTransaction.textContent = "Guardando...";
    await api("/api/cash-transactions", { method: "POST", body: transaction });
    await loadStateFromDatabase();
    clearCashForm({ keepDate: transaction.date, keepType: transaction.type });
    elements.cashMonth.value = transaction.date.slice(0, 7);
    elements.dashboardMonth.value = transaction.date.slice(0, 7);
    setCashMessage("Movimiento guardado en la caja.", "success");
    renderAll();
  } catch (error) {
    setCashMessage(`No pude guardar el movimiento: ${error.message}`, "error");
  } finally {
    isSaving = false;
    elements.saveCashTransaction.disabled = false;
    elements.saveCashTransaction.textContent = "Guardar movimiento";
  }
}

function clearCashForm(options = {}) {
  const keepDate = options.keepDate || elements.cashDate.value || toDateInput(new Date());
  const keepType = options.keepType || elements.cashType.value || "income";
  elements.cashForm.reset();
  elements.cashDate.value = keepDate;
  elements.cashType.value = keepType;
  renderCashCategories();
  formDirty = false;
  setCashMessage("", "success");
}

function setCashMessage(text, type) {
  elements.cashMessage.style.color = type === "error" ? "var(--rose)" : "var(--green)";
  elements.cashMessage.textContent = text;
}

function renderCash() {
  const month = elements.cashMonth.value || toMonthInput(new Date());
  const filterType = elements.cashFilterType.value || "all";
  const monthTransactions = state.cashTransactions.filter((transaction) => isInMonth(transaction.date, month));
  const visibleTransactions = monthTransactions
    .filter((transaction) => filterType === "all" || transaction.type === filterType)
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));
  const totals = summarizeCash(monthTransactions);

  elements.cashSummary.innerHTML = `
    <article class="metric-card income">
      <span>Ingresos</span>
      <strong>${formatCurrency(totals.income)}</strong>
      <small>${totals.incomeCount} movimientos</small>
    </article>
    <article class="metric-card expense">
      <span>Gastos</span>
      <strong>${formatCurrency(totals.expense)}</strong>
      <small>${totals.expenseCount} movimientos</small>
    </article>
    <article class="metric-card balance">
      <span>Saldo</span>
      <strong>${formatCurrency(totals.balance)}</strong>
      <small>${totals.count} movimientos del mes</small>
    </article>
  `;

  if (!visibleTransactions.length) {
    elements.cashTransactionList.innerHTML = `<div class="empty-state">No hay movimientos para el filtro actual.</div>`;
  } else {
    elements.cashTransactionList.innerHTML = visibleTransactions.map(renderCashTransaction).join("");
    elements.cashTransactionList.querySelectorAll("[data-cash-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteCashTransaction(button.dataset.cashDelete));
    });
  }

  renderClosures();
}

function renderCashTransaction(transaction) {
  const typeLabel = transaction.type === "income" ? "Ingreso" : "Gasto";
  const sign = transaction.type === "income" ? "+" : "-";
  return `
    <article class="transaction-item ${transaction.type}">
      <div class="transaction-main">
        <strong>${escapeHtml(transaction.concept)}</strong>
        <span>${formatDate(transaction.date)} - ${escapeHtml(transaction.category)} - ${escapeHtml(transaction.paymentMethod || "Sin medio")}</span>
        ${transaction.party ? `<small>${escapeHtml(transaction.party)}</small>` : ""}
        ${transaction.notes ? `<small>${escapeHtml(transaction.notes)}</small>` : ""}
      </div>
      <div class="transaction-amount ${transaction.type}">
        <span>${typeLabel}</span>
        <strong>${sign}${formatCurrency(transaction.amount)}</strong>
        <button class="small-action" type="button" data-cash-delete="${transaction.id}">Eliminar</button>
      </div>
    </article>
  `;
}

async function deleteCashTransaction(id) {
  try {
    await api(`/api/cash-transactions/${id}`, { method: "DELETE" });
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    setCashMessage(`No pude eliminar el movimiento: ${error.message}`, "error");
  }
}

async function closeCashMonth() {
  const month = elements.cashMonth.value || toMonthInput(new Date());
  try {
    elements.closeCashMonth.disabled = true;
    elements.closeCashMonth.textContent = "Cerrando...";
    await api("/api/monthly-closures", { method: "POST", body: { month } });
    await loadStateFromDatabase();
    setCashMessage(`Cierre creado para ${formatMonth(month)}.`, "success");
    renderAll();
  } catch (error) {
    setCashMessage(`No pude crear el cierre: ${error.message}`, "error");
  } finally {
    elements.closeCashMonth.disabled = false;
    elements.closeCashMonth.textContent = "Crear cierre del mes";
  }
}

function renderClosures() {
  const closures = state.monthlyClosures.slice(0, 8);
  if (!closures.length) {
    elements.closureList.innerHTML = `<div class="empty-state">Todavia no hay cierres mensuales.</div>`;
    return;
  }

  elements.closureList.innerHTML = closures
    .map(
      (closure) => `
        <article class="closure-item">
          <div>
            <strong>${formatMonth(closure.month)} - ${formatCurrency(closure.balance)}</strong>
            <span>Ingresos ${formatCurrency(closure.income)} - Gastos ${formatCurrency(closure.expense)} - ${closure.transactionCount} mov.</span>
          </div>
          <button class="small-action" type="button" data-closure-delete="${closure.id}">Quitar cierre</button>
        </article>
      `,
    )
    .join("");

  elements.closureList.querySelectorAll("[data-closure-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteClosure(button.dataset.closureDelete));
  });
}

async function deleteClosure(id) {
  try {
    await api(`/api/monthly-closures/${id}`, { method: "DELETE" });
    await loadStateFromDatabase();
    renderAll();
  } catch (error) {
    setCashMessage(`No pude quitar el cierre: ${error.message}`, "error");
  }
}

function renderDashboard() {
  const month = elements.dashboardMonth.value || toMonthInput(new Date());
  const monthTransactions = state.cashTransactions.filter((transaction) => isInMonth(transaction.date, month));
  const totals = summarizeCash(monthTransactions);
  const monthAppointments = state.appointments.filter((appointment) => isInMonth(appointment.date, month));
  const activeAppointments = monthAppointments.filter((appointment) => appointment.status !== "cancelled");
  const pendingReminders = state.reminders.filter((reminder) => reminder.status === "active").length;
  const avgIncome = activeAppointments.length ? totals.income / activeAppointments.length : 0;

  elements.dashboardKpis.innerHTML = `
    <article class="metric-card balance">
      <span>Saldo del mes</span>
      <strong>${formatCurrency(totals.balance)}</strong>
      <small>${formatMonth(month)}</small>
    </article>
    <article class="metric-card income">
      <span>Ingresos por cita activa</span>
      <strong>${formatCurrency(avgIncome)}</strong>
      <small>${activeAppointments.length} citas activas</small>
    </article>
    <article class="metric-card warning">
      <span>Recordatorios activos</span>
      <strong>${pendingReminders}</strong>
      <small>Seguimientos pendientes</small>
    </article>
  `;

  renderCashFlowChart(month);
  renderServiceChart(monthAppointments);
  renderStatusDashboard(monthAppointments);
  renderDashboardInsights();
}

function renderCashFlowChart(selectedMonth) {
  const months = getRecentMonths(selectedMonth, 6);
  const rows = months.map((month) => {
    const totals = summarizeCash(state.cashTransactions.filter((transaction) => isInMonth(transaction.date, month)));
    return { month, ...totals };
  });
  const max = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));

  elements.cashFlowChart.innerHTML = rows
    .map(
      (row) => `
        <div class="bar-row">
          <span>${formatMonth(row.month)}</span>
          <div class="bar-track"><div class="bar-fill income" style="--bar-value: ${Math.round((row.income / max) * 100)}%"></div></div>
          <strong>${formatCurrency(row.income)}</strong>
        </div>
        <div class="bar-row">
          <span>Gastos</span>
          <div class="bar-track"><div class="bar-fill expense" style="--bar-value: ${Math.round((row.expense / max) * 100)}%"></div></div>
          <strong>${formatCurrency(row.expense)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderServiceChart(appointments) {
  const counts = services.map((service) => ({
    label: service.title,
    count: appointments.filter((appointment) => appointment.serviceId === service.id).length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.count));

  elements.serviceChart.innerHTML = counts
    .map(
      (item) => `
        <div class="bar-row">
          <span>${escapeHtml(item.label)}</span>
          <div class="bar-track"><div class="bar-fill" style="--bar-value: ${Math.round((item.count / max) * 100)}%"></div></div>
          <strong>${item.count}</strong>
        </div>
      `,
    )
    .join("");
}

function renderStatusDashboard(appointments) {
  const statuses = [
    { key: "pending", label: "Pendientes" },
    { key: "confirmed", label: "Confirmadas" },
    { key: "cancelled", label: "Canceladas" },
  ];
  elements.statusDashboard.innerHTML = statuses
    .map((item) => {
      const count = appointments.filter((appointment) => appointment.status === item.key).length;
      return `
        <div class="status-row">
          <div>
            <strong>${item.label}</strong>
            <span>${formatMonth(elements.dashboardMonth.value || toMonthInput(new Date()))}</span>
          </div>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
}

function renderDashboardInsights() {
  const today = toDateInput(new Date());
  const upcomingAppointments = state.appointments
    .filter((appointment) => appointment.status !== "cancelled" && appointment.date >= today)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 4);
  const activeReminders = state.reminders
    .filter((reminder) => reminder.status === "active")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 3);
  const items = [
    ...upcomingAppointments.map((appointment) => ({
      title: `${formatDate(appointment.date)} - ${appointment.time}`,
      text: `${appointment.clientName} - ${getService(appointment.serviceId).title}`,
    })),
    ...activeReminders.map((reminder) => ({
      title: `Recordatorio: ${reminder.title}`,
      text: formatDateTime(reminder.dueAt),
    })),
  ];

  if (!items.length) {
    elements.dashboardInsights.innerHTML = `<div class="empty-state">No hay acciones proximas cargadas.</div>`;
    return;
  }

  elements.dashboardInsights.innerHTML = items
    .map(
      (item) => `
        <article class="insight-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </article>
      `,
    )
    .join("");
}

function renderDataStatus() {
  if (!elements.databaseStatus) return;
  elements.databaseStatus.textContent = state.meta.databaseReady ? "Lista y guardando" : "Pendiente";
  elements.dataPath.textContent = state.meta.dataDir || "-";
  elements.backupPath.textContent = state.meta.backupDir || "-";
}

function renderBlockedSlots() {
  const blocked = state.settings.blocked;
  if (!blocked.length) {
    elements.blockedList.innerHTML = `<div class="empty-state">No hay horarios bloqueados.</div>`;
    return;
  }

  elements.blockedList.innerHTML = blocked
    .map(
      (item) => `
        <div class="blocked-item">
          <strong>${formatDate(item.date)} - ${item.time}</strong>
          <button class="small-action" type="button" data-block-id="${item.id}">Quitar</button>
        </div>
      `,
    )
    .join("");

  elements.blockedList.querySelectorAll("[data-block-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        state.settings.blocked = await api(`/api/blocked/${button.dataset.blockId}`, { method: "DELETE" });
        renderAll();
      } catch (error) {
        showMessage(`No pude quitar el bloqueo: ${error.message}`, "error");
      }
    });
  });
}

function renderStats() {
  const today = toDateInput(new Date());
  const todayAppointments = state.appointments.filter(
    (appointment) => appointment.date === today && appointment.status !== "cancelled",
  );
  const pending = state.appointments.filter((appointment) => appointment.status === "pending").length;
  const week = state.appointments.filter((appointment) => isThisWeek(appointment.date)).length;

  elements.todayLabel.textContent = formatDate(today);
  elements.todayCount.textContent = `${todayAppointments.length} citas activas`;
  elements.pendingStat.textContent = String(pending);
  elements.weekStat.textContent = String(week);
  elements.totalStat.textContent = String(state.appointments.length);
}

function exportCsv() {
  const headers = ["fecha", "hora", "estado", "tramite", "duracion", "cliente", "telefono", "email", "documento", "observaciones"];
  const rows = state.appointments
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map((appointment) => [
      appointment.date,
      appointment.time,
      appointment.status,
      getService(appointment.serviceId).title,
      appointment.duration,
      appointment.clientName,
      appointment.clientPhone,
      appointment.clientEmail,
      appointment.clientDocument,
      appointment.notes,
    ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "agenda-martin-acosta.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function getService(id) {
  return services.find((service) => service.id === id) || services[0];
}

function clean(value) {
  return String(value || "").trim();
}

function toDateInput(date) {
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function toMonthInput(date) {
  return toDateInput(date).slice(0, 7);
}

function toDateTimeInput(date) {
  return `${toDateInput(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMonth(value) {
  return new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(
    new Date(`${value}-01T12:00:00`),
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatWeekday(value) {
  return new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function getWeekDates(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(date);
    next.setDate(date.getDate() + index);
    return toDateInput(next);
  });
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function isThisWeek(dateValue) {
  const now = new Date();
  const date = new Date(`${dateValue}T12:00:00`);
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function isInMonth(dateValue, monthValue) {
  return String(dateValue || "").slice(0, 7) === monthValue;
}

function summarizeCash(transactions) {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.type === "income") {
        totals.income += Number(transaction.amount || 0);
        totals.incomeCount += 1;
      }
      if (transaction.type === "expense") {
        totals.expense += Number(transaction.amount || 0);
        totals.expenseCount += 1;
      }
      totals.count += 1;
      totals.balance = totals.income - totals.expense;
      return totals;
    },
    { income: 0, expense: 0, balance: 0, count: 0, incomeCount: 0, expenseCount: 0 },
  );
}

function getRecentMonths(selectedMonth, count) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const cursor = new Date(year, month - 1, 1);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - (count - index - 1));
    return toMonthInput(date);
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function warnBeforeClose(event) {
  if (!isSaving && !hasUnsavedFormData()) return;
  event.preventDefault();
  event.returnValue = "Hay cambios sin guardar o una operacion de guardado en curso.";
}

function hasUnsavedFormData() {
  const bookingHasData =
    selectedSlot ||
    clean(elements.clientName.value) ||
    clean(elements.clientPhone.value) ||
    clean(elements.clientEmail.value) ||
    clean(elements.clientDocument.value) ||
    clean(elements.notes.value);

  const reminderHasData = clean(elements.reminderTitle.value) || clean(elements.reminderMessage.value);

  const cashHasData =
    clean(elements.cashAmount.value) ||
    clean(elements.cashParty.value) ||
    clean(elements.cashConcept.value) ||
    clean(elements.cashNotes.value);

  const settingsChanged =
    elements.startHour.value !== state.settings.startHour ||
    elements.endHour.value !== state.settings.endHour ||
    elements.breakStart.value !== state.settings.breakStart ||
    elements.breakEnd.value !== state.settings.breakEnd ||
    JSON.stringify([...document.querySelectorAll(".weekdays input:checked")].map((input) => Number(input.value))) !==
      JSON.stringify(state.settings.weekdays);

  return Boolean(formDirty && (bookingHasData || reminderHasData || cashHasData || settingsChanged));
}
