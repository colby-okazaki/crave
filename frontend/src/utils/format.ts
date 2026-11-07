const METERS_PER_MILE = 1609.344;

/** 2 → "$$" */
export function priceLabel(price: number) {
  return "$".repeat(Math.min(Math.max(Math.round(price), 1), 4));
}

/** 1290 → "0.8 mi away" (never "0.0"). */
export function milesAway(meters: number) {
  const miles = Math.max(meters / METERS_PER_MILE, 0.1);
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

/** 1240 → "1.2k", 640 → "640" */
export function compactCount(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}

/**
 * Is a place open right now, from hours like "11:00–21:00"?
 * Handles places that close after midnight ("18:00–02:00").
 * Returns null if the hours can't be read.
 */
export function isOpenNow(hours: string, now = new Date()): boolean | null {
  const match = hours.match(/^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [open, close] = [
    Number(match[1]) * 60 + Number(match[2]),
    Number(match[3]) * 60 + Number(match[4]),
  ];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

/** "11:00" → "11 AM", "22:30" → "10:30 PM" */
function clockLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

/** "11:00–22:00" → "Open today 11 AM – 10 PM" (or "Closed now · Today 5 PM – 10 PM"). */
export function hoursToday(hours: string, now = new Date()) {
  const match = hours.match(/^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (!match) return hours;
  const range = `${clockLabel(match[1])} – ${clockLabel(match[2])}`;
  return isOpenNow(hours, now) ? `Open today ${range}` : `Closed now · Today ${range}`;
}

/** Opens Apple Maps on iPhone/iPad/Mac, Google Maps everywhere else. */
export function mapsUrl(place: { name: string; address: string; location: { lat: number; lng: number } }) {
  const query = `${place.name}, ${place.address}`;
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) {
    const { lat, lng } = place.location;
    return `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&address=${encodeURIComponent(place.address)}&ll=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** The restaurant's menu, or a web search for it if we don't have a link. */
export function menuUrl(place: { name: string; address: string; menuUrl?: string }) {
  return place.menuUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${place.address} menu`)}`;
}
