// CAMBIA ESTE NÚMERO por el WhatsApp real (formato: 52 + 10 dígitos)
var WA = "524420000000";
function enviar(e){
  e.preventDefault();
  var t = "Hola, quiero cotizar: " + document.getElementById("serv").value +
          ". Zona: " + document.getElementById("zona").value +
          ". Detalle: " + (document.getElementById("desc").value || "sin detalle");
  window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(t), "_blank", "noopener");
  return false;
}
