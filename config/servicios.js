// Catálogo de servicios de Luxury Palace.
//
// ACTUALIZADO con el tarifario real que se definió después de la primera
// versión de este sistema (antes todo estaba en $10 parejo como placeholder).
//
// PENDIENTE DE CONFIRMAR CON COKY (usar estos valores como referencia, no como
// definitivos — reemplazar aquí en cuanto los tenga):
// - "Uñas" y "Cabello" subieron de precio en el ajuste final acordado con Ana,
//   pero la tabla con los montos nuevos no llegó a texto — abajo están los
//   precios ANTERIORES al ajuste (el tarifario original). Actualízalos aquí
//   apenas los tengas; nada más en el sistema depende de estos números.
// - "Faciales" (nuevo servicio de Leana) no tiene precio definido todavía —
//   está en $0 como placeholder, no ofrecer al cliente hasta ponerle precio real.
// - Confirmar si "Anita" (como se llamó en la primera versión) y "Ana"
//   (la dueña, que también atiende uñas y corporal) son la misma persona —
//   aquí quedó unificada como "ana".
//
// Comisiones acordadas (no se usan todavía en el sistema de reservas, quedan
// documentadas aquí para cuando se conecte con la facturación):
//   Uñas 50% | Pestañas/Cejas 50% | Cabello-Cortes 40% | Cabello-Tratamientos 58% | Corporal 50%

const PERSONAL = {
  ana: { id: 'ana', nombre: 'Ana' },
  ceci: { id: 'ceci', nombre: 'Ceci' },
  leana: { id: 'leana', nombre: 'Leana' },
};

const CATEGORIAS = [
  { id: 'unas', nombre: 'Uñas', icono: '💅' },
  { id: 'pestanas_cejas', nombre: 'Pestañas y cejas', icono: '👁️' },
  { id: 'cabello_cortes', nombre: 'Cabello — cortes y peinado', icono: '✂️' },
  { id: 'cabello_tratamientos', nombre: 'Cabello — tratamientos', icono: '✨' },
  { id: 'corporal', nombre: 'Depilación corporal', icono: '🌿' },
  { id: 'faciales', nombre: 'Faciales', icono: '🧖‍♀️' },
];

