# Shout Family

Family runs, dinner, jobs and shouts, in one place instead of the group chat.

## Version 1 (this build)

- **Home:** each family member's circle, with a ring if they owe an answer, plus open cards and a balances summary.
- **Run:** "I'm going to…" (Maccas, GYG, KFC, Coles, Woolies, IGA, Dan Murphy's, Other). People add orders from saved usuals, ask for an extra stop, or tap "Not me". The buyer locks the run, ticks items off, marks "can't get" items, then enters amounts, which become IOUs.
- **Dinner:** who's home tonight, plus a vote. A winning takeaway turns into a run with one tap.
- **Job:** post it, someone taps "I've got it", then "Done", and it's logged as a favour.
- **Shout:** log a favour or money by hand.
- **Balances:** net money per person, favours, recent shouts, settle up.
- **Calendar:** anything with a time.
- **Under-18 rules:** bottle shop runs are hidden from under-18s.

Everyone signs in with Google, and the family's data syncs live through Firebase (Firestore). Invite people from the **Me** tab: the link adds them to your group.

## Firebase

- Project: `shout-families`
- Database rules: `firestore.rules`. Only group members can read or write a group's cards and balances. A group can be opened by anyone with its invite link.
- Every push to `main` builds the app and publishes it to https://shout-families.web.app, along with the database rules (`.github/workflows/deploy.yml`). This needs a GitHub secret called `FIREBASE_SERVICE_ACCOUNT`.

## Run it

```
npm install
npm run dev
```

Build: `npm run build` (static output in `dist/`, works from any static host).
