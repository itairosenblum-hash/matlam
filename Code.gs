// =====================================================
// מערכת תורנויות - BACKEND (Google Apps Script)
// =====================================================
// הוראות התקנה:
// 1. בגיליון שלך: תוספות > Apps Script
// 2. מחק הכל, הדבק קוד זה
// 3. לחץ: פריסה > פריסה חדשה > אפליקציית אינטרנט
// 4. הגדר: "בצע כ: אני", "גישה: כולם"
// 5. העתק את ה-URL והכנס לאתר בהגדרות
// =====================================================

const SH = {
  USERS: 'Users',
  PEOPLE: 'People',
  DUTY_TYPES: 'DutyTypes',
  SCORES: 'Scores',
  SESSIONS: 'Sessions'
};

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// ===== ENTRY POINTS =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    return makeResp(route(data));
  } catch(err) {
    return makeResp({success: false, error: err.toString()});
  }
}

function doGet(e) {
  try {
    const params = {};
    const callback = e && e.parameter && e.parameter.callback;
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(k => {
        if (k === 'callback') return;
        const v = e.parameter[k];
        // Keep pure 6-digit numbers as strings (month codes like 202507)
        if (/^\d{6}$/.test(v)) { params[k] = v; return; }
        try { params[k] = JSON.parse(v); }
        catch(_) { params[k] = v; }
      });
    }
    const result = route(params);
    const json = JSON.stringify(result);
    if (callback) {
      // JSONP response - bypasses CORS completely
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return makeResp(result);
  } catch(err) {
    const errJson = JSON.stringify({success: false, error: err.toString()});
    const callback2 = e && e.parameter && e.parameter.callback;
    if (callback2) {
      return ContentService
        .createTextOutput(callback2 + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return makeResp({success: false, error: err.toString()});
  }
}

function makeResp(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

// ===== ROUTER =====
function route(req) {
  const action = req.action;
  if (action === 'ping') return {success: true, message: 'מערכת תורנויות v1.0'};
  if (action === 'login') return actionLogin(req);
  if (action === 'bootstrap') return actionBootstrap();
  if (action === 'getLockStatus') return actionGetLockStatus(req);

  const user = validateToken(req.token);
  if (!user) return {success: false, error: 'אין הרשאה', code: 401};

  // User actions
  if (action === 'getProfile') return {success: true, user};
  if (action === 'getConstraints') return actionGetConstraints(req, user);
  if (action === 'saveConstraints') return actionSaveConstraints(req, user);
  if (action === 'getSchedule') return actionGetSchedule(req, user);
  if (action === 'changePassword') return actionChangePassword(req, user);

  // Available to all authenticated users
  if (action === 'getPeople') return actionGetPeople();
  if (action === 'submitSwap') return actionSubmitSwap(req, user);
  if (action === 'getSwaps') return actionGetSwaps(req, user);
  if (action === 'getScores') return actionGetScores(); // all users can see scores
  if (action === 'getNotifications') return actionGetNotificationsPersonal(req, user);
  if (action === 'clearNotification') return actionClearNotification(req, user);
  if (action === 'clearAllNotifications') return actionClearAllNotifications(req, user);
  // duty_agent.py sync (token-based, no login required)
  if (action === 'writeSchedule') return writeScheduleFromAgent(req);
  if (action === 'updateSwap') return actionUpdateSwap(req);  // users approve/reject their own swaps
  if (action === 'deleteSwap' && user.role === 'admin') return actionDeleteSwap(req);

  // Admin only
  if (user.role !== 'admin') return {success: false, error: 'אין הרשאת מנהל', code: 403};
  if (action === 'getUsers') return actionGetUsers();
  if (action === 'addUser') return actionAddUser(req);
  if (action === 'updateUser') return actionUpdateUser(req);
  if (action === 'toggleUser') return actionToggleUser(req);
  if (action === 'getAllConstraints') return actionGetAllConstraints(req);
  if (action === 'generateSchedule') return actionGenerateScheduleV2(req);  // uses duty_agent logic
  if (action === 'generateScheduleLegacy') return actionGenerateSchedule(req);
  if (action === 'initMonth') return actionInitMonth(req);
  if (action === 'resetSchedule') return actionResetSchedule(req);
  if (action === 'setLockStatus') return actionSetLockStatus(req);
  if (action === 'updatePerson') return actionUpdatePerson(req);
  if (action === 'sendReminder') return actionSendReminder(req);
  if (action === 'sendScheduleEmails') return actionSendScheduleEmails(req);

  if (action === 'reApplySwap') return actionReApplySwap(req);
  if (action === 'fixV2Score') return actionFixV2Score(req);
  if (action === 'sendSchedule') return actionSendSchedule(req);
  if (action === 'sendAdminMessage') return actionSendAdminMessage(req);
  if (action === 'debugSwap') return actionDebugSwap(req);
  if (action === 'resetPassword' && user.role === 'admin') return actionResetPassword(req);
  if (action === 'getAllTornim') return actionGetAllTornim();
  if (action === 'addTorani') return actionAddTorani(req);
  if (action === 'updateTorani') return actionUpdateTorani(req);
  if (action === 'toggleTorani') return actionToggleTorani(req);
  if (action === 'deleteTorani') return actionDeleteTorani(req);
  if (action === 'requestProfileChange') return actionRequestProfileChange(req, user);
  if (action === 'getProfileChangeRequests') return actionGetProfileChangeRequests(req, user);
  if (action === 'approveProfileChange') return actionApproveProfileChange(req, user);
  if (action === 'rejectProfileChange') return actionRejectProfileChange(req, user);


  if (action === 'sendCredentialsOne') return actionSendCredentialsOne(req);
  if (action === 'updateScheduleEntry') return actionUpdateScheduleEntry(req);
  if (action === 'initSheets') return actionInitSheets();

  return {success: false, error: 'פעולה לא מוכרת: ' + action};
}

// ===== UTILS =====
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function hashPass(pw) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw, Utilities.Charset.UTF_8);
  return b.map(x => ('0' + (x & 0xFF).toString(16)).slice(-2)).join('');
}

function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) return Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd');
  return String(d).substring(0, 10);
}

// ===== AUTH =====
function actionLogin(req) {
  const {username, password} = req;
  if (!username || !password) return {success: false, error: 'חסרים פרטי כניסה'};

  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  const hash = hashPass(password);

  for (let i = 1; i < rows.length; i++) {
    const [, name, uname, pwd, role, active] = rows[i];
    if (String(uname).toLowerCase() === String(username).toLowerCase() && pwd === hash) {
      if (!active) return {success: false, error: 'החשבון מושבת'};
      const token = Utilities.getUuid();
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      getSheet(SH.SESSIONS).appendRow([token, username, name, role, new Date().toISOString(), expiry.toISOString()]);
      if (Math.random() < 0.1) cleanSessions();
      return {success: true, token, name, username, role, expiry: expiry.toISOString()};
    }
  }
  return {success: false, error: 'שם משתמש או סיסמה שגויים'};
}

function validateToken(token) {
  if (!token) return null;
  const rows = getSheet(SH.SESSIONS).getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const [tok, username, name, role, , expiry] = rows[i];
    if (tok === token && new Date(expiry) > now) return {username, name, role};
  }
  return null;
}

function cleanSessions() {
  const sheet = getSheet(SH.SESSIONS);
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (new Date(rows[i][5]) < now) sheet.deleteRow(i + 1);
  }
}

function actionChangePassword(req, user) {
  const {oldPassword, newPassword} = req;
  if (!oldPassword || !newPassword) return {success: false, error: 'חסרים שדות'};
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  const oldHash = hashPass(oldPassword);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === user.username && rows[i][3] === oldHash) {
      sheet.getRange(i + 1, 4).setValue(hashPass(newPassword));
      return {success: true};
    }
  }
  return {success: false, error: 'הסיסמה הנוכחית שגויה'};
}

// ===== USERS =====
function actionGetUsers() {
  const rows = getSheet(SH.USERS).getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, name, username, , role, active] = rows[i];
    if (username) users.push({id, name, username, role, active: !!active});
  }
  return {success: true, users};
}

function actionAddUser(req) {
  const {name, username, password, role} = req;
  if (!name || !username || !password) return {success: false, error: 'חסרים שדות חובה'};
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]).toLowerCase() === String(username).toLowerCase())
      return {success: false, error: 'שם המשתמש כבר קיים'};
  }
  sheet.appendRow([Utilities.getUuid().substring(0, 8), name, username, hashPass(password), role || 'user', true]);
  return {success: true};
}

function actionUpdateUser(req) {
  const {username, name, role, newPassword} = req;
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === username) {
      if (name) sheet.getRange(i + 1, 2).setValue(name);
      if (role) sheet.getRange(i + 1, 5).setValue(role);
      if (newPassword) sheet.getRange(i + 1, 4).setValue(hashPass(newPassword));
      return {success: true};
    }
  }
  return {success: false, error: 'משתמש לא נמצא'};
}

function actionToggleUser(req) {
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === req.username) {
      const current = !!rows[i][5];
      sheet.getRange(i + 1, 6).setValue(!current);
      return {success: true, active: !current};
    }
  }
  return {success: false, error: 'משתמש לא נמצא'};
}

// ===== PEOPLE =====
function actionGetPeople() {
  const rows = getSheet(SH.PEOPLE).getDataRange().getValues();
  const people = [];
  for (let i = 1; i < rows.length; i++) {
    const [name, activity, dutyCategory, phone, weekendType, email] = rows[i];
    if (name) people.push({
      name: String(name),
      activity: String(activity),
      dutyCategory: String(dutyCategory || ''),
      phone: String(phone || ''),
      weekendType: String(weekendType || 'מלא'),
      email: String(email || '')
    });
  }
  return {success: true, people};
}

function actionUpdatePerson(req) {
  const {name, weekendType, dutyCategory, activity} = req;
  if (!name) return {success: false, error: 'חסר שם'};
  const sheet = getSheet(SH.PEOPLE);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === name) {
      if (activity !== undefined) sheet.getRange(i+1, 2).setValue(activity);
      if (dutyCategory !== undefined) sheet.getRange(i+1, 3).setValue(dutyCategory);
      if (weekendType !== undefined) sheet.getRange(i+1, 5).setValue(weekendType);
      return {success: true};
    }
  }
  return {success: false, error: 'תורן לא נמצא'};
}

// ===== SCORES =====
function actionGetScores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  // Get all people
  const peopleRes = actionGetPeople();
  const people = peopleRes.people;

  // Base scores from Score sheet (2025 accumulation)
  const baseScores = {};
  const scoreSheet = getSheet(SH.SCORES);
  const scoreRows = scoreSheet.getDataRange().getValues();
  for (let i = 1; i < scoreRows.length; i++) {
    if (!scoreRows[i][0]) continue;
    baseScores[String(scoreRows[i][0])] = {
      acc2025: Number(scoreRows[i][2]) || 0,
      activity: String(scoreRows[i][1] || '1')
    };
  }

  // Find all Schedule_YYYYMM sheets
  const scheduleSheets = sheets.filter(s => /^Schedule_\d{6}$/.test(s.getName()));

  // Compute scores per person per month from actual schedules
  const personMonthScores = {}; // name -> { '202601': {score, type}, ... }

  scheduleSheets.forEach(sheet => {
    const monthCode = sheet.getName().replace('Schedule_',''); // e.g. '202606'
    const year = monthCode.substring(0,4);
    const mon = parseInt(monthCode.substring(4,6));
    const rows = sheet.getDataRange().getValues();

    // Headers: תאריך, יום, סוג יום, מבצע, עתודה א, עתודה ב, הערות, סוג תורנות, ניקוד, מבצע שני, עתודה א שנייה, עתודה ב שנייה
    for (let i = 1; i < rows.length; i++) {
      const vName  = String(rows[i][3] || '').trim();
      const v2Name = String(rows[i][9] || '').trim();
      const dutyType = String(rows[i][7] || rows[i][2] || '');
      const sc = Number(rows[i][8]) || 0;

      // Add score for V (main)
      if (vName && sc > 0) {
        if (!personMonthScores[vName]) personMonthScores[vName] = {};
        if (!personMonthScores[vName][monthCode])
          personMonthScores[vName][monthCode] = {score: 0, type: dutyType};
        personMonthScores[vName][monthCode].score += sc;
        personMonthScores[vName][monthCode].type = dutyType;
      }

      // Add score for V2 (second shift) - same score as main duty
      if (v2Name && sc > 0) {
        if (!personMonthScores[v2Name]) personMonthScores[v2Name] = {};
        if (!personMonthScores[v2Name][monthCode])
          personMonthScores[v2Name][monthCode] = {score: 0, type: dutyType};
        personMonthScores[v2Name][monthCode].score += sc;
      }
    }
  });

  // Build result
  const scores = people.filter(p => {
    // Skip admin and אב from scores
    if (p.name === 'מנהל מערכת' || p.dutyCategory === 'מנהל מערכת' || p.dutyCategory === 'אב') return false;
    if (p.role === 'admin') return false;
    return true;
  }).map(p => {
    const base = baseScores[p.name] || {};
    const monthData = personMonthScores[p.name] || {};

    // Compute 2026 accumulated total from schedules
    let acc2026 = 0;
    const monthScores = {};
    monthNames.forEach((mKey, idx) => {
      const mon = idx + 1;
      const code2026 = '2026' + String(mon).padStart(2,'0');
      const md = monthData[code2026] || {score:0, type:''};
      monthScores[mKey] = {score: md.score, type: md.type};
      acc2026 += md.score;
    });

    const result = {
      name: p.name,
      activity: p.activity,
      dutyCategory: p.dutyCategory || '',
      weekendType: p.weekendType || '',
      acc2025: base.acc2025 || 0,
      acc2026: Math.round(acc2026)
    };
    monthNames.forEach(m => {
      result[m] = monthScores[m] || {score:0, type:''};
    });
    return result;
  });

  return {success: true, scores};
}

function updateScoreForMonth(name, monthIdx, dutyType, score) {
  // monthIdx: 0=Jan, 4=May, etc.
  const sheet = getSheet(SH.SCORES);
  const rows = sheet.getDataRange().getValues();
  const col = 4 + monthIdx * 2; // type col (0-indexed)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === name) {
      sheet.getRange(i + 1, col + 1).setValue(dutyType); // type
      sheet.getRange(i + 1, col + 2).setValue(score);    // score
      // Update acc2026
      const newAcc = Number(rows[i][3] || 0) + score;
      sheet.getRange(i + 1, 4).setValue(newAcc);
      return;
    }
  }
}

// ===== CONSTRAINTS =====
function actionGetConstraints(req, user) {
  const month = String(req.month || '');
  const viewAs = req.viewAs;
  const lookupName = viewAs ? getNameByUsername(viewAs) : user.name;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Constraints_' + month);
  if (!sheet) return {success: true, constraints: new Array(31).fill(''), notes: ''};
  const rows = sheet.getDataRange().getValues();
  // Find notes column from header
  const headers = rows[0];
  const notesColIdx = headers.indexOf('הערות'); // 0-based
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === lookupName) {
      return {
        success: true,
        constraints: rows[i].slice(1, 32).map(c => {
          if (c === 'V' || c === 'v') return 'V';
          if (c === 'X' || c === 'x' || c === true) return 'X';
          return '';
        }),
        notes: notesColIdx >= 0 ? String(rows[i][notesColIdx] || '') : ''
      };
    }
  }
  return {success: true, constraints: new Array(31).fill(''), notes: ''};
}

function getNameByUsername(username) {
  const rows = getSheet(SH.USERS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) === String(username)) return String(rows[i][1]);
  }
  return username;
}

function getNotesCol(sheet) {
  // Find the 'הערות' column, or use col 33 as default
  const lastCol = Math.max(sheet.getLastColumn(), 33);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.indexOf('הערות');
  if (idx >= 0) return idx + 1; // 1-based
  // Not found — set it at col 33
  sheet.getRange(1, 33).setValue('הערות');
  return 33;
}

function actionSaveConstraints(req, user) {
  const month = String(req.month || '');
  const {constraints, notes} = req;
  const saveName = req.viewAs ? getNameByUsername(req.viewAs) : user.name;
  
  if (user.role !== 'admin') {
    const lockRes = actionGetLockStatus({month});
    if (lockRes.locked) {
      return {success: false, error: 'הגשת אילוצים לחודש זה נעולה. פנה למנהל.'};
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Constraints_' + month);
  if (!sheet) sheet = createConstraintSheet(month, ss);

  const notesCol = getNotesCol(sheet); // find הערות column dynamically

  const dayValues = new Array(31).fill('').map((_, i) => {
    const c = (constraints || [])[i];
    if (c === 'V' || c === 'v') return 'V';
    if (c === 'X' || c === 'x' || c === true) return 'X';
    return '';
  });

  // Find existing row for this person
  const lastRow = sheet.getLastRow();
  const nameCol = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  let targetRow = -1;
  for (let i = 0; i < nameCol.length; i++) {
    if (String(nameCol[i][0]).trim() === String(saveName).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) targetRow = lastRow + 1;

  // Write name + 31 days
  sheet.getRange(targetRow, 1, 1, 32).setValues([[saveName, ...dayValues]]);
  // Write notes to the correct column
  sheet.getRange(targetRow, notesCol).setValue(notes || '');

  return {success: true};
}

function actionGetAllConstraints(req) {
  const month = String(req.month || '');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Constraints_' + month);
  if (!sheet) return {success: true, constraints: {}, month};
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const notesColIdx = headers.indexOf('הערות'); // 0-based
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    result[rows[i][0]] = {
      constraints: rows[i].slice(1, 32).map(c => {
        if (c === 'V' || c === 'v') return 'V';
        if (c === 'X' || c === 'x' || c === true) return 'X';
        return '';
      }),
      notes: notesColIdx >= 0 ? String(rows[i][notesColIdx] || '') : ''
    };
  }
  return {success: true, constraints: result, month};
}

function createConstraintSheet(month, ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet('Constraints_' + month);
  sheet.setRightToLeft(true);
  const headers = ['שם'];
  for (let d = 1; d <= 31; d++) headers.push(d);
  headers.push('הערות'); // col 33
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const people = actionGetPeople().people.filter(p => p.activity !== '0');
  people.forEach((p, idx) => sheet.getRange(idx + 2, 1).setValue(p.name));
  return sheet;
}

// ===== SCHEDULE =====
function actionGetSchedule(req, user) {
  const month = String(req.month || '');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Schedule_' + month);
  if (!sheet) return {success: true, schedule: [], month};
  const rows = sheet.getDataRange().getValues();
  const schedule = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    schedule.push({
      date: fmtDate(rows[i][0]), day: rows[i][1], dayType: rows[i][2],
      v: rows[i][3] || '', a: rows[i][4] || '', b: rows[i][5] || '',
      notes: rows[i][6] || '', dutyType: rows[i][7] || '', score: rows[i][8] || 0,
      v2: rows[i][9] || '', a2: rows[i][10] || '', b2: rows[i][11] || ''
    });
  }
  return {success: true, schedule, month};
}

function actionUpdateScheduleEntry(req) {
  const month = String(req.month || '').trim();
  const {date, v, a, b, notes, dutyType, v2, a2, b2} = req;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const TZ = ss.getSpreadsheetTimeZone();
  const sheet = ss.getSheetByName('Schedule_' + month);
  if (!sheet) return {success: false, error: 'לוח לא נמצא: Schedule_' + month};
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    // Normalize row date to dd/MM/yyyy
    const rowDate = rows[i][0] instanceof Date ?
      Utilities.formatDate(rows[i][0], TZ, 'dd/MM/yyyy') : String(rows[i][0]).trim();
    // Normalize request date (could be dd/MM/yyyy or yyyy-MM-dd)
    var reqDate = String(date).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(reqDate)) {
      var p = reqDate.split('-');
      reqDate = p[2] + '/' + p[1] + '/' + p[0];
    }
    if (rowDate !== reqDate) continue;

    const oldV = String(rows[i][3]||'').trim();
    const oldScore = Number(rows[i][8])||0;
    const oldDutyType = String(rows[i][7]||'חול');

    // Update main shift
    if (v !== undefined) sheet.getRange(i+1, 4).setValue(v);
    if (a !== undefined) sheet.getRange(i+1, 5).setValue(a);
    if (b !== undefined) sheet.getRange(i+1, 6).setValue(b);
    if (notes !== undefined) sheet.getRange(i+1, 7).setValue(notes);

    // Update duty type + score
    if (dutyType) {
      const dutyScores = getDutyTypesMap();
      const newScore = dutyScores[dutyType] || oldScore;
      sheet.getRange(i+1, 8).setValue(dutyType);
      sheet.getRange(i+1, 9).setValue(newScore);
      // Adjust score if V changed or dutyType changed
      const newV = v !== undefined ? String(v||'').trim() : oldV;
      if (newV && (newV !== oldV || newScore !== oldScore)) {
        // Remove old score from old V
        if (oldV && oldV !== newV) updateScoreForSwap(oldV, '', month, oldScore, oldDutyType);
        else if (oldV && newScore !== oldScore) updateScoreForSwap(oldV, oldV, month, 0, oldDutyType);
        // Add new score to new V
        if (newV) {
          var scoreSheet = getSheet(SH.SCORES);
          var scoreRows = scoreSheet.getDataRange().getValues();
          for (var si=1; si<scoreRows.length; si++) {
            if (String(scoreRows[si][0]).trim() === newV) {
              var cur = Number(scoreRows[si][3])||0;
              // If V changed: remove old from oldV (already done), add new to newV
              // If same V but score changed: adjust
              var diff = newScore - (newV === oldV ? oldScore : 0);
              scoreSheet.getRange(si+1,4).setValue(Math.max(0, cur + diff));
              Logger.log('Score adjusted: ' + newV + ' +' + diff);
              break;
            }
          }
        }
      }
    }

    // Update second shift + score for V2
    const oldV2 = String(rows[i][9]||'').trim();
    if (v2 !== undefined) sheet.getRange(i+1, 10).setValue(v2);
    if (a2 !== undefined) sheet.getRange(i+1, 11).setValue(a2);
    if (b2 !== undefined) sheet.getRange(i+1, 12).setValue(b2);

    // Score for V2: always recalculate when v2 changes
    var newV2 = v2 !== undefined ? String(v2||'').trim() : oldV2;
    Logger.log('V2 check: newV2="'+newV2+'" oldV2="'+oldV2+'" v2param='+JSON.stringify(v2));
    if (newV2 !== oldV2) {
      var dutyTypes2 = getDutyTypesMap();
      var effectiveDutyType = String(dutyType||'').trim() || String(oldDutyType||'').trim() || 'חול';
      var dayScore = Number(dutyTypes2[effectiveDutyType]) || Number(oldScore) || 10;
      Logger.log('V2 will change: "'+oldV2+'"→"'+newV2+'" dutyType='+effectiveDutyType+' score='+dayScore);
      Logger.log('V2 score change: "'+oldV2+'" -> "'+newV2+'" score='+dayScore+' type='+effectiveDutyType);
      
      // Remove score from old V2
      if (oldV2) {
        var sRows = getSheet(SH.SCORES).getDataRange().getValues();
        for (var j=1; j<sRows.length; j++) {
          if (String(sRows[j][0]||'').trim() === oldV2) {
            var oldAcc = Number(sRows[j][3])||0;
            getSheet(SH.SCORES).getRange(j+1, 4).setValue(Math.max(0, oldAcc - dayScore));
            Logger.log('V2 score removed from '+oldV2+': '+oldAcc+' -> '+Math.max(0, oldAcc-dayScore));
            break;
          }
        }
      }
      
      // Add score to new V2 - update acc2026 AND the monthly column
      if (newV2) {
        var sRows2 = getSheet(SH.SCORES).getDataRange().getValues(); // fresh read
        var found = false;
        // Determine which month column to update (col 4 = acc2026, monthly cols start at 5)
        // Month layout: col 5=ינואר סוג, 6=ינואר ניקוד, 7=פברואר סוג, 8=פברואר ניקוד...
        var reqMonth2 = String(month||'').trim();
        var monIdx = reqMonth2.length === 6 ? parseInt(reqMonth2.substring(4,6)) - 1 : -1; // 0=jan
        var monthScoreCol = monIdx >= 0 ? (4 + monIdx * 2 + 2) : -1; // 1-indexed: 6=jan,8=feb...
        
        for (var k=1; k<sRows2.length; k++) {
          if (String(sRows2[k][0]||'').trim() === newV2) {
            var curAcc2 = Number(sRows2[k][3])||0;
            // Update acc2026 (col 4)
            getSheet(SH.SCORES).getRange(k+1, 4).setValue(curAcc2 + dayScore);
            // Update monthly score column if available
            if (monthScoreCol > 0) {
              var curMonScore = Number(sRows2[k][monthScoreCol-1])||0;
              getSheet(SH.SCORES).getRange(k+1, monthScoreCol).setValue(curMonScore + dayScore);
              Logger.log('V2 monthly score col '+monthScoreCol+' +'+dayScore+' for '+newV2);
            }
            Logger.log('V2 score added to '+newV2+': '+curAcc2+' -> '+(curAcc2+dayScore));
            found = true;
            break;
          }
        }
        if (!found) Logger.log('V2 ERROR: could not find '+newV2+' in Scores sheet');
      }
    }

    return {success: true};
  }
  return {success: false, error: 'תאריך לא נמצא: ' + date + ' בלוח ' + month};
}

