/*
 * Product catalogue. This stands in for the product admin: stacks and categories are tags,
 * so the "Shop by stack" tiles and filters pick products up automatically.
 *
 * Prices are TODO placeholders until the brand team confirms them.
 * `images` is optional: add real WebP photo paths (front, back, print, person) and they
 * replace the generated mockups. Example:
 *   images: { front: 'assets/img/products/git-brain-tee-front.webp', back: '...', print: '...', person: '...' }
 */
window.CRAFTON_STACKS = [
  { id: 'frontend', name: 'Frontend', glyph: '</>' },
  { id: 'backend', name: 'Backend', glyph: '{ }' },
  { id: 'git-devops', name: 'Git and DevOps', glyph: '$_' },
  { id: 'ai-data', name: 'AI and Data', glyph: '∑' },
  { id: 'hardware', name: 'Hardware', glyph: '⏚' },
  { id: 'campus-clubs', name: 'Campus clubs', glyph: '#' }
];

window.CRAFTON_CATEGORIES = [
  { id: 'tees', name: 'Tees' },
  { id: 'hoodies', name: 'Hoodies' },
  { id: 'caps', name: 'Caps' },
  { id: 'accessories', name: 'Accessories' }
];

window.CRAFTON_COLLECTION_LINES = {
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

const BLACK = { name: 'Black', hex: '#111111' };
const WHITE = { name: 'White', hex: '#f4f4f2' };
const ASH = { name: 'Ash grey', hex: '#9a9a96' };
const ORANGE = { name: 'Signal orange', hex: '#f5a800' };

window.CRAFTON_PRODUCTS = [
  {
    id: 'git-brain-tee', name: 'Git Brain Tee', type: 'tee', category: 'tees',
    stacks: ['git-devops'], price: 180, isNew: true, drop: '01',
    colours: [BLACK, WHITE], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'My Brain Runs On Git',
    tagline: 'Code, create and wear your passion.',
    description: 'The Drop 01 tee. Small Craf7ton mark on the chest, the full "My Brain Runs On Git" print across the back.',
    details: ['100% cotton, 220 gsm', 'Regular unisex fit', 'Front and back print', 'Wash cold, inside out']
  },
  {
    id: 'works-on-my-machine-tee', name: 'Works On My Machine Tee', type: 'tee', category: 'tees',
    stacks: ['backend'], price: 180, isNew: true, drop: '01',
    colours: [BLACK, ASH], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'It Works On My Machine',
    tagline: 'The oldest excuse in the book, printed on your back.',
    description: 'For every backend dev who has said it at least once this week.',
    details: ['100% cotton, 220 gsm', 'Regular unisex fit', 'Front and back print', 'Wash cold, inside out']
  },
  {
    id: 'console-log-tee', name: 'console.log(feelings) Tee', type: 'tee', category: 'tees',
    stacks: ['frontend'], price: 180, isNew: true, drop: '01',
    colours: [WHITE, BLACK], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'console.log( feelings )',
    tagline: 'Debugging, but make it emotional.',
    description: 'Frontend energy. Clean front, honest back.',
    details: ['100% cotton, 220 gsm', 'Regular unisex fit', 'Front and back print', 'Wash cold, inside out']
  },
  {
    id: 'ship-it-hoodie', name: 'Ship It Hoodie', type: 'hoodie', category: 'hoodies',
    stacks: ['git-devops', 'backend'], price: 350, isNew: true, drop: '01',
    colours: [BLACK, ASH], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'git push --force Ship It',
    tagline: 'For cold labs and Friday deploys.',
    description: 'Heavy fleece hoodie with a kangaroo pocket and a back print that does not ask for code review.',
    details: ['80% cotton, 20% polyester fleece, 320 gsm', 'Relaxed fit', 'Front and back print', 'Wash cold, do not tumble dry']
  },
  {
    id: 'prompt-engineer-tee', name: 'Prompt Engineer Tee', type: 'tee', category: 'tees',
    stacks: ['ai-data'], price: 180, isNew: false, drop: '01',
    colours: [BLACK, WHITE], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'Trained On Coffee',
    tagline: 'Model weights: mostly caffeine.',
    description: 'For the AI and data crowd. Fine-tuned for long nights.',
    details: ['100% cotton, 220 gsm', 'Regular unisex fit', 'Front and back print', 'Wash cold, inside out']
  },
  {
    id: 'void-warranty-tee', name: 'I Void Warranties Tee', type: 'tee', category: 'tees',
    stacks: ['hardware'], price: 180, isNew: false, drop: '01',
    colours: [ASH, BLACK], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'craf7ton', back: 'I Void Warranties',
    tagline: 'If it has screws, it can be opened.',
    description: 'For builders, tinkerers and anyone who owns a soldering iron.',
    details: ['100% cotton, 220 gsm', 'Regular unisex fit', 'Front and back print', 'Wash cold, inside out']
  },
  {
    id: 'craf7ton-cap', name: 'Craf7ton Dad Cap', type: 'cap', category: 'caps',
    stacks: ['frontend', 'backend', 'git-devops', 'ai-data', 'hardware'], price: 120, isNew: true, drop: '01',
    colours: [BLACK, WHITE], sizes: ['One size'],
    front: 'craf7ton', back: '</>',
    tagline: 'Low effort, high signal.',
    description: 'Embroidered six-panel cap with an adjustable strap.',
    details: ['100% cotton twill', 'Adjustable strap', 'Embroidered front, printed back', 'Spot clean only']
  },
  {
    id: 'club-custom-tee', name: 'Club Custom Tee', type: 'tee', category: 'tees',
    stacks: ['campus-clubs'], price: 150, isNew: false, drop: 'Club', quoteOnly: true,
    colours: [BLACK, WHITE, ORANGE], sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    front: 'your logo', back: 'Your Club Name Here',
    tagline: 'Your logo, your colours, our fabric.',
    description: 'Our Drop 01 blank with your club or team artwork. Bulk pricing for student clubs and tech teams. Price shown is a guide per piece; we confirm the final quote on WhatsApp.',
    details: ['Minimum 10 pieces', 'Front and back print', 'Mix sizes freely', 'About 2 weeks from artwork approval']
  },
  {
    id: 'sticker-pack', name: 'Dev Sticker Pack', type: 'stickers', category: 'accessories',
    stacks: ['frontend', 'backend', 'git-devops', 'ai-data', 'hardware'], price: 40, isNew: false, drop: '01',
    colours: [{ name: 'Mixed', hex: '#f5a800' }], sizes: ['Pack of 8'],
    front: 'craf7ton', back: 'stickers',
    tagline: 'For laptops that need a personality.',
    description: 'Eight matte vinyl stickers from the Drop 01 prints.',
    details: ['8 stickers per pack', 'Matte vinyl, waterproof', 'Fits any laptop lid']
  }
];
