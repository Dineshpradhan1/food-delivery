// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ---------- DB ----------
const db = new sqlite3.Database('db.sqlite');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    image TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT,
    total REAL,
    address TEXT,
    name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ---------- Middleware ----------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// ---------- File upload ----------
const upload = multer({ dest: 'public/uploads/' });

// ---------- Email transporter ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'YOUR_GMAIL@gmail.com',   // <<< CHANGE
    pass: 'YOUR_APP_PASSWORD'       // <<< CHANGE (use App Password)
  }
});

// ---------- Routes ----------
// Home – show menu
app.get('/', (req, res) => {
  db.all('SELECT * FROM menu', (err, rows) => {
    if (err) return res.status(500).send(err);
    res.render('index', { menu: rows });
  });
});

// Place order
app.post('/order', (req, res) => {
  const { items, total, address, name, phone } = req.body;
  const itemsJson = JSON.stringify(items);

  db.run(
    `INSERT INTO orders (items, total, address, name, phone) VALUES (?, ?, ?, ?, ?)`,
    [itemsJson, total, address, name, phone],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // ---- Send email ----
      const orderId = this.lastID;
      const mailOptions = {
        from: 'YOUR_GMAIL@gmail.com',
        to: 'RESTAURANT_EMAIL@example.com', // <<< CHANGE
        subject: `New Order #${orderId}`,
        html: `
          <h2>New Order Received</h2>
          <p><strong>Customer:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Delivery Address:</strong> ${address}</p>
          <p><strong>Total:</strong> $${total}</p>
          <ul>
            ${items.map(i => `<li>${i.name} ×${i.qty} = $${i.price*i.qty}</li>`).join('')}
          </ul>
          <p><em>Order ID: ${orderId}</em></p>
        `
      };

      transporter.sendMail(mailOptions, (err, info) => {
        if (err) console.error('Email error:', err);
      });

      res.json({ success: true, orderId });
    }
  );
});

// ---------- ADMIN ----------
app.get('/admin', (req, res) => {
  db.all('SELECT * FROM menu', (err, menu) => {
    if (err) return res.status(500).send(err);
    db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, orders) => {
      if (err) return res.status(500).send(err);
      res.render('admin', { menu, orders });
    });
  });
});

// Add / Update menu item
app.post('/admin/menu', upload.single('image'), (req, res) => {
  const { id, name, price } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (id) {
    // Update
    const sql = image
      ? `UPDATE menu SET name=?, price=?, image=? WHERE id=?`
      : `UPDATE menu SET name=?, price=? WHERE id=?`;
    const params = image ? [name, price, image, id] : [name, price, id];
    db.run(sql, params, (err) => {
      if (err) return res.status(500).send(err);
      res.redirect('/admin');
    });
  } else {
    // Insert
    db.run(
      `INSERT INTO menu (name, price, image) VALUES (?, ?, ?)`,
      [name, price, image],
      (err) => {
        if (err) return res.status(500).send(err);
        res.redirect('/admin');
      }
    );
  }
});

// Delete menu item
app.post('/admin/menu/delete', (req, res) => {
  const { id } = req.body;
  db.run(`DELETE FROM menu WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).send(err);
    res.redirect('/admin');
  });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Customer page: http://localhost:${PORT}/`);
  console.log(`Admin page:   http://localhost:${PORT}/admin`);
});