// ===== SCHEDULE GENERATION =====
function getDutyTypesMap() {
  // Hardcoded fallback scores (always available even if not in DutyTypes sheet)
  const fallback = {
    'חול':10, 'חול הקפצה':12, 'חמישי':12, 'חמישי הקפצה':15,
    'חול 24 שעות':15, 'חמישי 24 שעות':16, 'הדממה':18, 'חמישי הדממה':19,
    'סוף שבוע':20, 'סוף שבוע הקפצה':30, 'סוף שבוע מלא':40,
    'ערב חג':25, 'חג':25, 'יומיים חג':50, 'פטור':10, 'דולג':0
  };
  const rows = getSheet(SH.DUTY_TYPES).getDataRange().getValues();
  const map = Object.assign({}, fallback);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) map[String(rows[i][0])] = Number(rows[i][1]) || 0;
  }
  return map;
}

function actionGenerateSchedule(req) {
  const month = String(req.month || '');
  let dayCategories = req.dayCategories;
  if (!dayCategories) return {success: false, error: 'dayCategories חסר'};
  // Handle case where dayCategories arrives as a JSON string
  if (typeof dayCategories === 'string') {
    try { dayCategories = JSON.parse(dayCategories); } catch(e) {
      return {success: false, error: 'dayCategories פגום: ' + e.toString()};
    }
  }

  const year = parseInt(month.substring(0, 4));
  const mon  = parseInt(month.substring(4, 6));
  const daysInMonth = new Date(year, mon, 0).getDate();

  // Load people (active, non-exempt)
  const allPeople = actionGetPeople().people;
  const activePeople = allPeople.filter(p => p.activity !== '0' && p.dutyCategory !== 'פטור');

  // Load accumulated scores as working copy
  const scoresData = actionGetScores().scores;
  const workingScores = {};
  scoresData.forEach(s => { workingScores[s.name] = Number(s.acc2026) || 0; });

  // Load constraints for this month
  const constraintsRes = actionGetAllConstraints({month});
  const constraints = constraintsRes.constraints || {};

  // Load duty type score table
  const dutyTypes = getDutyTypesMap();

  // ── Helpers ──────────────────────────────────────
  function getConstraintVal(name, day) {
    if (!constraints[name]) return '';
    return constraints[name].constraints[day - 1] || '';
  }

  function isHardBlocked(name, day) {
    // X = hard constraint (cannot serve)
    return getConstraintVal(name, day) === 'X';
  }

  function prefersDay(name, day) {
    // V = prefers this day (not binding but noted)
    return getConstraintVal(name, day) === 'V';
  }

  function canDoType(person, cat) {
    // בהליך הסמכה / פטור - לא משובצים
    if (person.dutyCategory === 'בהליך הסמכה' || person.dutyCategory === 'פטור') {
      return false;
    }
    // משרת אב - only חמישי types
    if (person.dutyCategory === 'אב') {
      return cat === 'חמישי' || cat === 'חמישי 24 שעות';
    }
    return true;
  }

  // ── Load history for gap rules ──────────────────
  // Get all schedule sheets for current + past months to check frequency
  function getRecentAssignments(personName, monthsBack) {
    var result = [];
    var y = year, mo = mon;
    for (var k = 0; k < monthsBack; k++) {
      mo--;
      if (mo < 1) { mo = 12; y--; }
      var shName = 'Schedule_' + y + String(mo).padStart(2,'0');
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(shName);
      if (!sh) continue;
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var v = String(rows[i][3]||'').trim();
        var a = String(rows[i][4]||'').trim();
        var b = String(rows[i][5]||'').trim();
        var dtype = String(rows[i][7]||'').trim();
        if (v===personName||a===personName||b===personName) {
          result.push({monthsAgo: k+1, dutyType: dtype, role: v===personName?'V':a===personName?'A':'B'});
        }
      }
    }
    return result;
  }

  // Check if אב served in last 2 months (max once per 2 months)
  function avServedLastMonth(name) {
    for (var back = 1; back <= 2; back++) {
      var prevMo = mon - back, prevY = year;
      while (prevMo < 1) { prevMo += 12; prevY--; }
      var shName = 'Schedule_' + prevY + String(prevMo).padStart(2,'0');
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(shName);
      if (!sh) continue;
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var v=String(rows[i][3]||'').trim(), a=String(rows[i][4]||'').trim(), b=String(rows[i][5]||'').trim();
        if (v===name||a===name||b===name) return true;
      }
    }
    return false;
  }

  // Check current month assignments count
  var monthAssignmentCount = {}; // name → count this month

  // Check if person did weekend in last N months
  function didWeekendInLastMonths(name, months) {
    var hist = getRecentAssignments(name, months);
    return hist.some(function(h) {
      return h.dutyType.includes('סוף שבוע') || h.dutyType === 'שבת';
    });
  }

  // Returns list sorted by score (lowest first), respecting hard constraints
  // V preference always beats mesharet av (unless av also marked V)
  function getEligible(day, cat) {
    // Check who was assigned yesterday (to avoid consecutive days)
    const prevAssignment = assignment[day - 1];
    const prevV = prevAssignment ? prevAssignment.V : '';
    const prevA = prevAssignment ? prevAssignment.A : '';
    const prevB = prevAssignment ? prevAssignment.B : '';

    return activePeople
      .filter(p => {
        if (!canDoType(p, cat)) return false;
        if (isHardBlocked(p.name, day)) return false;
        // No consecutive days (unless they marked V for this day)
        if (!prefersDay(p.name, day) && (p.name === prevV || p.name === prevA || p.name === prevB)) return false;
        return true;
      })
      .sort((a, b) => {
        const aV = prefersDay(a.name, day);
        const bV = prefersDay(b.name, day);
        const aIsAv = a.dutyCategory === 'אב';
        const bIsAv = b.dutyCategory === 'אב';

        // V always wins
        if (aV && !bV) return -1;
        if (!aV && bV) return 1;

        // Neither has V: av gets priority on Thursday
        if (!aV && !bV) {
          if (aIsAv && !bIsAv) return -1;
          if (!aIsAv && bIsAv) return 1;
        }

        return (workingScores[a.name] || 0) - (workingScores[b.name] || 0);
      });
  }

  // ── Build day list ────────────────────────────────
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d);
    const dow = date.getDay();
    const cat = String(dayCategories[String(d)] || (dow === 4 ? 'חמישי' : (dow === 5 || dow === 6) ? 'סוף שבוע' : 'חול'));
    days.push({day: d, date, dow, cat, hebrewDay: HEBREW_DAYS[dow]});
  }

  const assignment = {};

  // PURE SCORE-BASED: every day by lowest accumulated score
  // מלא people get Fri+Sat together (score 40)
  // בנפרד people get each day separately (score 20 each)
  // The 3 picked per day are ALWAYS the lowest scorers regardless of type

  days.forEach(({day, dow, cat, hebrewDay}) => {
    if (assignment[day]) return; // already assigned (e.g. Sat after full weekend)

    const nextDay = days.find(d => d.day === day + 1);
    const isFriday = dow === 5 && cat === 'סוף שבוע' &&
                     nextDay && nextDay.cat === 'סוף שבוע';

    if (isFriday) {
      // Build combined pool: מלא (eligible for full weekend) + בנפרד (Friday only)
      const elFull = activePeople
        .filter(p => p.weekendType !== 'בנפרד' &&
          !isHardBlocked(p.name, day) && !isHardBlocked(p.name, day+1))
        .map(p => ({name:p.name, full:true, score:(workingScores[p.name]||0) - (prefersDay(p.name,day)||prefersDay(p.name,day+1)?50:0)}));

      const elSep = activePeople
        .filter(p => p.weekendType === 'בנפרד' && !isHardBlocked(p.name, day))
        .map(p => ({name:p.name, full:false, score:(workingScores[p.name]||0) - (prefersDay(p.name,day)?50:0)}));

      // Merge and sort by score (lowest first)
      const all = [...elFull, ...elSep].sort((a,b) => a.score - b.score);
      const top = all.slice(0, 3);

      const vP = top[0], aP = top[1], bP = top[2];
      const v = vP?.name || '', a = aP?.name || '', b = bP?.name || '';

      if (vP?.full) {
        // V does full weekend: same trio for both Fri+Sat, score 40
        const score = dutyTypes['סוף שבוע מלא'] || 40;
        assignment[day]   = {V:v, A:a, B:b, type:'סוף שבוע מלא', score, hebrewDay:HEBREW_DAYS[5], cat};
        assignment[day+1] = {V:v, A:a, B:b, type:'סוף שבוע מלא', score:0, hebrewDay:HEBREW_DAYS[6], cat:'סוף שבוע'};
        if (v) workingScores[v] = (workingScores[v]||0) + score;
      } else {
        // V is בנפרד — does Friday only, score 20
        const score = dutyTypes['סוף שבוע'] || 20;
        assignment[day] = {V:v, A:a, B:b, type:'סוף שבוע', score, hebrewDay:HEBREW_DAYS[5], cat};
        if (v) workingScores[v] = (workingScores[v]||0) + score;
        // Saturday left unassigned — will be picked up in the next iteration
      }
      return;
    }

    // All other days (incl. Saturday if not full-weekend): pure score
    const scoreMap = {'חול':10,'חול הקפצה':12,'חמישי':12,'חמישי הקפצה':15,'סוף שבוע':20,'סוף שבוע הקפצה':30,'סוף שבוע מלא':40,'חג':25,'ערב חג':25,'חג + חול':35,'חג + חמישי':37,'חג + סוף שבוע':45,'חול 24 שעות':15,'חמישי 24 שעות':17,'הדממה':15,'יומיים חג':50,'ערב חג + חמישי':30};
    const score = dutyTypes[cat] || scoreMap[cat] || 10;
    const el = getEligible(day, cat);
    const v = el[0]?.name || '', a = el[1]?.name || '', b = el[2]?.name || '';
    assignment[day] = {V:v, A:a, B:b, type:cat, score, hebrewDay, cat};
    if (v) {
      workingScores[v] = (workingScores[v]||0) + score;
      monthAssignmentCount[v] = (monthAssignmentCount[v]||0) + 1;
    }
  });

  // ── Save to Sheet (preserve holidays/notes from existing sheet) ──────
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Schedule_' + month;
  let sched = ss.getSheetByName(sheetName);
  
  if (!sched) {
    // No existing sheet - create fresh
    sched = ss.insertSheet(sheetName);
    sched.setRightToLeft(true);
    const headers = ['תאריך','יום','סוג יום','מבצע','עתודה א','עתודה ב','הערות','סוג תורנות','ניקוד','מבצע שני','עתודה א שנייה','עתודה ב שנייה'];
    sched.getRange(1,1,1,headers.length).setValues([headers]);
    const schedRows = days.map(({day, hebrewDay, cat}) => {
      const ag = assignment[day] || {V:'',A:'',B:'',type:cat,score:0,hebrewDay};
      const date = new Date(year, mon-1, day);
      return [
        Utilities.formatDate(date,'Asia/Jerusalem','dd/MM/yyyy'),
        ag.hebrewDay||hebrewDay, ag.cat||cat,
        ag.V||'', ag.A||'', ag.B||'', '',
        ag.type||cat, ag.score||0
      ];
    });
    sched.getRange(2,1,schedRows.length,headers.length).setValues(schedRows);
  } else {
    // Existing sheet - update V/A/B/score AND dayType (user override wins)
    const existingData = sched.getDataRange().getValues();
    const numRows = existingData.length - 1;
    if (numRows <= 0) return {success:false, error:'הלוח ריק'};

    const vabUpdates = [];
    const scoreUpdates = [];
    const dayTypeUpdates = [];

    for (let i = 1; i <= numRows; i++) {
      const rowDate = existingData[i][0];
      const dayNum = rowDate instanceof Date ? rowDate.getDate() :
        parseInt(String(rowDate).split('/')[0]);
      const ag = (dayNum && assignment[dayNum]) || {V:'',A:'',B:'',score:0};
      vabUpdates.push([ag.V||'', ag.A||'', ag.B||'']);
      scoreUpdates.push([ag.score||0]);
      // Use the cat from assignment (which came from user's dayCategories) — overrides old value
      const newCat = (dayNum && assignment[dayNum]) ? (assignment[dayNum].cat || assignment[dayNum].type || '') : (existingData[i][2] || '');
      dayTypeUpdates.push([newCat]);
    }

    // Single batch write for V/A/B (cols 4-6)
    sched.getRange(2, 4, numRows, 3).setValues(vabUpdates);
    // Single batch write for score (col 9)
    sched.getRange(2, 9, numRows, 1).setValues(scoreUpdates);
    // Update dayType (col 3) — user override wins
    sched.getRange(2, 3, numRows, 1).setValues(dayTypeUpdates);
  }

  // ── Build response ────────────────────────────────
  const schedule = days.map(({day, hebrewDay, cat}) => {
    const ag = assignment[day] || {};
    const date = new Date(year, mon-1, day);
    return {
      date: Utilities.formatDate(date,'Asia/Jerusalem','yyyy-MM-dd'),
      day: ag.hebrewDay||hebrewDay, dayType: ag.cat||cat,
      v: ag.V||'', a: ag.A||'', b: ag.B||'',
      notes:'', dutyType: ag.type||cat, score: ag.score||0
    };
  });

  return {success: true, schedule, month};
}

// ===== INIT SHEETS =====
function actionInitSheets() {
  initSessions(); initUsers(); initPeople(); initDutyTypes(); initScores();
  return {success: true, message: 'כל הגיליונות אותחלו בהצלחה!'};
}

function initSessions() {
  const sh = getSheet(SH.SESSIONS);
  sh.clearContents();
  sh.getRange(1,1,1,6).setValues([['Token','Username','Name','Role','Created','Expires']]);
}

function initUsers() {
  const sh = getSheet(SH.USERS);
  sh.clearContents();
  sh.setRightToLeft(true);
  sh.getRange(1,1,1,6).setValues([['ID','שם','שם משתמש','סיסמה','תפקיד','פעיל']]);
  sh.appendRow([Utilities.getUuid().substring(0,8), 'מנהל מערכת', 'admin', hashPass('admin123'), 'admin', true]);
}

function initPeople() {
  const sh = getSheet(SH.PEOPLE);
  sh.clearContents();
  sh.setRightToLeft(true);
  sh.getRange(1,1,1,6).setValues([['שם','פעילות','סוג תורנות','טלפון','סוג סוף שבוע','אימייל']]);
  const people = [
    ['אהרון ריסין','1','','543005842'],['איתי גרטל','1','','544996678'],
    ['אלון אשורוב','1','','543295450'],['בן דקל','1','','542029111'],
    ['גיא מונט','1','','503994399'],['גל סטי','1','','506575389'],
    ['גל איזנברגר','1','','052-305-5642'],['דניאל הרשקוביץ','1','','050-966-9933'],
    ['דניאל מלול','1','','545499791'],['הוד סטרול','1','','584885822'],
    ['הראל סיבוני','1','','544948399'],['זיו יוסף','1','','508851767'],
    ['יגאל לביא','1','','529277176'],['יהונתן אנגל','1','','526087953'],
    ['יהונתן דוד פור','1','','509221812'],['יואב מטרני','1','','526512171'],
    ['יובל הופמן','0','אב','547833991'],['יובל וולטמן','1','','543924033'],
    ['יובל נסים טויאטו','1','','528811845'],['יוסף עזראן','1','','538289188'],
    ['לידור סבג','0.5','אב','526444337'],['מיכאלה כהן','1','','509566050'],
    ['מתן סרי','1','','547191477'],['נוריאל ביטון','1','','543051783'],
    ['עומר יצחקי','1','','506659941'],['עידן פרץ','1','','544280337'],
    ['עמית אילוז','1','','503511155'],['עמית לביא','1','','544530513'],
    ['ענבר שמיר','1','','502797966'],['ערן לפושניאן','0','פטור','544762081'],
    ['פארוק אברהים','1','','525507936'],['רון יחיד','1','','544484376'],
    ['שגיא בוארון','1','','542515161'],['בר סרגיינקו','1','','050-723-2244'],
  ];
  sh.getRange(2,1,people.length,4).setValues(people);
}

function initDutyTypes() {
  const sh = getSheet(SH.DUTY_TYPES);
  sh.clearContents();
  sh.setRightToLeft(true);
  sh.getRange(1,1,1,2).setValues([['סוג תורנות','ניקוד']]);
  const types = [
    ['דולג',0],['הדממה',18],['הדממה + חול',28],['הדממה + חמישי',30],
    ['חג',25],['חג + חול',35],['חג + חמישי',37],['חג + סוף שבוע',45],
    ['חול',10],['חול + חול',24],['חול + חמישי',22],['חול + שבת',30],
    ['חול 24 שעות',15],['חול 24 שעות + חול',25],['חול 24 שעות + חול 24 שעות',30],
    ['חול 24 שעות + חמישי',31],['חול 24 שעות + שבת',35],
    ['חמישי',12],['חמישי 24 שעות',16],['חמישי 24 שעות + חול',26],
    ['חמישי הדממה',19],['יומיים חג',50],
    ['סוף שבוע',20],['סוף שבוע + חול',36],['סוף שבוע + חמישי',32],
    ['סוף שבוע מלא',40],['סוף שבוע מלא + חול',50],
    ['ערב חג',25],['פטור',10],['שבת הקפצה',30],
  ];
  sh.getRange(2,1,types.length,2).setValues(types);
}

function initScores() {
  const sh = getSheet(SH.SCORES);
  sh.clearContents();
  sh.setRightToLeft(true);
  const hdrs = ['שם','פעילות','מצטבר 2025','מצטבר 2026',
    'ינואר סוג','ינואר ניקוד','פברואר סוג','פברואר ניקוד',
    'מרץ סוג','מרץ ניקוד','אפריל סוג','אפריל ניקוד',
    'מאי סוג','מאי ניקוד','יוני סוג','יוני ניקוד',
    'יולי סוג','יולי ניקוד','אוגוסט סוג','אוגוסט ניקוד',
    'ספטמבר סוג','ספטמבר ניקוד','אוקטובר סוג','אוקטובר ניקוד',
    'נובמבר סוג','נובמבר ניקוד','דצמבר סוג','דצמבר ניקוד'];
  sh.getRange(1,1,1,hdrs.length).setValues([hdrs]);

  const data = [
    ['אהרון ריסין','1',616,693,'חול',10,'חול',12,'חול',10,'חג + חול',35,'חול',10,'','','','','','','','','','','','','',''],
    ['איתי גרטל','1',614,694,'סוף שבוע',20,'חול',10,'סוף שבוע',20,'חול',10,'סוף שבוע',20,'','','','','','','','','','','','','',''],
    ['אלון אשורוב','1',624,694,'דולג',0,'סוף שבוע',20,'סוף שבוע',20,'סוף שבוע',20,'חול',10,'','','','','','','','','','','','','',''],
    ['בן דקל','1',616,715,'חמישי',12,'חול',10,'חול 24 שעות + חול',25,'חמישי',12,'סוף שבוע מלא',40,'','','','','','','','','','','','','',''],
    ['גיא מונט','1',614,702,'סוף שבוע מלא',40,'דולג',0,'חול',10,'הדממה + חול',28,'חול',10,'','','','','','','','','','','','','',''],
    ['גל איזנברגר','1',688,708,'','',0,'','',0,'','',0,'','',0,'סוף שבוע',20,'','','','','','','','','','',''],
    ['גל סטי','1',614,694,'סוף שבוע',20,'חול',10,'סוף שבוע',20,'דולג',0,'ערב חג',30,'','','','','','','','','','','','','',''],
    ['דניאל הרשקוביץ','1',688,708,'','',0,'','',0,'','',0,'','',0,'סוף שבוע',20,'','','','','','','','','','',''],
    ['דניאל מלול','1',616,705,'חול',10,'סוף שבוע',20,'חול 24 שעות + חמישי',31,'הדממה',18,'חול',10,'','','','','','','','','','','','','',''],
    ['הוד סטרול','1',615,728,'חול',10,'חמישי',12,'סוף שבוע מלא + חול',75,'דולג',0,'חמישי 24 שעות',16,'','','','','','','','','','','','','',''],
    ['הראל סיבוני','1',620,696,'חמישי',12,'חמישי',12,'חמישי',12,'סוף שבוע מלא',40,'דולג',0,'','','','','','','','','','','','','',''],
    ['זיו יוסף','1',610,696,'חמישי',12,'סוף שבוע',20,'חול + חול',24,'סוף שבוע',20,'חול',10,'','','','','','','','','','','','','',''],
    ['יגאל לביא','1',629,741,'דולג',0,'חול',10,'חול 24 שעות + שבת',35,'חג + חמישי',37,'שבת הקפצה',30,'','','','','','','','','','','','','',''],
    ['יהונתן אנגל','1',617,712,'חול',10,'חול',10,'חול 24 שעות + חול',25,'סוף שבוע מלא',40,'חול',10,'','','','','','','','','','','','','',''],
    ['יהונתן דוד פור','1',614,698,'סוף שבוע',20,'חול',10,'חמישי',12,'סוף שבוע + חמישי',32,'חול',10,'','','','','','','','','','','','','',''],
    ['יואב מטרני','1',688,688,'','',0,'','',0,'','',0,'','',0,'דולג',0,'','','','','','','','','','',''],
    ['יובל הופמן','0',0,0,'פטור',10,'פטור',10,'פטור',10,'פטור',10,'חמישי',12,'','','','','','','','','','','','','',''],
    ['יובל וולטמן','1',618,698,'סוף שבוע',20,'חול',10,'סוף שבוע',20,'סוף שבוע',20,'חול',10,'','','','','','','','','','','','','',''],
    ['יובל נסים טויאטו','1',612,684,'חול',10,'דולג',0,'סוף שבוע מלא',40,'חמישי',12,'חול',10,'','','','','','','','','','','','','',''],
    ['יוסף עזראן','1',630,718,'חול',10,'סוף שבוע מלא',40,'חול',10,'הדממה',18,'חול',10,'','','','','','','','','','','','','',''],
    ['לידור סבג','0.5',0,0,'חמישי',12,'דולג',0,'חמישי',12,'דולג',0,'חמישי',12,'','','','','','','','','','','','','',''],
    ['מיכאלה כהן','1',616,710,'חול',10,'דולג',0,'חול + חול',24,'יומיים חג',50,'חול',10,'','','','','','','','','','','','','',''],
    ['מתן סרי','1',619,712.2,'חול',10,'חול',10,'סוף שבוע + חול',43.2,'חול',10,'סוף שבוע',20,'','','','','','','','','','','','','',''],
    ['נוריאל ביטון','1',619,709,'חול',10,'חול',10,'חול 24 שעות + חול 24 שעות',30,'סוף שבוע מלא',40,'דולג',0,'','','','','','','','','','','','','',''],
    ['עומר יצחקי','1',615,717,'חול',10,'חמישי 24 שעות + חול',26,'סוף שבוע',20,'סוף שבוע + חול',36,'חול',10,'','','','','','','','','','','','','',''],
    ['עידן פרץ','1',629,694,'','',0,'חול',10,'חול',10,'חג + חול',35,'חול',10,'','','','','','','','','','','','','',''],
    ['עמית אילוז','1',629,690,'','',0,'','',0,'','',0,'סוף שבוע + חול',36,'חול 24 שעות + חול',25,'','','','','','','','','','','',''],
    ['עמית לביא','1',613,683,'סוף שבוע מלא',40,'דולג',0,'חול',10,'חול',10,'חול',10,'','','','','','','','','','','','','',''],
    ['ענבר שמיר','1',615,695,'סוף שבוע',20,'דולג',0,'חול + שבת',30,'דולג',0,'חג',25,'','','','','','','','','','','','','',''],
    ['ערן לפושניאן','0',618,683,'חול',10,'חול',10,'סוף שבוע',20,'חג',25,'דולג',0,'','','','','','','','','','','','','',''],
    ['פארוק אברהים','1',623,716,'חול',10,'חמישי',12,'דולג',0,'חג + חול',35,'סוף שבוע + חול',36,'','','','','','','','','','','','','',''],
    ['רון יחיד','1',596,708,'חמישי',12,'סוף שבוע',40,'חול 24 שעות + חול',25,'חג + חול',35,'דולג',0,'','','','','','','','','','','','','',''],
    ['שגיא בוארון','1',620,698,'חול',10,'חול',10,'סוף שבוע',20,'הדממה',18,'סוף שבוע',20,'','','','','','','','','','','','','',''],
    ['בר סרגיינקו','1',702,702,'','',0,'','',0,'','',0,'','',0,'','',0,'','','','','','','','','','',''],
  ];
  if (data.length > 0) sh.getRange(2,1,data.length,28).setValues(data);
}

