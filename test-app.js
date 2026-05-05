const assert = require("node:assert/strict");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8000";

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function run() {
  await waitForServer();

  const html = await request("/", { raw: true });
  assert.match(html, /Escribano Martin Acosta/);
  assert.match(html, /assets\/agenda-logo\.png/);

  const logo = await fetch(`${BASE_URL}/assets/agenda-logo.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/png");

  const blockedDbDownload = await fetch(`${BASE_URL}/agenda_martin_acosta.db`);
  assert.equal(blockedDbDownload.status, 404);

  const initialState = await request("/api/state");
  assert.equal(initialState.settings.startHour, "09:00");
  assert.equal(initialState.appointments.length, 0);
  assert.equal(initialState.reminders.length, 0);
  assert.equal(initialState.cashTransactions.length, 0);
  assert.equal(initialState.monthlyClosures.length, 0);
  assert.equal(initialState.meta.databaseReady, true);

  const missingName = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2030-01-08", time: "10:00", clientPhone: "099" }),
  });
  assert.equal(missingName.status, 400);

  const appointment = await request("/api/appointments", {
    method: "POST",
    body: {
      serviceId: "consulta",
      date: "2030-01-08",
      time: "10:00",
      duration: 30,
      clientName: "Cliente Test",
      clientPhone: "099 000 000",
      clientEmail: "cliente@test.com",
      clientDocument: "12345678",
      notes: "Prueba automatizada",
      status: "pending",
    },
  });
  assert.equal(appointment.clientName, "Cliente Test");

  const duplicate = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceId: "consulta",
      date: "2030-01-08",
      time: "10:00",
      duration: 30,
      clientName: "Otro Cliente",
      clientPhone: "099 111 111",
    }),
  });
  assert.equal(duplicate.status, 409);

  const confirmed = await request(`/api/appointments/${appointment.id}`, {
    method: "PATCH",
    body: { status: "confirmed" },
  });
  assert.equal(confirmed.status, "confirmed");

  await request("/api/settings", {
    method: "PUT",
    body: {
      startHour: "08:30",
      endHour: "17:30",
      breakStart: "12:30",
      breakEnd: "13:30",
      weekdays: [1, 2, 3, 4, 5, 6],
    },
  });

  await request(`/api/appointments/${appointment.id}`, { method: "DELETE", noJson: true });

  const blocked = await request("/api/blocked", {
    method: "POST",
    body: { date: "2030-01-08", time: "10:00" },
  });
  assert.equal(blocked.length, 1);

  await request(`/api/blocked/${blocked[0].id}`, { method: "DELETE" });

  const reminder = await request("/api/reminders", {
    method: "POST",
    body: {
      title: "Llamar cliente",
      message: "Confirmar documentacion",
      dueAt: "2030-01-08T09:00",
      status: "active",
    },
  });
  assert.equal(reminder.title, "Llamar cliente");

  const notified = await request(`/api/reminders/${reminder.id}`, {
    method: "PATCH",
    body: { notifiedAt: "2030-01-08T09:00:00.000Z" },
  });
  assert.equal(notified.notifiedAt, "2030-01-08T09:00:00.000Z");

  const doneReminder = await request(`/api/reminders/${reminder.id}`, {
    method: "PATCH",
    body: { status: "done" },
  });
  assert.equal(doneReminder.status, "done");

  await request(`/api/reminders/${reminder.id}`, { method: "DELETE", noJson: true });

  const income = await request("/api/cash-transactions", {
    method: "POST",
    body: {
      type: "income",
      date: "2030-01-08",
      amount: 2500,
      category: "Firma",
      concept: "Pago de certificacion",
      paymentMethod: "Efectivo",
      party: "Cliente Test",
      notes: "Caja automatizada",
    },
  });
  assert.equal(income.type, "income");
  assert.equal(income.amount, 2500);

  const expense = await request("/api/cash-transactions", {
    method: "POST",
    body: {
      type: "expense",
      date: "2030-01-09",
      amount: 700,
      category: "Tasas y timbres",
      concept: "Compra de timbres",
      paymentMethod: "Transferencia",
    },
  });
  assert.equal(expense.type, "expense");

  const invalidCash = await fetch(`${BASE_URL}/api/cash-transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "income", date: "2030-01-09", amount: -10, category: "Firma", concept: "Mal" }),
  });
  assert.equal(invalidCash.status, 400);

  const closure = await request("/api/monthly-closures", {
    method: "POST",
    body: { month: "2030-01" },
  });
  assert.equal(closure.income, 2500);
  assert.equal(closure.expense, 700);
  assert.equal(closure.balance, 1800);
  assert.equal(closure.transactionCount, 2);

  await request(`/api/monthly-closures/${closure.id}`, { method: "DELETE", noJson: true });
  await request(`/api/cash-transactions/${income.id}`, { method: "DELETE", noJson: true });
  await request(`/api/cash-transactions/${expense.id}`, { method: "DELETE", noJson: true });

  const backup = await request("/api/backup", { method: "POST" });
  assert.equal(backup.ok, true);
  assert.match(backup.fileName, /^agenda_manual_/);

  const finalState = await request("/api/state");
  assert.equal(finalState.appointments.length, 0);
  assert.equal(finalState.reminders.length, 0);
  assert.equal(finalState.cashTransactions.length, 0);
  assert.equal(finalState.monthlyClosures.length, 0);

  console.log("OK - pruebas completas de agenda, caja, cierres, dashboards, API, base, recordatorios y seguridad estatica.");
}

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/state`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`El servidor no respondio en ${BASE_URL}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${path} respondio ${response.status}: ${await response.text()}`);
  }

  if (options.noJson || response.status === 204) return null;
  if (options.raw) return response.text();
  return response.json();
}
