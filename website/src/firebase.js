// website/src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider  } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// add more as needed

const firebaseConfig = {
  apiKey: "AIzaSyBV3cm7OU8-7fMMFBzvbwrT9kiY1Gg-jKI",
  authDomain: "nusmods-9090f.firebaseapp.com",
  projectId: "nusmods-9090f",
  storageBucket: "nusmods-9090f.firebasestorage.app",
  messagingSenderId: "426390003816",
  appId: "1:426390003816:web:7f2c4f5277ca8485eb9bdd",
};

export const app = initializeApp(firebaseConfig);

// Export only what you need
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