// ===== BOOTSTRAP (no auth required - only creates admin if sheet is empty) =====
function actionBootstrap() {
  try {
    const sh = getSheet(SH.USERS);
    const rows = sh.getDataRange().getValues();
    const hasUsers = rows.length > 1 && rows[1][2];
    if (hasUsers) {
      return {success: false, error: 'המערכת כבר מאותחלת. השתמש בפרטי הכניסה שלך.'};
    }
    actionInitSheets();
    return {success: true, message: 'המערכת אותחלה! התחבר עם admin / admin123'};
  } catch(e) {
    return {success: false, error: e.toString()};
  }
}

// הרץ פונקציה זו ישירות מעורך Apps Script לאתחול ידני
function manualInit() {
  actionInitSheets();
  Logger.log('סיום! התחבר עם admin / admin123');
}

// ===== UNIFIED TORANI MANAGEMENT =====
// Returns merged data from Users + People sheets
function actionGetAllTornim() {
  const usersRows = getSheet(SH.USERS).getDataRange().getValues();
  const peopleRows = getSheet(SH.PEOPLE).getDataRange().getValues();

  // Build people map by name
  const peopleMap = {};
  for (let i = 1; i < peopleRows.length; i++) {
    const [name, activity, dutyCategory, phone, weekendType, email] = peopleRows[i];
    if (name) peopleMap[String(name)] = {
      activity: String(activity || '1'),
      dutyCategory: String(dutyCategory || ''),
      phone: String(phone || ''),
      weekendType: String(weekendType || 'מלא'),
      email: String(email || ''),
      peopleRow: i + 1
    };
  }

  const tornim = [];
  for (let i = 1; i < usersRows.length; i++) {
    const [id, name, username, , role, active] = usersRows[i];
    if (!username) continue;
    const p = peopleMap[String(name)] || {};
    tornim.push({
      id, name: String(name), username: String(username),
      role: String(role || 'user'), active: !!active,
      activity: p.activity || '1',
      dutyCategory: p.dutyCategory || '',
      phone: p.phone || '',
      email: p.email || '',
      weekendType: p.weekendType || 'מלא',
      hasPeopleEntry: !!peopleMap[String(name)]
    });
  }
  return {success: true, tornim};
}

function actionAddTorani(req) {
  const {name, username, password, role, activity, dutyCategory, phone, weekendType, email} = req;
  if (!name || !username || !password) return {success: false, error: 'חסרים שדות חובה: שם, שם משתמש, סיסמה'};

  // Check username unique
  const usersSheet = getSheet(SH.USERS);
  const usersRows = usersSheet.getDataRange().getValues();
  for (let i = 1; i < usersRows.length; i++) {
    if (String(usersRows[i][2]).toLowerCase() === String(username).toLowerCase())
      return {success: false, error: 'שם המשתמש כבר קיים'};
  }

  // Add to Users
  usersSheet.appendRow([
    Utilities.getUuid().substring(0,8), name, username,
    hashPass(password), role || 'user', true
  ]);

  // Add/update People
  const peopleSheet = getSheet(SH.PEOPLE);
  const peopleRows = peopleSheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < peopleRows.length; i++) {
    if (String(peopleRows[i][0]) === String(name)) {
      peopleSheet.getRange(i+1,2).setValue(activity || '1');
      peopleSheet.getRange(i+1,3).setValue(dutyCategory || '');
      peopleSheet.getRange(i+1,4).setValue(phone || '');
      peopleSheet.getRange(i+1,5).setValue(weekendType || 'מלא');
      found = true; break;
    }
  }
  if (!found) {
    peopleSheet.appendRow([name, activity||'1', dutyCategory||'', phone||'', weekendType||'מלא', email||'']);
  }

  // Set starting score = average of all active tornim (fair entry into rotation)
  const avgScore = calcAverageScore();
  const scoreSheet = getSheet(SH.SCORES);
  const scoreRows = scoreSheet.getDataRange().getValues();
  let foundInScores = false;
  for (let i = 1; i < scoreRows.length; i++) {
    if (String(scoreRows[i][0]||'').trim() === String(name).trim()) {
      foundInScores = true;
      break;
    }
  }
  if (!foundInScores) {
    scoreSheet.appendRow([name, activity||'1', 0, avgScore]);
    Logger.log('New torani ' + name + ' → avg score: ' + avgScore);
  }

  return {success: true, message: 'תורן נוסף. ניקוד התחלתי: ' + avgScore};
}

// ===== חישוב ממוצע ניקוד כל התורנים הפעילים =====
function calcAverageScore() {
  var rows = getSheet(SH.SCORES).getDataRange().getValues();
  var total = 0, count = 0;
  for (var i = 1; i < rows.length; i++) {
    var act = String(rows[i][1]||'1').trim();
    var sc  = Number(rows[i][3])||0;
    if (act !== '0' && sc > 0) { total += sc; count++; }
  }
  return count > 0 ? Math.round(total / count) : 0;
}

function actionUpdateTorani(req) {
  const {username, name, role, newPassword, activity, dutyCategory, phone, weekendType, email, active} = req;
  if (!username) return {success: false, error: 'חסר שם משתמש'};

  // Update Users sheet
  const usersSheet = getSheet(SH.USERS);
  const usersRows = usersSheet.getDataRange().getValues();
  let oldName = '';
  for (let i = 1; i < usersRows.length; i++) {
    if (String(usersRows[i][2]) === String(username)) {
      oldName = String(usersRows[i][1]);
      if (name) { usersSheet.getRange(i+1,2).setValue(name); }
      if (role) { usersSheet.getRange(i+1,5).setValue(role); }
      if (newPassword) { usersSheet.getRange(i+1,4).setValue(hashPass(newPassword)); }
      if (active !== undefined) { usersSheet.getRange(i+1,6).setValue(active); }
      break;
    }
  }

  // Update People sheet (by old name, then update to new name if changed)
  const lookupName = name && name !== oldName ? oldName : (name || oldName);
  const peopleSheet = getSheet(SH.PEOPLE);
  const peopleRows = peopleSheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < peopleRows.length; i++) {
    if (String(peopleRows[i][0]) === String(lookupName)) {
      if (name) peopleSheet.getRange(i+1,1).setValue(name);
      if (activity !== undefined) peopleSheet.getRange(i+1,2).setValue(activity);
      if (dutyCategory !== undefined) peopleSheet.getRange(i+1,3).setValue(dutyCategory);
      if (phone !== undefined) peopleSheet.getRange(i+1,4).setValue(phone);
      if (weekendType !== undefined) peopleSheet.getRange(i+1,5).setValue(weekendType);
      if (email !== undefined) peopleSheet.getRange(i+1,6).setValue(email);
      found = true; break;
    }
  }
  if (!found && lookupName) {
    peopleSheet.appendRow([name||lookupName, activity||'1', dutyCategory||'', phone||'', weekendType||'מלא']);
  }

  return {success: true};
}

function actionToggleTorani(req) {
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === req.username) {
      const current = !!rows[i][5];
      sheet.getRange(i+1,6).setValue(!current);
      return {success: true, active: !current};
    }
  }
  return {success: false, error: 'תורן לא נמצא'};
}

function actionDeleteTorani(req) {
  // Only deactivate, never delete data
  return actionToggleTorani({...req});
}

// ===== REBUILD SCORES FROM ALL SCHEDULE SHEETS =====
function actionRebuildScores(req, user) {
  if (user.role !== 'admin') return {success: false, error: 'אין הרשאה'};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoreSheet = ss.getSheetByName('Scores');
  if (!scoreSheet) return {success: false, error: 'גיליון Scores לא נמצא'};

  var scoreRows = scoreSheet.getDataRange().getValues();
  if (scoreRows.length < 2) return {success: false, error: 'גיליון Scores ריק — הוסף תורנים קודם'};

  // Build name→row index map
  var nameToRow = {};
  for (var i = 1; i < scoreRows.length; i++) {
    var nm = String(scoreRows[i][0]||'').trim();
    if (nm) nameToRow[nm] = i + 1; // 1-based row
  }

  // Find Schedule sheets with actual assignments only
  var sheets = ss.getSheets();
  var schedSheets = sheets.filter(function(s){
    if (!/^Schedule_\d{6}$/.test(s.getName())) return false;
    var lastRow = s.getLastRow();
    if (lastRow < 2) return false;
    var data = s.getRange(2, 4, Math.min(lastRow-1, 5), 1).getValues();
    return data.some(function(r){ return String(r[0]||'').trim() !== ''; });
  });
  schedSheets.sort(function(a,b){ return a.getName().localeCompare(b.getName()); });

  // Clear all monthly columns (col E onwards = col 5+)
  var lastRow = scoreSheet.getLastRow();
  if (lastRow > 1) {
    scoreSheet.getRange(2, 5, lastRow - 1, 24).clearContent(); // 12 months × 2 cols = 24
    scoreSheet.getRange(2, 4, lastRow - 1, 1).clearContent();  // clear acc2026
  }

  // Accumulate scores per person
  var acc = {};
  Object.keys(nameToRow).forEach(function(n){ acc[n] = 0; });

  schedSheets.forEach(function(sh) {
    var shName = sh.getName(); // Schedule_202605
    var year = parseInt(shName.substring(9, 13));
    var mon  = parseInt(shName.substring(13, 15));
    if (year !== 2026) return; // only 2026 for now

    var monColType  = 5 + (mon - 1) * 2; // 1-based: col E=5 for Jan
    var monColScore = monColType + 1;

    var rows = sh.getDataRange().getValues();
    // rows[0] = headers, rows[i] = [date, day, dayType, V, A, B, notes, dutyType, score, ...]
    var monthScores = {}; // name → {type, score}

    for (var ri = 1; ri < rows.length; ri++) {
      var v    = String(rows[ri][3]||'').trim();
      var dtype= String(rows[ri][7]||rows[ri][2]||'').trim();
      var sc   = Number(rows[ri][8]||0);
      if (v && sc > 0) {
        if (!monthScores[v] || sc > monthScores[v].score) {
          monthScores[v] = {type: dtype, score: sc};
        }
      }
    }

    // Load people for פטור check
    var peopleSheet = ss.getSheetByName('People');
    var pRows = peopleSheet ? peopleSheet.getDataRange().getValues() : [];
    var exempt = {};
    for (var pi = 1; pi < pRows.length; pi++) {
      var pn = String(pRows[pi][0]||'').trim();
      var act = String(pRows[pi][1]||'1').trim();
      if (pn && act === '0') exempt[pn] = true;
    }

    // Write to Scores sheet
    Object.keys(nameToRow).forEach(function(n) {
      var rowNum = nameToRow[n];
      if (monthScores[n]) {
        scoreSheet.getRange(rowNum, monColType).setValue(monthScores[n].type);
        scoreSheet.getRange(rowNum, monColScore).setValue(monthScores[n].score);
        acc[n] = (acc[n]||0) + monthScores[n].score;
      } else if (exempt[n]) {
        scoreSheet.getRange(rowNum, monColType).setValue('פטור');
        scoreSheet.getRange(rowNum, monColScore).setValue(10);
        acc[n] = (acc[n]||0) + 10;
      }
    });
  });

  // Write accumulated 2026 score (col D = 4)
  Object.keys(nameToRow).forEach(function(n) {
    scoreSheet.getRange(nameToRow[n], 4).setValue(acc[n]||0);
  });

  return {success: true, message: 'ניקוד עודכן מ-' + schedSheets.length + ' לוחות'};
}


// ===== PROFILE CHANGE REQUESTS =====
var PROFILE_CHANGES_SHEET = 'ProfileChangeRequests';

function actionRequestProfileChange(req, user) {
  var {field, oldValue, newValue} = req;
  if (!field || !newValue) return {success: false, error: 'חסרים פרטים'};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFILE_CHANGES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROFILE_CHANGES_SHEET);
    sh.getRange(1,1,1,8).setValues([['ID','שם משתמש','שם','שדה','ערך ישן','ערך חדש','תאריך','סטטוס']]);
  }

  var id = Utilities.getUuid().substring(0,8);
  var now = new Date().toISOString();
  sh.appendRow([id, user.username, user.name, field, oldValue||'', newValue, now, 'ממתין']);

  var siteUrl = 'https://itairosenblum-hash.github.io/matlam/';
  var fieldHeb = field === 'weekendType' ? 'סוג סוף שבוע' : 'קטגוריה';

  // Mail to admin
  var adminEmail = ADMIN_EMAIL;
  if (adminEmail) {
    try {
      MailApp.sendEmail({
        to: adminEmail,
        subject: '📋 בקשת שינוי פרופיל — ' + user.name,
        htmlBody: '<div dir="rtl" style="font-family:Arial">' +
          '<h2>📋 בקשת שינוי פרופיל</h2>' +
          '<p><strong>' + user.name + '</strong> מבקש לשנות:</p>' +
          '<table style="border-collapse:collapse;width:100%">' +
          '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd"><strong>שדה</strong></td><td style="padding:8px;border:1px solid #ddd">' + fieldHeb + '</td></tr>' +
          '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd"><strong>ערך נוכחי</strong></td><td style="padding:8px;border:1px solid #ddd">' + (oldValue||'—') + '</td></tr>' +
          '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd"><strong>ערך חדש מבוקש</strong></td><td style="padding:8px;border:1px solid #ddd"><strong style="color:#2ea043">' + newValue + '</strong></td></tr>' +
          '</table>' +
          '<br><a href="' + siteUrl + '" style="background:#2ea043;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px">כניסה למערכת לאישור</a>' +
          '</div>'
      });
    } catch(e) { Logger.log('Admin mail error: ' + e); }
  }

  // Mail to user
  var tornim = actionGetAllTornim().tornim || [];
  var t = tornim.find(function(x){ return x.username === user.username; });
  if (t && t.email) {
    try {
      MailApp.sendEmail({
        to: t.email,
        subject: '📋 בקשתך לשינוי פרופיל נשלחה לאישור',
        htmlBody: '<div dir="rtl" style="font-family:Arial">' +
          '<h2>📋 בקשתך נשלחה למנהל</h2>' +
          '<p>שלום <strong>' + user.name + '</strong>,</p>' +
          '<p>בקשתך לשינוי <strong>' + fieldHeb + '</strong> מ-<strong>' + (oldValue||'—') + '</strong> ל-<strong>' + newValue + '</strong> נשלחה למנהל לאישור.</p>' +
          '<p>תקבל/י עדכון במייל לאחר שהמנהל יאשר או ידחה את הבקשה.</p>' +
          '</div>'
      });
    } catch(e) { Logger.log('User mail error: ' + e); }
  }

  return {success: true};
}

function actionGetProfileChangeRequests(req, user) {
  if (user.role !== 'admin') return {success: false, error: 'אין הרשאה'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFILE_CHANGES_SHEET);
  if (!sh || sh.getLastRow() < 2) return {success: true, requests: []};
  var rows = sh.getDataRange().getValues();
  Logger.log('ProfileChangeRequests rows: ' + rows.length);
  var requests = [];
  for (var i = 1; i < rows.length; i++) {
    Logger.log('Row ' + i + ' status: "' + rows[i][7] + '" hex: ' + Array.from(String(rows[i][7]||'')).map(c=>c.charCodeAt(0)).join(','));
    if (String(rows[i][7]||'').trim().includes('ממתין')) {
      requests.push({id:rows[i][0], username:rows[i][1], name:rows[i][2], field:rows[i][3], oldValue:rows[i][4], newValue:rows[i][5], date:rows[i][6]});
    }
  }
  return {success: true, requests};
}

function actionApproveProfileChange(req, user) {
  if (user.role !== 'admin') return {success: false, error: 'אין הרשאה'};
  return _handleProfileChange(req, 'אושר');
}

function actionRejectProfileChange(req, user) {
  if (user.role !== 'admin') return {success: false, error: 'אין הרשאה'};
  return _handleProfileChange(req, 'נדחה');
}

function _handleProfileChange(req, status) {
  var id = req.id;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFILE_CHANGES_SHEET);
  if (!sh) return {success: false, error: 'גיליון לא נמצא'};
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    var username = rows[i][1], name = rows[i][2], field = rows[i][3], oldValue = rows[i][4], newValue = rows[i][5];
    // Update status
    sh.getRange(i+1, 8).setValue(status);
    var fieldHeb = field === 'weekendType' ? 'סוג סוף שבוע' : 'קטגוריה';

    if (status === 'אושר') {
      // Apply change to People sheet (search by name)
      var peopleSheet = ss.getSheetByName('People');
      var pRows = peopleSheet.getDataRange().getValues();
      var found = false;
      Logger.log('Looking for name: "' + name + '" field: ' + field + ' newValue: ' + newValue);
      for (var pi = 1; pi < pRows.length; pi++) {
        Logger.log('Checking row ' + pi + ': "' + pRows[pi][0] + '"');
        if (String(pRows[pi][0]).trim() === String(name).trim()) {
          if (field === 'weekendType') peopleSheet.getRange(pi+1, 5).setValue(newValue);
          if (field === 'dutyCategory') peopleSheet.getRange(pi+1, 3).setValue(newValue);
          Logger.log('Updated row ' + (pi+1) + ' col ' + (field === 'weekendType' ? 5 : 3) + ' to: ' + newValue);
          found = true;
          break;
        }
      }
      Logger.log('Found: ' + found);

      // Also update in Users sheet (col 7 = weekendType, col 6 = dutyCategory)
      var usersSheet3 = ss.getSheetByName('Users');
      if (usersSheet3) {
        var uRows3 = usersSheet3.getDataRange().getValues();
        for (var ui3 = 1; ui3 < uRows3.length; ui3++) {
          if (String(uRows3[ui3][2]).trim() === String(username).trim()) {
            if (field === 'weekendType') usersSheet3.getRange(ui3+1, 7).setValue(newValue);
            if (field === 'dutyCategory') usersSheet3.getRange(ui3+1, 6).setValue(newValue);
            Logger.log('Updated Users row ' + (ui3+1) + ' to: ' + newValue);
            break;
          }
        }
      }
      // Also check Users sheet for the username-based name
      if (!found) {
        var usersSheet = ss.getSheetByName('Users');
        var uRows = usersSheet.getDataRange().getValues();
        for (var ui = 1; ui < uRows.length; ui++) {
          if (String(uRows[ui][2]).trim() === String(username).trim()) {
            var realName = String(uRows[ui][1]).trim();
            for (var pi2 = 1; pi2 < pRows.length; pi2++) {
              if (String(pRows[pi2][0]).trim() === realName) {
                if (field === 'weekendType') peopleSheet.getRange(pi2+1, 5).setValue(newValue);
                if (field === 'dutyCategory') peopleSheet.getRange(pi2+1, 3).setValue(newValue);
                break;
              }
            }
            break;
          }
        }
      }

      // Add notification for the user
      var notifSheet = ss.getSheetByName('Notifications');
      if (notifSheet) {
        var notifId = Utilities.getUuid().substring(0,8);
        var notifMsg = 'בקשתך לשינוי ' + fieldHeb + ' ל-"' + newValue + '" אושרה ✅';
        notifSheet.appendRow([notifId, name, notifMsg, new Date().toISOString()]);
      }
    } else {
      // Rejected — add notification
      var notifSheet2 = ss.getSheetByName('Notifications');
      if (notifSheet2) {
        var notifId2 = Utilities.getUuid().substring(0,8);
        var notifMsg2 = 'בקשתך לשינוי ' + fieldHeb + ' ל-"' + newValue + '" נדחתה ❌';
        notifSheet2.appendRow([notifId2, name, notifMsg2, new Date().toISOString()]);
      }
    }

    // Find user email from Users sheet
    var userEmail = '';
    var usersSheet2 = ss.getSheetByName('Users');
    if (usersSheet2) {
      var uRows2 = usersSheet2.getDataRange().getValues();
      // Check Users sheet col 8 (email if exists) or from People
      var tornim = actionGetAllTornim().tornim || [];
      var t = tornim.find(function(x){ return x.username === username; });
      if (t && t.email) userEmail = t.email;
    }

    if (userEmail) {
      var icon = status === 'אושר' ? '✅' : '❌';
      var msg = status === 'אושר'
        ? 'בקשתך אושרה! הפרופיל עודכן ל-<strong>' + newValue + '</strong>.'
        : 'בקשתך נדחתה על ידי המנהל. הפרופיל נשאר: <strong>' + (oldValue||'—') + '</strong>.';
      try {
        MailApp.sendEmail({
          to: userEmail,
          subject: icon + ' בקשת שינוי פרופיל — ' + (status === 'אושר' ? 'אושרה' : 'נדחתה'),
          htmlBody: '<div dir="rtl" style="font-family:Arial"><h2>' + icon + ' עדכון בקשתך</h2>' +
            '<p>שלום <strong>' + name + '</strong>,</p>' +
            '<p>' + msg + '</p>' +
            '<p>שדה: <strong>' + fieldHeb + '</strong></p></div>'
        });
      } catch(e) { Logger.log('Mail error: ' + e); }
    } else {
      Logger.log('No email found for user: ' + username);
    }
    return {success: true};
  }
  return {success: false, error: 'בקשה לא נמצאה'};
}

