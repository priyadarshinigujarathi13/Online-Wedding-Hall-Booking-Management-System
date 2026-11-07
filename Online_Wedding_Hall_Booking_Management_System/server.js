require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "wedding-hall-lab-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" }
  })
);

app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "wedding_hall_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ message: "Please log in as administrator." });
}

function validTimeRange(start, end) {
  return start && end && start < end;
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ message: "Server and MySQL connection are working." });
  } catch (error) {
    res.status(500).json({ message: "Database connection failed.", error: error.message });
  }
});

// HALLS
app.get("/api/halls", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM halls ORDER BY hall_id DESC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch halls.", error: error.message });
  }
});

app.get("/api/halls/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM halls WHERE hall_id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Hall not found." });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch hall.", error: error.message });
  }
});

// Check date and time availability. Overlapping reservations are excluded.
app.get("/api/availability", async (req, res) => {
  const { date, start_time, end_time, guests } = req.query;
  if (!date || !start_time || !end_time || !validTimeRange(start_time, end_time)) {
    return res.status(400).json({ message: "Choose a date, start time and end time. End time must be later." });
  }
  try {
    const [rows] = await pool.query(
      `SELECT h.* FROM halls h
       WHERE h.status = 'Available'
         AND h.capacity >= ?
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.hall_id = h.hall_id
             AND b.event_date = ?
             AND b.status IN ('Pending', 'Confirmed')
             AND b.start_time < ?
             AND b.end_time > ?
         )
       ORDER BY h.price ASC`,
      [Number(guests || 1), date, end_time, start_time]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Availability check failed.", error: error.message });
  }
});

// CUSTOMER REGISTRATION
app.post("/api/customers", async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ message: "Name, email and phone are required." });
  }
  try {
    const [result] = await pool.query(
      "INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
      [name.trim(), email.trim(), phone.trim(), address || null]
    );
    res.status(201).json({ message: "Customer registered successfully.", customer_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "This email is already registered." });
    res.status(500).json({ message: "Customer registration failed.", error: error.message });
  }
});

