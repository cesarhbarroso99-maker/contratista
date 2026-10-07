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

let yo = null, tab = 'resumen', modo = 'login';

async function init() { try { yo = await api('/api/me'); } catch { yo = null; } draw(); }
function draw() { $('#app').innerHTML = yo ? vistaApp() : vistaAuth(); if (yo) cargar(); }
const icons = {
  home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  quote:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 12h8M8 16h5"/>',
  ticket:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M7 8h10M7 12h7"/>',
  invoice:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  exit:'<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 8l5 4-5 4M8 12h11"/>',
  arrow:'<path d="M7 17 17 7M7 7h10v10"/>',
  brand:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>'
};
function icon(name){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.quote)+'</svg>'; }
function brand(){return '<a class="brand" href="/"><span class="brand-mark">'+icon('brand')+'</span><span>Contratista<small>Portal de clientes</small></span></a>';}
function go(next){tab=next;draw();}
function authMode(next){modo=next;draw();}
function togglePassword(button){const p=$('#pass');p.type=p.type==='password'?'text':'password';button.textContent=p.type==='password'?'Mostrar':'Ocultar';button.setAttribute('aria-label',button.textContent+' contraseña');}
const initial = name => esc((name||'C').trim().charAt(0).toUpperCase());
function status(value){const s=String(value||'');const cls=['aceptada','pagada','resuelto'].includes(s)?'status-done':['nueva','abierto'].includes(s)?'status-new':['rechazada','cerrado'].includes(s)?'status-closed':'status-pending';return '<span class="tag '+cls+'">'+esc(s)+'</span>';}
function empty(title,description,kind='quote'){return '<div class="empty"><div class="empty-icon">'+icon(kind)+'</div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p></div>';}
function decorate(){
  const root=$('#vista');if(!root)return;
  root.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.type==='checkbox'||el.closest('.fila')||el.closest('label'))return;
    const names={cs:'Servicio',cz:'Colonia o zona',cd:'Descripción del trabajo',tipo:'Tipo de solicitud',asunto:'Asunto',desc:'¿Cómo podemos ayudarte?',fe:'Correo del cliente',ff:'Folio',fc:'Concepto',fm:'Monto en MXN',fv:'Fecha de vencimiento',fu:'Enlace al PDF'};
    const label=document.createElement('label');label.className='field';const text=document.createElement('span');text.textContent=names[el.id]||el.getAttribute('placeholder')||'Estado';el.before(label);label.append(text,el);
  });
  root.querySelectorAll('label:not(.field)').forEach(l=>{if(l.querySelector('input[type=file]'))l.classList.add('field');});
  root.querySelectorAll('.tag').forEach(el=>{const s=el.textContent.trim();if(['aceptada','pagada','resuelto'].includes(s))el.classList.add('status-done');else if(['nueva','abierto'].includes(s))el.classList.add('status-new');else if(['cotizada','pendiente','en proceso'].includes(s))el.classList.add('status-pending');else if(['rechazada','cerrado'].includes(s))el.classList.add('status-closed');});
  root.querySelectorAll('table').forEach(t=>{if(t.parentElement.classList.contains('table-wrap'))return;const wrap=document.createElement('div');wrap.className='table-wrap';t.before(wrap);wrap.append(t);});
}
function setRecords(form,lista,heading){$('#vista').innerHTML=form?'<div class="view-grid"><div>'+form+'</div><section class="records" aria-label="'+heading+'"><p class="list-heading">'+heading+'</p>'+lista+'</section></div>':'<section class="records">'+lista+'</section>';decorate();}
let loadSequence=0;