function actionSendCredentialsAll(req) {
  const tornim = actionGetAllTornim().tornim;
  const siteUrl = 'https://itairosenblum-hash.github.io/matlam/';
  let sent = 0, skipped = 0;

  tornim.filter(t => t.active).forEach(function(t) {
    if (!t.email) { skipped++; return; }
    var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">' +
      '<h2 style="color:#2d4a3e">🔐 פרטי כניסה — מפקד תורן מטל"מ</h2>' +
      '<p>שלום <strong>' + t.name + '</strong>,</p>' +
      '<p>להלן פרטי הכניסה שלך למערכת:</p>' +
      '<table style="border-collapse:collapse;width:100%;margin:16px 0">' +
      '<tr><td style="padding:10px;background:#f5f5f5;border:1px solid #ddd;font-weight:bold">👤 שם משתמש</td>' +
      '<td style="padding:10px;border:1px solid #ddd;font-size:18px;letter-spacing:1px"><strong>' + t.username + '</strong></td></tr>' +
      '<tr><td style="padding:10px;background:#f5f5f5;border:1px solid #ddd;font-weight:bold">🔑 סיסמה</td>' +
      '<td style="padding:10px;border:1px solid #ddd">הסיסמה שלך (אם שינית) או הסיסמה שקיבלת בעת ההרשמה</td></tr>' +
      '</table>' +
      '<a href="' + siteUrl + '" style="display:inline-block;background:#2ea043;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold">כניסה למערכת</a>' +
      '<p style="margin-top:20px;color:#666;font-size:12px">אם שכחת את הסיסמה, פנה למנהל המערכת.</p>' +
      '<p style="color:#999;font-size:11px">מפקד תורן מטל"מ</p></div>';
    try {
      MailApp.sendEmail({to: t.email, subject: '🔐 פרטי כניסה — מפקד תורן מטל"מ', htmlBody: html});
      sent++;
    } catch(e) { Logger.log('Failed to send to ' + t.email + ': ' + e); skipped++; }
  });

  return {success: true, message: 'נשלח ל-' + sent + ' תורנים' + (skipped > 0 ? ' (' + skipped + ' ללא מייל / שגיאה)' : '')};
}

// ===== שלח פרטי כניסה לתורן בודד =====
function actionSendCredentialsOne(req) {
  const {username} = req;
  if (!username) return {success: false, error: 'חסר שם משתמש'};

  const tornim = actionGetAllTornim().tornim;
  const t = tornim.find(function(x) { return x.username === username; });
  if (!t) return {success: false, error: 'תורן לא נמצא'};
  if (!t.email) return {success: false, error: 'אין כתובת מייל לתורן זה'};

  const siteUrl = 'https://itairosenblum-hash.github.io/matlam/';
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">' +
    '<h2 style="color:#2d4a3e">🔐 פרטי כניסה — מפקד תורן מטל"מ</h2>' +
    '<p>שלום <strong>' + t.name + '</strong>,</p>' +
    '<p>להלן פרטי הכניסה שלך למערכת:</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:16px 0">' +
    '<tr><td style="padding:10px;background:#f5f5f5;border:1px solid #ddd;font-weight:bold">👤 שם משתמש</td>' +
    '<td style="padding:10px;border:1px solid #ddd;font-size:18px;letter-spacing:1px"><strong>' + t.username + '</strong></td></tr>' +
    '<tr><td style="padding:10px;background:#f5f5f5;border:1px solid #ddd;font-weight:bold">🔑 סיסמה</td>' +
    '<td style="padding:10px;border:1px solid #ddd">הסיסמה שלך (אם שינית) או הסיסמה שקיבלת בעת ההרשמה</td></tr>' +
    '</table>' +
    '<a href="' + siteUrl + '" style="display:inline-block;background:#2ea043;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold">כניסה למערכת</a>' +
    '<p style="margin-top:20px;color:#666;font-size:12px">אם שכחת את הסיסמה, פנה למנהל המערכת.</p>' +
    '<p style="color:#999;font-size:11px">מפקד תורן מטל"מ</p></div>';

  try {
    MailApp.sendEmail({to: t.email, subject: '🔐 פרטי כניסה — מפקד תורן מטל"מ', htmlBody: html});
    return {success: true};
  } catch(e) {
    return {success: false, error: e.toString()};
  }
}

// ===== אתחול כל התורנים - הרץ פעם אחת מעורך Apps Script =====
function initAllTornim() {
  const tornim = [
    // [שם,           username,              סיסמה,        תפקיד, פעילות, קטגוריה,       סוף שבוע, טלפון]
    ['אהרון ריסין',   'aharon.risin',        'Tornut2026',  'user','1',   '',             'בנפרד', '543005842'],
    ['איתי גרטל',    'itai.gartel',          'Tornut2026',  'user','1',   '',             'בנפרד', '544996678'],
    ['אלון אשורוב',  'alon.ashurov',         'Tornut2026',  'user','1',   '',             'בנפרד', '543295450'],
    ['בן דקל',       'ben.dekel',            'Tornut2026',  'user','1',   '',             'מלא',   '542029111'],
    ['בר סרגיינקו',  'bar.sergienko',        'Tornut2026',  'user','0',   'בהליך הסמכה',   'מלא',   '0507232244'],
    ['גיא מונט',     'guy.mont',             'Tornut2026',  'user','1',   '',             'מלא',   '503994399'],
    ['גל איזנברגר',  'gal.eizenberger',      'Tornut2026',  'user','0',   'בהליך הסמכה',   'מלא',   '0523055642'],
    ['גל סטי',       'gal.sti',              'Tornut2026',  'user','1',   '',             'בנפרד', '506575389'],
    ['דניאל הרשקוביץ','daniel.hershkovitz',  'Tornut2026',  'user','1',   '',             'בנפרד', '0509669933'],
    ['דניאל מלול',   'daniel.malul',         'Tornut2026',  'user','1',   '',             'בנפרד', '545499791'],
    ['הוד סטרול',    'hod.strol',            'Tornut2026',  'user','1',   '',             'בנפרד', '584885822'],
    ['הראל סיבוני',  'harel.siboni',         'Tornut2026',  'user','1',   '',             'מלא',   '544948399'],
    ['זיו יוסף',     'ziv.yosef',            'Tornut2026',  'user','1',   '',             'בנפרד', '508851767'],
    ['יגאל לביא',    'yigal.lavi',           'Tornut2026',  'user','1',   '',             'בנפרד', '529277176'],
    ['יהונתן אנגל',  'yonatan.angel',        'Tornut2026',  'user','1',   '',             'מלא',   '526087953'],
    ['יהונתן דוד פור','yonatan.davidpour',   'Tornut2026',  'user','1',   '',             'בנפרד', '509221812'],
    ['יואב מטרני',   'yoav.matrani',         'Tornut2026',  'user','1',   '',             'מלא',   '526512171'],
    ['יובל הופמן',   'yuval.hoffman',        'Tornut2026',  'user','0',   'אב',           'מלא',   '547833991'],
    ['יובל וולטמן',  'yuval.voltman',        'Tornut2026',  'user','1',   '',             'בנפרד', '543924033'],
    ['יובל נסים טויאטו','yuval.toiyato',     'Tornut2026',  'user','1',   '',             'מלא',   '528811845'],
    ['יוסף עזראן',   'yosef.ezran',          'Tornut2026',  'user','1',   '',             'מלא',   '538289188'],
    ['לידור סבג',    'lidor.savag',          'Tornut2026',  'user','0.5', 'אב',           'מלא',   '526444337'],
    ['מיכאלה כהן',   'michaela.cohen',       'Tornut2026',  'user','1',   '',             'מלא',   '509566050'],
    ['מתן סרי',      'matan.seri',           'Tornut2026',  'user','1',   '',             'בנפרד', '547191477'],
    ['נוריאל ביטון',  'nuriel.biton',        'Tornut2026',  'user','1',   '',             'מלא',   '543051783'],
    ['עומר יצחקי',   'omer.yitzhaki',        'Tornut2026',  'user','1',   '',             'בנפרד', '506659941'],
    ['עידן פרץ',     'idan.peretz',          'Tornut2026',  'user','1',   '',             'בנפרד', '544280337'],
    ['עמית אילוז',   'amit.ilouz',           'Tornut2026',  'user','1',   '',             'בנפרד', '503511155'],
    ['עמית לביא',    'amit.lavi',            'Tornut2026',  'user','1',   '',             'מלא',   '544530513'],
    ['ענבר שמיר',    'inbar.shamir',         'Tornut2026',  'user','1',   '',             'בנפרד', '502797966'],
    ['ערן לפושניאן', 'eran.lapushniyan',     'Tornut2026',  'user','0',   'פטור',         'מלא',   '544762081'],
    ['פארוק אברהים', 'farouk.avraham',       'Tornut2026',  'user','1',   '',             'בנפרד', '525507936'],
    ['רון יחיד',     'ron.yahid',            'Tornut2026',  'user','1',   '',             'בנפרד', '544484376'],
    ['שגיא בוארון',  'sagi.buaron',          'Tornut2026',  'user','1',   '',             'בנפרד', '542515161'],
  ];

  const usersSheet = getSheet(SH.USERS);
  const peopleSheet = getSheet(SH.PEOPLE);

  // Clear existing data (keep headers)
  const usersLastRow = usersSheet.getLastRow();
  if (usersLastRow > 1) usersSheet.deleteRows(2, usersLastRow - 1);
  const peopleLastRow = peopleSheet.getLastRow();
  if (peopleLastRow > 1) peopleSheet.deleteRows(2, peopleLastRow - 1);

  // צור חשבון admin נפרד למנהל המערכת
  usersSheet.appendRow([
    Utilities.getUuid().substring(0,8),
    'מנהל מערכת', 'admin', hashPass('admin123'), 'admin', true
  ]);

  let added = 0;
  tornim.forEach(([name, username, password, role, activity, category, weekend, phone]) => {
    // Add to Users
    usersSheet.appendRow([
      Utilities.getUuid().substring(0,8),
      name, username, hashPass(password), role, true
    ]);
    // Add to People
    peopleSheet.appendRow([name, activity, category, phone, weekend]);
    added++;
  });

  Logger.log('✅ נוספו ' + added + ' תורנים. סיסמה ברירת מחדל: Tornut2026');
  return 'נוספו ' + added + ' תורנים בהצלחה!';
}

// ===== אתחול לוח יוני 2026 - הרץ מעורך Apps Script =====
function initJuneSchedule2026() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Schedule_202606';
  const existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const sheet = ss.insertSheet(sheetName);
  sheet.setRightToLeft(true);

  const headers = ['תאריך','יום','סוג יום','מבצע','עתודה א','עתודה ב','הערות','סוג תורנות','ניקוד','מבצע שני','עתודה א שנייה','עתודה ב שנייה'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]);

  const HEB_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  // June 2026 day types from Excel
  const dayTypes = {
    1:'חול',2:'חול',3:'חול',4:'חמישי',5:'סוף שבוע',6:'סוף שבוע',
    7:'חול',8:'חול',9:'חול',10:'חול 24 שעות',11:'חמישי 24 שעות',
    12:'סוף שבוע',13:'סוף שבוע',14:'חול',15:'חול',16:'חול',17:'חול',
    18:'חמישי',19:'סוף שבוע',20:'סוף שבוע',21:'חול',22:'חול',23:'חול',
    24:'חול',25:'חמישי',26:'סוף שבוע',27:'סוף שבוע',28:'חול',29:'חול',30:'חול'
  };

  const rows = [];
  for (let d = 1; d <= 30; d++) {
    const date = new Date(2026, 5, d); // June = month 5
    const dow = date.getDay();
    rows.push([
      Utilities.formatDate(date, 'Asia/Jerusalem', 'dd/MM/yyyy'),
      HEB_DAYS[dow],
      dayTypes[d] || 'חול',
      '', '', '', '', dayTypes[d] || 'חול', 0
    ]);
  }

  sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  Logger.log('✅ לוח יוני 2026 נוצר עם ' + rows.length + ' ימים. ערוך דרך האתר!');
  return 'לוח יוני נוצר!';
}

// ===== לוח יוני 2026 - קריאה אוטומטית מהתמונה =====
function initJuneSchedule2026() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Schedule_202606';
  const existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const sheet = ss.insertSheet(sheetName);
  sheet.setRightToLeft(true);

  const headers = ['תאריך','יום','סוג יום','מבצע','עתודה א','עתודה ב','הערות','סוג תורנות','ניקוד','מבצע שני','עתודה א שנייה','עתודה ב שנייה'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]);

  const HEB_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  const dayTypes = {
    1:'חול',2:'חול',3:'חול',4:'חמישי',5:'סוף שבוע',6:'סוף שבוע',
    7:'חול',8:'חול',9:'חול',10:'חול 24 שעות',11:'חמישי 24 שעות',
    12:'סוף שבוע',13:'סוף שבוע',14:'חול',15:'חול',16:'חול',17:'חול',
    18:'חמישי',19:'סוף שבוע',20:'סוף שבוע',21:'חול',22:'חול',23:'חול',
    24:'חול',25:'חמישי',26:'סוף שבוע',27:'סוף שבוע',28:'חול',29:'חול',30:'חול'
  };

  const dutyScores = {
    'חול':10,'חמישי':12,'סוף שבוע':20,'חול 24 שעות':15,'חמישי 24 שעות':16,'סוף שבוע מלא':40
  };

  const assignments = {
    1:  {V:'אלון אשורוב',      A:'יובל וולטמן',      B:'דניאל הרשקוביץ'},
    2:  {V:'גל סטי',           A:'מתן סרי',           B:'בן דקל'},
    3:  {V:'זיו יוסף',         A:'גיא מונט',          B:'יהונתן אנגל'},
    4:  {V:'הראל סיבוני',      A:'עמית לביא',         B:'יובל נסים טויאטו'},
    5:  {V:'עידן פרץ',         A:'עומר יצחקי',        B:'רון יחיד'},
    6:  {V:'בר סרגיינקו',      A:'רון יחיד',          B:'עמית אילוז'},
    7:  {V:'יהונתן דוד פור',   A:'זיו יוסף',          B:'גל איזנברגר'},
    8:  {V:'יובל וולטמן',      A:'דניאל הרשקוביץ',   B:'נוריאל ביטון'},
    9:  {V:'שגיא בוארון',      A:'מיכאלה כהן',        B:'פארוק אברהים'},
    10: {V:'גיא מונט',         A:'יהונתן אנגל',       B:'יהונתן דוד פור'},
    11: {V:'עמית לביא',        A:'יובל נסים טויאטו',  B:'הראל סיבוני'},
    12: {V:'יואב מטרני',       A:'שגיא בוארון',       B:'מתן סרי'},
    13: {V:'יואב מטרני',       A:'שגיא בוארון',       B:'מתן סרי'},
    14: {V:'איתי גרטל',        A:'גל סטי',            B:'אהרון ריסין'},
    15: {V:'גל איזנברגר',      A:'יגאל לביא',         B:'יובל וולטמן'},
    16: {V:'ענבר שמיר',        A:'פארוק אברהים',      B:'יואב מטרני'},
    17: {V:'נוריאל ביטון',     A:'בן דקל',            B:'גיא מונט'},
    18: {V:'עמית אילוז',       A:'הראל סיבוני',       B:'זיו יוסף'},
    19: {V:'רון יחיד',         A:'ענבר שמיר',         B:'בר סרגיינקו'},
    20: {V:'אהרון ריסין',      A:'עידן פרץ',          B:'דניאל מלול'},
    21: {V:'דניאל הרשקוביץ',  A:'גל איזנברגר',       B:'גל סטי'},
    22: {V:'מיכאלה כהן',       A:'יהונתן דוד פור',   B:'שגיא בוארון'},
    23: {V:'יהונתן אנגל',      A:'נוריאל ביטון',      B:'יגאל לביא'},
    24: {V:'מתן סרי',          A:'עמית אילוז',        B:'עמית לביא'},
    25: {V:'יובל נסים טויאטו', A:'אהרון ריסין',       B:'מיכאלה כהן'},
    26: {V:'עומר יצחקי',       A:'אלון אשורוב',       B:'איתי גרטל'},
    27: {V:'עומר יצחקי',       A:'בר סרגיינקו',       B:'עידן פרץ'},
    28: {V:'בן דקל',           A:'יואב מטרני',        B:'ענבר שמיר'},
    29: {V:'פארוק אברהים',     A:'יגאל לביא',         B:'דניאל מלול'},
    30: {V:'אלון אשורוב',      A:'פארוק אברהים',      B:'איתי גרטל'}
  };

  const rows = [];
  for (let d = 1; d <= 30; d++) {
    const date = new Date(2026, 5, d);
    const dow = date.getDay();
    const a = assignments[d] || {V:'',A:'',B:''};
    const dtype = dayTypes[d] || 'חול';
    rows.push([
      Utilities.formatDate(date,'Asia/Jerusalem','dd/MM/yyyy'),
      HEB_DAYS[dow], dtype,
      a.V||'', a.A||'', a.B||'', '',
      dtype, dutyScores[dtype]||10
    ]);
  }

  sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  Logger.log('✅ לוח יוני 2026 נוצר עם 30 ימים + שיבוצים מלאים!');
  return 'לוח יוני 2026 נוצר בהצלחה!';
}

// ===== לוח חגים ומועדים ישראל 2026 =====
function getIsraeliHolidays2026() {
  return {
    // פורים
    '2026-03-13': {type:'ערב חג', name:'תענית אסתר'},
    '2026-03-14': {type:'חג',     name:'פורים'},
    // פסח
    '2026-03-31': {type:'ערב חג', name:'ערב פסח'},
    '2026-04-01': {type:'חג',     name:'פסח א׳'},
    '2026-04-02': {type:'חג',     name:'פסח ב׳'},
    '2026-04-03': {type:'חג',     name:'חוה״מ פסח'},
    '2026-04-04': {type:'חג',     name:'חוה״מ פסח'},
    '2026-04-05': {type:'חג',     name:'חוה״מ פסח'},
    '2026-04-06': {type:'חג',     name:'חוה״מ פסח'},
    '2026-04-07': {type:'ערב חג', name:'ערב שביעי של פסח'},
    '2026-04-08': {type:'חג',     name:'שביעי של פסח'},
    // יום העצמאות
    '2026-04-21': {type:'ערב חג', name:'יום הזיכרון'},
    '2026-04-22': {type:'חג',     name:'יום העצמאות'},
    // שבועות
    '2026-05-20': {type:'ערב חג', name:'ערב שבועות'},
    '2026-05-21': {type:'חג',     name:'שבועות א׳'},
    '2026-05-22': {type:'חג',     name:'שבועות ב׳'},
    // תשעה באב
    '2026-07-22': {type:'ערב חג', name:'ערב תשעה באב'},
    '2026-07-23': {type:'חג',     name:'תשעה באב'},
    // ראש השנה
    '2026-09-19': {type:'ערב חג', name:'ערב ראש השנה'},
    '2026-09-20': {type:'חג',     name:'ראש השנה א׳'},
    '2026-09-21': {type:'חג',     name:'ראש השנה ב׳'},
    // יום כיפור
    '2026-09-28': {type:'ערב חג', name:'ערב יום כיפור'},
    '2026-09-29': {type:'חג',     name:'יום כיפור'},
    // סוכות
    '2026-10-03': {type:'ערב חג', name:'ערב סוכות'},
    '2026-10-04': {type:'חג',     name:'סוכות א׳'},
    '2026-10-05': {type:'חג',     name:'סוכות ב׳'},
    '2026-10-06': {type:'חג',     name:'חוה״מ סוכות'},
    '2026-10-07': {type:'חג',     name:'חוה״מ סוכות'},
    '2026-10-08': {type:'חג',     name:'חוה״מ סוכות'},
    '2026-10-09': {type:'חג',     name:'חוה״מ סוכות'},
    '2026-10-10': {type:'ערב חג', name:'הושענא רבה'},
    '2026-10-11': {type:'חג',     name:'שמחת תורה'},
    // חנוכה
    '2026-12-01': {type:'חג',     name:'חנוכה א׳'},
    '2026-12-02': {type:'חג',     name:'חנוכה ב׳'},
    '2026-12-03': {type:'חג',     name:'חנוכה ג׳'},
    '2026-12-04': {type:'חג',     name:'חנוכה ד׳'},
    '2026-12-05': {type:'חג',     name:'חנוכה ה׳'},
    '2026-12-06': {type:'חג',     name:'חנוכה ו׳'},
    '2026-12-07': {type:'חג',     name:'חנוכה ז׳'},
    '2026-12-08': {type:'חג',     name:'חנוכה ח׳'},
  };
}

// ===== פונקציה אוניברסלית - צור לוח לכל חודש עם חגים =====
function initMonthSchedule(year, month) {
  // month: 1-12
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monthStr = String(year) + String(month).padStart(2,'0');
  const sheetName = 'Schedule_' + monthStr;
  const existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const sheet = ss.insertSheet(sheetName);
  sheet.setRightToLeft(true);

  const headers = ['תאריך','יום','סוג יום','מבצע','עתודה א','עתודה ב','הערות','סוג תורנות','ניקוד','מבצע שני','עתודה א שנייה','עתודה ב שנייה'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]);

  const HEB_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const holidays = getIsraeliHolidays2026();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dutyScores = {
    'חול':10,'חמישי':12,'חמישי 24 שעות':16,'חול 24 שעות':15,
    'סוף שבוע':20,'סוף שבוע מלא':40,'ערב חג':25,'חג':25,'יומיים חג':50
  };

  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month-1, d);
    const dow = date.getDay(); // 0=Sun
    const dateStr = Utilities.formatDate(date, 'Asia/Jerusalem', 'yyyy-MM-dd');
    const holiday = holidays[dateStr];

    let dayType;
    if (holiday) {
      dayType = holiday.type; // 'חג' or 'ערב חג'
    } else if (dow === 5) {
      dayType = 'סוף שבוע';   // שישי
    } else if (dow === 6) {
      dayType = 'סוף שבוע';   // שבת
    } else if (dow === 4) {
      dayType = 'חמישי';      // חמישי
    } else {
      dayType = 'חול';        // חול
    }

    const notes = holiday ? holiday.name : '';

    rows.push([
      Utilities.formatDate(date, 'Asia/Jerusalem', 'dd/MM/yyyy'),
      HEB_DAYS[dow], dayType,
      '', '', '', notes, dayType, dutyScores[dayType] || 10
    ]);
  }

  sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  const monthNames = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  Logger.log('✅ לוח ' + monthNames[month] + ' ' + year + ' נוצר עם ' + daysInMonth + ' ימים + חגים!');
  return 'לוח ' + monthNames[month] + ' ' + year + ' מוכן!';
}

// קיצורי דרך לכל חודש 2026
function initJuly2026()     { return initMonthSchedule(2026, 7); }
function initAugust2026()   { return initMonthSchedule(2026, 8); }
function initSept2026()     { return initMonthSchedule(2026, 9); }
function initOct2026()      { return initMonthSchedule(2026, 10); }
function initNov2026()      { return initMonthSchedule(2026, 11); }
function initDec2026()      { return initMonthSchedule(2026, 12); }

function actionInitMonth(req) {
  const year = parseInt(req.year);
  const month = parseInt(req.month);
  if (!year || !month) return {success:false, error:'חסרים year ו-month'};
  try {
    const msg = initMonthScheduleEx(year, month);
    return {success:true, message: msg};
  } catch(e) {
    return {success:false, error: e.toString()};
  }
}

