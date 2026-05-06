const { createServer } = require("node:http");
const { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } = require("node:fs");
const { extname, join, normalize, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const DATA_DIR = process.env.APP_DATA_DIR || join(ROOT, "datos");
const LEGACY_DB_PATH = join(ROOT, "agenda_martin_acosta.db");
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, "agenda_martin_acosta.db");
const BACKUP_DIR = process.env.BACKUP_DIR || join(DATA_DIR, "backups");

const DEFAULT_SETTINGS = {
  startHour: "09:00",
  endHour: "17:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  weekdays: [1, 2, 3, 4, 5],
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const SERVICE_IDS = new Set(["compraventa", "certificacion", "poder", "sociedades", "sucesiones", "consulta"]);
const VALID_DURATIONS = new Set([30, 45, 60]);
const VALID_STATUSES = new Set(["pending", "confirmed", "cancelled"]);
const VALID_CASH_TYPES = new Set(["income", "expense"]);
const VALID_CASE_STATUSES = new Set(["started", "waiting_documents", "drafting", "ready_to_sign", "finished"]);
const VALID_PAYMENT_STATUSES = new Set(["pending", "paid", "cancelled"]);
const STATIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "assets/agenda-logo.png",
  "assets/agenda-logo.svg",
  "assets/agenda.ico",
]);

