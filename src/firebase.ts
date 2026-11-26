import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