// ===== לוח חגים 2027-2029 =====
function getIsraeliHolidays() {
  const h2026 = getIsraeliHolidays2026();
  const h2027 = {
    // פורים
    '2027-03-03': {type:'ערב חג', name:'תענית אסתר'},
    '2027-03-04': {type:'חג',     name:'פורים'},
    // פסח
    '2027-04-20': {type:'ערב חג', name:'ערב פסח'},
    '2027-04-21': {type:'חג',     name:'פסח א׳'},
    '2027-04-22': {type:'חג',     name:'פסח ב׳'},
    '2027-04-23': {type:'חג',     name:'חוה״מ פסח'},
    '2027-04-24': {type:'חג',     name:'חוה״מ פסח'},
    '2027-04-25': {type:'חג',     name:'חוה״מ פסח'},
    '2027-04-26': {type:'חג',     name:'חוה״מ פסח'},
    '2027-04-27': {type:'ערב חג', name:'ערב שביעי של פסח'},
    '2027-04-28': {type:'חג',     name:'שביעי של פסח'},
    // יום העצמאות
    '2027-05-18': {type:'ערב חג', name:'יום הזיכרון'},
    '2027-05-19': {type:'חג',     name:'יום העצמאות'},
    // שבועות
    '2027-06-09': {type:'ערב חג', name:'ערב שבועות'},
    '2027-06-10': {type:'חג',     name:'שבועות א׳'},
    '2027-06-11': {type:'חג',     name:'שבועות ב׳'},
    // תשעה באב
    '2027-08-10': {type:'ערב חג', name:'ערב תשעה באב'},
    '2027-08-11': {type:'חג',     name:'תשעה באב'},
    // ראש השנה
    '2027-09-10': {type:'ערב חג', name:'ערב ראש השנה'},
    '2027-09-11': {type:'חג',     name:'ראש השנה א׳'},
    '2027-09-12': {type:'חג',     name:'ראש השנה ב׳'},
    // יום כיפור
    '2027-09-19': {type:'ערב חג', name:'ערב יום כיפור'},
    '2027-09-20': {type:'חג',     name:'יום כיפור'},
    // סוכות
    '2027-09-24': {type:'ערב חג', name:'ערב סוכות'},
    '2027-09-25': {type:'חג',     name:'סוכות א׳'},
    '2027-09-26': {type:'חג',     name:'סוכות ב׳'},
    '2027-09-27': {type:'חג',     name:'חוה״מ סוכות'},
    '2027-09-28': {type:'חג',     name:'חוה״מ סוכות'},
    '2027-09-29': {type:'חג',     name:'חוה״מ סוכות'},
    '2027-09-30': {type:'חג',     name:'חוה״מ סוכות'},
    '2027-10-01': {type:'ערב חג', name:'הושענא רבה'},
    '2027-10-02': {type:'חג',     name:'שמחת תורה'},
    // חנוכה
    '2027-12-20': {type:'חג',     name:'חנוכה א׳'},
    '2027-12-21': {type:'חג',     name:'חנוכה ב׳'},
    '2027-12-22': {type:'חג',     name:'חנוכה ג׳'},
    '2027-12-23': {type:'חג',     name:'חנוכה ד׳'},
    '2027-12-24': {type:'חג',     name:'חנוכה ה׳'},
    '2027-12-25': {type:'חג',     name:'חנוכה ו׳'},
    '2027-12-26': {type:'חג',     name:'חנוכה ז׳'},
    '2027-12-27': {type:'חג',     name:'חנוכה ח׳'},
  };
  const h2028 = {
    // פורים
    '2028-03-22': {type:'ערב חג', name:'תענית אסתר'},
    '2028-03-23': {type:'חג',     name:'פורים'},
    // פסח
    '2028-04-09': {type:'ערב חג', name:'ערב פסח'},
    '2028-04-10': {type:'חג',     name:'פסח א׳'},
    '2028-04-11': {type:'חג',     name:'פסח ב׳'},
    '2028-04-12': {type:'חג',     name:'חוה״מ פסח'},
    '2028-04-13': {type:'חג',     name:'חוה״מ פסח'},
    '2028-04-14': {type:'חג',     name:'חוה״מ פסח'},
    '2028-04-15': {type:'חג',     name:'חוה״מ פסח'},
    '2028-04-16': {type:'ערב חג', name:'ערב שביעי של פסח'},
    '2028-04-17': {type:'חג',     name:'שביעי של פסח'},
    // יום העצמאות
    '2028-05-08': {type:'ערב חג', name:'יום הזיכרון'},
    '2028-05-09': {type:'חג',     name:'יום העצמאות'},
    // שבועות
    '2028-05-28': {type:'ערב חג', name:'ערב שבועות'},
    '2028-05-29': {type:'חג',     name:'שבועות א׳'},
    '2028-05-30': {type:'חג',     name:'שבועות ב׳'},
    // תשעה באב
    '2028-07-29': {type:'ערב חג', name:'ערב תשעה באב'},
    '2028-07-30': {type:'חג',     name:'תשעה באב'},
    // ראש השנה
    '2028-09-28': {type:'ערב חג', name:'ערב ראש השנה'},
    '2028-09-29': {type:'חג',     name:'ראש השנה א׳'},
    '2028-09-30': {type:'חג',     name:'ראש השנה ב׳'},
    // יום כיפור
    '2028-10-07': {type:'ערב חג', name:'ערב יום כיפור'},
    '2028-10-08': {type:'חג',     name:'יום כיפור'},
    // סוכות
    '2028-10-12': {type:'ערב חג', name:'ערב סוכות'},
    '2028-10-13': {type:'חג',     name:'סוכות א׳'},
    '2028-10-14': {type:'חג',     name:'סוכות ב׳'},
    '2028-10-15': {type:'חג',     name:'חוה״מ סוכות'},
    '2028-10-16': {type:'חג',     name:'חוה״מ סוכות'},
    '2028-10-17': {type:'חג',     name:'חוה״מ סוכות'},
    '2028-10-18': {type:'חג',     name:'חוה״מ סוכות'},
    '2028-10-19': {type:'ערב חג', name:'הושענא רבה'},
    '2028-10-20': {type:'חג',     name:'שמחת תורה'},
    // חנוכה
    '2028-12-08': {type:'חג',     name:'חנוכה א׳'},
    '2028-12-09': {type:'חג',     name:'חנוכה ב׳'},
    '2028-12-10': {type:'חג',     name:'חנוכה ג׳'},
    '2028-12-11': {type:'חג',     name:'חנוכה ד׳'},
    '2028-12-12': {type:'חג',     name:'חנוכה ה׳'},
    '2028-12-13': {type:'חג',     name:'חנוכה ו׳'},
    '2028-12-14': {type:'חג',     name:'חנוכה ז׳'},
    '2028-12-15': {type:'חג',     name:'חנוכה ח׳'},
  };
  const h2029 = {
    // פורים
    '2029-03-11': {type:'ערב חג', name:'תענית אסתר'},
    '2029-03-12': {type:'חג',     name:'פורים'},
    // פסח
    '2029-03-28': {type:'ערב חג', name:'ערב פסח'},
    '2029-03-29': {type:'חג',     name:'פסח א׳'},
    '2029-03-30': {type:'חג',     name:'פסח ב׳'},
    '2029-03-31': {type:'חג',     name:'חוה״מ פסח'},
    '2029-04-01': {type:'חג',     name:'חוה״מ פסח'},
    '2029-04-02': {type:'חג',     name:'חוה״מ פסח'},
    '2029-04-03': {type:'חג',     name:'חוה״מ פסח'},
    '2029-04-04': {type:'ערב חג', name:'ערב שביעי של פסח'},
    '2029-04-05': {type:'חג',     name:'שביעי של פסח'},
    // יום העצמאות
    '2029-04-25': {type:'ערב חג', name:'יום הזיכרון'},
    '2029-04-26': {type:'חג',     name:'יום העצמאות'},
    // שבועות
    '2029-05-17': {type:'ערב חג', name:'ערב שבועות'},
    '2029-05-18': {type:'חג',     name:'שבועות א׳'},
    '2029-05-19': {type:'חג',     name:'שבועות ב׳'},
    // תשעה באב
    '2029-07-19': {type:'ערב חג', name:'ערב תשעה באב'},
    '2029-07-20': {type:'חג',     name:'תשעה באב'},
    // ראש השנה
    '2029-09-17': {type:'ערב חג', name:'ערב ראש השנה'},
    '2029-09-18': {type:'חג',     name:'ראש השנה א׳'},
    '2029-09-19': {type:'חג',     name:'ראש השנה ב׳'},
    // יום כיפור
    '2029-09-26': {type:'ערב חג', name:'ערב יום כיפור'},
    '2029-09-27': {type:'חג',     name:'יום כיפור'},
    // סוכות
    '2029-10-01': {type:'ערב חג', name:'ערב סוכות'},
    '2029-10-02': {type:'חג',     name:'סוכות א׳'},
    '2029-10-03': {type:'חג',     name:'סוכות ב׳'},
    '2029-10-04': {type:'חג',     name:'חוה״מ סוכות'},
    '2029-10-05': {type:'חג',     name:'חוה״מ סוכות'},
    '2029-10-06': {type:'חג',     name:'חוה״מ סוכות'},
    '2029-10-07': {type:'חג',     name:'חוה״מ סוכות'},
    '2029-10-08': {type:'ערב חג', name:'הושענא רבה'},
    '2029-10-09': {type:'חג',     name:'שמחת תורה'},
    // חנוכה
    '2029-11-28': {type:'חג',     name:'חנוכה א׳'},
    '2029-11-29': {type:'חג',     name:'חנוכה ב׳'},
    '2029-11-30': {type:'חג',     name:'חנוכה ג׳'},
    '2029-12-01': {type:'חג',     name:'חנוכה ד׳'},
    '2029-12-02': {type:'חג',     name:'חנוכה ה׳'},
    '2029-12-03': {type:'חג',     name:'חנוכה ו׳'},
    '2029-12-04': {type:'חג',     name:'חנוכה ז׳'},
    '2029-12-05': {type:'חג',     name:'חנוכה ח׳'},
  };
  return Object.assign({}, h2026, h2027, h2028, h2029);
}

// Update initMonthSchedule to use all-years holiday map
function initMonthScheduleEx(year, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monthStr = String(year) + String(month).padStart(2,'0');
  const sheetName = 'Schedule_' + monthStr;
  const existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const sheet = ss.insertSheet(sheetName);
  sheet.setRightToLeft(true);

  const headers = ['תאריך','יום','סוג יום','מבצע','עתודה א','עתודה ב','הערות','סוג תורנות','ניקוד','מבצע שני','עתודה א שנייה','עתודה ב שנייה'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]);

  const HEB_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const holidays = getIsraeliHolidays();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dutyScores = {
    'חול':10,'חמישי':12,'חמישי 24 שעות':16,'חול 24 שעות':15,
    'סוף שבוע':20,'ערב חג':25,'חג':25
  };

  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month-1, d);
    const dow = date.getDay();
    const dateStr = Utilities.formatDate(date, 'Asia/Jerusalem', 'yyyy-MM-dd');
    const holiday = holidays[dateStr];
    let dayType = holiday ? holiday.type : (dow===5||dow===6) ? 'סוף שבוע' : dow===4 ? 'חמישי' : 'חול';
    const notes = holiday ? holiday.name : '';
    rows.push([
      Utilities.formatDate(date,'Asia/Jerusalem','dd/MM/yyyy'),
      HEB_DAYS[dow], dayType, '', '', '', notes, dayType, dutyScores[dayType]||10,
      '', '', ''
    ]);
  }
  sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  const monthNames = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return 'לוח ' + monthNames[month] + ' ' + year + ' מוכן!';
}

// ===== Reset schedule =====
function actionResetSchedule(req) {
  try {
    const month = String(req.month || '').trim();
    const year = parseInt(req.year || month.substring(0,4));
    const mon  = parseInt(req.mon  || month.substring(4,6));
    if (!year || !mon) return {success:false, error:'חסר חודש'};
    // Clear sheet cache so next read gets fresh data
    _sheetCache = {};
    const msg = initMonthScheduleEx(year, mon);
    
    // Also clear this month's scores from Scores sheet
    var monColType  = 4 + (mon-1)*2 + 1; // col index (1-based): E=5 for jan
    var monColScore = monColType + 1;
    var scoreSheet  = getSheet(SH.SCORES);
    var lastScoreRow = scoreSheet.getLastRow();
    if (lastScoreRow > 1) {
      scoreSheet.getRange(2, monColType,  lastScoreRow-1, 1).clearContent();
      scoreSheet.getRange(2, monColScore, lastScoreRow-1, 1).clearContent();
      Logger.log('Cleared scores for month ' + mon + ' (cols ' + monColType + '-' + monColScore + ')');
    }
    
    return {success:true, message: (msg || 'הלוח אופס בהצלחה') + ' + ניקוד החודש נוקה'};
  } catch(e) {
    Logger.log('resetSchedule error: ' + e.toString());
    return {success:false, error: e.toString()};
  }
}

// Update actionInitMonth to use extended version
function actionInitMonthEx(req) {
  const year = parseInt(req.year);
  const month = parseInt(req.month);
  if (!year || !month) return {success:false, error:'חסרים פרמטרים'};
  try {
    const msg = initMonthScheduleEx(year, month);
    return {success:true, message: msg};
  } catch(e) {
    return {success:false, error: e.toString()};
  }
}

// ===== צור לוחות ינואר-מאי 2026 (חודשים היסטוריים) =====
function initJanToMay2026() {
  for (let m = 1; m <= 5; m++) {
    initMonthScheduleEx(2026, m);
    Logger.log('Created Schedule_2026' + String(m).padStart(2,'0'));
  }
  Logger.log('✅ נוצרו לוחות ינואר עד מאי 2026');
}

// ===== בדיקת ואיפוס סיסמאות =====
function debugCheckPasswords() {
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  Logger.log('=== רשימת משתמשים ===');
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][2]) continue;
    Logger.log(`שם: ${rows[i][1]} | יוזר: ${rows[i][2]} | האש: ${String(rows[i][3]).substring(0,10)}... | פעיל: ${rows[i][5]}`);
  }
  Logger.log('סה"כ: ' + (rows.length-1) + ' משתמשים');
}

function resetAllPasswords() {
  // מאפס את כולם ל-Tornut2026 חוץ מ-admin
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  const defaultHash = hashPass('Tornut2026');
  const adminHash = hashPass('admin123');
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][2]) continue;
    if (rows[i][2] === 'admin') {
      sheet.getRange(i+1, 4).setValue(adminHash);
    } else {
      sheet.getRange(i+1, 4).setValue(defaultHash);
    }
    count++;
  }
  Logger.log('✅ אופסו סיסמאות ל-' + count + ' משתמשים');
  return 'אופסו ' + count + ' סיסמאות';
}

function fixActiveFlag() {
  // וודא שכולם מסומנים כפעילים
  const sheet = getSheet(SH.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2]) sheet.getRange(i+1, 6).setValue(true);
  }
  Logger.log('✅ כל המשתמשים מסומנים כפעילים');
}

// ===== נעילת/פתיחת לוח אילוצים =====
// נשמר בגיליון Settings בפורמט: month -> locked/open
function getSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Settings');
  if (!sh) {
    sh = ss.insertSheet('Settings');
    sh.setRightToLeft(true);
    sh.getRange(1,1,1,3).setValues([['חודש','סטטוס','עודכן']]);
  }
  return sh;
}

function actionGetLockStatus(req) {
  if (!req) return {success: false, error: 'חסר req'};
  const month = String(req.month || '');
  const sh = getSettingsSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === month) {
      return {success: true, locked: rows[i][1] !== 'open', month};
    }
  }
  // Default: locked
  return {success: true, locked: true, month};
}

function actionSetLockStatus(req) {
  if (!req) return {success: false, error: 'חסר req'};
  // Auth is handled by router (admin-only section)
  const month = String(req.month || '');
  const locked = req.locked !== 'false' && req.locked !== false;
  const sh = getSettingsSheet();
  const rows = sh.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === month) {
      sh.getRange(i+1, 2).setValue(locked ? 'locked' : 'open');
      sh.getRange(i+1, 3).setValue(new Date().toISOString());
      return {success: true, locked, month};
    }
  }
  // New row
  sh.appendRow([month, locked ? 'locked' : 'open', new Date().toISOString()]);
  return {success: true, locked, month};
}

// ===== EMAIL: REMINDER =====
function actionSendReminder(req) {
  const month = String(req.month || '');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Constraints_' + month);
  
  // Get all people with emails
  const people = actionGetPeople().people;
  const submitted = {};
  
  if (sheet) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) {
        const hasAny = rows[i].slice(1, 32).some(c => c === 'V' || c === 'X');
        if (hasAny) submitted[rows[i][0]] = true;
      }
    }
  }
  
  const monthNames = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const mon = parseInt(month.substring(4,6));
  const year = month.substring(0,4);
  const monthName = monthNames[mon] + ' ' + year;
  
  let sent = 0;
  people.filter(p => p.activity !== '0' && p.dutyCategory !== 'פטור' && p.email && !submitted[p.name])
    .forEach(p => {
      try {
        MailApp.sendEmail({
          to: p.email,
          subject: `תזכורת: הגשת אילוצים ל${monthName}`,
          htmlBody: `<div dir="rtl" style="font-family:Arial;padding:20px">
            <h3>שלום ${p.name},</h3>
            <p>טרם הגשת אילוצים לחודש <strong>${monthName}</strong>.</p>
            <p>נא להיכנס למערכת התורנויות ולסמן את הימים הרלוונטיים עד מועד הסגירה.</p>
            <a href="https://matlam.netlify.app" style="background:#2ea043;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px">כניסה למערכת</a>
          </div>`
        });
        sent++;
      } catch(e) { Logger.log('Error sending to ' + p.email + ': ' + e); }
    });
  
  return {success: true, sent};
}

