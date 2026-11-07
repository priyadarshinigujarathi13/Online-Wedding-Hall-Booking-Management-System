CREATE DATABASE IF NOT EXISTS wedding_hall_db;
USE wedding_hall_db;

-- Drop child tables first if you are recreating the database tables.
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS halls;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(15) NOT NULL,
    address VARCHAR(255)
);

CREATE TABLE halls (
    hall_id INT AUTO_INCREMENT PRIMARY KEY,
    hall_name VARCHAR(100) NOT NULL,
    location VARCHAR(150) NOT NULL,
    capacity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    facilities TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Available'
);

CREATE TABLE bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    hall_id INT NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    CONSTRAINT fk_bookings_customer
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_hall
        FOREIGN KEY (hall_id) REFERENCES halls(hall_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_booking_time CHECK (end_time > start_time)
);

CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Sample halls for the website and Workbench demonstration.
INSERT INTO halls (hall_name, location, capacity, price, facilities, status) VALUES
('The Grand Palace', 'Kurnool, Andhra Pradesh', 800, 125000.00, 'Air conditioning, Grand stage, Bridal room, Parking, Catering area', 'Available'),
('Royal Orchid Convention', 'Nandyal Road, Kurnool', 500, 85000.00, 'Air conditioning, LED lighting, Parking, Dining hall', 'Available'),
('Pearl Garden Function Hall', 'Bellary Chowrasta, Kurnool', 350, 60000.00, 'Garden lawn, Stage, Sound system, Parking', 'Available'),
('Sree Lakshmi Convention Centre', 'Adoni, Andhra Pradesh', 1000, 150000.00, 'Central AC, Large stage, Generator, Dining hall, Valet parking', 'Available'),
('Golden Moments Banquet', 'Kurnool, Andhra Pradesh', 200, 40000.00, 'Indoor hall, Projector, Sound system, Dining area', 'Available');

-- Sample customers (optional demonstration data).
INSERT INTO customers (name, email, phone, address) VALUES
('Priya Darshini', 'priya@example.com', '9876543210', 'Kurnool, Andhra Pradesh'),
('Rahul Kumar', 'rahul@example.com', '9876501234', 'Nandyal, Andhra Pradesh');

-- Verify tables and sample data after running this script.
SELECT * FROM customers;
SELECT * FROM halls;
SELECT * FROM bookings;
SELECT * FROM payments;