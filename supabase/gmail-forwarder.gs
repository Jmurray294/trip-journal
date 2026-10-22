/**
 * Trip Journal — Gmail forwarder.
 *
 * Runs inside the family's trips Gmail account (script.google.com). Every 5 minutes it picks up
 * new mail sent to a "+code" address, sends each message to the Trip Journal inbound-email function,
 * then marks it read, labels it and archives it. The "+code" in the address it was sent to (e.g. murraytrips+3f9a1c@gmail.com)
 * tells the app which family it's for.
 *
 * With FAMILY_CODE filled in, it also reads mail sent to the plain trips address — airlines, hotels and
 * booking sites write there when it's the email on the booking, including changes and cancellations.
 * The function keeps what is about the family's travel; anything else is left in the inbox untouched.
 *
 * Setup: paste this into a new Apps Script project, then choose `setup` in the toolbar and Run it once
 * (Google asks you to allow access to Gmail and outside requests). That's it.
 */

const FUNCTION_URL = 'https://hevucbiddgcvbxynstjn.supabase.co/functions/v1/inbound-email';
const SECRET = 'PASTE-INBOUND-SECRET-HERE'; // same value as the INBOUND_SECRET secret in Supabase
const FAMILY_CODE = '';                     // the letters after "+" in the journal's address; empty = +code mail only
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
  scan_('newer_than:2d', false);
  if (FAMILY_CODE) scan_('newer_than:2d -category:promotions -category:social -in:sent -in:chats', true);
}

// Send the last two weeks of mail through again, e.g. after the app learns to read more.
// Items already in a trip are updated, not duplicated. Choose `reimport` in the toolbar and Run it.
function reimport() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  for (const k in all) if (k.indexOf('seen:') === 0) props.deleteProperty(k);
  scan_('newer_than:14d', false);
  if (FAMILY_CODE) scan_('newer_than:14d -category:promotions -category:social -in:sent -in:chats', true);
}

// plain = false: mail to a +code address. plain = true: mail to the plain trips address, which the
// function reads as watched mail (kept only if it is about the family's travel).
function scan_(query, plain) {
  const done = label_(DONE), failed = label_(FAILED);
  const props = PropertiesService.getScriptProperties();
  pruneSeen_(props);
  // Not "is:unread": mail you forward to your own +code address arrives already read.
  const threads = GmailApp.search(query, 0, 100);
  for (const thread of threads) {
    let handled = false;
    for (const msg of thread.getMessages()) {
      const seenKey = 'seen:' + msg.getId();
      if (props.getProperty(seenKey)) continue;
      const code = mailboxCode_(msg);
      if (plain ? code : !code) continue;
      const payload = {
        From: msg.getFrom(),
        Subject: msg.getSubject(),
        TextBody: msg.getPlainBody(),
        HtmlBody: msg.getBody(),
        MailboxHash: code || FAMILY_CODE,
        ToFull: [],
        MessageId: msg.getId(),
        Attachments: attachments_(msg),
        Watched: plain,
      };
      let status = 0, result = {};
      try {
        const res = UrlFetchApp.fetch(FUNCTION_URL + '?key=' + encodeURIComponent(SECRET), {
          method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
        });
        status = res.getResponseCode();
        try { result = JSON.parse(res.getContentText()); } catch (e) { result = {}; }
      } catch (e) { status = 0; }
      if (plain && result.ignored === 'unknown address') throw new Error('FAMILY_CODE is not right: the journal does not know "' + FAMILY_CODE + '".');

      const triesKey = 'tries:' + msg.getId();
      if (status >= 200 && status < 300) {
        props.deleteProperty(triesKey); props.setProperty(seenKey, String(Date.now()));
        // plain mail that isn't travel (account notices and the like) stays in the inbox as it was
        if (plain && !(result.added > 0 || result.toSort > 0)) continue;
        msg.markRead(); handled = true;
        thread.addLabel(done);
      } else {
        if (!plain) handled = true;
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
