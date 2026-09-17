// Firebase bootstrap + login (matlam v2)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { userKey, emailFor, fbPass } from "./emu.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB3ZOVzk78cFVvWPR_jGGL5UK5mquaYITY",
  authDomain: "matlam-e5288.firebaseapp.com",
  projectId: "matlam-e5288",
  storageBucket: "matlam-e5288.firebasestorage.app",
  messagingSenderId: "752992069219",
  appId: "1:752992069219:web:0d06f6a79224175806fa56"
};
export const REGION = "me-west1";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const functions = getFunctions(app, REGION);
export const fnLogin = httpsCallable(functions, "login", { timeout: 60000 });
export const fnApi = httpsCallable(functions, "api", { timeout: 180000 });
export const fnForgot = httpsCallable(functions, "forgotPassword", { timeout: 60000 });
export const fnExport = httpsCallable(functions, "exportBackup", { timeout: 180000 });
export const fnImport = httpsCallable(functions, "importData", { timeout: 540000 });

export { userKey };

// Password is verified on the server against the imported password hashes;
// the server then (re)provisions the Firebase account so we can sign in.
export async function login(username, password) {
  try {
    await fnLogin({ username, password });
  } catch (e) {
    throw new Error(e.message || "שם משתמש או סיסמה שגויים");
  }
  return signInWithEmailAndPassword(auth, emailFor(username), fbPass(password));
}

export const currentKey = () => auth.currentUser ? auth.currentUser.email.split("@")[0] : null;