// ---- Acceso ----
function vistaAuth() {
  const register=modo==='registro';
  return `<div class="auth-page"><header class="auth-top">${brand()}<a class="back-link" href="/">← Volver al sitio</a></header>
  <div class="auth-grid"><section class="auth-story"><p class="eyebrow">Tu espacio de seguimiento</p><h1>Tu próximo proyecto,<br><span>en buenas manos.</span></h1><p>Solicita una cotización, da seguimiento a tus trabajos y consulta tus documentos desde un mismo lugar.</p>
  <div class="benefits">${[['quote','Cotizaciones a tu medida','Comparte lo que necesitas y agrega fotografías.'],['ticket','Seguimiento directo','Mantén la conversación sobre cada solicitud.'],['invoice','Tus cobros y facturas','Consulta importes y documentos disponibles.']].map(([i,t,d])=>'<div class="benefit"><span class="benefit-icon">'+icon(i)+'</span><div><b>'+t+'</b><small>'+d+'</small></div></div>').join('')}</div></section>
  <section class="auth-card"><div class="auth-tabs" aria-label="Opciones de acceso"><button type="button" class="${!register?'active':''}" aria-pressed="${!register}" onclick="authMode('login')">Iniciar sesión</button><button type="button" class="${register?'active':''}" aria-pressed="${register}" onclick="authMode('registro')">Crear cuenta</button></div>
  <h2>${register?'Comencemos tu proyecto':'Bienvenido de nuevo'}</h2><p class="muted">${register?'Regístrate para solicitar y consultar tus servicios.':'Ingresa para dar seguimiento a tus servicios.'}</p>
  <form onsubmit="enviarAuth(event)">${register?'<label class="field"><span>Nombre o empresa</span><input id="nombre" autocomplete="organization" placeholder="Tu nombre o el de tu empresa" maxlength="100" required></label>':''}
  <label class="field"><span>Correo electrónico</span><input id="email" type="email" autocomplete="email" placeholder="nombre@empresa.com" maxlength="200" required></label>
  <label class="field"><span>Contraseña</span><div class="password-wrap"><input id="pass" type="password" autocomplete="${register?'new-password':'current-password'}" placeholder="${register?'Mínimo 8 caracteres':'Tu contraseña'}" minlength="8" maxlength="200" required><button type="button" class="password-toggle" aria-label="Mostrar contraseña" onclick="togglePassword(this)">Mostrar</button></div></label>
  <p id="err" class="error" role="alert"></p><button class="full" type="submit">${register?'Crear mi cuenta':'Entrar a mi portal'} →</button></form><p class="auth-foot">${register?'¿Ya tienes cuenta?':'¿Es tu primera visita?'} <a href="#" onclick="authMode('${register?'login':'registro'}');return false">${register?'Inicia sesión':'Crea tu cuenta'}</a></p></section></div>
  <footer class="auth-footer"><span>Contratista · Portal de clientes</span><span>Cotizaciones · Soporte · Facturas</span></footer></div>`;
}

async function enviarAuth(e) {
  e.preventDefault();
  const submit = e.target.querySelector('button[type=submit]');submit.disabled=true;$('#err').textContent='';
  try {
    const b = { email: $('#email').value, password: $('#pass').value };
    if (modo === 'registro') b.nombre = $('#nombre').value;
    yo = await api(modo === 'login' ? '/api/login' : '/api/registro', 'POST', b);
    tab='resumen';draw();
  } catch (x) { const err=$('#err');if(err)err.textContent=x.message; } finally { if(submit.isConnected)submit.disabled=false; }
}
async function salir() { await api('/api/logout', 'POST'); yo = null; draw(); }

