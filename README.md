# Craf7ton storefront

Mobile-first storefront for Craf7ton, built from the *Craf7ton Website Wireframe and Developer Brief* (v1).
It's plain HTML, CSS and JavaScript with no build step, so it runs on any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Pages

| Page | File |
|---|---|
| Home (hero rotation, shop by stack, new in, story strip, club quote, community wall, signup) | `index.html` |
| Shop (stack, category and colour filters, sort, infinite scroll, search via `?q=`) | `shop.html` |
| Product (swipe gallery front/back/print/on-body, sticky add to bag, size guide panel, wear it with) | `product.html?id=…` |
| Clubs (custom order form) | `clubs.html` |
| Story | `story.html` |
| Bag and checkout (Bag → Details → Pay, guest checkout, campus pickup or courier, Mobile Money first) | `cart.html` |
| Contact, Size guide, Delivery and returns | `contact.html`, `size-guide.html`, `delivery-returns.html` |

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Before launch: what you need to fill in

All store settings live in **`assets/js/config.js`**:

- `whatsapp`, `email`, `socialHandle`, `instagram`, `tiktok`: real contact details (placeholders for now).
- `formEndpoint`: optional. Set it to a Formspree, Getform or Google Apps Script URL so club quotes, contact messages, drop signups and orders reach the store inbox. Without it, forms open WhatsApp with the message pre-filled and offer an email link.
- `paystackPublicKey`: turns on real Mobile Money and card payments through Paystack Inline. Without it, checkout runs in **order by WhatsApp** mode: the customer places the order, sends it to the store on WhatsApp, and pays by MoMo manually.
- `delivery.courierFee`, `delivery.campuses`: confirm with the brand team.

Other files:

- **Logo:** `assets/img/logo.svg` is a placeholder. Replace it with the supplied wordmark file and keep the filename. The brief says not to retype the wordmark in a font.
- **Products and prices:** `assets/js/products.js`. Prices are placeholders. Stacks and categories are tags, so the shop-by-stack tiles and filters pick up new products automatically.
- **Photos:** products show generated front/back mockups until you add real photos. Add an `images` object to a product (`front`, `back`, `print`, `person`, WebP, lazy loaded). Keep the hero under 150 KB.
- **Community wall:** add customer photos to the `WALL` array in `assets/js/app.js`.
- **Size chart:** `SIZE_TABLE` in `assets/js/app.js`. The measurements are placeholders, so check them against the real blanks.
- **Policy copy:** the delivery, returns and story text is a draft for the brand team to approve.

## Analytics

`app.js` pushes these events to `window.dataLayer`. It also forwards them to `gtag`, `plausible` and `fbq` when they're present:
`add_to_cart`, `begin_checkout`, `purchase`, `club_form_submit` (plus `generate_lead` and `sign_up`).
Paste your analytics snippet into the `<head>` of each page (there's a comment marking the spot).

## Payments: important

Paystack supports Ghana Mobile Money (MTN, Telecel, AirtelTigo) and cards in GHS. This front end only opens the payment popup.
**Before fulfilling an order, verify each payment on the server** with a Paystack webhook or the Verify Transaction API.
A static site cannot do this by itself, so you'll need a small serverless function, or a move to a platform.

## Shopify / WooCommerce

The brief recommends Shopify or WooCommerce for launch. This build is the agreed design and UX as working code: the layout, components, copy and flows map one-to-one onto a theme.
If you move to a platform, keep `styles.css` and port the sections into theme templates. The cart, checkout, payments and product admin then come from the platform, and `config.js` / `products.js` are no longer needed.

## Not in v1 (per the brief)

Accounts and loyalty, live social feed, AI chatbot, comparison tool, app.
