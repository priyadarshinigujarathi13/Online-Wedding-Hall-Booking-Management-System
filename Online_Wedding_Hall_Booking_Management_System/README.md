# Online Wedding Hall Booking Management System

A full-stack FSD mini-project built with HTML, CSS, JavaScript, Node.js, Express.js and MySQL.

## Features

- Browse wedding halls with location, capacity, facilities and price.
- Search halls by name or location and filter by capacity.
- Submit customer and event booking details.
- Check date/time conflicts and hall capacity before booking.
- View payment records using a booking ID.
- Admin login and dashboard.
- Admin can add, edit and delete halls, update booking status, view customers and add payment records.
- SQL script creates the four requested tables and inserts sample halls/customers.

## Project structure

```text
Online_Wedding_Hall_Booking_Management_System/
├── database/
│   └── wedding_hall_db.sql
├── public/
│   ├── index.html
│   ├── halls.html
│   ├── booking.html
│   ├── payments.html
│   ├── admin.html
│   ├── style.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Step 1: Create the MySQL database

1. Open MySQL Workbench and connect to your local MySQL server.
2. Open `database/wedding_hall_db.sql`.
3. Execute the full script using the lightning icon.
4. Refresh the SCHEMAS panel. You should see `wedding_hall_db`.
5. Expand Tables to see `customers`, `halls`, `bookings` and `payments`.
6. To view sample rows, run:

```sql
USE wedding_hall_db;
SELECT * FROM customers;
SELECT * FROM halls;
SELECT * FROM bookings;
SELECT * FROM payments;
```

The bookings and payments tables will initially be empty. They receive records when you create a booking and the admin adds a payment.

> Note: The SQL script drops and recreates the four tables. Do not rerun it if you need to keep existing project records.

## Step 2: Configure the Node.js project

Open PowerShell in this project folder. Copy `.env.example` to a new file named `.env` and set your actual MySQL password.

Example `.env`:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=wedding_hall_db
SESSION_SECRET=my_wedding_hall_secret_2026
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

If your MySQL root account has no password, keep `DB_PASSWORD=` empty.

## Step 3: Install and run

```powershell
npm install
npm start
```

Open this address in your browser:

`http://localhost:3000`

Do not open the HTML files directly by double-clicking. Use the Express server URL.

## Step 4: Test the project

1. Open Explore Halls and view sample halls.
2. Open Book a Hall and submit a booking.
3. Note the Booking ID shown after successful booking.
4. Open Admin and sign in with the credentials in `.env` (default example: `admin` / `admin123`).
5. Confirm or update the booking status.
6. Add a payment record using the Booking ID.
7. Open Payment Details and enter the same Booking ID.
8. In MySQL Workbench, run `SELECT *` on all four tables to verify stored data.

## GitHub

Create a new empty GitHub repository. In PowerShell, from the project folder:

```powershell
git init
git add .
git commit -m "Online wedding hall booking management system"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Do not upload `.env` or `node_modules`. The `.gitignore` file excludes them. Upload `.env.example` so another person knows which settings are required.

## Admin demo login

The example credentials are `admin` and `admin123`. Change them in `.env` before using the project beyond a classroom demonstration.

## Important project note

This is a classroom demonstration project. The payment module stores payment records; it does not connect to a bank, UPI provider or real payment gateway. Admin session configuration is intended for a local lab demonstration, not production deployment.
