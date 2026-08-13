import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

// Public web config — not a secret. Access control lives in Firestore's security rules,
// not in hiding this object (see firestore.rules at the repo root).
const firebaseConfig = {
  apiKey: 'AIzaSyClJBMSiUFJOLFXcq8pYBGEmSzD70gr7bg',
  authDomain: 'sky-dash-shooter.firebaseapp.com',
  databaseURL: 'https://sky-dash-shooter-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'sky-dash-shooter',
  storageBucket: 'sky-dash-shooter.firebasestorage.app',
  messagingSenderId: '229889170220',
  appId: '1:229889170220:web:428e39acfe8d4d8968aa89'
};

export const firebaseApp = initializeApp(firebaseConfig);

// Firestore's default WebChannel transport keeps a persistent streaming connection open,
// which some proxies/corporate networks/browser extensions quietly break in a way that
// surfaces as spurious "client is offline" errors. Auto-detecting long-polling trades a
// little latency for working reliably everywhere.
export const firestore = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true
});
