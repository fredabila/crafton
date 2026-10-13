/* Shop taxonomy: stacks (identity) and categories (garment). Served to the storefront via /api/config. */
export const STACKS = [
  { id: 'frontend', name: 'Frontend', glyph: '</>' },
  { id: 'backend', name: 'Backend', glyph: '{ }' },
  { id: 'git-devops', name: 'Git and DevOps', glyph: '$_' },
  { id: 'ai-data', name: 'AI and Data', glyph: '∑' },
  { id: 'hardware', name: 'Hardware', glyph: '⏚' },
  { id: 'campus-clubs', name: 'Campus clubs', glyph: '#' }
];

export const CATEGORIES = [
  { id: 'tees', name: 'Tees' },
  { id: 'hoodies', name: 'Hoodies' },
  { id: 'caps', name: 'Caps' },
  { id: 'accessories', name: 'Accessories' }
];

export const COLLECTION_LINES = {
  all: 'Printed both sides. Heavy cotton that survives a hackathon.',
  frontend: 'For people who argue about border-radius.',
  backend: 'For the ones who keep production alive.',
  'git-devops': 'Commit often. Wear it more.',
  'ai-data': 'Trained on coffee and late nights.',
  hardware: 'For builders who own a soldering iron.',
  'campus-clubs': 'Your club, our fabric. Bulk pricing on request.',
  tees: 'Front logo, loud back print.',
  hoodies: 'For cold labs and long nights.',
  caps: 'Low effort, high signal.',
  accessories: 'Small things for your setup.'
};

export const PRODUCT_TYPES = ['tee', 'hoodie', 'cap', 'stickers', 'other'];
export const ORDER_STATUSES = ['pending_payment', 'awaiting_manual_payment', 'paid', 'processing', 'ready_for_pickup', 'shipped', 'completed', 'cancelled', 'expired'];
export const MOMO_NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];
