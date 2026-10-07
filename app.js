const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(u, m = 'GET', b) {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && yo) { yo = null; draw(); } // la sesión caducó: vuelve al login
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}
window.onunhandledrejection = e => alert(e.reason.message);

let yo = null, tab = 'cotizaciones', modo = 'login';

async function init() { try { yo = await api('/api/me'); } catch { yo = null; } draw(); }
function draw() { $('#app').innerHTML = yo ? vistaApp() : vistaAuth(); if (yo) cargar(); }

// ---- Acceso ----
function vistaAuth() {
  return `<h1>Portal de clientes</h1>
  <form class="card" onsubmit="enviarAuth(event)">
    ${modo === 'registro' ? '<input id="nombre" placeholder="Nombre o empresa" required>' : ''}
    <input id="email" type="email" placeholder="Correo" required>
    <input id="pass" type="password" placeholder="Contraseña (mínimo 8)" minlength="8" required>
    <button>${modo === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
    <p><a href="#" onclick="modo=modo==='login'?'registro':'login';draw();return false">${modo === 'login' ? 'Crear cuenta nueva' : 'Ya tengo cuenta'}</a></p>
    <p id="err" style="color:#b00020"></p>
  </form>`;
}
async function enviarAuth(e) {
  e.preventDefault();
  try {
    const b = { email: $('#email').value, password: $('#pass').value };
    if (modo === 'registro') b.nombre = $('#nombre').value;
    yo = await api(modo === 'login' ? '/api/login' : '/api/registro', 'POST', b);
    draw();
  } catch (x) { $('#err').textContent = x.message; }
}
async function salir() { await api('/api/logout', 'POST'); yo = null; draw(); }

// ---- Estructura ----
function vistaApp() {
  return `<nav>
    <h1 style="flex:1">Hola, ${esc(yo.nombre)}</h1>
    <button class="sec" onclick="tab='cotizaciones';draw()">Cotizaciones</button>
    <button class="sec" onclick="tab='tickets';draw()">Tickets</button>
    <button class="sec" onclick="tab='facturas';draw()">Cobros y facturas</button>
    <button class="sec" onclick="salir()">Salir</button>
  </nav><div id="vista"></div>`;
}
function cargar() { tab === 'tickets' ? verTickets() : tab === 'facturas' ? verFacturas() : verCotizaciones(); }

// ---- Tickets ----
async function verTickets() {
  const ts = await api('/api/tickets');
  const form = yo.rol === 'admin' ? '' : `<form class="card" onsubmit="nuevoTicket(event)">
    <h2>Nuevo ticket</h2>
    <select id="tipo"><option value="queja">Queja</option><option value="cobro">Cobro</option><option value="factura">Factura</option><option value="soporte">Soporte</option></select>
    <input id="asunto" placeholder="Asunto" required>
    <textarea id="desc" rows="3" placeholder="Describe el problema" required></textarea>
    <button>Enviar</button></form>`;
  const lista = ts.map(t => `<div class="card">
    <b>#${t.id} ${esc(t.asunto)}</b> <span class="tag">${esc(t.tipo)}</span> <span class="tag">${esc(t.estado)}</span><br>
    <small>${esc(t.cliente)} · ${esc(t.creado)}</small><br>
    <button class="sec" onclick="abrir(${t.id})">Abrir</button>
    <div id="t${t.id}"></div></div>`).join('') || '<p>No hay tickets.</p>';
  $('#vista').innerHTML = form + lista;
}
async function nuevoTicket(e) {
  e.preventDefault();
  await api('/api/tickets', 'POST', { tipo: $('#tipo').value, asunto: $('#asunto').value, descripcion: $('#desc').value });
  verTickets();
}
async function abrir(id) {
  const d = await api('/api/tickets/' + id);
  const msgs = d.mensajes.map(m => `<div class="msg ${m.rol === 'admin' ? 'admin' : ''}"><b>${esc(m.nombre)}</b> <small>${esc(m.creado)}</small><br>${esc(m.texto)}</div>`).join('');
  const est = yo.rol === 'admin'
    ? `<select onchange="estado(${id},this.value)">${['abierto', 'en proceso', 'resuelto', 'cerrado'].map(s => `<option ${s === d.ticket.estado ? 'selected' : ''}>${s}</option>`).join('')}</select>` : '';
  $('#t' + id).innerHTML = msgs + est + `<form onsubmit="responder(event,${id})"><textarea rows="2" placeholder="Escribe un mensaje" required></textarea><button>Responder</button></form>`;
}
async function responder(e, id) {
  e.preventDefault();
  await api(`/api/tickets/${id}/mensajes`, 'POST', { texto: e.target.querySelector('textarea').value });
  abrir(id);
}
async function estado(id, v) { await api('/api/tickets/' + id, 'PATCH', { estado: v }); }

