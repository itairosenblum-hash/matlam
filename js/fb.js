// Firebase bootstrap + shared helpers (matlam v2)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         onAuthStateChanged, signOut, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         doc, getDoc, setDoc, onSnapshot, collection, getDocs, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB3ZOVzk78cFVvWPR_jGGL5UK5mquaYITY",
  authDomain: "matlam-e5288.firebaseapp.com",
  projectId: "matlam-e5288",
  storageBucket: "matlam-e5288.firebasestorage.app",
  messagingSenderId: "752992069219",
  appId: "1:752992069219:web:0d06f6a79224175806fa56"
};

// Old system (read-only use: verifying passwords during migration + data import)
export const OLD_API_URL = "https://script.google.com/macros/s/AKfycbxgTS2a9Fz-N91I9bm7GaqCPN9WD3rVRgJ_mkhGVXEk5P-YGCWv9oIN5DbESXg00z5PZA/exec";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
// Local cache: screens open instantly from disk, then update live
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export { doc, getDoc, setDoc, onSnapshot, collection, getDocs, writeBatch, serverTimestamp,
         onAuthStateChanged, signOut };

const EMAIL_DOMAIN = "matlam-e5288.firebaseapp.com";

// Username -> stable key used as people/{key} doc id and as the auth email local part.
export function userKey(username) {
  const u = String(username || "").trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(u)) return u;
  return "u" + Array.from(new TextEncoder().encode(u)).map(b => b.toString(16).padStart(2, "0")).join("");
}
// Key for a person that has no login account (name only)
export function nameKey(name) {
  return "n" + Array.from(new TextEncoder().encode(String(name || "").trim())).map(b => b.toString(16).padStart(2, "0")).join("");
}
export const emailFor = u => userKey(u) + "@" + EMAIL_DOMAIN;
// Firebase requires >= 6 chars; old passwords may be shorter, so always pad identically.
const fbPass = p => String(p) + "::mtl2";

// JSONP call to the old Apps Script (same convention as the old site)
export function oldApi(params, token, url = OLD_API_URL) {
  return new Promise((resolve, reject) => {
    const cb = "jcb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    const s = document.createElement("script");
    const t = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 60000);
    function cleanup() { clearTimeout(t); delete window[cb]; s.remove(); }
    window[cb] = d => { cleanup(); resolve(d); };
    const all = { ...params, callback: cb };
    if (token) all.token = token;
    s.src = url + "?" + Object.entries(all).filter(([, v]) => v != null)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : v)).join("&");
    s.onerror = () => { cleanup(); reject(new Error("שגיאת רשת מול המערכת הישנה")); };
    document.head.appendChild(s);
  });
}

// Login. First time: verify against the old system, then create the Firebase account
// with the same password (users keep their existing credentials).
export async function login(username, password, onStatus = () => {}) {
  const email = emailFor(username);
  try {
    return await signInWithEmailAndPassword(auth, email, fbPass(password));
  } catch (e) {
    if (!["auth/invalid-credential", "auth/user-not-found", "auth/invalid-login-credentials"].includes(e.code)) throw e;
  }
  onStatus("כניסה ראשונה למערכת החדשה — מאמת מול המערכת הקיימת...");
  const r = await oldApi({ action: "login", username, password });
  if (!r || !r.success) throw new Error((r && r.error) || "שם משתמש או סיסמה שגויים");
  try {
    return await createUserWithEmailAndPassword(auth, email, fbPass(password));
  } catch (e) {
    if (e.code === "auth/email-already-in-use")
      throw new Error("החשבון כבר הועבר עם סיסמה אחרת. פנה למנהל לאיפוס.");
    throw e;
  }
}

export const currentKey = () => auth.currentUser ? auth.currentUser.email.split("@")[0] : null;
