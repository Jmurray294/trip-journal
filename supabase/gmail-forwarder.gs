/**
 * Trip Journal — Gmail forwarder.
 *
 * Runs inside the family's trips Gmail account (script.google.com). Every 5 minutes it picks up
 * new mail sent to a "+code" address, sends each message to the Trip Journal inbound-email function,
 * then marks it read, labels it and archives it. Other mail is left alone. The "+code" in the address it was sent to (e.g. murraytrips+3f9a1c@gmail.com)
 * tells the app which family it's for.
 *
 * Setup: paste this into a new Apps Script project, then choose `setup` in the toolbar and Run it once
 * (Google asks you to allow access to Gmail and outside requests). That's it.
 */

const FUNCTION_URL = 'https://hevucbiddgcvbxynstjn.supabase.co/functions/v1/inbound-email';
const SECRET = 'PASTE-INBOUND-SECRET-HERE'; // same value as the INBOUND_SECRET secret in Supabase
const DONE = 'trip-journal/imported';
const FAILED = 'trip-journal/failed';
const MAX_TRIES = 3;

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkMail').timeBased().everyMinutes(5).create();
  label_(DONE); label_(FAILED);
  checkMail();
  Logger.log('Trip Journal forwarder is running every 5 minutes.');
}

function checkMail() {
  scan_('newer_than:2d');
}

// Send the last two weeks of +code mail through again, e.g. after the app learns to read more.
// Items already in a trip are updated, not duplicated. Choose `reimport` in the toolbar and Run it.
function reimport() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  for (const k in all) if (k.indexOf('seen:') === 0) props.deleteProperty(k);
  scan_('newer_than:14d');
}

function scan_(query) {
  const done = label_(DONE), failed = label_(FAILED);
  const props = PropertiesService.getScriptProperties();
  pruneSeen_(props);
  // Not "is:unread": mail you forward to your own +code address arrives already read. Only messages
  // addressed to a +code address are touched; the rest of the inbox is left alone.
  const threads = GmailApp.search(query, 0, 100);
  for (const thread of threads) {
    let handled = false;
    for (const msg of thread.getMessages()) {
      const seenKey = 'seen:' + msg.getId();
      if (props.getProperty(seenKey)) continue;
      const code = mailboxCode_(msg);
      if (!code) continue;
      handled = true;
      const payload = {
        From: msg.getFrom(),
        Subject: msg.getSubject(),
        TextBody: msg.getPlainBody(),
        HtmlBody: msg.getBody(),
        MailboxHash: code,
        ToFull: [],
        Attachments: attachments_(msg),
      };
      let status = 0;
      try {
        const res = UrlFetchApp.fetch(FUNCTION_URL + '?key=' + encodeURIComponent(SECRET), {
          method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
        });
        status = res.getResponseCode();
      } catch (e) { status = 0; }

      const triesKey = 'tries:' + msg.getId();
      if (status >= 200 && status < 300) {
        msg.markRead(); props.deleteProperty(triesKey); props.setProperty(seenKey, String(Date.now()));
        thread.addLabel(done);
      } else {
        // retry on the next runs (network hiccup, function cold start); give up after a few
        const tries = Number(props.getProperty(triesKey) || 0) + 1;
        if (tries >= MAX_TRIES || (status >= 400 && status < 500)) {
          msg.markRead(); thread.addLabel(failed); props.deleteProperty(triesKey); props.setProperty(seenKey, String(Date.now()));
        } else props.setProperty(triesKey, String(tries));
      }
    }
    if (handled && !thread.isUnread()) thread.moveToArchive();
  }
}

// Forget handled message ids once they're older than the search window.
function pruneSeen_(props) {
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
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

// The family code after "+" in whichever of our addresses the message was sent to.
function mailboxCode_(msg) {
  const me = Session.getActiveUser().getEmail().split('@')[0].toLowerCase();
  const fields = [msg.getTo(), msg.getCc(), msg.getBcc(), header_(msg, 'Delivered-To'), header_(msg, 'X-Original-To')].join(',');
  const re = new RegExp(me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\+([a-z0-9]+)@', 'i');
  const m = fields.match(re);
  return m ? m[1].toLowerCase() : '';
}

function header_(msg, name) {
  try { return msg.getHeader(name) || ''; } catch (e) { return ''; }
}

function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