// ===== EMAIL: MONTHLY SCHEDULE =====
function actionSendScheduleEmails(req) {
  const month = String(req.month || '');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schedSheet = ss.getSheetByName('Schedule_' + month);
  if (!schedSheet) return {success: false, error: 'אין לוח לחודש זה'};
  
  const rows = schedSheet.getDataRange().getValues();
  const HEB_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const monthNames = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const mon = parseInt(month.substring(4,6));
  const year = month.substring(0,4);
  const monthName = monthNames[mon] + ' ' + year;
  
  // Build schedule map per person
  const personSchedule = {};
  for (let i = 1; i < rows.length; i++) {
    const [date, day, dayType, v, a, b, notes, dutyType, score] = rows[i];
    [[v,'מבצע'],[a,'עתודה א׳'],[b,'עתודה ב׳']].forEach(([name, role]) => {
      if (!name) return;
      if (!personSchedule[name]) personSchedule[name] = [];
      personSchedule[name].push({date, day, dutyType, role, score});
    });
  }
  
  const people = actionGetPeople().people;
  let sent = 0;
  
  people.filter(p => p.email && personSchedule[p.name]).forEach(p => {
    const duties = personSchedule[p.name];
    const rows_html = duties.map(d => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${d.date}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${d.day}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${d.dutyType}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:${d.role==='מבצע'?'#1a7f37':'#0969da'}">${d.role}</td>
      </tr>`).join('');
    
    try {
      MailApp.sendEmail({
        to: p.email,
        subject: `לוח תורנויות — ${monthName}`,
        htmlBody: `<div dir="rtl" style="font-family:Arial;padding:20px;max-width:600px">
          <h3>שלום ${p.name},</h3>
          <p>להלן התורנויות שלך לחודש <strong>${monthName}</strong>:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <thead><tr style="background:#f0f0f0">
              <th style="padding:8px;text-align:right">תאריך</th>
              <th style="padding:8px;text-align:right">יום</th>
              <th style="padding:8px;text-align:right">סוג</th>
              <th style="padding:8px;text-align:right">תפקיד</th>
            </tr></thead>
            <tbody>${rows_html}</tbody>
          </table>
          <a href="https://matlam.netlify.app" style="background:#2ea043;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">כניסה למערכת</a>
        </div>`
      });
      sent++;
    } catch(e) { Logger.log('Error: ' + e); }
  });
  
  return {success: true, sent};
}

// ===== SWAP REQUESTS =====

function getSwapsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('SwapRequests');
  if (!sh) {
    sh = ss.insertSheet('SwapRequests');
    sh.setRightToLeft(true);
    sh.getRange(1,1,1,10).setValues([['ID','חודש','תאריך שלי','מבקש','עם מי','תאריך שלהם','הערה','סטטוס','נוצר','']]);
  }
  return sh;
}

function actionSubmitSwap(req, user) {
  const {month, date, theirDate, withWho, note, fromName, myCol, theirCol} = req;
  if (!date || !withWho || !theirDate) return {success:false, error:'חסרים פרטים'};
  const id = Utilities.getUuid().substring(0,8);
  // Store: col info for exact cell replacement (4=V, 5=A, 6=B)
  var fName = String(fromName || user.name || '').trim();
  var wWho  = String(withWho || '').trim();
  var myD   = String(date || '').trim();
  var thD   = String(theirDate || date || '').trim();
  getSwapsSheet().appendRow([
    id,
    String(month      || '').trim(),
    myD, fName, wWho, thD,
    String(note       || '').trim(),
    'pending_target',
    new Date().toISOString(),
    JSON.stringify({myCol: parseInt(myCol)||4, theirCol: parseInt(theirCol)||4})
  ]);
  // Notify target person by email
  notifySwapTarget(wWho, fName, myD, thD, String(note||'').trim());
  return {success:true, id};
}

function actionGetSwaps(req, user) {
  const rows = getSwapsSheet().getDataRange().getValues();
  const swaps = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] || !String(rows[i][0]).trim()) continue;
    swaps.push({
      id:        String(rows[i][0]).trim(),
      month:     String(rows[i][1] || '').trim(),
      date:      String(rows[i][2] || '').trim(),
      fromName:  String(rows[i][3] || '').trim(),
      withWho:   String(rows[i][4] || '').trim(),
      theirDate: String(rows[i][5] || '').trim(),
      note:      String(rows[i][6] || '').trim(),
      status:    String(rows[i][7] || 'pending_target').trim()
    });
  }
  return {success:true, swaps};
}

function actionUpdateSwap(req) {
  const {id, status} = req;
  const sheet = getSwapsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== String(id).trim()) continue;
    var TZ2 = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    function normDateVal(v) {
      if (!v) return '';
      if (v instanceof Date) return Utilities.formatDate(v, TZ2, 'dd/MM/yyyy');
      var s = String(v).trim();
      // yyyy-MM-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { var p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
      return s;
    }
    // Month: could be number or string like "202605" or Date
    var month = rows[i][1] instanceof Date ?
      Utilities.formatDate(rows[i][1], TZ2, 'yyyyMM') :
      String(rows[i][1]).trim();
    const date      = normDateVal(rows[i][2]);
    const fromName  = String(rows[i][3]).trim();
    const withWho   = String(rows[i][4]).trim();
    const theirDate = normDateVal(rows[i][5]);
    const curStatus = String(rows[i][7]).trim();
    
    Logger.log('updateSwap: id='+id+' month='+month+' date='+date+' theirDate='+theirDate+
               ' from='+fromName+' to='+withWho+' status='+curStatus+'->'+status);

    // Target approved → pending_admin
    if (status === 'target_approved' && curStatus === 'pending_target') {
      sheet.getRange(i+1,8).setValue('pending_admin');
      var fName2 = String(rows[i][3]).trim();
      var wWho2  = String(rows[i][4]).trim();
      var myD2   = String(rows[i][2]).trim();
      var thD2   = String(rows[i][5]).trim();
      // Notify admin
      notifyAdminSwapPending(fName2, wWho2, myD2, thD2);
      // Notify fromName that target approved
      var tz2 = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      function normD(v) { return v instanceof Date ? Utilities.formatDate(v,tz2,'dd/MM/yyyy') : String(v||'').trim(); }
      addSwapNotification(fName2, '✅ ' + wWho2 + ' אישר את בקשת ההחלפה שלך (' + normD(myD2) + ' ⇄ ' + normD(thD2) + '). ממתין לאישור מנהל.');
      return {success:true, message:'עבר למנהל לאישור'};
    }
    // Target rejected
    if (status === 'target_rejected') {
      sheet.getRange(i+1,8).setValue('rejected');
      var fName3 = String(rows[i][3]).trim();
      var wWho3  = String(rows[i][4]).trim();
      var myD3   = String(rows[i][2]).trim();
      // Notify fromName that target rejected
      var tz3 = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      function normD3(v) { return v instanceof Date ? Utilities.formatDate(v,tz3,'dd/MM/yyyy') : String(v||'').trim(); }
      addSwapNotification(fName3, '❌ ' + wWho3 + ' דחה את בקשת ההחלפה שלך (' + normD3(myD3) + ').');
      return {success:true};
    }
    // Admin approved → execute swap
    if (status === 'approved') {
      sheet.getRange(i+1,8).setValue('approved');
      var colInfo = {};
      try { colInfo = JSON.parse(String(rows[i][9]||'{}')); } catch(e) {}
      var result = executeSwap(month, date, fromName, withWho, theirDate || date, colInfo.myCol||0, colInfo.theirCol||0);
      if (!result.success) {
        sheet.getRange(i+1,10).setValue('שגיאה: ' + result.error);
        return {success:true, warning: result.error};
      }
      return {success:true, message:'ההחלפה בוצעה בלוח'};
    }
    // Admin rejected
    if (status === 'rejected') {
      sheet.getRange(i+1,8).setValue('rejected');
      // Notify both parties
      var tz5 = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      function normD5(v) { return v instanceof Date ? Utilities.formatDate(v,tz5,'dd/MM/yyyy') : String(v||'').trim(); }
      addSwapNotification(fromName, '❌ המנהל דחה את בקשת ההחלפה (' + normD5(date) + ' ⇄ ' + normD5(theirDate||date) + ').');
      addSwapNotification(withWho, '❌ בקשת ההחלפה עם ' + fromName + ' נדחתה על ידי המנהל.');
      return {success:true};
    }
    // Fallback
    sheet.getRange(i+1,8).setValue(status);
    return {success:true};
  }
  return {success:false, error:'בקשה לא נמצאה'};
}

function actionDeleteSwap(req) {
  const {id} = req;
  const sheet = getSwapsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i+1);
      return {success:true};
    }
  }
  return {success:false, error:'לא נמצא'};
}

function actionReApplySwap(req) {
  const {id} = req;
  const sheet = getSwapsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== String(id).trim()) continue;
    var colInfo2 = {};
    try { colInfo2 = JSON.parse(String(rows[i][9]||'{}')); } catch(e) {}
    var result = executeSwap(
      String(rows[i][1]).trim(),
      String(rows[i][2]).trim(),
      String(rows[i][3]).trim(),
      String(rows[i][4]).trim(),
      String(rows[i][5] || rows[i][2]).trim(),
      colInfo2.myCol||0, colInfo2.theirCol||0
    );
    if (result.success) sheet.getRange(i+1,8).setValue('approved');
    return result;
  }
  return {success:false, error:'לא נמצא'};
}

// ─── CORE EXECUTE SWAP ────────────────────────────────────
function executeSwap(month, myDate, fromName, withWho, theirDate, myCol, theirCol) {
  // myCol/theirCol: 4=V, 5=A, 6=B - which slot each person holds
  myCol    = parseInt(myCol)    || 0; // 0 = auto-detect
  theirCol = parseInt(theirCol) || 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var monthStr = String(month).trim();
  var sheet = ss.getSheetByName('Schedule_' + monthStr);
  if (!sheet) return {success:false, error:'לא נמצא לוח לחודש ' + monthStr};

  var TZ = ss.getSpreadsheetTimeZone();
  var data = sheet.getDataRange().getValues();

  function norm(val) {
    if (!val) return '';
    if (Object.prototype.toString.call(val) === '[object Date]')
      return Utilities.formatDate(val, TZ, 'dd/MM/yyyy');
    var s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { var p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
    return s;
  }

  var myDateN    = norm(myDate);
  var theirDateN = norm(theirDate || myDate);
  var fromTrim   = String(fromName).trim();
  var withTrim   = String(withWho).trim();

  Logger.log('executeSwap: my='+myDateN+'(col'+myCol+') their='+theirDateN+'(col'+theirCol+') '+fromTrim+' <-> '+withTrim);

  var myRowIdx=-1, theirRowIdx=-1;
  for (var i=1; i<data.length; i++) {
    var rd = norm(data[i][0]);
    if (rd === myDateN)    myRowIdx    = i;
    if (rd === theirDateN) theirRowIdx = i;
  }

  Logger.log('myRow='+myRowIdx+' theirRow='+theirRowIdx);
  if (myRowIdx<0)    return {success:false, error:'לא נמצא תאריך ' + myDateN + ' בלוח ' + monthStr};
  if (theirRowIdx<0) return {success:false, error:'לא נמצא תאריך ' + theirDateN + ' בלוח ' + monthStr};

  // --- Replace fromName with withWho on myRow ---
  var myV=String(data[myRowIdx][3]||'').trim();
  var myA=String(data[myRowIdx][4]||'').trim();
  var myB=String(data[myRowIdx][5]||'').trim();
  var myScore=Number(data[myRowIdx][8])||0;
  var myType=String(data[myRowIdx][7]||data[myRowIdx][2]||'');

  var newMyV=myV, newMyA=myA, newMyB=myB;
  if (myCol===4 && myV===fromTrim) newMyV=withTrim;
  else if (myCol===5 && myA===fromTrim) newMyA=withTrim;
  else if (myCol===6 && myB===fromTrim) newMyB=withTrim;
  else {
    // Auto-detect
    if (myV===fromTrim) newMyV=withTrim;
    else if (myA===fromTrim) newMyA=withTrim;
    else if (myB===fromTrim) newMyB=withTrim;
    else return {success:false, error:fromTrim+' לא נמצא ב-'+myDateN+' (V:'+myV+' A:'+myA+' B:'+myB+')'};
  }
  sheet.getRange(myRowIdx+1,4).setValue(newMyV);
  sheet.getRange(myRowIdx+1,5).setValue(newMyA);
  sheet.getRange(myRowIdx+1,6).setValue(newMyB);
  Logger.log('myRow: V:'+myV+'->'+newMyV+' A:'+myA+'->'+newMyA+' B:'+myB+'->'+newMyB);

  var changedMyV = (myV!==newMyV);
  if (changedMyV && myScore>0) updateScoreForSwap(myV, newMyV, monthStr, myScore, myType);

  // --- Replace withWho with fromName on theirRow (if different date) ---
  if (myRowIdx !== theirRowIdx) {
    var thV=String(data[theirRowIdx][3]||'').trim();
    var thA=String(data[theirRowIdx][4]||'').trim();
    var thB=String(data[theirRowIdx][5]||'').trim();
    var thScore=Number(data[theirRowIdx][8])||0;
    var thType=String(data[theirRowIdx][7]||data[theirRowIdx][2]||'');

    var newThV=thV, newThA=thA, newThB=thB;
    if (theirCol===4 && thV===withTrim) newThV=fromTrim;
    else if (theirCol===5 && thA===withTrim) newThA=fromTrim;
    else if (theirCol===6 && thB===withTrim) newThB=fromTrim;
    else {
      // Auto-detect
      if (thV===withTrim) newThV=fromTrim;
      else if (thA===withTrim) newThA=fromTrim;
      else if (thB===withTrim) newThB=fromTrim;
      else return {success:false, error:withTrim+' לא נמצא ב-'+theirDateN+' (V:'+thV+' A:'+thA+' B:'+thB+')'};
    }
    sheet.getRange(theirRowIdx+1,4).setValue(newThV);
    sheet.getRange(theirRowIdx+1,5).setValue(newThA);
    sheet.getRange(theirRowIdx+1,6).setValue(newThB);
    Logger.log('theirRow: V:'+thV+'->'+newThV+' A:'+thA+'->'+newThA+' B:'+thB+'->'+newThB);

    var changedThV = (thV!==newThV);
    if (changedThV && thScore>0) updateScoreForSwap(thV, newThV, monthStr, thScore, thType);
  }

  return {success:true, message:'ההחלפה בוצעה: '+fromTrim+' ⇄ '+withTrim};
}



// ===== צור את כל לוחות השנה 2026-2029 מראש =====
function initAllSchedules() {
  var years = [2026, 2027, 2028, 2029];
  var created = 0;
  
  years.forEach(function(year) {
    for (var month = 1; month <= 12; month++) {
      try {
        initMonthScheduleEx(year, month);
        created++;
        Logger.log('Created Schedule_' + year + String(month).padStart(2,'0'));
      } catch(e) {
        Logger.log('Error creating ' + year + '/' + month + ': ' + e);
      }
    }
  });
  
  Logger.log('✅ נוצרו ' + created + ' לוחות שנה (2026-2029) עם חגים מובנים!');
  return 'נוצרו ' + created + ' לוחות שנה!';
}

// ===== צור לוחות שנה לשנה ספציפית =====
function initYear2026() {
  for (var m=1; m<=12; m++) initMonthScheduleEx(2026, m);
  Logger.log('✅ כל לוחות 2026 נוצרו');
}
function initYear2027() {
  for (var m=1; m<=12; m++) initMonthScheduleEx(2027, m);
  Logger.log('✅ כל לוחות 2027 נוצרו');
}
function initYear2028() {
  for (var m=1; m<=12; m++) initMonthScheduleEx(2028, m);
  Logger.log('✅ כל לוחות 2028 נוצרו');
}
function initYear2029() {
  for (var m=1; m<=12; m++) initMonthScheduleEx(2029, m);
  Logger.log('✅ כל לוחות 2029 נוצרו');
}

// ===== עדכון ניקוד =====
function updateScoreForSwap(oldV, newV, month, score, dutyType) {
  if (!oldV || !newV || score <= 0) return;
  oldV = String(oldV).trim();
  newV = String(newV).trim();
  if (oldV === newV) return; // same person, no change

  var scoreSheet = getSheet(SH.SCORES);
  var rows = scoreSheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (name === oldV) {
      var cur = Number(rows[i][3]) || 0;
      scoreSheet.getRange(i+1, 4).setValue(Math.max(0, cur - score));
      Logger.log('Score -' + score + ' from ' + oldV + ' (was ' + cur + ')');
    }
    if (name === newV) {
      var cur2 = Number(rows[i][3]) || 0;
      scoreSheet.getRange(i+1, 4).setValue(cur2 + score);
      Logger.log('Score +' + score + ' to ' + newV + ' (was ' + cur2 + ')');
    }
  }
}

// ===== תיקון ניקוד תורן שני =====
function actionFixV2Score(req) {
  var {personName, month, score, dutyType} = req;
  if (!personName || !score) return {success:false, error:'חסרים פרמטרים'};
  
  var numScore = Number(score);
  if (!numScore && dutyType) {
    numScore = getDutyTypesMap()[dutyType] || 10;
  }
  
  var scoreSheet = getSheet(SH.SCORES);
  var rows = scoreSheet.getDataRange().getValues();
  
  for (var i=1; i<rows.length; i++) {
    if (String(rows[i][0]||'').trim() === String(personName).trim()) {
      var cur = Number(rows[i][3])||0;
      var newVal = cur + numScore;
      scoreSheet.getRange(i+1, 4).setValue(newVal);
      Logger.log('fixV2Score: '+personName+' '+cur+' -> '+newVal);
      return {success:true, message: personName+' קיבל +'+numScore+' ניקוד (היה: '+cur+', עכשיו: '+newVal+')'};
    }
  }
  return {success:false, error: 'לא נמצא: '+personName};
}

// ===== סנכרון ניקוד - מחשב מחדש מכל הלוחות ומעדכן גיליון Scores =====
function syncAllScores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoreSheet = getSheet(SH.SCORES);
  var scoreRows = scoreSheet.getDataRange().getValues();
  var monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var dutyScores = getDutyTypesMap();
  
  // Build per-person monthly scores from all schedule sheets
  var personScores = {}; // name -> {jan:0, feb:0, ...}
  
  ss.getSheets().forEach(function(sh) {
    if (!/^Schedule_\d{6}$/.test(sh.getName())) return;
    var mon = parseInt(sh.getName().substring(10,12)) - 1; // 0=jan
    var mKey = monthNames[mon];
    if (!mKey) return;
    
    var rows = sh.getLastRow() > 1 ? sh.getRange(1,1,sh.getLastRow(),12).getValues() : [];
    for (var i=1; i<rows.length; i++) {
      var v   = String(rows[i][3]||'').trim();
      var v2  = String(rows[i][9]||'').trim();
      var sc  = Number(rows[i][8])||0;
      
      if (v && sc>0) {
        if (!personScores[v]) personScores[v] = {};
        personScores[v][mKey] = (personScores[v][mKey]||0) + sc;
      }
      if (v2 && sc>0) {
        if (!personScores[v2]) personScores[v2] = {};
        personScores[v2][mKey] = (personScores[v2][mKey]||0) + sc;
      }
    }
  });
  
  // Update Scores sheet
  // Col layout: A=שם, B=פעילות, C=acc2025, D=acc2026(sum of months), E=ינואר סוג, F=ינואר ניקוד, G=פברואר סוג...
  var updated = 0;
  for (var i=1; i<scoreRows.length; i++) {
    var name = String(scoreRows[i][0]||'').trim();
    if (!name) continue;
    // Skip admin
    var pData = getSheet(SH.PEOPLE).getDataRange().getValues();
    var isAdmin = false;
    for (var pi=1;pi<pData.length;pi++) {
      if (String(pData[pi][0]||'').trim()===name && String(pData[pi][2]||'').trim()==='מנהל מערכת') {isAdmin=true;break;}
    }
    if (isAdmin) continue;
    var ps = personScores[name] || {};
    var acc2025 = Number(scoreRows[i][2])||0;
    var total2026 = 0;
    monthNames.forEach(function(mKey, idx) {
      var sc = ps[mKey]||0;
      total2026 += sc;
      var scoreCol = 4 + idx*2 + 2; // col F=6 (jan), H=8 (feb)...
      scoreSheet.getRange(i+1, scoreCol).setValue(sc>0 ? sc : '');
    });
    // acc2026 column = total cumulative (2025 + all 2026 months)
    scoreSheet.getRange(i+1, 4).setValue(acc2025 + total2026);
    updated++;
  }
  
  Logger.log('✅ syncAllScores: עודכנו '+updated+' תורנים');
  SpreadsheetApp.getUi().alert('✅ הניקוד עודכן עבור '+updated+' תורנים');
}

// ===== מערכת אימיילים =====

// כתובת מייל של מנהל
var ADMIN_EMAIL = 'itai.rose@outlook.com';

// קבל מייל של תורן לפי שם
function getEmailByName(name) {
  var rows = getSheet(SH.PEOPLE).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]||'').trim() === String(name).trim()) {
      return String(rows[i][5]||'').trim(); // עמודה F = מייל
    }
  }
  return '';
}

// קבל מייל של כל התורנים הפעילים
function getAllActiveEmails() {
  var rows = getSheet(SH.PEOPLE).getDataRange().getValues();
  var emails = [];
  for (var i = 1; i < rows.length; i++) {
    var email = String(rows[i][5]||'').trim();
    var activity = String(rows[i][1]||'1').trim();
    if (email && activity !== '0') emails.push(email);
  }
  return emails;
}

// 1. שלח לוח תורנויות לכולם
function actionSendSchedule(req) {
  var {month, extraMessage} = req;
  var monthStr = String(month||'').trim();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedule_' + monthStr);
  if (!sheet) return {success:false, error:'לא נמצא לוח לחודש ' + monthStr};
  
  var TZ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(1,1,sheet.getLastRow(),12).getValues() : [];
  
  // Build schedule HTML table
  var year = monthStr.substring(0,4);
  var mon  = parseInt(monthStr.substring(4,6));
  var MONTH_NAMES = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  var title = MONTH_NAMES[mon] + ' ' + year;
  
  var tableRows = '';
  for (var i = 1; i < rows.length; i++) {
    var dateCell = rows[i][0];
    var dateStr = dateCell instanceof Date ? Utilities.formatDate(dateCell, TZ, 'dd/MM') : String(dateCell||'');
    var day = String(rows[i][1]||'');
    var dayType = String(rows[i][2]||'');
    var v = String(rows[i][3]||'');
    var a = String(rows[i][4]||'');
    var b = String(rows[i][5]||'');
    var v2 = String(rows[i][9]||'');
    if (!v && !a && !b) continue;
    
    var bgColor = dayType.includes('חג')||dayType.includes('ערב חג') ? '#fff3cd' :
                  dayType === 'סוף שבוע'||dayType === 'סוף שבוע מלא' ? '#f0f0ff' :
                  dayType === 'חמישי'||dayType.includes('חמישי') ? '#fff8e6' : '#ffffff';
    
    tableRows += '<tr style="background:' + bgColor + '">' +
      '<td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold">' + dateStr + ' ' + day + '</td>' +
      '<td style="padding:6px 10px;border:1px solid #ddd;color:#666;font-size:12px">' + dayType + '</td>' +
      '<td style="padding:6px 10px;border:1px solid #ddd;font-weight:600">' + v + '</td>' +
      '<td style="padding:6px 10px;border:1px solid #ddd;color:#555">' + a + '</td>' +
      '<td style="padding:6px 10px;border:1px solid #ddd;color:#555">' + b + '</td>' +
      (v2 ? '<td style="padding:6px 10px;border:1px solid #ddd;color:#888;font-size:11px">+' + v2 + '</td>' : '<td></td>') +
      '</tr>';
  }
  
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">' +
    '<h2 style="color:#2d4a3e">📅 לוח תורנויות — ' + title + '</h2>' +
    (extraMessage ? '<div style="background:#e8f5e9;border-right:4px solid #4caf50;padding:12px 16px;margin-bottom:16px;border-radius:4px">' + extraMessage + '</div>' : '') +
    '<table style="width:100%;border-collapse:collapse;direction:rtl">' +
    '<thead><tr style="background:#2d4a3e;color:white">' +
    '<th style="padding:8px 10px;border:1px solid #ddd">תאריך</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd">סוג</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd">מבצע</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd">עתודה א׳</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd">עתודה ב׳</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd">תורנות שנייה</th>' +
    '</tr></thead><tbody>' + tableRows + '</tbody></table>' +
    '<p style="color:#999;font-size:11px;margin-top:16px">מפקד תורן מטל"מ</p></div>';
  
  var emails = getAllActiveEmails();
  var sent = 0;
  emails.forEach(function(email) {
    try {
      MailApp.sendEmail({
        to: email,
        subject: '📅 לוח תורנויות ' + title,
        htmlBody: html
      });
      sent++;
    } catch(e) { Logger.log('Failed to send to ' + email + ': ' + e); }
  });
  
  return {success:true, message:'נשלח ל-' + sent + ' תורנים מתוך ' + emails.length};
}

// 2. שלח הודעה חשובה (מנהל)
function actionSendAdminMessage(req) {
  var {subject, message, recipients} = req;
  if (!message || !subject) return {success:false, error:'חסרים פרטים'};
  
  var emails = recipients === 'all' ? getAllActiveEmails() : [recipients];
  
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<h2 style="color:#2d4a3e">📣 ' + subject + '</h2>' +
    '<div style="background:#f9f9f9;border-right:4px solid #2d4a3e;padding:16px;border-radius:4px;line-height:1.6">' + 
    message.replace(/\n/g,'<br>') + '</div>' +
    '<p style="color:#999;font-size:11px;margin-top:16px">מפקד תורן מטל"מ</p></div>';
  
  var sent = 0;
  emails.forEach(function(email) {
    try {
      MailApp.sendEmail({to: email, subject: '📣 ' + subject, htmlBody: html});
      sent++;
    } catch(e) { Logger.log('Failed: ' + e); }
  });
  
  return {success:true, message:'נשלח ל-' + sent + ' נמענים'};
}

// 3. שלח מייל לתורן שמבקשים להחליף איתו
function notifySwapTarget(withWho, fromName, date, theirDate, note) {
  var email = getEmailByName(withWho);
  if (!email) { Logger.log('No email for ' + withWho); return; }
  
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px">' +
    '<h3 style="color:#2d4a3e">🔄 בקשת החלפת תורנות</h3>' +
    '<p><strong>' + fromName + '</strong> מבקש להחליף איתך תורנות:</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd">📅 תורנות של ' + fromName + ':</td><td style="padding:8px;border:1px solid #ddd">' + date + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd">📅 תורנות שלך:</td><td style="padding:8px;border:1px solid #ddd">' + theirDate + '</td></tr>' +
    (note ? '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd">💬 הסבר:</td><td style="padding:8px;border:1px solid #ddd">' + note + '</td></tr>' : '') +
    '</table>' +
    '<p style="margin-top:16px">היכנס למערכת כדי לאשר או לדחות את הבקשה.</p>' +
    '<p style="color:#999;font-size:11px">מפקד תורן מטל"מ</p></div>';
  
  try {
    MailApp.sendEmail({to: email, subject: '🔄 בקשת החלפה מ-' + fromName, htmlBody: html});
    Logger.log('Swap notification sent to ' + withWho + ' (' + email + ')');
  } catch(e) { Logger.log('Failed to notify swap target: ' + e); }
}

// 4. שלח מייל למנהל כשהחלפה ממתינה לאישורו
function notifyAdminSwapPending(fromName, withWho, date, theirDate) {
  var adminEmail = getAdminEmail();
  if (!adminEmail) return;
  
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px">' +
    '<h3 style="color:#2d4a3e">⏳ בקשת החלפה ממתינה לאישורך</h3>' +
    '<p><strong>' + fromName + '</strong> ו-<strong>' + withWho + '</strong> אישרו ביניהם החלפה:</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd">📅 תורנות ' + fromName + ':</td><td style="padding:8px;border:1px solid #ddd">' + date + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f5f5f5;border:1px solid #ddd">📅 תורנות ' + withWho + ':</td><td style="padding:8px;border:1px solid #ddd">' + theirDate + '</td></tr>' +
    '</table>' +
    '<p style="margin-top:16px">היכנס למערכת לאישור.</p>' +
    '<p style="color:#999;font-size:11px">מפקד תורן מטל"מ</p></div>';
  
  try {
    MailApp.sendEmail({to: adminEmail, subject: '⏳ החלפת תורנות ממתינה לאישורך', htmlBody: html});
  } catch(e) { Logger.log('Failed to notify admin: ' + e); }
}

// קבל מייל מנהל מגיליון Users
function getAdminEmail() {
  // Strategy 1: Get admin name from Users, then email from People sheet
  var usersRows = getSheet(SH.USERS).getDataRange().getValues();
  var adminName = '';
  for (var i = 1; i < usersRows.length; i++) {
    if (String(usersRows[i][4]||'').trim() === 'admin') {
      adminName = String(usersRows[i][1]||'').trim();
      // Also check col 5 (F) directly in Users sheet
      var directEmail = String(usersRows[i][5]||'').trim();
      if (directEmail && directEmail.includes('@')) return directEmail;
      break;
    }
  }
  // Strategy 2: Look up in People sheet by name
  if (adminName) {
    var email = getEmailByName(adminName);
    if (email) return email;
  }
  // Strategy 3: Use the Google account running the script
  try {
    var scriptEmail = Session.getEffectiveUser().getEmail();
    if (scriptEmail) return scriptEmail;
  } catch(e) {}
  return '';
}

// ===== בדיקת מיילים - הרץ פעם אחת כדי לאשר הרשאות =====
function testEmailPermissions() {
  try {
    var myEmail = Session.getActiveUser().getEmail();
    MailApp.sendEmail({
      to: myEmail,
      subject: '✅ מפקד תורן מטל"מ - בדיקת מיילים',
      htmlBody: '<div dir="rtl"><h3>✅ מערכת המיילים פועלת!</h3><p>ההרשאות אושרו בהצלחה.</p></div>'
    });
    Logger.log('Test email sent to: ' + myEmail);
    return 'נשלח מייל בדיקה ל-' + myEmail;
  } catch(e) {
    Logger.log('Error: ' + e.toString());
    return 'שגיאה: ' + e.toString();
  }
}

// ===== DEBUG: בדוק login =====
function debugLogin() {
  var rows = getSheet(SH.USERS).getDataRange().getValues();
  Logger.log('Users sheet rows: ' + (rows.length-1));
  for (var i=1; i<rows.length && i<5; i++) {
    Logger.log('Row '+i+': id='+rows[i][0]+' name='+rows[i][1]+' user='+rows[i][2]+' role='+rows[i][4]+' active='+rows[i][5]);
    Logger.log('  pwd hash length: '+String(rows[i][3]||'').length);
  }
  // Test hash
  var testHash = hashPass('admin123');
  Logger.log('Hash of admin123: '+testHash);
  Logger.log('Hash of Tornut2026: '+hashPass('Tornut2026'));
}

// ===== איפוס סיסמה ידני (מנהל בלבד) =====
function actionResetPassword(req) {
  var {targetUsername, newPassword} = req;
  if (!targetUsername || !newPassword) return {success:false, error:'חסרים פרטים'};
  var sheet = getSheet(SH.USERS);
  var rows = sheet.getDataRange().getValues();
  for (var i=1; i<rows.length; i++) {
    if (String(rows[i][2]||'').toLowerCase() === String(targetUsername).toLowerCase()) {
      var newHash = hashPass(newPassword);
      sheet.getRange(i+1, 4).setValue(newHash);
      Logger.log('Password reset for: ' + targetUsername);
      return {success:true, message:'סיסמה אופסה עבור ' + targetUsername};
    }
  }
  return {success:false, error:'משתמש לא נמצא: ' + targetUsername};
}

// ===== איפוס סיסמת ברירת מחדל לכל התורנים =====
function resetAllTornimPasswords() {
  var sheet = getSheet(SH.USERS);
  var rows = sheet.getDataRange().getValues();
  var defaultPass = 'Aa123456';
  var newHash = hashPass(defaultPass);
  var count = 0;
  
  for (var i = 1; i < rows.length; i++) {
    var role = String(rows[i][4]||'').trim();
    var uname = String(rows[i][2]||'').trim();
    if (role !== 'admin' && uname) { // don't reset admin
      sheet.getRange(i+1, 4).setValue(newHash);
      count++;
      Logger.log('Reset password for: ' + uname);
    }
  }
  Logger.log('Done: reset ' + count + ' passwords to ' + defaultPass);
  return 'אופסו ' + count + ' סיסמאות לסיסמת ברירת מחדל: ' + defaultPass;
}

// ===== התראות החלפה =====
function addSwapNotification(toName, message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Notifications');
    if (!sh) {
      sh = ss.insertSheet('Notifications');
      sh.getRange(1,1,1,4).setValues([['ID','ToName','Message','CreatedAt']]);
    }
    sh.appendRow([
      Utilities.getUuid().substring(0,8),
      String(toName).trim(),
      String(message).trim(),
      new Date().toISOString()
    ]);
  } catch(e) {
    Logger.log('addSwapNotification error: ' + e);
  }
}

// ===== קריאת התראות אישיות =====
function actionGetNotificationsPersonal(req, user) {
  var myName = String(user.name || '').trim();
  var notifs = [];
  
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notifications');
    if (sh && sh.getLastRow() > 1) {
      var rows = sh.getRange(1, 1, sh.getLastRow(), 4).getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][1]||'').trim() === myName) {
          notifs.push({
            id: String(rows[i][0]).trim(),
            message: String(rows[i][2]||'').trim(),
            createdAt: String(rows[i][3]||'').trim(),
            rowIdx: i+1
          });
        }
      }
    }
  } catch(e) { Logger.log('getNotificationsPersonal error: ' + e); }
  
  return {success: true, notifications: notifs};
}

function actionClearNotification(req, user) {
  var notifId = String(req.notifId || '').trim();
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notifications');
    if (!sh || sh.getLastRow() <= 1) return {success: true};
    var rows = sh.getRange(1, 1, sh.getLastRow(), 4).getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === notifId) {
        sh.deleteRow(i + 1);
        return {success: true};
      }
    }
  } catch(e) { Logger.log('clearNotification error: ' + e); }
  return {success: true};
}

function actionClearAllNotifications(req, user) {
  var myName = String(user.name || '').trim();
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notifications');
    if (!sh || sh.getLastRow() <= 1) return {success: true};
    var rows = sh.getRange(1, 1, sh.getLastRow(), 4).getValues();
    // Delete from bottom up to preserve row indices
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][1]||'').trim() === myName) {
        sh.deleteRow(i + 1);
      }
    }
  } catch(e) { Logger.log('clearAllNotifications error: ' + e); }
  return {success: true};
}

// ===== איפוס סיסמת ADMIN =====
function resetAdminPassword() {
  var sheet = getSheet(SH.USERS);
  var rows = sheet.getDataRange().getValues();
  var newHash = hashPass('admin123');
  var count = 0;
  
  for (var i = 1; i < rows.length; i++) {
    var role = String(rows[i][4]||'').trim();
    var uname = String(rows[i][2]||'').trim();
    if (role === 'admin' || uname === 'admin') {
      sheet.getRange(i+1, 4).setValue(newHash);
      count++;
      Logger.log('Reset admin password for: ' + uname);
    }
  }
  Logger.log('Done. Admin password reset to: admin123');
  return 'סיסמת admin אופסה ל: admin123 (' + count + ' שורות)';
}

// ===== קבלת שיבוץ מ-duty_agent.py =====
function writeScheduleFromAgent(data) {
  // Verify secret token
  if (String(data.token||'') !== 'matlam_duty_2026') {
    return {success:false, error:'unauthorized'};
  }
  
  var month       = String(data.month || '').trim();   // e.g. '202606'
  var assignments = data.assignments || {};             // {"1":{V,A,B,score,type},...}
  var scores      = data.scores || {};                  // {"name": newScore}
  
  if (!month) return {success:false, error:'missing month'};
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var TZ = ss.getSpreadsheetTimeZone();
  var schedSheet = ss.getSheetByName('Schedule_' + month);
  if (!schedSheet) return {success:false, error:'Schedule_' + month + ' not found'};
  
  var lastRow = schedSheet.getLastRow();
  if (lastRow < 2) return {success:false, error:'empty sheet'};
  
  var rows = schedSheet.getRange(1, 1, lastRow, 12).getValues();
  var vabData = [], scoreData = [];
  
  for (var i = 1; i < rows.length; i++) {
    var dateCell = rows[i][0];
    var dayNum = dateCell instanceof Date ? dateCell.getDate() :
                 parseInt(String(dateCell||'').split('/')[0]);
    if (!dayNum) { vabData.push(['','','']); scoreData.push([0]); continue; }
    
    var ag = assignments[String(dayNum)] || {};
    vabData.push([ag.V||'', ag.A||'', ag.B||'']);
    scoreData.push([ag.score||0]);
    if (ag.type) schedSheet.getRange(i+1, 8).setValue(ag.type);
  }
  
  schedSheet.getRange(2, 4, vabData.length, 3).setValues(vabData);
  schedSheet.getRange(2, 9, scoreData.length, 1).setValues(scoreData);
  
  // Update Scores sheet
  var scoreSheet = getSheet(SH.SCORES);
  var srows = scoreSheet.getDataRange().getValues();
  for (var j = 1; j < srows.length; j++) {
    var name = String(srows[j][0]||'').trim();
    if (name && scores[name] !== undefined) {
      scoreSheet.getRange(j+1, 4).setValue(Number(scores[name]));
    }
  }
  
  Logger.log('writeScheduleFromAgent: ' + month + ', ' + Object.keys(assignments).length + ' days');
  return {success:true, message:'Schedule_' + month + ' updated — ' + Object.keys(assignments).length + ' days'};
}

// ===================================================================
// DUTY AGENT ALGORITHM — translated from duty_agent.py
// ===================================================================

var DUTY_SCORES_MAP = {
  'חול':10, 'חול הקפצה':12, 'חמישי':12, 'חמישי הקפצה':15, 'סוף שבוע':20, 'סוף שבוע הקפצה':30,
  'סוף שבוע מלא':40, 'ערב חג':30, 'חג':30,
  'חג + סוף שבוע':50, 'דולג':0, 'פטור':10,
  'חול 24 שעות':15, 'חמישי 24 שעות':16, 'הדממה':18
};

function actionGenerateScheduleV2(req) {
  var month = String(req.month || '').trim();
  var year  = parseInt(month.substring(0,4));
  var mon   = parseInt(month.substring(4,6));
  if (!year || !mon) return {success:false, error:'חסר חודש'};

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var TZ  = ss.getSpreadsheetTimeZone();

  // ── 1. Load People & Scores ─────────────────────────────────────
  var peopleRows = ss.getSheetByName('People').getDataRange().getValues();
  var scoreRows  = ss.getSheetByName('Scores').getDataRange().getValues();
  
  // Build people map: name → {activity, dutyCategory, weekendType}
  var peopleMap = {};
  for (var i = 1; i < peopleRows.length; i++) {
    var nm = String(peopleRows[i][0]||'').trim();
    if (nm) peopleMap[nm] = {
      name:        nm,
      activity:    String(peopleRows[i][1]||'1').trim(),
      dutyCategory:String(peopleRows[i][2]||'').trim(),
      weekendType: String(peopleRows[i][4]||'מלא').trim()
    };
  }

  // Build scores map + history
  var scores = {}, people = {};
  for (var j = 1; j < scoreRows.length; j++) {
    var sname = String(scoreRows[j][0]||'').trim();
    if (!sname) continue;
    // Skip admin - not a torni
    var pm_check = peopleMap[sname] || {};
    if (pm_check.dutyCategory === 'מנהל מערכת') continue;
    var acc2026 = Number(scoreRows[j][3])||0;
    var pm      = peopleMap[sname] || {name:sname,activity:'1',dutyCategory:'',weekendType:'מלא'};
    
    // Check last full-weekend and last weekend from monthly columns
    // Scores sheet: col E(5)=ינואר סוג, F(6)=ינואר ניקוד, G(7)=פברואר סוג...
    var lastFW = null, lastWeekend = null;
    for (var back = 1; back <= 12; back++) {
      var mNum = mon - back;
      if (mNum < 1) break;
      var colIdx = 4 + (mNum-1)*2; // 0-indexed: col E=4 for ינואר(1)
      var dtype = String(scoreRows[j][colIdx]||'').trim();
      if (!dtype) continue;
      if (lastFW === null && dtype.indexOf('סוף שבוע מלא') !== -1) lastFW = mNum;
      if (lastWeekend === null && (dtype.indexOf('סוף שבוע') !== -1 || dtype.indexOf('שבת') !== -1))
        lastWeekend = mNum;
      if (lastFW !== null && lastWeekend !== null) break;
    }
    
    // Check if prev month had חג
    var prevMonDuty = '';
    if (mon > 1) {
      var prevColIdx = 4 + (mon-2)*2;
      prevMonDuty = String(scoreRows[j][prevColIdx]||'').trim();
    }

    people[sname] = Object.assign({}, pm, {
      score_2026:   acc2026,
      last_fw:      lastFW,
      last_weekend: lastWeekend,
      prev_hag:     prevMonDuty.indexOf('חג') !== -1,
      no_skip:      false,
      duty_type:    pm.weekendType === 'מלא' ? 'סוף שבוע מלא' : null
    });
    scores[sname] = acc2026;
  }

  // ── 2. Load Constraints ──────────────────────────────────────────
  var cSheetName = 'Constraints_' + month;
  var calInfo = {}; // name → {constraints: Set, forced_v: Set, preference: str}
  var cSheet = ss.getSheetByName(cSheetName);
  if (cSheet) {
    var cRows = cSheet.getDataRange().getValues();
    var daysInMonth = new Date(year, mon, 0).getDate();
    for (var ci = 1; ci < cRows.length; ci++) {
      var cname = String(cRows[ci][0]||'').trim();
      if (!cname || !people[cname]) continue;
      var constraints = {}, forced_v = {};
      for (var d = 1; d <= daysInMonth; d++) {
        var cv = String(cRows[ci][d]||'').trim().toUpperCase();
        if (cv === 'X') constraints[d] = true;
        if (cv === 'V') forced_v[d] = true;
      }
      var pref = String(cRows[ci][daysInMonth+1]||'').trim();
      var noSkip = pref.indexOf('לא לדלג') !== -1 || pref.indexOf('ללא דילוג') !== -1;
      if (noSkip) people[cname].no_skip = true;
      calInfo[cname] = {constraints: constraints, forced_v: forced_v, preference: pref};
    }
  }

  // ── 3. Build day categories from Schedule sheet ──────────────────
  var schedSheet = ss.getSheetByName('Schedule_' + month);
  if (!schedSheet) return {success:false, error:'Schedule_' + month + ' לא נמצא. צור לוח קודם.'};
  
  var schedRows = schedSheet.getRange(1,1,schedSheet.getLastRow(),12).getValues();
  var DAY_CAT = {}, WEEKEND_PAIRS = [];
  for (var si2 = 1; si2 < schedRows.length; si2++) {
    var dateCell = schedRows[si2][0];
    var dn = dateCell instanceof Date ? dateCell.getDate() : parseInt(String(dateCell).split('/')[0]);
    if (!dn) continue;
    var cat = String(schedRows[si2][2]||'חול').trim();
    if (cat === 'שישי' || cat === 'שבת') cat = 'סוף שבוע';
    DAY_CAT[dn] = cat;
  }

  // Override with user-specified dayCategories from the request (user override always wins)
  var userCats = req.dayCategories;
  if (typeof userCats === 'string') { try { userCats = JSON.parse(userCats); } catch(e) { userCats = null; } }
  if (userCats && typeof userCats === 'object') {
    Object.keys(userCats).forEach(function(dk) {
      var dn2 = parseInt(dk);
      if (dn2 && userCats[dk]) DAY_CAT[dn2] = String(userCats[dk]).trim();
    });
  }

  // Conflict priorities: admin chose who gets priority on conflict days
  var conflictPriorities = req.conflictPriorities;
  if (typeof conflictPriorities === 'string') { try { conflictPriorities = JSON.parse(conflictPriorities); } catch(e) { conflictPriorities = {}; } }
  conflictPriorities = conflictPriorities || {};
  // Inject admin-chosen priorities as forced_v (overrides existing)
  Object.keys(conflictPriorities).forEach(function(dk) {
    var dn = parseInt(dk);
    var chosenName = String(conflictPriorities[dk]).trim();
    if (!dn || !chosenName) return;
    // Ensure this person has forced_v on this day, and clear others
    if (!calInfo[chosenName]) calInfo[chosenName] = {constraints:{}, forced_v:{}, preference:''};
    calInfo[chosenName].forced_v[dn] = true;
    // Remove forced_v from others for this day
    Object.keys(calInfo).forEach(function(n) {
      if (n !== chosenName && calInfo[n].forced_v) delete calInfo[n].forced_v[dn];
    });
  });
  
  // Find weekend pairs (consecutive סוף שבוע days that are Fri+Sat)
  // Also find holiday pairs (consecutive חג days) - treated same as full weekends
  var daysInMonth2 = new Date(year, mon, 0).getDate();
  var HAG_PAIRS = [];
  for (var d2 = 1; d2 < daysInMonth2; d2++) {
    if (DAY_CAT[d2] === 'סוף שבוע' && DAY_CAT[d2+1] === 'סוף שבוע') {
      var dow = new Date(year, mon-1, d2).getDay(); // 5=Friday
      if (dow === 5) WEEKEND_PAIRS.push([d2, d2+1]);
    }
    // Holiday pair: two consecutive חג days (or ערב חג + חג)
    var cat_d2 = DAY_CAT[d2]||'', cat_d2n = DAY_CAT[d2+1]||'';
    if ((cat_d2 === 'חג' || cat_d2 === 'ערב חג') && cat_d2n === 'חג') {
      HAG_PAIRS.push([d2, d2+1]);
    }
  }

  // ── 4. Core helper functions ─────────────────────────────────────
  
  function fwEligible(p) {
    var last = p.last_fw;
    if (last !== null && (mon - last) < 6) return false;
    // חג in last 6 months disqualifies from full weekend
    for (var back2 = 1; back2 <= 6; back2++) {
      var mNum2 = mon - back2;
      if (mNum2 < 1) break;
      var colIdx2 = 4 + (mNum2-1)*2;
      // find this person in scoreRows
      for (var sr = 1; sr < scoreRows.length; sr++) {
        if (String(scoreRows[sr][0]||'').trim() === p.name) {
          if ((String(scoreRows[sr][colIdx2]||'').indexOf('חג') !== -1)) return false;
          break;
        }
      }
    }
    return true;
  }

  function canDoDay(name, day, isFW) {
    var p = people[name];
    if (!p) return false;
    var cat = DAY_CAT[day] || 'חול';
    if ((calInfo[name]||{}).constraints && calInfo[name].constraints[day]) return false;
    if (p.activity === '0') return false;
    if (p.dutyCategory === 'פטור' || p.dutyCategory === 'בהליך הסמכה') return false;
    if (p.activity === '0.5' && cat !== 'חמישי' && cat !== 'ערב חג') return false;
    // מלא gets FULL weekend pair or holiday pair (both days together)
    // נפרד can do any single day including weekend/holiday - no restrictions here
    return true;
  }

  function prefMatches(p, slotType) {
    var pref = ((calInfo[p.name]||{}).preference || '').trim();
    if (!pref) return false;
    var inPref = function(arr) { return arr.some(function(k){return pref.indexOf(k)!==-1;}); };
    if (inPref(['חמישי',"ה'"])) if (slotType === 'חמישי' || slotType === 'ערב חג') return true;
    if (inPref(['סוף שבוע','שישי','שבת',"ו'","ש'"])) if (slotType.indexOf('סוף שבוע')!==-1||slotType==='חג'||slotType==='חג + סוף שבוע') return true;
    if (inPref(['חול','רגיל'])) if (slotType === 'חול') return true;
    return false;
  }

  // ── 5. Schedule algorithm ────────────────────────────────────────
  
  var activeNames = Object.keys(people).filter(function(n){return people[n].activity !== '0';});
  activeNames.sort(function(a,b){
    var an = people[a].no_skip?0:1, bn = people[b].no_skip?0:1;
    if (an !== bn) return an-bn;
    return scores[a] - scores[b];
  });

  var usedV = {}, dayToV = {}, slotPrimary = {}, fwCovered = {};

  function pickCandidate(days, isFW, slotType, minWeekendGap) {
    var candidates = [];
    for (var ni = 0; ni < activeNames.length; ni++) {
      var n = activeNames[ni];
      if (usedV[n]) continue;
      var p = people[n];
      if (p.activity === '0.5') continue;
      if (isFW) {
        if (p.duty_type !== 'סוף שבוע מלא') continue;
        if (!fwEligible(p)) continue;
      }
      if (!isFW && (slotType === 'סוף שבוע' || slotType === 'חג + סוף שבוע')) {
        if (p.prev_hag) continue;
      }
      if (minWeekendGap !== undefined && minWeekendGap !== null) {
        var lw = p.last_weekend;
        if (lw !== null && (mon - lw) < minWeekendGap) continue;
      }
      var ok = days.every(function(day){return canDoDay(n, day, isFW);});
      if (!ok) continue;
      // Skip if conflict-priority reserved for a different day
      var reservedDay2 = conflictPriorities ? Object.keys(conflictPriorities).find(function(dk){ return conflictPriorities[dk] === n; }) : null;
      if (reservedDay2 && days.indexOf(parseInt(reservedDay2)) === -1) continue;
      var noSkipFlag = p.no_skip ? 0 : 1;
      var prefFlag   = prefMatches(p, slotType) ? 0 : 1;
      candidates.push([noSkipFlag, prefFlag, scores[n], n]);
    }
    if (!candidates.length) return null;
    candidates.sort(function(a,b){
      for(var k=0;k<3;k++){if(a[k]!==b[k])return a[k]-b[k];}return 0;
    });
    return candidates[0][3];
  }

  // ── Priority-based V assignment ──────────────────────────────────
  // Order: Holiday pairs → single holidays → weekends → thursday → regular
  // Lowest score wins regardless of מלא/נפרד type

  // Paternity (0.5) always gets Thursday first — but NOT if someone else has forced_v on that day
  var thuDays = [];
  for (var d3=1;d3<=daysInMonth2;d3++){
    if (DAY_CAT[d3]==='חמישי'||DAY_CAT[d3]==='ערב חג') thuDays.push(d3);
  }
  var paternityPeople = activeNames.filter(function(n){return people[n].activity==='0.5';});
  paternityPeople.forEach(function(pat){
    for(var ti=0;ti<thuDays.length;ti++){
      var thu=thuDays[ti];
      if(dayToV[thu]) continue;
      if(!canDoDay(pat,thu,false)) continue;
      // Skip this day if someone else has forced_v (V request) on it
      var hasForcedV = activeNames.some(function(n){
        return n !== pat && (calInfo[n]||{}).forced_v && calInfo[n].forced_v[thu] && canDoDay(n, thu, false);
      });
      if (hasForcedV) continue;
      usedV[pat]=true; dayToV[thu]=pat;
      var cat=DAY_CAT[thu];
      slotPrimary[thu]=[pat,cat,DUTY_SCORES_MAP[cat]||12];
      scores[pat]+=DUTY_SCORES_MAP[cat]||12;
      break;
    }
  });

  // Revised pickCandidate - picks LOWEST SCORE regardless of מלא/נפרד
  function pickLowest(days, slotType, minWeekendGap) {
    var isHagSlot = slotType === 'חג' || slotType === 'ערב חג' || slotType === 'חג + סוף שבוע';
    var candidates = [];
    for (var ni=0; ni<activeNames.length; ni++) {
      var n = activeNames[ni];
      if (usedV[n]) continue;
      var p = people[n];
      if (p.activity === '0.5') continue; // paternity handled separately
      // Weekend gap check (not for holidays)
      if (!isHagSlot && minWeekendGap) {
        var lw = p.last_weekend;
        if (lw !== null && (mon - lw) < minWeekendGap) continue;
      }
      // Full-weekend gap check: ONLY for actual weekends, NOT holidays
      if (!isHagSlot && days.length > 1 && p.weekendType === 'מלא') {
        if (!fwEligible(p)) continue;
      }
      var ok = days.every(function(day){return canDoDay(n, day, days.length>1);});
      if (!ok) continue;
      // Skip if this person is conflict-priority reserved for a different day
      var reservedDay = conflictPriorities ? Object.keys(conflictPriorities).find(function(dk){ return conflictPriorities[dk] === n; }) : null;
      if (reservedDay && days.indexOf(parseInt(reservedDay)) === -1) continue;
      // Skip if person has forced_v on a day NOT in current slot (save them for that day)
      var fv = (calInfo[n]||{}).forced_v || {};
      var fvDays = Object.keys(fv).map(Number).filter(function(fd){ return fv[fd] && canDoDay(n, fd, false); });
      if (fvDays.length > 0 && !fvDays.some(function(fd){ return days.indexOf(fd) !== -1; })) continue;
      var noSkipFlag = p.no_skip ? 0 : 1;
      var prefFlag   = prefMatches(p, slotType) ? 0 : 1;
      // forced_v: person marked V on ANY day in this slot → gets priority
      var forcedVFlag = days.some(function(day){ return (calInfo[n]||{}).forced_v && calInfo[n].forced_v[day]; }) ? 0 : 1;
      candidates.push([forcedVFlag, noSkipFlag, prefFlag, scores[n], n]);
    }
    if (!candidates.length) return null;
    candidates.sort(function(a,b){
      for(var k=0;k<4;k++){if(a[k]!==b[k])return a[k]-b[k];}return 0;
    });
    return candidates[0][4];
  }

  // PRIORITY 1: Holiday pairs (ערב חג + חג, or חג + חג)
  HAG_PAIRS.forEach(function(pair){
    var d1=pair[0], d2=pair[1];
    if (fwCovered[d1]||fwCovered[d2]) return;
    var hagScore = Math.max(DUTY_SCORES_MAP[DAY_CAT[d1]]||30, DUTY_SCORES_MAP[DAY_CAT[d2]]||30);
    // Try as pair first — lowest score, no fw gap restriction for holidays
    var chosen = pickLowest([d1,d2], 'חג', null);
    if (!chosen) chosen = pickLowest([d1], 'חג', null); // fallback to first day only
    if (chosen) {
      var isMala = people[chosen].weekendType === 'מלא';
      usedV[chosen]=true;
      if (isMala) {
        // מלא covers both days
        dayToV[d1]=dayToV[d2]=chosen;
        slotPrimary[d1]=[chosen,'חג',hagScore];
        slotPrimary[d2]=[chosen,'חג',0];
        fwCovered[d1]=true; fwCovered[d2]=true;
      } else {
        // נפרד covers both days too (holiday pair = full coverage regardless of type)
        dayToV[d1]=dayToV[d2]=chosen;
        slotPrimary[d1]=[chosen,'חג',hagScore];
        slotPrimary[d2]=[chosen,'חג',0];
        fwCovered[d1]=true; fwCovered[d2]=true;
      }
      scores[chosen]+=hagScore;
      people[chosen].last_weekend=mon;
    }
    // Assign second day separately if still uncovered
    if (!fwCovered[d2]) {
      var chosen2 = pickLowest([d2], 'חג', null);
      if (chosen2) {
        usedV[chosen2]=true; dayToV[d2]=chosen2;
        var sc2 = DUTY_SCORES_MAP[DAY_CAT[d2]]||30;
        slotPrimary[d2]=[chosen2,'חג',sc2];
        scores[chosen2]+=sc2; fwCovered[d2]=true;
      }
    }
  });

  // PRIORITY 1b: Single holiday days not part of a pair
  for (var hd=1;hd<=daysInMonth2;hd++){
    if (fwCovered[hd]||dayToV[hd]) continue;
    var hcat=DAY_CAT[hd]||'';
    if (hcat==='חג'||hcat==='ערב חג') {
      var hchosen=pickLowest([hd],'חג',null);
      if (hchosen){
        usedV[hchosen]=true; dayToV[hd]=hchosen;
        var hsc=DUTY_SCORES_MAP[hcat]||30;
        slotPrimary[hd]=[hchosen,hcat,hsc];
        scores[hchosen]+=hsc; fwCovered[hd]=true;
      }
    }
  }

  // PRIORITY 2: Weekend pairs (Fri+Sat) — מלא covers both, נפרד covers one
  WEEKEND_PAIRS.forEach(function(pair){
    var fri=pair[0], sat=pair[1];
    if (fwCovered[fri]&&fwCovered[sat]) return;
    // Try as full pair first
    var chosen = pickLowest([fri,sat], 'סוף שבוע מלא', null);
    if (chosen && people[chosen].weekendType === 'מלא') {
      // מלא: covers both fri+sat
      usedV[chosen]=true; dayToV[fri]=dayToV[sat]=chosen;
      slotPrimary[fri]=[chosen,'סוף שבוע מלא',DUTY_SCORES_MAP['סוף שבוע מלא']];
      slotPrimary[sat]=[chosen,'סוף שבוע מלא',0];
      scores[chosen]+=DUTY_SCORES_MAP['סוף שבוע מלא'];
      people[chosen].last_fw=mon; people[chosen].last_weekend=mon;
      fwCovered[fri]=true; fwCovered[sat]=true;
    } else {
      // No מלא available or chosen is נפרד — assign each day separately (handled below)
      // Just mark the pair as not covered so it falls through to single-day processing
    }
  });

  // PRIORITY 2b: Single weekend days (for נפרד or unpaired)
  // Sort all remaining weekend days
  var weekendSingles = [];
  for (var wd=1;wd<=daysInMonth2;wd++){
    if (!fwCovered[wd] && !dayToV[wd] && DAY_CAT[wd]==='סוף שבוע') weekendSingles.push(wd);
  }
  weekendSingles.forEach(function(day){
    if (dayToV[day]) return;
    var chosen = null;
    for (var gap=4;gap>=2;gap--){
      chosen = pickLowest([day], 'סוף שבוע', gap);
      if (chosen) break;
    }
    if (chosen) {
      usedV[chosen]=true; dayToV[day]=chosen;
      slotPrimary[day]=[chosen,'סוף שבוע',DUTY_SCORES_MAP['סוף שבוע']];
      scores[chosen]+=DUTY_SCORES_MAP['סוף שבוע'];
      people[chosen].last_weekend=mon;
    }
  });

  // PRIORITY 3: 24-hour duties
  // PRIORITY 4: Thursday (חמישי / ערב חג)
  // PRIORITY 5: Regular days (חול)
  var slotOrder = [
    {cats:['חול 24 שעות','חמישי 24 שעות','הדממה'], name:'24hours'},
    {cats:['חמישי','ערב חג'], name:'thursday'},
    {cats:['חול'], name:'regular'}
  ];
  slotOrder.forEach(function(group){
    var days = [];
    for (var gd=1;gd<=daysInMonth2;gd++){
      var gc = DAY_CAT[gd]||'חול';
      if (!dayToV[gd] && !fwCovered[gd] && group.cats.indexOf(gc)!==-1) days.push(gd);
    }
    days.forEach(function(day){
      if (dayToV[day]) return;
      var cat=DAY_CAT[day]||'חול';
      var chosen = pickLowest([day], cat, null);
      if (chosen) {
        usedV[chosen]=true; dayToV[day]=chosen;
        var val=DUTY_SCORES_MAP[cat]||10;
        slotPrimary[day]=[chosen,cat,val];
        scores[chosen]+=val;
      }
    });
  });

  var dolag = activeNames.filter(function(n){return !usedV[n];});

  // ── 6. Reserve A/B assignment ────────────────────────────────────
  var fwPeople = new Set(Object.keys(people).filter(function(n){return people[n].duty_type==='סוף שבוע מלא';}));
  var vIsFW = new Set();
  WEEKEND_PAIRS.forEach(function(pair){
    if(fwCovered[pair[0]]){var vp=dayToV[pair[0]];if(vp)vIsFW.add(vp);}
  });

  var personVDays = {};
  Object.keys(dayToV).forEach(function(d){
    var n=dayToV[d];
    if(!personVDays[n]) personVDays[n]=[];
    personVDays[n].push(parseInt(d));
  });

  var vGroup = {};
  Object.keys(dayToV).forEach(function(d){
    var n=dayToV[d], cat=DAY_CAT[d]||'חול';
    var grp = cat==='סוף שבוע'?'weekend':cat==='חמישי'||cat==='ערב חג'?'thursday':'weekday';
    if (!vGroup[n]) vGroup[n]=grp;
    else if (grp==='weekend') vGroup[n]='weekend';
    else if (grp==='thursday'&&vGroup[n]==='weekday') vGroup[n]='thursday';
  });

  var reservePool = activeNames.filter(function(n){return !dolag.includes(n);});
  var resA={},resB={},resTotal={},resDays={};
  reservePool.forEach(function(n){resA[n]=0;resB[n]=0;resTotal[n]=0;resDays[n]=[];});

  var MIN_GAP=3, PREF_GAP=7, MAX_RES=2;

  var vPersons = new Set(Object.values(dayToV));
  var result = {}, fwPairDone = {};

  function buildEligibleFW(fri,sat,minGap) {
    return reservePool.filter(function(n){
      if(n===dayToV[fri]) return false;
      if(vGroup[n]==='weekend'&&!vIsFW.has(n)) return false;
      if((calInfo[n]||{}).constraints&&(calInfo[n].constraints[fri]||calInfo[n].constraints[sat])) return false;
      if(people[n].activity==='0'||people[n].activity==='0.5') return false;
      var maxRes = vIsFW.has(n) ? MAX_RES*2 : MAX_RES;
      if(resTotal[n]>=maxRes) return false;
      var rds=resDays[n];
      if(rds.length&&Math.min.apply(null,rds.map(function(r){return Math.abs(fri-r);})) < minGap) return false;
      if(rds.length&&Math.min.apply(null,rds.map(function(r){return Math.abs(sat-r);})) < minGap) return false;
      var vd=personVDays[n]||[];
      if(vd.some(function(v){return Math.abs(fri-v)<MIN_GAP||Math.abs(sat-v)<MIN_GAP;})) return false;
      return true;
    });
  }

  function buildEligible(v,day,cat,requireGrp,minGap,allowFW,minVGap,maxResOvr) {
    if(minVGap===undefined) minVGap=MIN_GAP;
    if(maxResOvr===undefined) maxResOvr=MAX_RES;
    return reservePool.filter(function(n){
      if(n===v) return false;
      if(vIsFW.has(n)&&cat==='סוף שבוע') return false;
      if(fwPeople.has(n)&&(cat==='סוף שבוע'||cat==='חג')) return false;
      if(vGroup[n]==='weekday'&&cat==='סוף שבוע'&&!allowFW) return false;
      if((calInfo[n]||{}).constraints&&calInfo[n].constraints[day]) return false;
      if(people[n].activity==='0.5'&&cat!=='חמישי'&&cat!=='ערב חג') return false;
      if(resTotal[n]>=maxResOvr) return false;
      if(requireGrp&&vGroup[n]!==cat.indexOf('סוף שבוע')!==-1?'weekend':cat==='חמישי'||cat==='ערב חג'?'thursday':'weekday') {
        // simplified group check
      }
      var rds=resDays[n];
      if(rds.length&&Math.min.apply(null,rds.map(function(r){return Math.abs(day-r);})) < minGap) return false;
      var vd=personVDays[n]||[];
      if(vd.some(function(v2){return Math.abs(day-v2)<minVGap;})) return false;
      return true;
    });
  }

  function getGap(n,day) {
    var rds=resDays[n];
    if(!rds.length) return 999;
    return Math.min.apply(null,rds.map(function(r){return Math.abs(day-r);}));
  }

  function assignReserve(n,day,role) {
    result[day][role]=n;
    if(role==='A') resA[n]++;else resB[n]++;
    resTotal[n]++;
    resDays[n].push(day);
  }

  // Process days
  var allDays = [];
  for(var pd=1;pd<=daysInMonth2;pd++) if(dayToV[pd]) allDays.push(pd);

  allDays.forEach(function(day){
    if(result[day]) return;
    if(fwPairDone[day]) return;
    var v=dayToV[day];
    var cat=DAY_CAT[day]||'חול';
    var si=slotPrimary[day];
    var slotStype=si?si[1]:cat;
    var isFWSlot=slotStype==='סוף שבוע מלא'||slotStype==='חג + סוף שבוע';
    var sscore=si?si[2]:0;

    if(isFWSlot) {
      // Find sat pair
      var fwSat=null;
      WEEKEND_PAIRS.forEach(function(pair){if(pair[0]===day)fwSat=pair[1];});
      if(fwSat!==null) {
        var elig=buildEligibleFW(day,fwSat,PREF_GAP);
        if(elig.length<2) elig=buildEligibleFW(day,fwSat,MIN_GAP);
        if(elig.length<2) elig=buildEligibleFW(day,fwSat,1);

        elig.sort(function(a,b){return resA[a]-resA[b]||(scores[a]-scores[b]);});
        var afw=elig[0]||null;
        var bPool=elig.filter(function(n){return n!==afw;});
        bPool.sort(function(a,b){return resB[a]-resB[b]||(scores[a]-scores[b]);});
        var bfw=bPool[0]||null;

        if(!result[day]) result[day]={V:v,A:null,B:null,type:slotStype,score:sscore};
        if(!result[fwSat]) result[fwSat]={V:dayToV[fwSat]||v,A:null,B:null,type:slotStype,score:0};
        if(afw){result[day].A=afw;result[fwSat].A=afw;resA[afw]++;resTotal[afw]++;resDays[afw].push(fwSat);}
        if(bfw){result[day].B=bfw;result[fwSat].B=bfw;resB[bfw]++;resTotal[bfw]++;resDays[bfw].push(fwSat);}
        fwPairDone[fwSat]=true;
        return;
      }
    }

    // Single day reserves
    var elig2=buildEligible(v,day,cat,false,PREF_GAP,false,MIN_GAP,MAX_RES);
    if(elig2.length<2) elig2=buildEligible(v,day,cat,false,MIN_GAP,false,MIN_GAP,MAX_RES);
    if(elig2.length<2) elig2=buildEligible(v,day,cat,false,1,false,MIN_GAP,MAX_RES);
    if(elig2.length<2) elig2=buildEligible(v,day,cat,false,1,true,MIN_GAP,MAX_RES);
    if(elig2.length<2) elig2=buildEligible(v,day,cat,false,1,true,1,MAX_RES+1);

    elig2.sort(function(a,b){
      return (resA[a]-resA[b])||(getGap(b,day)-getGap(a,day))||(scores[a]-scores[b]);
    });
    var ar=elig2[0]||null;
    var bPool2=elig2.filter(function(n){return n!==ar;});
    bPool2.sort(function(a,b){
      return (resB[a]-resB[b])||(getGap(b,day)-getGap(a,day))||(scores[a]-scores[b]);
    });
    var br=bPool2[0]||null;

    result[day]={V:v,A:ar,B:br,type:slotStype,score:sscore};
    if(ar){resA[ar]++;resTotal[ar]++;resDays[ar].push(day);}
    if(br){resB[br]++;resTotal[br]++;resDays[br].push(day);}
  });

  // ── 7. Write to Schedule sheet ──────────────────────────────────
  var vabData=[], scoreData=[], typeData=[];
  for(var wi=1;wi<schedRows.length;wi++){
    var dateCell2=schedRows[wi][0];
    var dn2=dateCell2 instanceof Date?dateCell2.getDate():parseInt(String(dateCell2).split('/')[0]);
    var ag=result[dn2]||{V:'',A:'',B:'',score:0,type:''};
    vabData.push([ag.V||'',ag.A||'',ag.B||'']);
    scoreData.push([ag.score||0]);
    typeData.push([ag.type||schedRows[wi][7]||'']);
  }
  if(vabData.length){
    var numR=vabData.length;
    schedSheet.getRange(2,4,numR,3).setValues(vabData);
    schedSheet.getRange(2,9,numR,1).setValues(scoreData);
    schedSheet.getRange(2,8,numR,1).setValues(typeData);
  }

  // ── 8. Update Scores sheet ─────────────────────────────────────
  var scoreSheet2=ss.getSheetByName('Scores');
  var monColType = 4 + (mon-1)*2 + 1; // 1-indexed for GS: col 5=ינואר סוג(E), 6=ינואר ניקוד(F)...
  var monColScore = monColType + 1;

  // Score updates: +10 for inactive
  Object.keys(people).forEach(function(n){
    if(people[n].activity==='0') scores[n]+=10;
  });

  for(var sui=1;sui<scoreRows.length;sui++){
    var sn=String(scoreRows[sui][0]||'').trim();
    if(!sn) continue;
    if(scores[sn]!==undefined){
      scoreSheet2.getRange(sui+1,4).setValue(scores[sn]);
    }
    // Write monthly type+score
    var ag2=null;
    Object.keys(result).forEach(function(d){if(result[d].V===sn&&result[d].score>0)ag2=result[d];});
    if(ag2){
      scoreSheet2.getRange(sui+1,monColType).setValue(ag2.type||'');
      scoreSheet2.getRange(sui+1,monColScore).setValue(ag2.score);
    } else if(people[sn]&&people[sn].activity==='0'){
      scoreSheet2.getRange(sui+1,monColType).setValue('פטור');
      scoreSheet2.getRange(sui+1,monColScore).setValue(10);
    }
  }

  Logger.log('generateScheduleV2: ' + month + ' done, ' + Object.keys(result).length + ' days scheduled');
  return {success:true, message:'השיבוץ הופק בהצלחה (' + Object.keys(result).length + ' ימים)'};
}

// ===== הרצה ישירה לבנייה מחדש של הניקוד =====
function rebuildScoresDirectly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoreSheet = ss.getSheetByName('Scores');
  if (!scoreSheet) { Logger.log('ERROR: Scores sheet not found'); return; }

  var scoreRows = scoreSheet.getDataRange().getValues();
  Logger.log('Scores rows: ' + scoreRows.length);
  if (scoreRows.length < 2) { Logger.log('ERROR: Scores sheet has no data rows'); return; }

  // name → {rowNum, acc2025}
  var nameToRow = {};
  var acc2025 = {};
  for (var i = 1; i < scoreRows.length; i++) {
    var nm = String(scoreRows[i][0]||'').trim();
    if (!nm) continue;
    nameToRow[nm] = i + 1; // 1-based
    acc2025[nm] = Number(scoreRows[i][2]||0); // col C = מצטבר 2025
  }
  Logger.log('Names: ' + Object.keys(nameToRow).length);

  // Find Schedule sheets — only ones with actual assignments (not empty)
  var sheets = ss.getSheets();
  var schedSheets = sheets.filter(function(s){
    if (!/^Schedule_\d{6}$/.test(s.getName())) return false;
    var lastRow = s.getLastRow();
    if (lastRow < 2) return false; // empty sheet
    // Check that at least one row has a V assignment (col D)
    var data = s.getRange(2, 4, Math.min(lastRow-1, 5), 1).getValues();
    return data.some(function(r){ return String(r[0]||'').trim() !== ''; });
  });
  schedSheets.sort(function(a,b){ return a.getName().localeCompare(b.getName()); });
  Logger.log('Schedule sheets: ' + schedSheets.map(function(s){return s.getName();}).join(', '));

  // Clear monthly cols (E onwards = col 5+, 12 months × 2 = 24 cols) but NOT col C (2025)
  var lastRow = scoreSheet.getLastRow();
  if (lastRow > 1) {
    scoreSheet.getRange(2, 5, lastRow-1, 24).clearContent(); // monthly cols only
    scoreSheet.getRange(2, 4, lastRow-1, 1).clearContent();  // col D (acc2026)
  }

  // Load exempt people
  var peopleSheet = ss.getSheetByName('People');
  var exempt = {};
  if (peopleSheet) {
    var pRows = peopleSheet.getDataRange().getValues();
    for (var pi = 1; pi < pRows.length; pi++) {
      if (String(pRows[pi][1]||'').trim() === '0') exempt[String(pRows[pi][0]||'').trim()] = true;
    }
  }

  // Accumulate 2026 scores per person
  var acc2026 = {};
  Object.keys(nameToRow).forEach(function(n){ acc2026[n] = 0; });

  schedSheets.forEach(function(sh) {
    var shName = sh.getName();
    var mon = parseInt(shName.substring(13, 15));
    var monColType  = 5 + (mon-1)*2;  // 1-based col in Scores sheet
    var monColScore = monColType + 1;
    var rows = sh.getDataRange().getValues();
    Logger.log(shName + ' headers: ' + JSON.stringify(rows[0]));
    Logger.log(shName + ' row1: ' + JSON.stringify(rows[1]));
    var monthScores = {};

    for (var ri = 1; ri < rows.length; ri++) {
      var v     = String(rows[ri][3]||'').trim();
      var v2    = String(rows[ri][9]||'').trim();
      var dtype = String(rows[ri][7]||rows[ri][2]||'').trim();
      var sc    = Number(rows[ri][8]||0);
      var isWeekend = (dtype.indexOf('סוף שבוע') !== -1);

      if (v && sc > 0) {
        if (!monthScores[v]) monthScores[v] = {types: [], score: 0, weekendDays: 0};
        monthScores[v].score += sc;
        if (isWeekend) monthScores[v].weekendDays++;
        else if (dtype && monthScores[v].types.indexOf(dtype) === -1) monthScores[v].types.push(dtype);
      }
      if (v2 && sc > 0) {
        if (!monthScores[v2]) monthScores[v2] = {types: [], score: 0, weekendDays: 0};
        monthScores[v2].score += sc;
        if (isWeekend) monthScores[v2].weekendDays++;
        else if (dtype && monthScores[v2].types.indexOf(dtype) === -1) monthScores[v2].types.push(dtype);
      }
    }
    Logger.log(shName + ' monthScores names: ' + Object.keys(monthScores).join(', '));

    Object.keys(nameToRow).forEach(function(n) {
      var row = nameToRow[n];
      if (monthScores[n]) {
        var types = monthScores[n].types.slice();
        // Determine weekend type based on count of weekend days assigned
        if (monthScores[n].weekendDays >= 2) {
          types.unshift('סוף שבוע מלא');
        } else if (monthScores[n].weekendDays === 1) {
          types.unshift('סוף שבוע');
        }
        scoreSheet.getRange(row, monColType).setValue(types.join(' + '));
        scoreSheet.getRange(row, monColScore).setValue(monthScores[n].score);
        acc2026[n] += monthScores[n].score;
      } else if (exempt[n]) {
        scoreSheet.getRange(row, monColType).setValue('פטור');
        scoreSheet.getRange(row, monColScore).setValue(10);
        acc2026[n] += 10;
      } else {
        scoreSheet.getRange(row, monColType).setValue('דולג');
        scoreSheet.getRange(row, monColScore).setValue(0);
      }
    });
    Logger.log(shName + ': ' + JSON.stringify(monthScores).substring(0,150));
  });

  // Write col D = מצטבר 2025 + מצטבר 2026
  Object.keys(nameToRow).forEach(function(n) {
    var total = (acc2025[n]||0) + (acc2026[n]||0);
    scoreSheet.getRange(nameToRow[n], 4).setValue(total);
  });

  Logger.log('Done! acc2026: ' + JSON.stringify(acc2026).substring(0,300));
}

function testPeopleUpdate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('People');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    Logger.log('Row ' + i + ': "' + rows[i][0] + '" col5: ' + rows[i][4]);
    if (String(rows[i][0]).trim() === 'מנהל מערכת') {
      Logger.log('Found! Current weekendType: ' + rows[i][4]);
      break;
    }
  }
}

function fixPeopleWeekend() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('People');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === 'מנהל מערכת') {
      Logger.log('Found at row ' + (i+1) + ', current E: ' + rows[i][4]);
      sh.getRange(i+1, 5).setValue('בנפרד');
      Logger.log('Set to בנפרד. New value: ' + sh.getRange(i+1, 5).getValue());
      return;
    }
  }
  Logger.log('Not found!');
}