// ---- Cobros y facturas ----
async function verFacturas() {
  const fs = await api('/api/facturas');
  const form = yo.rol === 'admin' ? `<form class="card" onsubmit="nuevaFactura(event)">
    <h2>Registrar cobro o factura</h2>
    <input id="fe" type="email" placeholder="Correo del cliente" required>
    <input id="ff" placeholder="Folio">
    <input id="fc" placeholder="Concepto" required>
    <input id="fm" type="number" step="0.01" min="0" placeholder="Monto MXN" required>
    <input id="fv" type="date">
    <input id="fu" placeholder="Enlace https al PDF (opcional)">
    <button>Guardar</button></form>` : '';
  const lista = fs.map(f => `<div class="card">
    <b>${esc(f.folio || 'S/F')}</b> ${esc(f.concepto)} — $${Number(f.monto).toFixed(2)} MXN <span class="tag">${esc(f.estado)}</span><br>
    <small>${esc(f.cliente)} · vence ${esc(f.vence || '—')}</small>
    ${f.url ? ` <a href="${esc(f.url)}" target="_blank" rel="noopener">Ver PDF</a>` : ''}
    ${yo.rol === 'admin' && f.estado !== 'pagada' ? ` <button onclick="pagar(${f.id})">Marcar pagada</button>` : ''}
  </div>`).join('') || '<p>Sin cobros ni facturas.</p>';
  $('#vista').innerHTML = form + lista;
}
async function nuevaFactura(e) {
  e.preventDefault();
  await api('/api/facturas', 'POST', { email: $('#fe').value, folio: $('#ff').value, concepto: $('#fc').value, monto: $('#fm').value, vence: $('#fv').value, url: $('#fu').value });
  verFacturas();
}
async function pagar(id) { await api('/api/facturas/' + id, 'PATCH', { estado: 'pagada' }); verFacturas(); }

