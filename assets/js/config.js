/*
 * Store settings. Edit this file before launch; nothing else needs touching for these values.
 * Values marked TODO are placeholders waiting on the brand team.
 */
window.CRAFTON_CONFIG = {
  brand: 'Craf7ton',
  currency: 'GHS',

  // TODO: real WhatsApp business number in international format, digits only (e.g. 233241234567).
  whatsapp: '233000000000',
  // TODO: real store inbox.
  email: 'hello@craf7ton.com',
  // TODO: real social handle (without @) and profile links.
  socialHandle: 'craf7ton',
  instagram: 'https://instagram.com/craf7ton',
  tiktok: 'https://www.tiktok.com/@craf7ton',

  announcement: 'Free delivery on club orders over 10 pieces',

  // Optional form backend (Formspree, Getform, a Google Apps Script URL, etc.).
  // When set, club quotes, contact messages and drop signups are POSTed here as JSON
  // so they land in the store inbox. When empty, forms fall back to WhatsApp / email links.
  formEndpoint: '',

  // Paystack public key (pk_live_... or pk_test_...). When empty, checkout runs in
  // "order by WhatsApp" mode: the order is sent to the store on WhatsApp and paid by MoMo manually.
  // Payments MUST be verified server side (Paystack webhook) before an order is fulfilled.
  paystackPublicKey: '',

  delivery: {
    // TODO: confirm fees with the brand team.
    courierFee: 35,
    freeDeliveryPieces: 10,
    campuses: [
      'UMaT, Tarkwa',
      'KNUST, Kumasi',
      'University of Ghana, Legon',
      'UCC, Cape Coast',
      'Ashesi, Berekuso',
      'Other campus (tell us in notes)'
    ]
  }
};