const SERVICIOS = [
  // ---- Uñas (comisión 50%) — Ana y Ceci ----
  { id: 'manicura_normal', nombre: 'Manicura esmalte normal', categoria: 'unas', duracionMin: 90, precio: 7, personal: ['ana', 'ceci'] },
  { id: 'manicura_semi', nombre: 'Manicura esmalte semipermanente', categoria: 'unas', duracionMin: 90, precio: 10, personal: ['ana', 'ceci'] },
  { id: 'pedicura_normal', nombre: 'Pedicura esmalte normal', categoria: 'unas', duracionMin: 90, precio: 10, personal: ['ana', 'ceci'] },
  { id: 'pedicura_semi', nombre: 'Pedicura esmalte semipermanente', categoria: 'unas', duracionMin: 90, precio: 15, personal: ['ana', 'ceci'] },
  { id: 'manicura_hombre', nombre: 'Manicura caballero', categoria: 'unas', duracionMin: 90, precio: 7, personal: ['ana', 'ceci'] },
  { id: 'pedicura_hombre', nombre: 'Pedicura caballero', categoria: 'unas', duracionMin: 90, precio: 8, personal: ['ana', 'ceci'] },
  { id: 'base_rubber', nombre: 'Base rubber', categoria: 'unas', duracionMin: 90, precio: 15, personal: ['ana', 'ceci'] },
  { id: 'unas_gel', nombre: 'Uñas acrílico / poligel / gel', categoria: 'unas', duracionMin: 90, precio: 20, personal: ['ana', 'ceci'] },
  { id: 'unas_esculpidas', nombre: 'Uñas esculpidas', categoria: 'unas', duracionMin: 90, precio: 25, personal: ['ana', 'ceci'] },
  { id: 'jelly_spa', nombre: 'Jelly spa', categoria: 'unas', duracionMin: 90, precio: 18, personal: ['ana', 'ceci'] },

  // ---- Pestañas y cejas (comisión 50%) — Leana ----
  { id: 'pestanas_extension', nombre: 'Pestañas (extensión)', categoria: 'pestanas_cejas', duracionMin: 90, precio: 25, personal: ['leana'] },
  { id: 'lifting_pestanas', nombre: 'Lifting de pestañas', categoria: 'pestanas_cejas', duracionMin: 90, precio: 15, personal: ['leana'] },
  { id: 'laminado_cejas', nombre: 'Laminado de cejas', categoria: 'pestanas_cejas', duracionMin: 90, precio: 15, personal: ['leana'] },
  { id: 'depilacion_cejas', nombre: 'Depilación de cejas', categoria: 'pestanas_cejas', duracionMin: 90, precio: 8, personal: ['leana'] },

  // ---- Cabello — cortes (comisión 40%) — Ceci ----
  { id: 'corte_dama', nombre: 'Corte dama', categoria: 'cabello_cortes', duracionMin: 90, precio: 8, personal: ['ceci'] },
  { id: 'cepillado', nombre: 'Cepillado', categoria: 'cabello_cortes', duracionMin: 90, precio: 10, personal: ['ceci'] },
  { id: 'corte_caballero', nombre: 'Corte caballero', categoria: 'cabello_cortes', duracionMin: 90, precio: 6, personal: ['ceci'] },

  // ---- Cabello — tratamientos (comisión 58%) — Ceci ----
  { id: 'hidratacion', nombre: 'Hidratación', categoria: 'cabello_tratamientos', duracionMin: 90, precio: 25, personal: ['ceci'] },
  { id: 'tinte', nombre: 'Tinte', categoria: 'cabello_tratamientos', duracionMin: 90, precio: 35, personal: ['ceci'] },
  { id: 'keratina', nombre: 'Keratina', categoria: 'cabello_tratamientos', duracionMin: 90, precio: 60, personal: ['ceci'] },

  // ---- Depilación corporal (comisión 50%) — Ana y Ceci — precios confirmados, sin cambios ----
  { id: 'corp_axilas', nombre: 'Axilas', categoria: 'corporal', duracionMin: 90, precio: 8, personal: ['ana', 'ceci'] },
  { id: 'corp_medio_brazo', nombre: 'Medio brazo', categoria: 'corporal', duracionMin: 90, precio: 10, personal: ['ana', 'ceci'] },
  { id: 'corp_brazo_completo', nombre: 'Brazo completo', categoria: 'corporal', duracionMin: 90, precio: 12, personal: ['ana', 'ceci'] },
  { id: 'corp_abdomen', nombre: 'Abdomen', categoria: 'corporal', duracionMin: 90, precio: 10, personal: ['ana', 'ceci'] },
  { id: 'corp_media_pierna', nombre: 'Media pierna', categoria: 'corporal', duracionMin: 90, precio: 12, personal: ['ana', 'ceci'] },
  { id: 'corp_pierna_completa', nombre: 'Pierna completa', categoria: 'corporal', duracionMin: 90, precio: 15, personal: ['ana', 'ceci'] },
  { id: 'corp_bikini_basico', nombre: 'Bikini básico', categoria: 'corporal', duracionMin: 90, precio: 12, personal: ['ana', 'ceci'] },
  { id: 'corp_bikini_brasileno', nombre: 'Bikini brasileño', categoria: 'corporal', duracionMin: 90, precio: 16, personal: ['ana', 'ceci'] },
  { id: 'corp_espalda', nombre: 'Espalda', categoria: 'corporal', duracionMin: 90, precio: 16, personal: ['ana', 'ceci'] },
  { id: 'corp_genital_hombre', nombre: 'Genital completo (hombre)', categoria: 'corporal', duracionMin: 90, precio: 16, personal: ['ana', 'ceci'] },

  // ---- Faciales — Leana — SIN PRECIO DEFINIDO (placeholder) ----
  { id: 'facial_basico', nombre: 'Facial (precio por confirmar)', categoria: 'faciales', duracionMin: 90, precio: 0, personal: ['leana'], noOfrecerAunSinPrecio: true },
];

const HORARIO = {
  aperturaMin: 8 * 60,      // 08:00 en minutos desde medianoche
  ultimoInicioMin: 18 * 60, // 18:00 — ningún segmento nuevo puede iniciar en o después de esta hora
  granularidadMin: 30,      // slots candidatos cada 30 minutos
  diasAtencion: [0, 1, 2, 3, 4, 5, 6], // lunes a domingo (0=domingo en JS Date)
};

const PAGO = {
  porcentajeAbono: 0.20,
  banco: 'Banco Pichincha',
  tipoCuenta: 'Cuenta de ahorros',
  numeroCuenta: process.env.CUENTA_NUMERO || 'CONFIGURAR_EN_ENV',
  titular: 'Araujo Villarreal Ana Olga',
  cedula: process.env.CUENTA_CEDULA || 'CONFIGURAR_EN_ENV',
};

const REGLAS = {
  toleranciaEsperaMin: 10,
  minAnticipacionCambioMin: 120, // 2 horas — para modificar sin perder el abono
};

module.exports = { PERSONAL, CATEGORIAS, SERVICIOS, HORARIO, PAGO, REGLAS };
