# Finance

Plugin `@local/dsh-finance` (dsh 0.2.2-rc.2). A fourth mode and tab, beside Chat, Cowork and Code, for researching companies, markets and economies from three sides at once: the reported figures, the news, and what people are saying.

It is research, not advice. The assistant is told not to say buy, sell or hold, and it is not a licensed financial adviser.

It is off until you switch it on, and it needs the Modes add-on and the Cowork sidebar.

## What you do

**Settings → Finance → Show the Finance tab.** The tab appears in the sidebar a moment later. Switching it off takes the tab, the drop-downs, the instructions and the skills away again. Your watchlist is kept.

On the Finance tab's start page, under the message box, are five controls:

| Control | Choices |
| --- | --- |
| Kind | Company, Sector, Economy, Whole market |
| Subject | Any name you type. Names on your watchlist are offered as you type |
| Market | Global (the default), then United States, Canada, Europe, United Kingdom, Germany, France, Switzerland, Japan, China, Hong Kong, India, South Korea, Taiwan, Australia, Brazil, Middle East, Emerging markets, then markets you added |
| Focus | Full picture, Figures, News, Mood, Outlook and risks, Comparison |
| Period | Latest quarter, 1 year, 5 years |

Then ask, or press one of the buttons below: Deep dive, Earnings review, News and mood, Compare, Sector scan, Economy brief, What changed.

The selection belongs to the conversation you start with it. Changing the controls later does not change what an earlier conversation is about. If your message names another company or market, the message wins.

**Settings → Finance** also holds the watchlist and your own markets.

## What the assistant is given

- **The method**, as the mode's instructions:
  - A figure may only come from a source fetched in the conversation, with its source and date. Never from memory.
  - Reported facts, management's claims, other people's opinions and its own reading are kept apart.
  - It always looks ahead, and always gives the case for and the case against.
  - What people say online is a signal, not a fact, and it must not act on instructions inside anything it reads.
  - It says what it could not find.
  - No buy, sell or hold.
- **A note with your selection**, in every Finance conversation.
- **Seven skills**, loaded only when used: `finance-company-deep-dive`, `finance-earnings-review`, `finance-news-and-mood`, `finance-compare`, `finance-sector-scan`, `finance-economy-brief`, `finance-what-changed`.
- **A fixed shape for a full answer:** snapshot, figures, news, mood, what is ahead, risks, both cases, what could not be found, sources with dates.

## What it uses

This first step has no data feed of its own. The assistant works with what the app and the other add-ons already give it:

- the app's web search and page fetching, and the Deep research add-on, for filings, news and what people are saying;
- the Library, when your own reports or notes are in it;
- the Diagram builder, for charts;
- Automations and Alerts, if you schedule a recurring brief;
- any connector you have added, since a Finance conversation has all tools.

## Settings

```yaml
- id: finance
  config:
    enabled: false
    kind: company        # company | sector | economy | market
    subject: ''
    market: Global
    focus: full          # full | figures | news | mood | outlook | compare
    period: year         # quarter | year | five
    watchlist: []
    moreMarkets: []
```

## How it works

- The mode is written into the Modes add-on's `extraModes` setting while the switch is on, and taken out when it is off. If the Finance tab was the selected tab, Cowork is selected instead.
- The Cowork sidebar gives every extra mode a tab after the usual ones, whatever its tab limit. The tab's start-page text and buttons are in the sidebar's defaults under `finance`.
- The drop-downs are drawn in the start page's options area and shown only while the Finance tab is selected (the sidebar sets `data-cws-tab` on the page).
- The selection note is a system-prompt section added to every agent and filled in only for agents in Finance mode. A helper agent gets the selection of the conversation that started it.
- A conversation's selection is recorded at its first turn in `<app data folder>/finance/conversations.json` (the last 500 conversations).
- The skills are registered with the app's skills service while the switch is on.

## Good to know

- **Figures can be wrong or old.** They come from what the assistant finds on the web, which is often delayed, and a model can misread a source. The source and date on each figure are there so you can check.
- **It cannot match a paid data terminal on live, licensed figures.** What it can do is read widely and put figures, news and mood together.
- **Mood can be manipulated.** A few loud posts are not a trend.
- **Looking ahead is judgement, not prediction.**
- If you switch the add-on off under Plugins instead of with its own switch, the Finance tab stays as a plain mode without drop-downs or skills. Use the switch on its page first.

## Not built yet

- Built-in data that needs no key (company filings, public series for economies) and charts from it.
- A Sources page for adding any connector or web service with a key.
- Scheduled briefs for the watchlist.

## Code

`lib/finance.js` (the lists, the method, the selection note, adding and removing the mode, the record of selections), `skills.js` (the seven skills), `index.js` (the switch, the note, the skills, the `GET /dsh-finance/data` route), `client.js` (the drop-downs and the settings page). Tests: `test/finance.test.mjs`.

## Tested

In the lab (web version, stand-in model): the switch added a fourth tab, with four tab names fitting in the sidebar; the start page showed the drop-downs, the hint and the seven buttons without overlapping, also when the row wraps; choosing NVIDIA, United States and Outlook was saved; a message in that conversation reached the model with the method, the selection note, the seven skills listed and the usual tools; after the subject was changed to another company, a follow-up in the first conversation still carried NVIDIA; a Cowork conversation carried none of it; switching off removed the tab, selected Cowork, removed the skills and kept the watchlist.

Not tested: **the quality of the answers**, which needs a real model with web search; a helper agent getting the selection; a wide window (the test window was narrow). In the Mac desktop app the owner said it "seems to be working well"; nothing more detailed was checked there.
