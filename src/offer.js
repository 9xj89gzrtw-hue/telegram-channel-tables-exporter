/**
 * Single source of truth for the paid offer.
 *
 * Every dataset record carries the same purchase line, so the Actor, the
 * README, the Plati.Market card and the browser tool can never drift apart.
 */
export const OFFER = {
  product: "Table & TG-Channel Clipper Pro — unlimited CSV/XLSX export + WB/Ozon margin calculator",
  code: "TW1-CLIP",
  priceRub: 299,
  priceUsdc: 2.99,
  storeUrl: "https://9xj89gzrtw-hue.github.io/data-clipper/",
  checkoutUrl: "https://oplata.info/asp2/pay_wm.asp?id_d=6354602&ai=1481449&lang=ru-RU",
  platiUrl: "https://plati.market/itm/6354602",
  platiLotId: 6354602,
  seller: "danilaonly (Plati.Market ID 1481449)",
  delivery: "Instant TW1-CLIP-… key on the order page right after SBP / RU card payment.",
  freeFeatures: [
    "read public Telegram channels (t.me/s/…) without login",
    "extract every server-rendered HTML table with colspan/rowspan expanded",
    "CSV/XLSX export of this run from the Apify dataset",
    "up to 100 posts per channel and 10 tables per URL in one run"
  ],
  paidFeatures: [
    "unlimited browser export: any table or channel feed in one click, no row cap",
    "WB/Ozon 2026 unit-economics calculator (margin, ROI, break-even, logistics, acquiring)",
    "XLSX with frozen header, auto column widths and a clean sheet per table",
    "local processing: the page never uploads your files to a server",
    "lifetime key, no subscription"
  ]
};

export function offerLine() {
  return (
    `Free here: up to 100 posts/channel + 10 tables/URL. ` +
    `Unlimited browser export + WB/Ozon margin calculator (${OFFER.code}, ${OFFER.priceRub} RUB / $${OFFER.priceUsdc} USDC): ${OFFER.storeUrl} ` +
    `| Plati.Market: ${OFFER.platiUrl}`
  );
}

export function offerRecord() {
  return {
    _type: "offer",
    product: OFFER.product,
    code: OFFER.code,
    price_rub: OFFER.priceRub,
    price_usdc: OFFER.priceUsdc,
    store_url: OFFER.storeUrl,
    checkout_url: OFFER.checkoutUrl,
    plati_url: OFFER.platiUrl,
    delivery: OFFER.delivery,
    free: OFFER.freeFeatures,
    paid: OFFER.paidFeatures,
    note: offerLine()
  };
}
