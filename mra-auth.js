export const MRA_ADMIN_UIDS=Object.freeze([
 "2DCyQB0Js1UpWGI0LkEQtnOhGPl1",
 "UqAXXX1tq9d5I34QTF3USu3vaUb2"
]);

const adminUidSet=new Set(MRA_ADMIN_UIDS);

export function isMraAdminUser(user){
 return Boolean(user&&!user.isAnonymous&&adminUidSet.has(user.uid));
}

export function mraAuthErrorMessage(error,providerLabel="MRA"){
 const messages={
  "auth/popup-closed-by-user":"Sign-in was canceled.",
  "auth/cancelled-popup-request":"The earlier sign-in window was replaced. Complete the newest sign-in window.",
  "auth/popup-blocked":"The browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "auth/unauthorized-domain":"This website is not authorized in Firebase Authentication. Add stealthmaesch-max.github.io as an authorized domain.",
  "auth/account-exists-with-different-credential":"That email already uses another sign-in method. Choose the provider originally used for this MRA account.",
  "auth/credential-already-in-use":"That provider is already connected to another account. Sign out and use the approved MRA account.",
  "auth/operation-not-allowed":`${providerLabel} sign-in is not enabled in Firebase Authentication.`,
  "auth/network-request-failed":"Authentication could not reach Firebase. Check the connection and try again.",
  "auth/too-many-requests":"Firebase temporarily limited sign-in attempts. Wait briefly, then try again."
 };
 return messages[error?.code]||`Sign-in failed: ${error?.message||"Unknown authentication error"}`;
}
