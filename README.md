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

Data is saved on the device for now. On the **Me** tab you can switch person to test the app from each family member's side. Shared accounts and live sync come next.

## Run it

```
npm install
npm run dev
```

Build: `npm run build` (static output in `dist/`, works from any static host).