// ---- Estructura ----
function vistaApp() {
  const admin=yo.rol==='admin';
  const pages={resumen:['Mi espacio','Aquí puedes consultar y dar seguimiento a tus servicios.'],cotizaciones:['Cotizaciones',admin?'Revisa solicitudes y prepara las cotizaciones de tus clientes.':'Solicita un servicio y consulta tus cotizaciones.'],tickets:['Tickets de atención','Consulta tus solicitudes y mantén la conversación en un mismo lugar.'],facturas:['Cobros y facturas',admin?'Registra y consulta los documentos de tus clientes.':'Consulta tus importes, fechas de vencimiento y documentos.']};
  const [title,subtitle]=pages[tab];
  return `<div class="shell"><aside class="sidebar">${brand()}<p class="sidebar-caption">${admin?'Administración':'Mi cuenta'}</p><nav class="portal-nav" aria-label="Secciones del portal">${[['resumen','home','Resumen'],['cotizaciones','quote','Cotizaciones'],['tickets','ticket','Tickets'],['facturas','invoice','Facturas']].map(([id,i,t])=>'<button class="nav-item '+(tab===id?'active':'')+'" '+(tab===id?'aria-current="page"':'')+' onclick="go(\''+id+'\')">'+icon(i)+'<span>'+t+'</span></button>').join('')}</nav>
  <div class="sidebar-bottom"><a class="nav-item" href="/">${icon('arrow')} Volver al sitio</a><div class="account"><span class="avatar">${initial(yo.nombre)}</span><div><b>${esc(yo.nombre)}</b><small>${admin?'Administrador':'Cuenta de cliente'}</small></div></div><button class="nav-item" onclick="salir()">${icon('exit')} Cerrar sesión</button></div></aside>
  <section class="workspace"><header class="topbar"><span class="topbar-title">Portal de clientes <span class="muted"> / ${tab==='resumen'?'Resumen':title}</span></span><div class="topbar-right"><span>${esc(yo.nombre)}</span><span class="role">${admin?'Administrador':'Cliente'}</span><span class="avatar">${initial(yo.nombre)}</span><button class="sec mobile-logout" onclick="salir()" aria-label="Cerrar sesión" title="Cerrar sesión">Salir</button></div></header>
  <div class="content"><div class="page-heading"><div>${tab==='resumen'?'<p class="eyebrow">Bienvenido, '+esc(yo.nombre)+'</p>':''}<h1>${admin&&tab==='resumen'?'Panel de administración':title}</h1><p>${subtitle}</p></div>${tab==='resumen'&&!admin?'<button onclick="go(\'cotizaciones\')">+ Solicitar cotización</button>':''}</div><div id="vista" aria-live="polite"></div><p class="footer-note">Contratista · Portal de clientes</p></div></section></div>`;
}
async function cargar(){const seq=++loadSequence;$('#vista').innerHTML='<div class="loading" role="status"><span class="spinner"></span>Cargando tu información…</div>';try{await (tab==='resumen'?verResumen():tab==='tickets'?verTickets():tab==='facturas'?verFacturas():verCotizaciones());}catch(e){if(seq===loadSequence&&$('#vista'))$('#vista').innerHTML='<div class="card"><h2>No pudimos cargar esta sección</h2><p class="error">'+esc(e.message)+'</p><button onclick="cargar()">Volver a intentar</button></div>';}}
async function verResumen(){
  const seq=loadSequence;
  const [cs,ts,fs]=await Promise.all([api('/api/cotizaciones'),api('/api/tickets'),api('/api/facturas')]);
  if(seq!==loadSequence||!yo||tab!=='resumen')return;
  const admin=yo.rol==='admin';
  const openTickets=ts.filter(t=>!['resuelto','cerrado'].includes(t.estado)).length;
  const pending=fs.filter(f=>f.estado!=='pagada').length;
  const cards=[['cotizaciones','quote','Cotizaciones',cs.length,'Solicitudes registradas'],['tickets','ticket','Tickets abiertos',openTickets,'Solicitudes en seguimiento'],['facturas','invoice','Facturas pendientes',pending,'Cobros por liquidar']];
  const recent=cs.slice(0,4).map(c=>'<div class="activity-row"><div><b>'+esc(c.servicio)+'</b><small>Solicitud #'+c.id+' · '+esc(c.zona||'Zona sin especificar')+'</small></div>'+status(c.estado)+'</div>').join('')||empty('Aún no hay cotizaciones',admin?'Aquí aparecerán las solicitudes de tus clientes.':'Solicita tu primer servicio para comenzar.');
  $('#vista').innerHTML='<div class="stats">'+cards.map(([next,i,t,n,d])=>'<button class="stat" onclick="go(\''+next+'\')"><span class="stat-icon">'+icon(i)+'</span><span><span class="stat-label">'+t+'</span><strong>'+n+'</strong><small>'+d+'</small></span></button>').join('')+'</div><div class="overview-grid"><section class="card"><div class="section-head"><h2>Cotizaciones recientes</h2><button class="text-button" onclick="go(\'cotizaciones\')">Ver todas →</button></div>'+recent+'</section><section class="card"><h2>¿Qué necesitas hacer?</h2><button class="quick-action" onclick="go(\'cotizaciones\')"><span><b>'+(admin?'Revisar cotizaciones':'Solicitar una cotización')+'</b><small>'+(admin?'Consulta y responde las solicitudes.':'Describe el trabajo y comparte fotografías.')+'</small></span><span>→</span></button><button class="quick-action" onclick="go(\'tickets\')"><span><b>'+(admin?'Atender tickets':'Contactar con soporte')+'</b><small>Consulta mensajes y seguimiento.</small></span><span>→</span></button><button class="quick-action" onclick="go(\'facturas\')"><span><b>Consultar facturas</b><small>Revisa importes y documentos.</small></span><span>→</span></button></section></div>';
}

