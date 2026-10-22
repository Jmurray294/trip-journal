/**
 * Trip Journal — Gmail watcher.
 *
 * Runs inside a family member's own Gmail (script.google.com), so bookings, changes, payment notices
 * and trip plans reach the journal without anyone forwarding them. Every 10 minutes it looks for
 * travel mail — mail from airlines, hotels, cruise lines, booking sites and the like, or with a
 * travel subject — and sends each new message to the Trip Journal inbound-email function, which keeps
 * what is about the family's travel and drops the rest. Your inbox is left as it is: nothing is
 * marked read or archived; emails that went into the journal get a "Trip Journal" label.
 *
 * Setup: paste this into a new Apps Script project, fill in SECRET and FAMILY_CODE below, then choose
 * `setup` in the toolbar and Run it once (Google asks you to allow access to Gmail and outside
 * requests). It also reads the last 60 days of travel mail, a few at a time over the next runs.
 */

const FUNCTION_URL = 'https://hevucbiddgcvbxynstjn.supabase.co/functions/v1/inbound-email';
const SECRET = 'PASTE-INBOUND-SECRET-HERE';    // same value as the INBOUND_SECRET secret in Supabase
const FAMILY_CODE = 'PASTE-FAMILY-CODE-HERE';  // the letters after "+" in the journal's email address
const LABEL = 'Trip Journal';
const CATCH_UP_DAYS = 60;
const MAX_TRIES = 3;
const TIME_BUDGET = 4.5 * 60 * 1000;           // Apps Script stops a run at 6 minutes
const DAY = 24 * 60 * 60 * 1000;

// Mail from these is always looked at. Add your travel agent or anyone else who sends trip mail.
const SENDERS = [
  // airlines
  'united.com', 'delta.com', 'aa.com', 'southwest.com', 'alaskaair.com', 'jetblue.com', 'hawaiianairlines.com',
  'flyfrontier.com', 'spirit.com', 'suncountry.com', 'aircanada', 'westjet.com', 'britishairways.com', 'virginatlantic.com',
  'lufthansa', 'airfrance', 'klm', 'iberia', 'aerlingus.com', 'aegeanair.com', 'swiss.com', 'emirates', 'qatarairways',
  'turkishairlines', 'aeromexico', 'copaair', 'icelandair', 'ryanair', 'easyjet', 'qantas', 'singaporeair', 'cathaypacific',
  // hotels and rentals
  'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'accor', 'wyndham', 'choicehotels.com', 'bestwestern.com',
  'fourseasons.com', 'airbnb.com', 'vrbo.com', 'booking.com', 'hotels.com', 'expedia', 'priceline.com', 'agoda',
  'trip.com', 'kayak.com', 'hopper.com', 'tripit.com', 'travelocity', 'orbitz', 'costcotravel',
  // cruises
  'royalcaribbean', 'carnival.com', 'ncl.com', 'celebritycruises', 'princess.com', 'hollandamerica', 'vikingcruises',
  'vikingrivercruises', 'disneycruise', 'msccruises', 'virginvoyages', 'cunard', 'oceaniacruises', 'regentsevenseas',
  // cars, trains, tours, tables, tickets
  'hertz.com', 'avis.com', 'budget.com', 'enterprise.com', 'nationalcar.com', 'alamo.com', 'sixt', 'turo.com',
  'amtrak.com', 'eurostar', 'trainline', 'viator.com', 'getyourguide', 'klook', 'opentable.com', 'resy.com',
  'disneyworld', 'disneyland', 'universalorlando', 'tsa.gov', 'cbp.dhs.gov', 'state.gov',
];

// ...and so is mail from anyone with one of these in the subject (bookings, changes, friends' trip plans).
const SUBJECT_WORDS = [
  'itinerary', 'reservation', 'booking', 'e-ticket', 'eticket', 'boarding pass', 'check-in', 'check in',
  'schedule change', 'flight change', 'gate change', 'flight delay', 'your flight', 'your trip', 'your stay',
  'upcoming stay', 'upcoming trip', 'cruise', 'car rental', 'rental car', 'travel documents', 'trip', 'vacation',
  'getaway', 'travel',
];

function setup() {
  if (SECRET.indexOf('PASTE') === 0 || FAMILY_CODE.indexOf('PASTE') === 0) throw new Error('Fill in SECRET and FAMILY_CODE first.');
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkMail').timeBased().everyMinutes(10).create();
  label_();
  catchUp();
  Logger.log('Trip Journal watcher is running every 10 minutes.');
}

function checkMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return; // the last run is still going
  try {
    const props = PropertiesService.getScriptProperties();
    const days = Number(props.getProperty('catchUpDays') || 2);
    if (scan_(days) && days > 2) props.deleteProperty('catchUpDays');
  } finally { lock.releaseLock(); }
}

// Read further back, e.g. for a trip already being planned, or after the app learns to read more.
// Items already in a trip are updated, not duplicated. Choose `catchUp` in the toolbar and Run it.
function catchUp() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  for (const k in all) if (k.indexOf('seen:') === 0) props.deleteProperty(k);
  props.setProperty('catchUpDays', String(CATCH_UP_DAYS));
  checkMail();
}

// True when every matching message has been handled; false when the run ran out of time.
function scan_(days) {
  const started = Date.now();
  const props = PropertiesService.getScriptProperties();
  pruneSeen_(props, days);
  const label = label_();
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const since = started - days * DAY;
  const query = query_(days);
  for (let start = 0; ; start += 50) {
    const threads = GmailApp.search(query, start, 50);
    for (const thread of threads) {
      let filed = false;
      for (const msg of thread.getMessages()) {
        if (msg.getDate().getTime() < since) continue;
        const seenKey = 'seen:' + msg.getId();
        if (props.getProperty(seenKey)) continue;
        // mail you sent, including what you forward to the journal's address yourself
        if (msg.getFrom().toLowerCase().indexOf(me) >= 0) continue;
        if (Date.now() - started > TIME_BUDGET) { if (filed) thread.addLabel(label); return false; }

        const payload = {
          From: msg.getFrom(),
          Subject: msg.getSubject(),
          TextBody: msg.getPlainBody(),
          HtmlBody: msg.getBody(),
          MailboxHash: FAMILY_CODE,
          ToFull: [],
          MessageId: msg.getId(),
          Attachments: attachments_(msg),
          Watched: true,
        };
        let status = 0, result = {};
        try {
          const res = UrlFetchApp.fetch(FUNCTION_URL + '?key=' + encodeURIComponent(SECRET), {
            method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
          });
          status = res.getResponseCode();
          try { result = JSON.parse(res.getContentText()); } catch (e) { result = {}; }
        } catch (e) { status = 0; }
        if (result.ignored === 'unknown address') throw new Error('FAMILY_CODE is not right: the journal does not know "' + FAMILY_CODE + '".');

        const triesKey = 'tries:' + msg.getId();
        if (status >= 200 && status < 300) {
          props.deleteProperty(triesKey); props.setProperty(seenKey, String(Date.now()));
          if (result.added > 0 || result.toSort > 0) filed = true;
        } else {
          // try again on the next runs (network hiccup, cold start, Claude busy); give up after a few
          const tries = Number(props.getProperty(triesKey) || 0) + 1;
          if (tries >= MAX_TRIES || (status >= 400 && status < 500)) {
            props.deleteProperty(triesKey); props.setProperty(seenKey, String(Date.now()));
          } else props.setProperty(triesKey, String(tries));
        }
      }
      if (filed) thread.addLabel(label);
    }
    if (threads.length < 50) return true;
  }
}

function query_(days) {
  const quote = (w) => (/[\s-]/.test(w) ? '"' + w + '"' : w);
  return '{from:(' + SENDERS.join(' OR ') + ') subject:(' + SUBJECT_WORDS.map(quote).join(' OR ') + ')}' +
    ' newer_than:' + days + 'd -category:promotions -category:social -in:chats';
}

// Forget handled message ids once they're older than the search window.
function pruneSeen_(props, days) {
  const cutoff = Date.now() - (days + 1) * DAY;
  const all = props.getProperties();
  for (const k in all) if (k.indexOf('seen:') === 0 && Number(all[k]) < cutoff) props.deleteProperty(k);
}

// PDFs and photos attached to the email (invoices, e-tickets, itineraries), base64 for the function.
function attachments_(msg) {
  const out = [];
  let total = 0;
  for (const a of msg.getAttachments({ includeInlineImages: false })) {
    const type = (a.getContentType() || '').toLowerCase();
    const name = a.getName() || '';
    if (!(type === 'application/pdf' || /\.pdf$/i.test(name) || /^image\/(jpeg|png|gif|webp)$/.test(type))) continue;
    const size = a.getSize();
    if (out.length >= 6 || total + size > 15 * 1024 * 1024) continue;
    out.push({ Name: name, ContentType: /\.pdf$/i.test(name) ? 'application/pdf' : type, Content: Utilities.base64Encode(a.getBytes()) });
    total += size;
  }
  return out;
}

function label_() {
  return GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
}