prepareDataDirectory();
createStartupBackup();
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = FULL;");
initDb();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, { error: error.message || "Error interno" }, error.statusCode || 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agenda Martin Acosta lista en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`El puerto ${PORT} ya esta en uso. Cierra otra ventana de la agenda y vuelve a intentar.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      client_email TEXT NOT NULL DEFAULT '',
      client_document TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      UNIQUE(date, time)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      appointment_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      notified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      document TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notarial_cases (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_name TEXT NOT NULL,
      service_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      due_date TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      case_id TEXT,
      client_name TEXT NOT NULL,
      concept TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      concept TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT '',
      party TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      appointment_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_closures (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL UNIQUE,
      income_cents INTEGER NOT NULL,
      expense_cents INTEGER NOT NULL,
      balance_cents INTEGER NOT NULL,
      transaction_count INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS active_appointment_slot
      ON appointments(date, time)
      WHERE status != 'cancelled';

    CREATE INDEX IF NOT EXISTS clients_search
      ON clients(name, document, phone);

    CREATE INDEX IF NOT EXISTS notarial_cases_status
      ON notarial_cases(status, due_date);

    CREATE INDEX IF NOT EXISTS case_documents_case
      ON case_documents(case_id, status);

    CREATE INDEX IF NOT EXISTS payment_requests_status
      ON payment_requests(status, due_date);

    CREATE INDEX IF NOT EXISTS cash_transactions_date
      ON cash_transactions(date, type);

    CREATE INDEX IF NOT EXISTS monthly_closures_month
      ON monthly_closures(month);
  `);

  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    insertSetting.run(key, JSON.stringify(value));
  });
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, {
      settings: getSettings(),
      appointments: listAppointments(),
      reminders: listReminders(),
      clients: listClients(),
      cases: listCases(),
      caseDocuments: listCaseDocuments(),
      paymentRequests: listPaymentRequests(),
      cashTransactions: listCashTransactions(),
      monthlyClosures: listMonthlyClosures(),
      meta: getMeta(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/appointments") {
    const appointment = createAppointment(await readJson(request));
    sendJson(response, appointment, 201);
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "appointments" && parts[2]) {
    const { status } = await readJson(request);
    sendJson(response, updateAppointmentStatus(parts[2], status));
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "appointments" && parts[2]) {
    db.prepare("DELETE FROM appointments WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/settings") {
    sendJson(response, saveSettings(await readJson(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/blocked") {
    const { date, time } = await readJson(request);
    validateDateTime(date, time);
    if (isActiveAppointmentSlotTaken(date, time)) {
      throw httpError("No se puede bloquear un horario con una cita activa.", 409);
    }
    db.prepare("INSERT OR IGNORE INTO blocked_slots (id, date, time) VALUES (?, ?, ?)").run(
      randomUUID(),
      date,
      time,
    );
    sendJson(response, getBlockedSlots(), 201);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reminders") {
    sendJson(response, createReminder(await readJson(request)), 201);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/clients") {
    sendJson(response, createClient(await readJson(request)), 201);
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "clients" && parts[2]) {
    sendJson(response, updateClient(parts[2], await readJson(request)));
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "clients" && parts[2]) {
    db.prepare("DELETE FROM clients WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cases") {
    sendJson(response, createCase(await readJson(request)), 201);
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "cases" && parts[2]) {
    sendJson(response, updateCase(parts[2], await readJson(request)));
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "cases" && parts[2]) {
    db.prepare("DELETE FROM case_documents WHERE case_id = ?").run(parts[2]);
    db.prepare("DELETE FROM notarial_cases WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "case-documents" && parts[2]) {
    sendJson(response, updateCaseDocument(parts[2], await readJson(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/payment-requests") {
    sendJson(response, createPaymentRequest(await readJson(request)), 201);
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "payment-requests" && parts[2]) {
    sendJson(response, updatePaymentRequest(parts[2], await readJson(request)));
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "payment-requests" && parts[2]) {
    db.prepare("DELETE FROM payment_requests WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cash-transactions") {
    sendJson(response, createCashTransaction(await readJson(request)), 201);
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "cash-transactions" && parts[2]) {
    db.prepare("DELETE FROM cash_transactions WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/monthly-closures") {
    sendJson(response, createMonthlyClosure(await readJson(request)), 201);
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "monthly-closures" && parts[2]) {
    db.prepare("DELETE FROM monthly_closures WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/backup") {
    sendJson(response, createManualBackup(), 201);
    return;
  }

  if (request.method === "PATCH" && parts[0] === "api" && parts[1] === "reminders" && parts[2]) {
    sendJson(response, updateReminder(parts[2], await readJson(request)));
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "reminders" && parts[2]) {
    db.prepare("DELETE FROM reminders WHERE id = ?").run(parts[2]);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "blocked" && parts[2]) {
    db.prepare("DELETE FROM blocked_slots WHERE id = ?").run(parts[2]);
    sendJson(response, getBlockedSlots());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/import") {
    importLocalData(await readJson(request));
    sendJson(response, {
      settings: getSettings(),
      appointments: listAppointments(),
      reminders: listReminders(),
      clients: listClients(),
      cases: listCases(),
      caseDocuments: listCaseDocuments(),
      paymentRequests: listPaymentRequests(),
      cashTransactions: listCashTransactions(),
      monthlyClosures: listMonthlyClosures(),
      meta: getMeta(),
    }, 201);
    return;
  }

  sendJson(response, { error: "Ruta no encontrada" }, 404);
}

function getSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  const rows = db.prepare("SELECT key, value FROM settings").all();

  rows.forEach((row) => {
    settings[row.key] = JSON.parse(row.value);
  });

  settings.blocked = getBlockedSlots();
  return settings;
}

function saveSettings(payload) {
  const allowed = ["startHour", "endHour", "breakStart", "breakEnd", "weekdays"];
  const statement = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  validateSettings(payload);

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      statement.run(key, JSON.stringify(payload[key]));
    }
  });

  return getSettings();
}

function getBlockedSlots() {
  return db.prepare("SELECT id, date, time FROM blocked_slots ORDER BY date, time").all();
}

function listAppointments() {
  return db
    .prepare(
      `SELECT id, service_id, date, time, duration, client_name, client_phone,
              client_email, client_document, notes, status, created_at
       FROM appointments
       ORDER BY date, time`,
    )
    .all()
    .map(appointmentFromRow);
}

function getMeta() {
  return {
    dataDir: DATA_DIR,
    backupDir: BACKUP_DIR,
    databasePath: DB_PATH,
    databaseReady: existsSync(DB_PATH),
  };
}

function listReminders() {
  return db
    .prepare(
      `SELECT id, title, message, due_at, appointment_id, status, created_at, notified_at
       FROM reminders
       ORDER BY due_at, created_at`,
    )
    .all()
    .map(reminderFromRow);
}

function listClients() {
  return db
    .prepare(
      `SELECT id, name, phone, email, document, address, notes, created_at, updated_at
       FROM clients
       ORDER BY name COLLATE NOCASE`,
    )
    .all()
    .map(clientFromRow);
}

function listCases() {
  return db
    .prepare(
      `SELECT id, client_id, client_name, service_id, title, status, due_date,
              amount_cents, notes, created_at, updated_at
       FROM notarial_cases
       ORDER BY
         CASE status
           WHEN 'waiting_documents' THEN 1
           WHEN 'drafting' THEN 2
           WHEN 'ready_to_sign' THEN 3
           WHEN 'started' THEN 4
           ELSE 5
         END,
         due_date,
         created_at DESC`,
    )
    .all()
    .map(caseFromRow);
}

function listCaseDocuments() {
  return db
    .prepare(
      `SELECT id, case_id, label, status, notes, created_at
       FROM case_documents
       ORDER BY created_at, label COLLATE NOCASE`,
    )
    .all()
    .map(caseDocumentFromRow);
}

function listPaymentRequests() {
  return db
    .prepare(
      `SELECT id, client_id, case_id, client_name, concept, due_date,
              amount_cents, status, notes, created_at, paid_at
       FROM payment_requests
       ORDER BY
         CASE status WHEN 'pending' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END,
         due_date,
         created_at DESC`,
    )
    .all()
    .map(paymentRequestFromRow);
}

function listCashTransactions() {
  return db
    .prepare(
      `SELECT id, type, date, amount_cents, category, concept, payment_method, party,
              notes, appointment_id, created_at
       FROM cash_transactions
       ORDER BY date DESC, created_at DESC`,
    )
    .all()
    .map(cashTransactionFromRow);
}

function listMonthlyClosures() {
  return db
    .prepare(
      `SELECT id, month, income_cents, expense_cents, balance_cents,
              transaction_count, notes, created_at
       FROM monthly_closures
       ORDER BY month DESC`,
    )
    .all()
    .map(monthlyClosureFromRow);
}

function createAppointment(payload) {
  const appointment = normalizeAppointmentPayload(payload);

  if (isBlocked(appointment.date, appointment.time)) {
    throw httpError("Ese horario esta bloqueado.", 409);
  }

  if (isActiveAppointmentSlotTaken(appointment.date, appointment.time)) {
    throw httpError("Ese horario ya esta ocupado.", 409);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  upsertClientFromAppointment(appointment);

  try {
    db.prepare(
      `INSERT INTO appointments (
        id, service_id, date, time, duration, client_name, client_phone,
        client_email, client_document, notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      appointment.serviceId,
      appointment.date,
      appointment.time,
      appointment.duration,
      appointment.clientName,
      appointment.clientPhone,
      appointment.clientEmail,
      appointment.clientDocument,
      appointment.notes,
      appointment.status,
      createdAt,
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw httpError("Ese horario ya esta ocupado.", 409);
    }
    throw error;
  }

  return appointmentFromRow(db.prepare("SELECT * FROM appointments WHERE id = ?").get(id));
}

function createClient(payload) {
  const client = normalizeClientPayload(payload);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clients (id, name, phone, email, document, address, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, client.name, client.phone, client.email, client.document, client.address, client.notes, now, now);
  return clientFromRow(db.prepare("SELECT * FROM clients WHERE id = ?").get(id));
}

function updateClient(id, payload) {
  const current = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!current) throw httpError("Cliente no encontrado", 404);
  const next = normalizeClientPayload({ ...clientFromRow(current), ...payload });
  db.prepare(
    `UPDATE clients
     SET name = ?, phone = ?, email = ?, document = ?, address = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.name, next.phone, next.email, next.document, next.address, next.notes, new Date().toISOString(), id);
  return clientFromRow(db.prepare("SELECT * FROM clients WHERE id = ?").get(id));
}

function createCase(payload) {
  const item = normalizeCasePayload(payload);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notarial_cases (
      id, client_id, client_name, service_id, title, status, due_date,
      amount_cents, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    item.clientId,
    item.clientName,
    item.serviceId,
    item.title,
    item.status,
    item.dueDate,
    item.amountCents,
    item.notes,
    now,
    now,
  );

  const documents = Array.isArray(payload.documents) && payload.documents.length
    ? payload.documents
    : defaultDocumentsForService(item.serviceId);
  const insertDocument = db.prepare(
    "INSERT INTO case_documents (id, case_id, label, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  documents.forEach((document) => {
    const label = limitText(typeof document === "string" ? document : document.label, 90);
    if (!label) return;
    insertDocument.run(randomUUID(), id, label, "pending", "", now);
  });

  return caseFromRow(db.prepare("SELECT * FROM notarial_cases WHERE id = ?").get(id));
}

function updateCase(id, payload) {
  const current = db.prepare("SELECT * FROM notarial_cases WHERE id = ?").get(id);
  if (!current) throw httpError("Tramite no encontrado", 404);
  const currentCase = caseFromRow(current);
  const item = normalizeCasePayload({ ...currentCase, ...payload });
  db.prepare(
    `UPDATE notarial_cases
     SET client_id = ?, client_name = ?, service_id = ?, title = ?, status = ?,
         due_date = ?, amount_cents = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    item.clientId,
    item.clientName,
    item.serviceId,
    item.title,
    item.status,
    item.dueDate,
    item.amountCents,
    item.notes,
    new Date().toISOString(),
    id,
  );
  return caseFromRow(db.prepare("SELECT * FROM notarial_cases WHERE id = ?").get(id));
}

function updateCaseDocument(id, payload) {
  const current = db.prepare("SELECT * FROM case_documents WHERE id = ?").get(id);
  if (!current) throw httpError("Documento no encontrado", 404);
  const status = String(payload.status || current.status).trim();
  if (!["pending", "received", "not_needed"].includes(status)) throw httpError("Estado de documento invalido", 400);
  const notes = Object.prototype.hasOwnProperty.call(payload, "notes") ? limitText(payload.notes, 300) : current.notes;
  db.prepare("UPDATE case_documents SET status = ?, notes = ? WHERE id = ?").run(status, notes, id);
  return caseDocumentFromRow(db.prepare("SELECT * FROM case_documents WHERE id = ?").get(id));
}

function createPaymentRequest(payload) {
  const payment = normalizePaymentRequestPayload(payload);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO payment_requests (
      id, client_id, case_id, client_name, concept, due_date,
      amount_cents, status, notes, created_at, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    payment.clientId,
    payment.caseId,
    payment.clientName,
    payment.concept,
    payment.dueDate,
    payment.amountCents,
    payment.status,
    payment.notes,
    createdAt,
    null,
  );
  return paymentRequestFromRow(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id));
}

function updatePaymentRequest(id, payload) {
  const current = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id);
  if (!current) throw httpError("Pago pendiente no encontrado", 404);
  const currentPayment = paymentRequestFromRow(current);
  const payment = normalizePaymentRequestPayload({ ...currentPayment, ...payload });
  const paidAt = payment.status === "paid" ? payload.paidAt || current.paid_at || new Date().toISOString() : null;

  db.prepare(
    `UPDATE payment_requests
     SET client_id = ?, case_id = ?, client_name = ?, concept = ?, due_date = ?,
         amount_cents = ?, status = ?, notes = ?, paid_at = ?
     WHERE id = ?`,
  ).run(
    payment.clientId,
    payment.caseId,
    payment.clientName,
    payment.concept,
    payment.dueDate,
    payment.amountCents,
    payment.status,
    payment.notes,
    paidAt,
    id,
  );

  return paymentRequestFromRow(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id));
}

function updateAppointmentStatus(id, status) {
  if (!VALID_STATUSES.has(status)) {
    throw httpError("Estado invalido", 400);
  }

  db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, id);
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
  if (!row) throw httpError("Cita no encontrada", 404);
  return appointmentFromRow(row);
}

function importLocalData(payload) {
  if (payload.settings) {
    saveSettings(payload.settings);
    const blocked = Array.isArray(payload.settings.blocked) ? payload.settings.blocked : [];
    const insertBlocked = db.prepare("INSERT OR IGNORE INTO blocked_slots (id, date, time) VALUES (?, ?, ?)");
    blocked.forEach((item) => {
      if (item.date && item.time) insertBlocked.run(randomUUID(), item.date, item.time);
    });
  }

  const appointments = Array.isArray(payload.appointments) ? payload.appointments : [];
  const insertAppointment = db.prepare(
    `INSERT OR IGNORE INTO appointments (
      id, service_id, date, time, duration, client_name, client_phone,
      client_email, client_document, notes, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  appointments.forEach((appointment) => {
    if (!appointment.clientName || !appointment.clientPhone || !appointment.date || !appointment.time) return;
    insertAppointment.run(
      appointment.id || randomUUID(),
      appointment.serviceId || "consulta",
      appointment.date,
      appointment.time,
      Number(appointment.duration || 30),
      appointment.clientName.trim(),
      appointment.clientPhone.trim(),
      (appointment.clientEmail || "").trim(),
      (appointment.clientDocument || "").trim(),
      (appointment.notes || "").trim(),
      appointment.status || "pending",
      appointment.createdAt || new Date().toISOString(),
    );
  });
}

function createReminder(payload) {
  const reminder = normalizeReminderPayload(payload);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO reminders (id, title, message, due_at, appointment_id, status, created_at, notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    reminder.title,
    reminder.message,
    reminder.dueAt,
    reminder.appointmentId,
    reminder.status,
    createdAt,
    null,
  );

  return reminderFromRow(db.prepare("SELECT * FROM reminders WHERE id = ?").get(id));
}

function createCashTransaction(payload) {
  const transaction = normalizeCashTransactionPayload(payload);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO cash_transactions (
      id, type, date, amount_cents, category, concept, payment_method,
      party, notes, appointment_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    transaction.type,
    transaction.date,
    transaction.amountCents,
    transaction.category,
    transaction.concept,
    transaction.paymentMethod,
    transaction.party,
    transaction.notes,
    transaction.appointmentId,
    createdAt,
  );

  return cashTransactionFromRow(db.prepare("SELECT * FROM cash_transactions WHERE id = ?").get(id));
}

function createMonthlyClosure(payload) {
  const month = normalizeMonth(payload.month);
  const notes = limitText(payload.notes, 500);
  const totals = getCashTotalsForMonth(month);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare("DELETE FROM monthly_closures WHERE month = ?").run(month);
  db.prepare(
    `INSERT INTO monthly_closures (
      id, month, income_cents, expense_cents, balance_cents,
      transaction_count, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    month,
    totals.incomeCents,
    totals.expenseCents,
    totals.incomeCents - totals.expenseCents,
    totals.transactionCount,
    notes,
    createdAt,
  );

  return monthlyClosureFromRow(db.prepare("SELECT * FROM monthly_closures WHERE id = ?").get(id));
}

function getCashTotalsForMonth(month) {
  const { start, end } = getMonthRange(month);
  const rows = db
    .prepare(
      `SELECT type, amount_cents
       FROM cash_transactions
       WHERE date >= ? AND date < ?`,
    )
    .all(start, end);

  return rows.reduce(
    (totals, row) => {
      if (row.type === "income") totals.incomeCents += row.amount_cents;
      if (row.type === "expense") totals.expenseCents += row.amount_cents;
      totals.transactionCount += 1;
      return totals;
    },
    { incomeCents: 0, expenseCents: 0, transactionCount: 0 },
  );
}

function updateReminder(id, payload) {
  const current = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
  if (!current) throw httpError("Recordatorio no encontrado", 404);

  const next = {
    title: Object.prototype.hasOwnProperty.call(payload, "title") ? limitText(payload.title, 100) : current.title,
    message: Object.prototype.hasOwnProperty.call(payload, "message") ? limitText(payload.message, 500) : current.message,
    dueAt: Object.prototype.hasOwnProperty.call(payload, "dueAt") ? String(payload.dueAt || "").trim() : current.due_at,
    appointmentId: Object.prototype.hasOwnProperty.call(payload, "appointmentId")
      ? limitText(payload.appointmentId, 80) || null
      : current.appointment_id,
    status: Object.prototype.hasOwnProperty.call(payload, "status") ? String(payload.status || "").trim() : current.status,
    notifiedAt: Object.prototype.hasOwnProperty.call(payload, "notifiedAt")
      ? payload.notifiedAt || null
      : current.notified_at,
  };

  validateReminder(next);

  db.prepare(
    `UPDATE reminders
     SET title = ?, message = ?, due_at = ?, appointment_id = ?, status = ?, notified_at = ?
     WHERE id = ?`,
  ).run(next.title, next.message, next.dueAt, next.appointmentId, next.status, next.notifiedAt, id);

  return reminderFromRow(db.prepare("SELECT * FROM reminders WHERE id = ?").get(id));
}

function appointmentFromRow(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    date: row.date,
    time: row.time,
    duration: row.duration,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    clientDocument: row.client_document,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  };
}

function reminderFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    dueAt: row.due_at,
    appointmentId: row.appointment_id,
    status: row.status,
    createdAt: row.created_at,
    notifiedAt: row.notified_at,
  };
}

function clientFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    document: row.document,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function caseFromRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    serviceId: row.service_id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    amount: centsToAmount(row.amount_cents),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function caseDocumentFromRow(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    label: row.label,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function paymentRequestFromRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    caseId: row.case_id,
    clientName: row.client_name,
    concept: row.concept,
    dueDate: row.due_date,
    amount: centsToAmount(row.amount_cents),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function cashTransactionFromRow(row) {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    amount: centsToAmount(row.amount_cents),
    category: row.category,
    concept: row.concept,
    paymentMethod: row.payment_method,
    party: row.party,
    notes: row.notes,
    appointmentId: row.appointment_id,
    createdAt: row.created_at,
  };
}

function monthlyClosureFromRow(row) {
  return {
    id: row.id,
    month: row.month,
    income: centsToAmount(row.income_cents),
    expense: centsToAmount(row.expense_cents),
    balance: centsToAmount(row.balance_cents),
    transactionCount: row.transaction_count,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function requireText(value, message) {
  if (!String(value || "").trim()) throw httpError(message, 400);
}

function normalizeAppointmentPayload(payload) {
  const serviceId = String(payload.serviceId || "consulta").trim();
  const date = String(payload.date || "").trim();
  const time = String(payload.time || "").trim();
  const duration = Number(payload.duration || 30);
  const status = String(payload.status || "pending").trim();
  const clientName = limitText(payload.clientName, 90);
  const clientPhone = limitText(payload.clientPhone, 50);
  const clientEmail = limitText(payload.clientEmail, 120);
  const clientDocument = limitText(payload.clientDocument, 40);
  const notes = limitText(payload.notes, 1000);

  requireText(clientName, "Nombre requerido");
  requireText(clientPhone, "Telefono requerido");
  validateDateTime(date, time);

  if (!SERVICE_IDS.has(serviceId)) throw httpError("Tramite invalido", 400);
  if (!VALID_DURATIONS.has(duration)) throw httpError("Duracion invalida", 400);
  if (!VALID_STATUSES.has(status)) throw httpError("Estado invalido", 400);
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    throw httpError("Email invalido", 400);
  }

  return { serviceId, date, time, duration, clientName, clientPhone, clientEmail, clientDocument, notes, status };
}

function normalizeReminderPayload(payload) {
  const reminder = {
    title: limitText(payload.title, 100),
    message: limitText(payload.message, 500),
    dueAt: String(payload.dueAt || "").trim(),
    appointmentId: limitText(payload.appointmentId, 80) || null,
    status: String(payload.status || "active").trim(),
  };
  validateReminder(reminder);
  return reminder;
}

function normalizeClientPayload(payload) {
  const client = {
    name: limitText(payload.name || payload.clientName, 100),
    phone: limitText(payload.phone || payload.clientPhone, 50),
    email: limitText(payload.email || payload.clientEmail, 120),
    document: limitText(payload.document || payload.clientDocument, 40),
    address: limitText(payload.address, 160),
    notes: limitText(payload.notes, 900),
  };
  requireText(client.name, "Nombre de cliente requerido");
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) {
    throw httpError("Email de cliente invalido", 400);
  }
  return client;
}

function normalizeCasePayload(payload) {
  const serviceId = String(payload.serviceId || "consulta").trim();
  const status = String(payload.status || "started").trim();
  const dueDate = String(payload.dueDate || "").trim();
  const amount = Number(payload.amount || 0);
  const item = {
    clientId: limitText(payload.clientId, 80) || null,
    clientName: limitText(payload.clientName, 100),
    serviceId,
    title: limitText(payload.title, 140),
    status,
    dueDate,
    amountCents: Math.round((Number.isFinite(amount) && amount > 0 ? amount : 0) * 100),
    notes: limitText(payload.notes, 900),
  };

  requireText(item.clientName, "Cliente del tramite requerido");
  requireText(item.title, "Titulo del tramite requerido");
  if (!SERVICE_IDS.has(item.serviceId)) throw httpError("Tipo de tramite invalido", 400);
  if (!VALID_CASE_STATUSES.has(item.status)) throw httpError("Estado de tramite invalido", 400);
  if (item.dueDate) validateDate(item.dueDate);
  return item;
}

function normalizePaymentRequestPayload(payload) {
  const amount = Number(payload.amount);
  const status = String(payload.status || "pending").trim();
  const payment = {
    clientId: limitText(payload.clientId, 80) || null,
    caseId: limitText(payload.caseId, 80) || null,
    clientName: limitText(payload.clientName, 100),
    concept: limitText(payload.concept, 140),
    dueDate: String(payload.dueDate || "").trim(),
    amountCents: Math.round(amount * 100),
    status,
    notes: limitText(payload.notes, 700),
  };

  requireText(payment.clientName, "Cliente del pago requerido");
  requireText(payment.concept, "Concepto del pago requerido");
  validateDate(payment.dueDate);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError("Importe de pago invalido", 400);
  if (!VALID_PAYMENT_STATUSES.has(payment.status)) throw httpError("Estado de pago invalido", 400);
  return payment;
}

function normalizeCashTransactionPayload(payload) {
  const type = String(payload.type || "").trim();
  const date = String(payload.date || "").trim();
  const amount = Number(payload.amount);
  const category = limitText(payload.category, 80);
  const concept = limitText(payload.concept, 140);
  const paymentMethod = limitText(payload.paymentMethod, 60);
  const party = limitText(payload.party, 100);
  const notes = limitText(payload.notes, 800);
  const appointmentId = limitText(payload.appointmentId, 80) || null;

  if (!VALID_CASH_TYPES.has(type)) throw httpError("Tipo de movimiento invalido", 400);
  validateDate(date);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError("Importe invalido", 400);
  requireText(category, "Categoria requerida");
  requireText(concept, "Concepto requerido");

  return {
    type,
    date,
    amountCents: Math.round(amount * 100),
    category,
    concept,
    paymentMethod,
    party,
    notes,
    appointmentId,
  };
}

function validateReminder(reminder) {
  requireText(reminder.title, "Titulo de recordatorio requerido");
  requireText(reminder.dueAt, "Fecha y hora de recordatorio requerida");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(reminder.dueAt))) {
    throw httpError("Fecha de recordatorio invalida", 400);
  }
  if (!["active", "done", "dismissed"].includes(reminder.status)) {
    throw httpError("Estado de recordatorio invalido", 400);
  }
}

function validateDateTime(date, time) {
  validateDate(date);
  requireText(time, "Hora requerida");
  if (!/^\d{2}:\d{2}$/.test(String(time))) throw httpError("Hora invalida", 400);
}

function validateDate(date) {
  requireText(date, "Fecha requerida");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw httpError("Fecha invalida", 400);
}

function normalizeMonth(month) {
  const value = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(value)) throw httpError("Mes invalido", 400);
  return value;
}

function validateSettings(payload) {
  ["startHour", "endHour", "breakStart", "breakEnd"].forEach((key) => {
    if (payload[key] && !/^\d{2}:\d{2}$/.test(String(payload[key]))) {
      throw httpError("Horario invalido", 400);
    }
  });

  if (payload.weekdays && !Array.isArray(payload.weekdays)) {
    throw httpError("Dias habiles invalidos", 400);
  }
}

function limitText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function centsToAmount(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function getMonthRange(month) {
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function upsertClientFromAppointment(appointment) {
  const client = normalizeClientPayload({
    name: appointment.clientName,
    phone: appointment.clientPhone,
    email: appointment.clientEmail,
    document: appointment.clientDocument,
    notes: appointment.notes,
  });
  const now = new Date().toISOString();
  const existing = client.document
    ? db.prepare("SELECT * FROM clients WHERE document = ?").get(client.document)
    : db.prepare("SELECT * FROM clients WHERE name = ? AND phone = ?").get(client.name, client.phone);

  if (existing) {
    db.prepare(
      `UPDATE clients
       SET name = ?, phone = ?, email = ?, document = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      client.name,
      client.phone || existing.phone,
      client.email || existing.email,
      client.document || existing.document,
      client.notes || existing.notes,
      now,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO clients (id, name, phone, email, document, address, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, client.name, client.phone, client.email, client.document, "", client.notes, now, now);
  return id;
}

function defaultDocumentsForService(serviceId) {
  const common = ["Cedula vigente", "Datos de contacto", "Comprobante de pago"];
  const byService = {
    compraventa: ["Datos del inmueble", "Titulo antecedente", "Certificados registrales", "Borrador de escritura"],
    certificacion: ["Documento a firmar", "Cedula del firmante"],
    poder: ["Datos del poderdante", "Datos del apoderado", "Alcance del poder"],
    sociedades: ["Datos de socios", "Estatuto o contrato", "Acta o resolucion"],
    sucesiones: ["Partida de defuncion", "Partidas familiares", "Certificado de actos personales"],
    consulta: ["Resumen del asunto", "Documentacion relacionada"],
  };
  return [...common, ...(byService[serviceId] || byService.consulta)];
}

function isBlocked(date, time) {
  return Boolean(db.prepare("SELECT 1 FROM blocked_slots WHERE date = ? AND time = ?").get(date, time));
}

function isActiveAppointmentSlotTaken(date, time) {
  return Boolean(
    db.prepare("SELECT 1 FROM appointments WHERE date = ? AND time = ? AND status != 'cancelled'").get(date, time),
  );
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response, payload, status = 200) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const normalizedSafePath = normalize(safePath).replaceAll("\\", "/");
  if (!STATIC_FILES.has(normalizedSafePath)) {
    response.writeHead(404);
    response.end("No encontrado");
    return;
  }

  const filePath = resolve(ROOT, normalize(normalizedSafePath));

  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("No encontrado");
    return;
  }

  const body = readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    "Content-Length": body.length,
  });
  response.end(body);
}

function createStartupBackup() {
  if (!existsSync(DB_PATH) || statSync(DB_PATH).size === 0) return;

  mkdirSync(BACKUP_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const backupPath = join(BACKUP_DIR, `agenda_${today}.db`);
  if (!existsSync(backupPath)) {
    copyFileSync(DB_PATH, backupPath);
  }
}

function createManualBackup() {
  if (!existsSync(DB_PATH)) {
    throw httpError("Todavia no existe una base de datos para respaldar.", 404);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupPath = join(BACKUP_DIR, `agenda_manual_${timestamp}.db`);
  copyFileSync(DB_PATH, backupPath);
  return { ok: true, path: backupPath, fileName: backupPath.split(/[\\/]/).pop() };
}

function prepareDataDirectory() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!process.env.DB_PATH && !existsSync(DB_PATH) && existsSync(LEGACY_DB_PATH)) {
    copyFileSync(LEGACY_DB_PATH, DB_PATH);
  }
}

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});
