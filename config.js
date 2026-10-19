// НАСТРОЙКИ FIREBASE — уже заполнены для проекта guardian-spirit-ef95c.
// Если когда-нибудь смените проект: скопируйте в Firebase (шестерёнка → Настройки проекта →
// Ваши приложения → Конфигурация SDK) блок от "const firebaseConfig = {" до "};"
// и вставьте вместо блока ниже.

const firebaseConfig = {
  apiKey: "AIzaSyD0zSH0VxY41NRM5k4eBFv-SBVEaStU3Tg",
  authDomain: "guardian-spirit-ef95c.firebaseapp.com",
  projectId: "guardian-spirit-ef95c",
  storageBucket: "guardian-spirit-ef95c.firebasestorage.app",
  messagingSenderId: "656913706953",
  appId: "1:656913706953:web:0cf38a0636036679770218"
};

window.FIREBASE_CONFIG = firebaseConfig;

// АДМИНИСТРАТОРЫ. Здесь не почты, а их зашифрованные отпечатки — по ним нельзя узнать, кто администратор.
// Чтобы добавить или убрать администратора, напишите Claude: он пришлёт новую строку.
// Тот же список почт указан в правилах Firestore (их видите только вы в консоли Firebase).
window.OTARA_ADMIN_KEYS = [
  "c67f75d66eb418e68e44e815ca0af5335b6692a8d93bf03897869e6780d3ce71",
  "8af81160b4f7f0a538d22faf3617e3e6ea31861f049911cd817ea1c3cf5b0779"
];
