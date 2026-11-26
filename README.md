# Shout Family

Family runs, dinner, jobs and shouts, in one place instead of the group chat.

## What's in it (chat-first, v2)

- **Chats like Messages:** the family chat, a Fun chat, and smaller chats ("The boys"). New chats default to whoever's home.
- **Type normally:** "Going to GYG" becomes a run, "Bring the washing in" a job, "Pick up Emmett" a lift, "Who's home for dinner?" a dinner check. Every card has Undo.
- **Replies do the work:** typing while a run is open offers "Add this to Steve's GYG run?". "Can I have KFC?" asks the buyer to add a stop. Press and hold any message for I've got it / On my way / Not me.
- **Suggestions:** phrase chips above the text box (learned from what you send), with optional Who / Where / When add-ons that stay tappable after sending.
- **Run links for people without the app:** share a run into any chat, and guests add an order with no sign-in.
- **Fun chat:** Instagram, TikTok and YouTube links go there automatically, with Actually good / Not for me feedback for the sender. Photos too.
- **Status and Life360:** tap Home / Work / Out / Away (no location tracking), plus an Open Life360 button.
- **Balances, calendar, under-18 rules** as before.

Message detection is rule-based (`src/intents.ts`) for now.

## Testing

`VITE_EMU=1 npm run build` makes a build that talks to local Firebase emulators (Firestore on 8085, Auth on 9099) and exposes `window.__emuSignIn(uid, email, name)` for scripted tests.

## Run it

```
npm install
npm run dev
```

Build: `npm run build` (static output in `dist/`, works from any static host).
