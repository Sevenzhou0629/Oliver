# Product Requirements Document — CardPilot

## North star

At the beginning of each month, each of two household members opens an iOS app and sees all usable recurring benefits, relevant current public promotions, deadlines, the right card to use, spending progress, and real savings they have confirmed — across two people's credit card portfolios.

## Personas & inventory

Two partners in the Seattle area who frequently travel for skiing and beach vacations, hold Ikon Pass, and use points for travel. Their household has many overlapping credit cards, including separate primary accounts and authorized-user cards. For initial setup, seed the card names in `fixtures/card-catalog.json` but require mapping/confirmation after Plaid Link. Real ownership or account identifiers are not included in fixtures.

## User flows

### Onboarding
1. Sign in, create household, send invitation, have second member independently accept.
2. Review seeded cards and mark holder, issuer, product, annual fee, anniversary if known, and whether account is independent primary or authorized user.
3. Connect each member's institutions via Plaid Link, verify card product/account mapping manually. Allow unsupported accounts to remain manual.
4. Consent settings: transaction sharing at household summary or detail levels; disconnect anytime.
5. Choose points value assumptions and source preference (official > USCreditCardGuide).

### Monthly home
- "Available this month", "Expiring soon", "Possibly used", "Confirmed savings", "Need activation".
- Aggregate all recurring benefits over their real cycles; avoid counting yearly credit as monthly cash.
- Show owner/card badge; separate available balance, spend threshold and actual confirmed reward.
- Each row has source, terms, last validated time, expiry and linked transaction candidates.
- A monthly digest should be manually re-generatable; schedule for month-start thereafter.

### Offers discovery
- Search and filter by card, member, merchant, travel, grocery, restaurants, online shopping, geography, deadline and confidence.
- Sources in settings: official issuer/loyalty websites by default, USCreditCardGuide secondary; allow custom permitted public URLs.
- Show `Reported publicly / personal eligibility not verified` for targeted promotions.
- On offer detail: full structured terms, original source link, confidence, verified date, "Add to Card manually" guidance if necessary.
- Comparing an official source to backup: official eligibility and terms always win, but report conflicting or missing evidence.

### Spending
- Monthly and 12-month spending by merchant/category/member/card.
- Pending transactions clearly marked, excluded/deduplicated for posted totals.
- Option to classify PCC, Trader Joe's, T&T, Amazon, REI etc. for matching while preserving underlying merchant names.
- Show actual historical savings only with strong evidence; user can confirm/unconfirm.

### Wallet and recommended card
- List each card, annual fee, owner, renewal, recurring benefits, point earning rules.
- Merchant/category selection -> ranked cards by expected *incremental* reward, with assumptions shown.
- Compare earnings under point valuations; include category caps, portal restrictions and offer activation.
- No claim that a speculative high-value award redemption is guaranteed cash.

## UI tabs

Home, Discover, Spending, Wallet, Settings.

## Non-functional

- Accessible Dynamic Type, VoiceOver labels, dark mode.
- Useful mock UI with no linked institutions.
- Privacy: transparent consent, least privilege, data deletion, audit actions.
- Idempotent sync, resilient to bank disconnections, unavailable offers, search errors.
- UI identifies stale source and missing permissions rather than hiding incomplete data.

## Not in V1

- Automatically redeem benefits or activate Amex/Chase targeted offers.
- Import, obtain or store bank sign-in credentials outside official Plaid flow.
- Trading, payments, bill pay, card applications.
- Scraping personal offers behind bank authentication.