// ---- Cotizaciones con fotos ----
const SERVICIOS = ['Destape de drenaje o baño', 'Plomería (fugas, instalación)', 'Impermeabilización', 'Electricidad', 'Albañilería', 'Pintura', 'Mantenimiento de empresa o nave', 'Otro'];
function leerFoto(file) { // reduce la foto a máx. 1280 px para que suba rápido
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => mal(new Error('No se pudo leer la foto'));
    img.src = URL.createObjectURL(file);
  });
}
async function verCotizaciones() {
  const cs = await api('/api/cotizaciones');
  const admin = yo.rol === 'admin';
  const form = admin ? '' : `<form class="card" onsubmit="nuevaCot(event)">
    <h2>Pide tu cotización</h2>
    <select id="cs">${SERVICIOS.map(s => `<option>${s}</option>`).join('')}</select>
    <input id="cz" placeholder="Colonia o zona">
    <textarea id="cd" rows="3" placeholder="Cuéntanos el problema" required></textarea>
    <label>Fotos (hasta 3)<input id="cf" type="file" accept="image/*" multiple></label>
    <button>Enviar solicitud</button></form>`;
  const lista = cs.map(c => {
    const fotos = Array.from({ length: c.fotos }, (_, i) => `<a href="/api/cotizaciones/${c.id}/foto/${i}" target="_blank"><img src="/api/cotizaciones/${c.id}/foto/${i}" style="height:90px;margin:4px;border-radius:4px"></a>`).join('');
    const precio = c.estado === 'nueva' ? '' : (c.partidas.length
      ? `<table style="width:100%;border-collapse:collapse">${c.partidas.map(p => `<tr><td>${esc(p.concepto)}</td><td>${esc(p.cantidad)} × ${mx(p.precio)}</td><td style="text-align:right">${mx(p.importe)}</td></tr>`).join('')}</table>
         <p>Subtotal ${mx(c.subtotal)} · IVA ${mx(c.iva)} · <b>Total ${mx(c.total)} MXN</b></p>`
      : `<p><b>Cotización: ${mx(c.monto)} MXN</b></p>`)
      + (c.detalle ? `<p>${esc(c.detalle)}</p>` : '') + (c.estado === 'nueva' ? '' : `<a href="/api/cotizaciones/${c.id}/pdf" target="_blank">Descargar PDF</a>`);
    const botones = !admin && c.estado === 'cotizada'
      ? `<button onclick="respCot(${c.id},true)">Aceptar</button> <button class="sec" onclick="respCot(${c.id},false)">Rechazar</button>` : '';
    const cotizar = admin && !['aceptada', 'rechazada'].includes(c.estado) ? `<form onsubmit="cotizar(event,${c.id})" oninput="calc(this)">
      <b>Partidas</b>
      <div class="partidas">${filaHTML()}</div>
      <button type="button" class="sec" onclick="this.form.querySelector('.partidas').insertAdjacentHTML('beforeend',filaHTML())">+ Agregar partida</button>
      <label><input type="checkbox" class="iva" checked style="width:auto"> Incluir IVA 16%</label>
      <textarea rows="2" placeholder="Notas: tiempos, garantía, condiciones de pago"></textarea>
      <p class="tot"></p>
      <button>Enviar cotización</button></form>` : '';
    return `<div class="card"><b>#${c.id} ${esc(c.servicio)}</b> <span class="tag">${esc(c.estado)}</span><br>
      <small>${esc(c.cliente)} · ${esc(c.zona)} · ${esc(c.creado)}</small>
      <p>${esc(c.descripcion)}</p>${fotos}${precio}${botones}${cotizar}</div>`;
  }).join('') || '<p>No hay solicitudes.</p>';
  $('#vista').innerHTML = form + lista;
}
async function nuevaCot(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const fotos = await Promise.all([...$('#cf').files].slice(0, 3).map(leerFoto));
    await api('/api/cotizaciones', 'POST', { servicio: $('#cs').value, zona: $('#cz').value, descripcion: $('#cd').value, fotos });
    verCotizaciones();
  } finally { btn.disabled = false; }
}
const mx = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const filaHTML = () => `<div class="fila"><input class="pc" placeholder="Concepto" required><input class="pq" type="number" min="0.01" step="0.01" value="1" required><input class="pp" type="number" min="0" step="0.01" placeholder="Precio" required></div>`;
function leerPartidas(f) {
  return [...f.querySelectorAll('.fila')].map(r => ({ concepto: r.querySelector('.pc').value, cantidad: r.querySelector('.pq').value, precio: r.querySelector('.pp').value }));
}
function calc(f) { // vista previa del total (el servidor lo vuelve a calcular)
  const sub = leerPartidas(f).reduce((a, p) => a + (Number(p.cantidad) || 0) * (Number(p.precio) || 0), 0);
  const iva = f.querySelector('.iva').checked ? sub * 0.16 : 0;
  f.querySelector('.tot').textContent = `Subtotal ${mx(sub)} · IVA ${mx(iva)} · Total ${mx(sub + iva)}`;
}
async function cotizar(e, id) {
  e.preventDefault();
  await api('/api/cotizaciones/' + id, 'PATCH', { partidas: leerPartidas(e.target), con_iva: e.target.querySelector('.iva').checked, detalle: e.target.querySelector('textarea').value });
  verCotizaciones();
}
async function respCot(id, aceptar) { await api(`/api/cotizaciones/${id}/respuesta`, 'POST', { aceptar }); verCotizaciones(); }

init();
