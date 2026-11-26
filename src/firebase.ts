import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Web config is meant to ship inside the app; access is controlled by firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDyNRrDesCKIr458p3XxOG7DpRe-Z-yX7w',
  authDomain: 'shout-families.firebaseapp.com',
  projectId: 'shout-families',
  storageBucket: 'shout-families.firebasestorage.app',
  messagingSenderId: '8675342569',
  appId: '1:8675342569:web:53e9112e48c1ee21f25878',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const EMU = import.meta.env.VITE_EMU === '1';

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: EMU ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Test builds only: talk to local emulators and allow scripted sign-in.
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  (window as unknown as Record<string, unknown>).__emuSignIn = (sub: string, email: string, name: string) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, name, email_verified: true })));
}