// ---- Tickets ----
async function verTickets() {
  const seq=loadSequence;const ts = await api('/api/tickets');if(seq!==loadSequence||!yo||tab!=='tickets')return;
  const form = yo.rol === 'admin' ? '' : `<form class="card form-card" onsubmit="nuevoTicket(event)">
    <h2>Nuevo ticket</h2><p class="section-note">Describe tu solicitud para que podamos darle seguimiento.</p>
    <select id="tipo"><option value="queja">Queja</option><option value="cobro">Cobro</option><option value="factura">Factura</option><option value="soporte">Soporte</option></select>
    <input id="asunto" placeholder="Asunto" required>
    <textarea id="desc" rows="3" placeholder="Describe el problema" required></textarea>
    <button>Enviar</button></form>`;
  const lista = ts.map(t => `<div class="card">
    <b>#${t.id} ${esc(t.asunto)}</b> <span class="tag">${esc(t.tipo)}</span> <span class="tag">${esc(t.estado)}</span><br>
    <small>${esc(t.cliente)} · ${esc(t.creado)}</small><br>
    <button class="sec" onclick="abrir(${t.id})">Abrir</button>
    <div id="t${t.id}"></div></div>`).join('') || empty('Sin tickets por el momento','Aquí aparecerán tus solicitudes de atención.','ticket');
  setRecords(form,lista,'Historial de tickets');
}
async function nuevoTicket(e) {
  e.preventDefault();
  await api('/api/tickets', 'POST', { tipo: $('#tipo').value, asunto: $('#asunto').value, descripcion: $('#desc').value });
  verTickets();
}
async function abrir(id) {
  const seq=loadSequence;const d = await api('/api/tickets/' + id);if(seq!==loadSequence||!$('#t'+id))return;
  const msgs = d.mensajes.map(m => `<div class="msg ${m.rol === 'admin' ? 'admin' : ''}"><b>${esc(m.nombre)}</b> <small>${esc(m.creado)}</small><br>${esc(m.texto)}</div>`).join('');
  const est = yo.rol === 'admin'
    ? `<select onchange="estado(${id},this.value)">${['abierto', 'en proceso', 'resuelto', 'cerrado'].map(s => `<option ${s === d.ticket.estado ? 'selected' : ''}>${s}</option>`).join('')}</select>` : '';
  $('#t' + id).innerHTML = msgs + est + `<form onsubmit="responder(event,${id})"><textarea rows="2" placeholder="Escribe un mensaje" required></textarea><button>Responder</button></form>`;
  decorate();
}
async function responder(e, id) {
  e.preventDefault();
  await api(`/api/tickets/${id}/mensajes`, 'POST', { texto: e.target.querySelector('textarea').value });
  abrir(id);
}
async function estado(id, v) { await api('/api/tickets/' + id, 'PATCH', { estado: v }); }

// ---- Cobros y facturas ----
async function verFacturas() {
  const seq=loadSequence;const fs = await api('/api/facturas');if(seq!==loadSequence||!yo||tab!=='facturas')return;
  const form = yo.rol === 'admin' ? `<form class="card form-card" onsubmit="nuevaFactura(event)">
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
  </div>`).join('') || empty('Sin cobros ni facturas','Los documentos registrados aparecerán aquí.','invoice');
  setRecords(form,lista,'Cobros y facturas registrados');
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
  const seq=loadSequence;const cs = await api('/api/cotizaciones');if(seq!==loadSequence||!yo||tab!=='cotizaciones')return;
  const admin = yo.rol === 'admin';
  const form = admin ? '' : `<form class="card form-card" onsubmit="nuevaCot(event)">
    <h2>Solicitar cotización</h2><p class="section-note">Cuéntanos qué trabajo necesitas. Las fotos nos ayudan a preparar tu propuesta.</p>
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
      <p>${esc(c.descripcion)}</p><div class="record-photos">${fotos}</div>${precio}${botones}${cotizar}</div>`;
  }).join('') || empty('Aún no hay solicitudes',admin?'Aquí aparecerán las solicitudes de tus clientes.':'Completa el formulario para pedir tu primera cotización.');
  setRecords(form,lista,'Tus solicitudes');
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
