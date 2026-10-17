/**
 * Trip Journal — Gmail forwarder.
 *
 * Runs inside the family's trips Gmail account (script.google.com). Every 5 minutes it picks up
 * unread mail, sends each message to the Trip Journal inbound-email function, then marks it read,
 * labels it and archives it. The "+code" in the address it was sent to (e.g. murraytrips+3f9a1c@gmail.com)
 * tells the app which family it's for.
 *
 * Setup: paste this into a new Apps Script project, then choose `setup` in the toolbar and Run it once
 * (Google asks you to allow access to Gmail and outside requests). That's it.
 */

const FUNCTION_URL = 'https://hevucbiddgcvbxynstjn.supabase.co/functions/v1/inbound-email';
const SECRET = '3uopcLCdNvonvkBSqiQzE4s6';
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
  const done = label_(DONE), failed = label_(FAILED);
  const props = PropertiesService.getScriptProperties();
  const threads = GmailApp.search('in:inbox is:unread', 0, 20);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (!msg.isUnread()) continue;
      const code = mailboxCode_(msg);
      const payload = {
        From: msg.getFrom(),
        Subject: msg.getSubject(),
        TextBody: msg.getPlainBody(),
        HtmlBody: msg.getBody(),
        MailboxHash: code,
        ToFull: [],
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
        msg.markRead(); props.deleteProperty(triesKey);
        thread.addLabel(done);
      } else {
        // retry on the next runs (network hiccup, function cold start); give up after a few
        const tries = Number(props.getProperty(triesKey) || 0) + 1;
        if (tries >= MAX_TRIES || (status >= 400 && status < 500)) { msg.markRead(); thread.addLabel(failed); props.deleteProperty(triesKey); }
        else props.setProperty(triesKey, String(tries));
      }
    }
    if (!thread.isUnread()) thread.moveToArchive();
  }
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
