# Balance

Plugin `@local/dsh-balance` (dsh 0.2.2-rc.2). One line at the bottom of the sidebar with your DeepSeek balance.

## What you see

At the foot of the sidebar, above **More**: `Balance   $12.34`.

- **Press it** to read the balance again. It also reads again by itself every five minutes while the window is in view.
- **Point at it** to see every balance, where each comes from, and when it was read.
- With the sidebar narrowed to icons, only the amount is shown, without cents.
- A dash (—) means there is no balance to show. Point at it for the reason.

## Where the balance comes from

- **Your DeepSeek account**, when you are signed in to it in the app. Paid and bonus balances are added together per currency.
- **Your DeepSeek API key**, when the app has one saved (under the name `DEEPSEEK_API_KEY`, as Settings → Models saves it).

If both exist, the account's balance is the one shown, and the key's is in the pointer text. With several currencies, the first one that has money in it is shown.

## Settings

```yaml
- id: balance
  config:
    enabled: true
```

There is no settings page. Switch the add-on off under **Plugins** to take the line away.

## Good to know

- **What is sent:** your API key goes to DeepSeek's own address (`api.deepseek.com/user/balance`) and nowhere else. The account balance is read through the app's own account service. Nothing else leaves your Mac.
- The key stays in the app's server half. The page in the window never receives it, and error messages never contain it.
- A reading is kept for one minute, and pressing the line asks DeepSeek at most every ten seconds.
- It shows a balance, not what you spent. For spending, see the Usage ledger and the Budget guard.
- It only knows DeepSeek. Balances at other providers (OpenRouter, Anthropic and so on) are not shown.

## Why it exists

The third-party plugin "DeepSeek Balance" (`dsh-ds-balance`, up to 3.1.1) shows nothing in app version 0.2.2: it calls `useAnchoredPosition`, which the app removed in 0.2.2, and crashes when it draws. This add-on is a small replacement that does not depend on it. The two can be installed together; the other one simply stays empty until its author fixes it.

## Not built

- A warning when the balance is low.
- A choice of which currency or which source to show first.
- A history of the balance.

## Code

`lib/balance.js` (reading and adding up the balances), `index.js` (the `GET/POST /dsh-balance/data` route), `client.js` (the line in the sidebar). Tests: `test/balance.test.mjs`.

## Tested

In the lab (web version) on 2026-11-12: the line appeared at the foot of the Cowork sidebar above More; with a made-up key, DeepSeek's real service refused it and the line showed a dash with "DeepSeek refused the API key." in the pointer text. Not tested in the lab: a real balance (no real key or account is used there), the signed-in account (unit tests only), the narrow sidebar, pressing the line.
