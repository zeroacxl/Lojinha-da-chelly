import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYGUmvBmUpWQzextx3AaO9mxUhdveu6EA",
  authDomain: "lojinha-da-chelly.firebaseapp.com",
  projectId: "lojinha-da-chelly",
  storageBucket: "lojinha-da-chelly.firebasestorage.app",
  messagingSenderId: "252536959525",
  appId: "1:252536959525:web:60347c6dfef601bacac5cc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