// CREATE BOOKING
app.post("/api/bookings", async (req, res) => {
  const { name, email, phone, address, hall_id, event_name, event_date, start_time, end_time, guests } = req.body;
  if (!name || !email || !phone || !hall_id || !event_name || !event_date || !start_time || !end_time) {
    return res.status(400).json({ message: "Please fill all required booking details." });
  }
  if (!validTimeRange(start_time, end_time)) {
    return res.status(400).json({ message: "End time must be later than start time." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [customerRows] = await connection.query("SELECT customer_id FROM customers WHERE email = ?", [email.trim()]);
    let customerId;
    if (customerRows.length) {
      customerId = customerRows[0].customer_id;
      await connection.query(
        "UPDATE customers SET name = ?, phone = ?, address = ? WHERE customer_id = ?",
        [name.trim(), phone.trim(), address || null, customerId]
      );
    } else {
      const [customerResult] = await connection.query(
        "INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
        [name.trim(), email.trim(), phone.trim(), address || null]
      );
      customerId = customerResult.insertId;
    }

    const [hallRows] = await connection.query(
      "SELECT * FROM halls WHERE hall_id = ? AND status = 'Available' FOR UPDATE",
      [hall_id]
    );
    if (!hallRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Selected hall is not available." });
    }
    if (Number(guests || 1) > hallRows[0].capacity) {
      await connection.rollback();
      return res.status(400).json({ message: "Guest count exceeds this hall's capacity." });
    }

    const [conflicts] = await connection.query(
      `SELECT booking_id FROM bookings
       WHERE hall_id = ? AND event_date = ?
         AND status IN ('Pending', 'Confirmed')
         AND start_time < ? AND end_time > ?`,
      [hall_id, event_date, end_time, start_time]
    );
    if (conflicts.length) {
      await connection.rollback();
      return res.status(409).json({ message: "This hall is already booked for the selected time. Please choose another slot." });
    }

    const amount = Number(hallRows[0].price);
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings
       (customer_id, hall_id, event_name, event_date, start_time, end_time, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [customerId, hall_id, event_name.trim(), event_date, start_time, end_time, amount]
    );

    await connection.commit();
    res.status(201).json({
      message: "Booking request submitted successfully.",
      booking_id: bookingResult.insertId,
      total_amount: amount
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: "Booking could not be created.", error: error.message });
  } finally {
    connection.release();
  }
});

// CUSTOMER PAYMENT DETAILS
app.get("/api/payments/:bookingId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, b.event_name, b.event_date, b.total_amount, b.status AS booking_status,
              c.name AS customer_name, h.hall_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN customers c ON b.customer_id = c.customer_id
       JOIN halls h ON b.hall_id = h.hall_id
       WHERE p.booking_id = ? ORDER BY p.payment_id DESC`,
      [req.params.bookingId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch payment details.", error: error.message });
  }
});

// Admin login. Credentials are configured in .env.
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";
  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    return res.json({ message: "Admin login successful." });
  }
  res.status(401).json({ message: "Invalid admin username or password." });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out successfully." }));
});

app.get("/api/admin/session", (req, res) => {
  res.json({ isAdmin: Boolean(req.session && req.session.isAdmin) });
});

// ADMIN: customers, bookings and payments
app.get("/api/admin/customers", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM customers ORDER BY customer_id DESC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch customers." });
  }
});

app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, c.name AS customer_name, c.email, c.phone,
              h.hall_name, h.location
       FROM bookings b
       JOIN customers c ON b.customer_id = c.customer_id
       JOIN halls h ON b.hall_id = h.hall_id
       ORDER BY b.event_date DESC, b.booking_id DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch bookings.", error: error.message });
  }
});

app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["Pending", "Confirmed", "Cancelled", "Completed"].includes(status)) {
    return res.status(400).json({ message: "Invalid booking status." });
  }
  try {
    await pool.query("UPDATE bookings SET status = ? WHERE booking_id = ?", [status, req.params.id]);
    res.json({ message: "Booking status updated." });
  } catch (error) {
    res.status(500).json({ message: "Unable to update booking." });
  }
});

// ADMIN: hall management
app.post("/api/admin/halls", requireAdmin, async (req, res) => {
  const { hall_name, location, capacity, price, facilities, status } = req.body;
  if (!hall_name || !location || !capacity || price === undefined || Number(capacity) <= 0 || Number(price) < 0) {
    return res.status(400).json({ message: "Enter valid hall details." });
  }
  try {
    const [result] = await pool.query(
      "INSERT INTO halls (hall_name, location, capacity, price, facilities, status) VALUES (?, ?, ?, ?, ?, ?)",
      [hall_name, location, Number(capacity), Number(price), facilities || "", status || "Available"]
    );
    res.status(201).json({ message: "Hall added successfully.", hall_id: result.insertId });
  } catch (error) {
    res.status(500).json({ message: "Unable to add hall.", error: error.message });
  }
});

app.put("/api/admin/halls/:id", requireAdmin, async (req, res) => {
  const { hall_name, location, capacity, price, facilities, status } = req.body;
  try {
    const [result] = await pool.query(
      `UPDATE halls SET hall_name=?, location=?, capacity=?, price=?, facilities=?, status=?
       WHERE hall_id=?`,
      [hall_name, location, Number(capacity), Number(price), facilities || "", status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Hall not found." });
    res.json({ message: "Hall updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Unable to update hall.", error: error.message });
  }
});

app.delete("/api/admin/halls/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM halls WHERE hall_id = ?", [req.params.id]);
    res.json({ message: "Hall deleted successfully." });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ message: "This hall has booking records. Change its status to Unavailable instead of deleting it." });
    }
    res.status(500).json({ message: "Unable to delete hall.", error: error.message });
  }
});

// ADMIN: payment records
app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, b.event_name, c.name AS customer_name, h.hall_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN customers c ON b.customer_id = c.customer_id
       JOIN halls h ON b.hall_id = h.hall_id
       ORDER BY p.payment_id DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch payments." });
  }
});

// Admin records a payment (for lab demonstration; no real payment gateway).
app.post("/api/admin/payments", requireAdmin, async (req, res) => {
  const { booking_id, amount, payment_status } = req.body;
  if (!booking_id || amount === undefined || Number(amount) < 0) {
    return res.status(400).json({ message: "Enter a valid booking ID and amount." });
  }
  try {
    const [bookingRows] = await pool.query("SELECT booking_id FROM bookings WHERE booking_id = ?", [booking_id]);
    if (!bookingRows.length) return res.status(404).json({ message: "Booking not found." });
    await pool.query(
      "INSERT INTO payments (booking_id, amount, payment_date, payment_status) VALUES (?, ?, CURDATE(), ?)",
      [booking_id, Number(amount), payment_status || "Pending"]
    );
    res.status(201).json({ message: "Payment record added successfully." });
  } catch (error) {
    res.status(500).json({ message: "Unable to add payment.", error: error.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Wedding Hall Booking System running at http://localhost:${PORT}`);
});