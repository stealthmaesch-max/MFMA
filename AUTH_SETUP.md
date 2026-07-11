# MFMAFLAG Authentication Setup

1. Confirm GitHub and Google are enabled in Firebase Authentication.
2. Under Authentication > Settings > Authorized domains, add:
   stealthmaesch-max.github.io
3. Upload this build to the manager branch.
4. Open control.html and sign in once with GitHub.
5. Copy the Firebase UID using the Copy UID button.
6. Sign out, then sign in once with Google.
7. Copy the Google Firebase UID.
8. Open database.rules.secure.template.json and replace both UID placeholders.
9. Paste the completed rules into Firebase Realtime Database > Rules and publish.

Do not publish the secure rules until both sign-in methods work.
