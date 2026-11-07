const API = "/api";
const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const showMessage = (element, message, type = "success") => {
  if (!element) return;
  element.textContent = message;
  element.className = "form-message " + type;
};
async function api(url, options = {}) {
  const response = await fetch(API + url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

function hallCard(hall) {
  return `<article class="hall-card">
    <div class="hall-card-image"><span class="hall-tag">${escapeHTML(hall.status)}</span><span class="hall-card-number">VENUE / ${String(hall.hall_id).padStart(2, "0")}</span></div>
    <div class="hall-card-body"><p class="hall-location">⌖ ${escapeHTML(hall.location)}</p><h3>${escapeHTML(hall.hall_name)}</h3>
      <div class="hall-meta"><span>♧ ${Number(hall.capacity).toLocaleString("en-IN")} guests</span><strong>${money(hall.price)}</strong></div>
      <p class="hall-facilities">${escapeHTML(hall.facilities || "Facilities details available on request")}</p>
      <a class="text-link" href="booking.html?hall=${hall.hall_id}">Enquire / book ↗</a>
    </div></article>`;
}

async function loadFeatured() {
  const container = document.getElementById("featuredHalls");
  if (!container) return;
  try {
    const halls = await api("/halls");
    container.innerHTML = halls.slice(0, 3).map(hallCard).join("") || "<p>No halls added yet.</p>";
  } catch (error) { container.innerHTML = `<p class="error-text">${escapeHTML(error.message)}</p>`; }
}

let allHalls = [];
async function loadHallListing() {
  const container = document.getElementById("hallList");
  if (!container) return;
  try {
    allHalls = await api("/halls");
    renderHallListing();
  } catch (error) { container.innerHTML = `<p class="error-text">${escapeHTML(error.message)}</p>`; }
}
function renderHallListing() {
  const container = document.getElementById("hallList");
  if (!container) return;
  const search = (document.getElementById("hallSearch")?.value || "").toLowerCase();
  const capacity = Number(document.getElementById("capacityFilter")?.value || 0);
  const filtered = allHalls.filter(h => (h.hall_name + " " + h.location).toLowerCase().includes(search) && Number(h.capacity) >= capacity);
  container.innerHTML = filtered.map(hallCard).join("") || '<div class="empty-state">No halls match your search. Try another location or capacity.</div>';
}

async function setupBooking() {
  const form = document.getElementById("bookingForm");
  if (!form) return;
  const hallSelect = document.getElementById("bookingHall");
  const info = document.getElementById("bookingHallInfo");
  const message = document.getElementById("bookingMessage");
  const dateInput = form.elements.event_date;
  dateInput.min = new Date().toISOString().split("T")[0];
  try {
    const halls = await api("/halls");
    hallSelect.innerHTML = '<option value="">Choose a hall</option>' + halls.filter(h => h.status === "Available").map(h =>
      `<option value="${h.hall_id}" data-capacity="${h.capacity}" data-price="${h.price}">${escapeHTML(h.hall_name)} — ${escapeHTML(h.location)}</option>`
    ).join("");
    const requested = new URLSearchParams(location.search).get("hall");
    if (requested) hallSelect.value = requested;
    updateHallInfo();
  } catch (error) { showMessage(message, error.message, "error"); }
  function updateHallInfo() {
    const option = hallSelect.selectedOptions[0];
    if (!option || !option.value) { info.textContent = "Select a hall to view its capacity and price."; return; }
    info.textContent = `Capacity: ${option.dataset.capacity} guests  ·  Hall price: ${money(option.dataset.price)}`;
  }
  hallSelect.addEventListener("change", updateHallInfo);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.guests = Number(data.guests);
    try {
      const result = await api("/bookings", { method: "POST", body: JSON.stringify(data) });
      showMessage(message, `${result.message} Your Booking ID is ${result.booking_id}. Estimated hall amount: ${money(result.total_amount)}. Save this ID to view payment details.`, "success");
      form.reset();
      dateInput.min = new Date().toISOString().split("T")[0];
      hallSelect.value = "";
      updateHallInfo();
    } catch (error) { showMessage(message, error.message, "error"); }
  });
}

function setupPayments() {
  const form = document.getElementById("paymentLookup");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.booking_id.value;
    const results = document.getElementById("paymentResults");
    results.innerHTML = '<p class="muted">Loading payment details...</p>';
    try {
      const rows = await api(`/payments/${encodeURIComponent(id)}`);
      if (!rows.length) {
        results.innerHTML = '<div class="empty-state">No payment record found for this booking yet. Payment records are added by the administrator.</div>';
        return;
      }
      results.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Payment ID</th><th>Booking ID</th><th>Customer</th><th>Hall</th><th>Event</th><th>Amount</th><th>Payment date</th><th>Status</th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.payment_id}</td><td>${p.booking_id}</td><td>${escapeHTML(p.customer_name)}</td><td>${escapeHTML(p.hall_name)}</td><td>${escapeHTML(p.event_name)}</td><td>${money(p.amount)}</td><td>${escapeHTML(p.payment_date)}</td><td><span class="status-pill">${escapeHTML(p.payment_status)}</span></td></tr>`).join("")}</tbody></table></div>`;
    } catch (error) { results.innerHTML = `<p class="error-text">${escapeHTML(error.message)}</p>`; }
  });
}

