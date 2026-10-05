// Portal de clientes: tickets + cobros/facturas. Ejecuta: ADMIN_EMAIL=tucorreo@mail.com node server.js
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
// Devuelve el texto limpio si es string no vacío y no excede el máximo; si no, null
const txt = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max) ? v.trim() : null;
const db = new Database(path.join(__dirname, 'portal.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, nombre TEXT, email TEXT UNIQUE, hash TEXT, salt TEXT, rol TEXT DEFAULT 'cliente');
CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, usuario_id INTEGER, tipo TEXT, asunto TEXT, estado TEXT DEFAULT 'abierto', creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mensajes(id INTEGER PRIMARY KEY, ticket_id INTEGER, usuario_id INTEGER, texto TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS facturas(id INTEGER PRIMARY KEY, usuario_id INTEGER, folio TEXT, concepto TEXT, monto REAL, vence TEXT, estado TEXT DEFAULT 'pendiente', url TEXT);
CREATE TABLE IF NOT EXISTS cotizaciones(id INTEGER PRIMARY KEY, usuario_id INTEGER, servicio TEXT, zona TEXT, descripcion TEXT, fotos TEXT DEFAULT '', estado TEXT DEFAULT 'nueva', monto REAL, detalle TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
`);

for (const col of ['partidas TEXT', 'con_iva INTEGER DEFAULT 1', 'cotizado TEXT']) {
  try { db.exec('ALTER TABLE cotizaciones ADD COLUMN ' + col); } catch { /* ya existe */ }
}

// Datos que salen en el PDF (cámbialos con variables de entorno)
const EMPRESA = process.env.EMPRESA_NOMBRE || 'Nombre de tu empresa';
const TELEFONO = process.env.EMPRESA_TEL || '';
const VIGENCIA_DIAS = Number(process.env.VIGENCIA_DIAS) || 15;

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Sesiones (en memoria: se pierden al reiniciar el servidor) ----
const sesiones = new Map();
const hashPass = (p, salt) => crypto.scryptSync(p, salt, 64).toString('hex');
const leerSid = req => ((req.headers.cookie || '').match(/sid=([a-f0-9]+)/) || [])[1];
const auth = (req, res, next) => {
  const ses = sesiones.get(leerSid(req));
  if (!ses || ses.exp < Date.now()) { sesiones.delete(leerSid(req)); return res.status(401).json({ error: 'Inicia sesión' }); }
  req.user = ses.user; next();
};
const soloAdmin = (req, res, next) =>
  req.user.rol === 'admin' ? next() : res.status(403).json({ error: 'Solo administrador' });
const esAdmin = req => req.user.rol === 'admin';

function abrirSesion(res, u) {
  const sid = crypto.randomBytes(24).toString('hex');
  const user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
  sesiones.set(sid, { user, exp: Date.now() + 7 * 24 * 3600 * 1000 });
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json(user);
}

app.post('/api/registro', (req, res) => {
  const { nombre, email, password } = req.body || {};
  const correo = (txt(email, 200) || '').toLowerCase();
  if (!txt(nombre, 100) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || typeof password !== 'string' || password.length < 8 || password.length > 200)
    return res.status(400).json({ error: 'Revisa nombre, correo válido y contraseña (8 a 200 caracteres)' });
  if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(correo))
    return res.status(400).json({ error: 'Ese correo ya está registrado' });
  const salt = crypto.randomBytes(16).toString('hex');
  const rol = correo === ADMIN_EMAIL ? 'admin' : 'cliente';
  const r = db.prepare('INSERT INTO usuarios(nombre,email,hash,salt,rol) VALUES(?,?,?,?,?)')
    .run(String(nombre).trim(), correo, hashPass(password, salt), salt, rol);
  abrirSesion(res, { id: r.lastInsertRowid, nombre, email: correo, rol });
});

const intentos = new Map(); // ip -> { n, hasta }
app.post('/api/login', (req, res) => {
  const reg = intentos.get(req.ip);
  if (reg && reg.n >= 10 && Date.now() < reg.hasta) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(String(email || '').toLowerCase().trim());
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPass(String(password || ''), u.salt)), Buffer.from(u.hash));
  if (!ok) {
    intentos.set(req.ip, { n: (reg && Date.now() < reg.hasta ? reg.n : 0) + 1, hasta: Date.now() + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  intentos.delete(req.ip);
  abrirSesion(res, u);
});

app.post('/api/logout', (req, res) => {
  sesiones.delete(leerSid(req));
  res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---- Tickets ----
const TIPOS = ['queja', 'cobro', 'factura', 'soporte'];
const ESTADOS = ['abierto', 'en proceso', 'resuelto', 'cerrado'];
const SQL_TICKET = 'SELECT t.*, u.nombre AS cliente FROM tickets t JOIN usuarios u ON u.id=t.usuario_id';

app.get('/api/tickets', auth, (req, res) => {
  const filas = esAdmin(req)
    ? db.prepare(SQL_TICKET + ' ORDER BY t.id DESC').all()
    : db.prepare(SQL_TICKET + ' WHERE t.usuario_id=? ORDER BY t.id DESC').all(req.user.id);
  res.json(filas);
});

app.post('/api/tickets', auth, (req, res) => {
  const { tipo, asunto, descripcion } = req.body || {};
  if (!TIPOS.includes(tipo) || !txt(asunto, 200) || !txt(descripcion, 5000))
    return res.status(400).json({ error: 'Datos incompletos' });
  const r = db.prepare('INSERT INTO tickets(usuario_id,tipo,asunto) VALUES(?,?,?)').run(req.user.id, tipo, asunto);
  db.prepare('INSERT INTO mensajes(ticket_id,usuario_id,texto) VALUES(?,?,?)').run(r.lastInsertRowid, req.user.id, descripcion);
  res.json({ id: r.lastInsertRowid });
});

function ticketPermitido(req, res) {
  const t = db.prepare(SQL_TICKET + ' WHERE t.id=?').get(req.params.id);
  if (!t || (!esAdmin(req) && t.usuario_id !== req.user.id)) {
    res.status(404).json({ error: 'Ticket no encontrado' });
    return null;
  }
  return t;
}

app.get('/api/tickets/:id', auth, (req, res) => {
  const t = ticketPermitido(req, res); if (!t) return;
  const mensajes = db.prepare(
    'SELECT m.texto, m.creado, u.nombre, u.rol FROM mensajes m JOIN usuarios u ON u.id=m.usuario_id WHERE m.ticket_id=? ORDER BY m.id'
  ).all(t.id);
  res.json({ ticket: t, mensajes });
});

app.post('/api/tickets/:id/mensajes', auth, (req, res) => {
  const t = ticketPermitido(req, res); if (!t) return;
  const texto = txt((req.body || {}).texto, 5000);
  if (!texto) return res.status(400).json({ error: 'Escribe un mensaje' });
  db.prepare('INSERT INTO mensajes(ticket_id,usuario_id,texto) VALUES(?,?,?)').run(t.id, req.user.id, texto);
  res.json({ ok: true });
});

app.patch('/api/tickets/:id', auth, soloAdmin, (req, res) => {
  const { estado } = req.body || {};
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  if (!db.prepare('UPDATE tickets SET estado=? WHERE id=?').run(estado, req.params.id).changes) return res.status(404).json({ error: 'Ticket no encontrado' });
  res.json({ ok: true });
});

// ---- Cobros y facturas (solo registro y seguimiento; no emite CFDI ni procesa pagos) ----
const SQL_FACT = 'SELECT f.*, u.nombre AS cliente FROM facturas f JOIN usuarios u ON u.id=f.usuario_id';

app.get('/api/facturas', auth, (req, res) => {
  const filas = esAdmin(req)
    ? db.prepare(SQL_FACT + ' ORDER BY f.id DESC').all()
    : db.prepare(SQL_FACT + ' WHERE f.usuario_id=? ORDER BY f.id DESC').all(req.user.id);
  res.json(filas);
});

app.post('/api/facturas', auth, soloAdmin, (req, res) => {
  const { email, folio, concepto, monto, vence, url } = req.body || {};
  const cliente = db.prepare('SELECT id FROM usuarios WHERE email=?').get(String(email || '').toLowerCase().trim());
  if (!cliente || !concepto || !(Number(monto) >= 0))
    return res.status(400).json({ error: 'Cliente no encontrado o datos incompletos' });
  const enlace = String(url || '').startsWith('https://') ? url : '';
  db.prepare('INSERT INTO facturas(usuario_id,folio,concepto,monto,vence,url) VALUES(?,?,?,?,?,?)')
    .run(cliente.id, folio || '', concepto, Number(monto), vence || '', enlace);
  res.json({ ok: true });
});

app.patch('/api/facturas/:id', auth, soloAdmin, (req, res) => {
  const { estado } = req.body || {};
  if (!['pendiente', 'pagada', 'vencida'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  if (!db.prepare('UPDATE facturas SET estado=? WHERE id=?').run(estado, req.params.id).changes) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json({ ok: true });
});

// ---- Cotizaciones con fotos ----
const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const SQL_COT = 'SELECT c.*, u.nombre AS cliente FROM cotizaciones c JOIN usuarios u ON u.id=c.usuario_id';
const esJpeg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const r2 = n => Math.round(n * 100) / 100;
function totales(partidas, conIva) { // el servidor siempre recalcula; nunca confía en los totales del navegador
  const subtotal = r2(partidas.reduce((a, p) => a + r2(p.cantidad * p.precio), 0));
  const iva = conIva ? r2(subtotal * 0.16) : 0;
  return { subtotal, iva, total: r2(subtotal + iva) };
}
const verCot = c => { // no exponemos nombres de archivo
  const partidas = (c.partidas ? JSON.parse(c.partidas) : []).map(p => ({ ...p, importe: r2(p.cantidad * p.precio) }));
  return { ...c, fotos: c.fotos ? c.fotos.split(',').length : 0, partidas, ...(partidas.length ? totales(partidas, c.con_iva) : {}) };
};

function cotPermitida(req, res) {
  const c = db.prepare(SQL_COT + ' WHERE c.id=?').get(req.params.id);
  if (!c || (!esAdmin(req) && c.usuario_id !== req.user.id)) {
    res.status(404).json({ error: 'Solicitud no encontrada' });
    return null;
  }
  return c;
}

app.post('/api/cotizaciones', auth, (req, res) => {
  const { servicio, zona, descripcion, fotos } = req.body || {};
  if (!txt(servicio, 100) || !txt(descripcion, 5000) || (zona && !txt(zona, 100)))
    return res.status(400).json({ error: 'Indica el servicio y describe el problema' });
  if (fotos !== undefined && (!Array.isArray(fotos) || fotos.length > 3)) return res.status(400).json({ error: 'Máximo 3 fotos' });
  const bufs = [];
  for (const f of (fotos || [])) {
    const m = typeof f === 'string' && /^data:image\/jpeg;base64,(.+)$/.exec(f);
    const buf = m && Buffer.from(m[1], 'base64');
    if (!buf || !esJpeg(buf) || buf.length > 4e6) return res.status(400).json({ error: 'Las fotos deben ser JPG de menos de 4 MB' });
    bufs.push(buf);
  }
  const nombres = bufs.map(buf => { // solo se escribe a disco cuando todas son válidas
    const n = crypto.randomBytes(12).toString('hex') + '.jpg';
    fs.writeFileSync(path.join(UPLOADS, n), buf);
    return n;
  });
  const r = db.prepare('INSERT INTO cotizaciones(usuario_id,servicio,zona,descripcion,fotos) VALUES(?,?,?,?,?)')
    .run(req.user.id, servicio, zona || '', descripcion, nombres.join(','));
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/cotizaciones', auth, (req, res) => {
  const filas = esAdmin(req)
    ? db.prepare(SQL_COT + ' ORDER BY c.id DESC').all()
    : db.prepare(SQL_COT + ' WHERE c.usuario_id=? ORDER BY c.id DESC').all(req.user.id);
  res.json(filas.map(verCot));
});

app.get('/api/cotizaciones/:id/foto/:n', auth, (req, res) => {
  const c = cotPermitida(req, res); if (!c) return;
  const f = (c.fotos ? c.fotos.split(',') : [])[Number(req.params.n)];
  if (!f) return res.status(404).end();
  res.sendFile(path.join(UPLOADS, f));
});

app.patch('/api/cotizaciones/:id', auth, soloAdmin, (req, res) => {
  const c = cotPermitida(req, res); if (!c) return;
  if (['aceptada', 'rechazada'].includes(c.estado)) return res.status(400).json({ error: 'El cliente ya respondió' });
  const { partidas, con_iva, detalle } = req.body || {};
  if (detalle && !txt(detalle, 2000)) return res.status(400).json({ error: 'Las notas son demasiado largas (máx. 2000 caracteres)' });
  const lista = Array.isArray(partidas) && partidas.length <= 30 ? partidas.map(p => ({
    concepto: txt((p || {}).concepto, 200), cantidad: Number((p || {}).cantidad), precio: Number((p || {}).precio)
  })) : [];
  if (!lista.length || lista.some(p => !p.concepto || !(p.cantidad > 0 && p.cantidad <= 1e6) || !(p.precio >= 0 && p.precio <= 1e8)))
    return res.status(400).json({ error: 'Agrega de 1 a 30 partidas con concepto (máx. 200 caracteres), cantidad y precio válidos' });
  const t = totales(lista, !!con_iva);
  db.prepare("UPDATE cotizaciones SET monto=?, detalle=?, partidas=?, con_iva=?, cotizado=CURRENT_TIMESTAMP, estado='cotizada' WHERE id=?")
    .run(t.total, String(detalle || ''), JSON.stringify(lista), con_iva ? 1 : 0, c.id);
  res.json({ ok: true, ...t });
});

app.post('/api/cotizaciones/:id/respuesta', auth, (req, res) => {
  const c = cotPermitida(req, res); if (!c) return;
  if (c.usuario_id !== req.user.id || c.estado !== 'cotizada') return res.status(400).json({ error: 'No se puede responder esta cotización' });
  db.prepare('UPDATE cotizaciones SET estado=? WHERE id=?').run((req.body || {}).aceptar ? 'aceptada' : 'rechazada', c.id);
  res.json({ ok: true });
});

// ---- PDF de la cotización ----
const mx = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
app.get('/api/cotizaciones/:id/pdf', auth, (req, res) => {
  const c = cotPermitida(req, res); if (!c) return;
  if (c.estado === 'nueva') return res.status(400).json({ error: 'Esta solicitud aún no tiene cotización' });
  const v = verCot(c);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cotizacion-${c.id}.pdf"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(20).text(EMPRESA);
  if (TELEFONO) doc.font('Helvetica').fontSize(10).text('Tel / WhatsApp: ' + TELEFONO);
  doc.moveDown(1).font('Helvetica-Bold').fontSize(16).text('COTIZACIÓN #' + c.id);
  doc.font('Helvetica').fontSize(10).text(`Fecha: ${(c.cotizado || c.creado).slice(0, 10)}   ·   Vigencia: ${VIGENCIA_DIAS} días`);
  doc.moveDown().font('Helvetica-Bold').text('Cliente: ', { continued: true }).font('Helvetica').text(c.cliente);
  doc.font('Helvetica-Bold').text('Servicio: ', { continued: true }).font('Helvetica').text(c.servicio + (c.zona ? ' · ' + c.zona : ''));
  doc.moveDown().font('Helvetica-Bold').text('Problema descrito:').font('Helvetica').text(c.descripcion);

  let y = doc.moveDown().y;
  const fila = (a, b, p, d, negrita) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const h = Math.max(doc.heightOfString(a, { width: 260 }), 14);
    if (y + h > 730) { doc.addPage(); y = 50; }
    doc.text(a, 50, y, { width: 260 });
    doc.text(b, 320, y, { width: 50, align: 'right' });
    doc.text(p, 375, y, { width: 80, align: 'right' });
    doc.text(d, 460, y, { width: 85, align: 'right' });
    y += h + 6;
    doc.moveTo(50, y - 3).lineTo(545, y - 3).strokeColor('#cccccc').stroke();
  };
  fila('Concepto', 'Cant.', 'Precio', 'Importe', true);
  if (v.partidas.length) v.partidas.forEach(p => fila(p.concepto, String(p.cantidad), mx(p.precio), mx(p.importe)));
  else fila(c.servicio, '1', mx(c.monto), mx(c.monto));

  const tot = (t, val, negrita) => {
    if (y > 730) { doc.addPage(); y = 50; }
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 12 : 10);
    doc.text(t, 320, y, { width: 135, align: 'right' });
    doc.text(val, 460, y, { width: 85, align: 'right' });
    y += 18;
  };
  y += 6;
  if (v.partidas.length) { tot('Subtotal', mx(v.subtotal)); if (v.iva) tot('IVA 16%', mx(v.iva)); }
  tot('TOTAL MXN', mx(c.monto), true);
  if (c.detalle) doc.font('Helvetica-Bold').fontSize(10).text('Notas y condiciones:', 50, y + 10, { width: 495 }).font('Helvetica').text(c.detalle, { width: 495 });
  doc.end();
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const st = err.status || 500;
  if (st >= 500) console.error(err);
  res.status(st).json({ error: st === 413 ? 'El archivo es demasiado grande' : st < 500 ? 'Solicitud inválida' : 'Error del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Portal en http://localhost:' + PORT));