async function setupAdmin() {
  const loginForm = document.getElementById("adminLogin");
  if (!loginForm) return;
  const dashboard = document.getElementById("adminDashboard");
  const loginMessage = document.getElementById("loginMessage");

  async function checkSession() {
    try {
      const result = await api("/admin/session");
      if (result.isAdmin) {
        loginForm.classList.add("hidden");
        dashboard.classList.remove("hidden");
        await loadDashboard();
      }
    } catch (_) {}
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credentials = Object.fromEntries(new FormData(loginForm).entries());
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      showMessage(loginMessage, "Login successful. Loading dashboard...");
      loginForm.classList.add("hidden");
      dashboard.classList.remove("hidden");
      await loadDashboard();
    } catch (error) { showMessage(loginMessage, error.message, "error"); }
  });

  document.getElementById("adminLogout").addEventListener("click", async () => {
    await api("/admin/logout", { method: "POST", body: "{}" });
    dashboard.classList.add("hidden");
    loginForm.classList.remove("hidden");
    loginForm.reset();
    showMessage(loginMessage, "You have been logged out.");
  });

  document.getElementById("hallForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.hall_id;
    delete data.hall_id;
    try {
      if (id) await api(`/admin/halls/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/admin/halls", { method: "POST", body: JSON.stringify(data) });
      showMessage(document.getElementById("hallAdminMessage"), id ? "Hall updated." : "Hall added.");
      form.reset();
      form.elements.hall_id.value = "";
      await loadDashboard();
    } catch (error) { showMessage(document.getElementById("hallAdminMessage"), error.message, "error"); }
  });

  document.getElementById("clearHallForm").addEventListener("click", () => {
    const form = document.getElementById("hallForm");
    form.reset(); form.elements.hall_id.value = "";
  });

  document.getElementById("paymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/admin/payments", { method: "POST", body: JSON.stringify(data) });
      showMessage(document.getElementById("paymentAdminMessage"), "Payment record saved.");
      event.currentTarget.reset();
      await loadDashboard();
    } catch (error) { showMessage(document.getElementById("paymentAdminMessage"), error.message, "error"); }
  });

  async function loadDashboard() {
    const [halls, bookings, customers, payments] = await Promise.all([
      api("/halls"), api("/admin/bookings"), api("/admin/customers"), api("/admin/payments")
    ]);
    document.getElementById("statHalls").textContent = halls.length;
    document.getElementById("statBookings").textContent = bookings.length;
    document.getElementById("statCustomers").textContent = customers.length;
    document.getElementById("statPayments").textContent = payments.length;

    document.getElementById("adminHallList").innerHTML = tableHTML(
      ["ID", "Hall", "Location", "Capacity", "Price", "Status", "Actions"],
      halls.map(h => [h.hall_id, escapeHTML(h.hall_name), escapeHTML(h.location), h.capacity, money(h.price), escapeHTML(h.status),
        `<button class="table-action" data-edit-hall="${h.hall_id}">Edit</button> <button class="table-action danger" data-delete-hall="${h.hall_id}">Delete</button>`])
    );
    document.getElementById("adminBookingList").innerHTML = tableHTML(
      ["ID", "Customer", "Hall", "Event", "Date", "Time", "Amount", "Status"],
      bookings.map(b => [b.booking_id, escapeHTML(b.customer_name), escapeHTML(b.hall_name), escapeHTML(b.event_name), escapeHTML(b.event_date), `${escapeHTML(b.start_time)} – ${escapeHTML(b.end_time)}`, money(b.total_amount),
        `<select class="status-select" data-booking-status="${b.booking_id}">${["Pending","Confirmed","Cancelled","Completed"].map(s => `<option ${b.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>`])
    );
    document.getElementById("adminPaymentList").innerHTML = tableHTML(
      ["Payment ID", "Booking ID", "Customer", "Hall", "Event", "Amount", "Date", "Status"],
      payments.map(p => [p.payment_id, p.booking_id, escapeHTML(p.customer_name), escapeHTML(p.hall_name), escapeHTML(p.event_name), money(p.amount), escapeHTML(p.payment_date), escapeHTML(p.payment_status)])
    );
    document.getElementById("adminCustomerList").innerHTML = tableHTML(
      ["ID", "Name", "Email", "Phone", "Address"],
      customers.map(c => [c.customer_id, escapeHTML(c.name), escapeHTML(c.email), escapeHTML(c.phone), escapeHTML(c.address || "—")])
    );

    document.querySelectorAll("[data-edit-hall]").forEach(button => button.addEventListener("click", () => {
      const hall = halls.find(h => h.hall_id === Number(button.dataset.editHall));
      const form = document.getElementById("hallForm");
      for (const key of ["hall_id", "hall_name", "location", "capacity", "price", "facilities", "status"]) form.elements[key].value = hall[key] ?? "";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
    document.querySelectorAll("[data-delete-hall]").forEach(button => button.addEventListener("click", async () => {
      if (!confirm("Delete this hall? A hall with bookings cannot be deleted.")) return;
      try { await api(`/admin/halls/${button.dataset.deleteHall}`, { method: "DELETE" }); await loadDashboard(); }
      catch (error) { alert(error.message); }
    }));
    document.querySelectorAll("[data-booking-status]").forEach(select => select.addEventListener("change", async () => {
      try { await api(`/admin/bookings/${select.dataset.bookingStatus}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); }
      catch (error) { alert(error.message); }
    }));
  }
  function tableHTML(headers, rows) {
    if (!rows.length) return '<p class="muted table-empty">No records available.</p>';
    return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  await checkSession();
}

document.addEventListener("DOMContentLoaded", () => {
  loadFeatured();
  loadHallListing();
  setupBooking();
  setupPayments();
  setupAdmin();
  document.getElementById("hallSearch")?.addEventListener("input", renderHallListing);
  document.getElementById("capacityFilter")?.addEventListener("change", renderHallListing);
});