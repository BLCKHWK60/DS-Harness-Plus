# Plus Recon

An extra download for **DeepSeek Harness Plus**. Read this page before you install it.

## What Recon is

Recon is a separate, isolated tab for research. It can reach **.onion sites through Tor** and read **Usenet newsgroups**, as text. Its conversations are kept apart from the rest of the app: they have only Recon's own tools and share nothing with your other conversations.

## Read this first

- **Recon reaches Tor and Usenet.** Those networks hold material that is illegal or harmful in many countries, and what you open there can have consequences.
- **You are responsible for what you do with it.** You use Recon only for lawful purposes and according to the laws and rules where you live and on the services you use. The people who made Plus and this download are not responsible for how you use it.
- **Recon is not a way to hide.** It sends your reading through Tor and, if you set it up, a VPN, but nothing here makes you anonymous or safe. Your provider, your Mac and what you type can still identify you.
- **Privacy rules.** A Recon conversation is isolated: nothing from your other conversations comes in, and nothing from it goes to them. It reads text only, with its own tools. If the model is a cloud model, what Recon finds is held back until you type `/recon cloud` on purpose. "End and wipe" clears the run's room. Logins for Usenet servers and VPN files are kept in the macOS Keychain, not in a file and not shown to the model. Searches and reads do go out, through Tor, Usenet or the Internet Archive.
- **You need Tor.** Recon needs the `tor` program (`brew install tor`). Plus does not install it.
- **It is off until you switch it on.** The installer adds Recon switched off. You switch it on yourself, in Plugins and then in Settings → Recon.

The installer asks you to type an agreement before it copies anything.

## Install

1. Install the **main** DeepSeek Harness Plus download first (the same version number as this one).
2. Double-click **`Install Recon.command`**. If macOS blocks it, follow the same steps as for the main installer: System Settings → Privacy & Security → **Open Anyway**.
3. Read the warning in the Terminal window and type `I AGREE` to continue.
4. Open DeepSeek Harness. In **Plugins**, switch **Recon** on, then set it up in **Settings → Recon**.

It does not change any other add-on. Installing again updates Recon and keeps its settings.

## Remove

Double-click **`Uninstall Recon.command`**. It removes Recon only. It prints what stays (Recon's data folder, Keychain logins) and offers, optionally, to remove Recon's data folder too. It asks twice, and the default is No.

## Updating Plus later

Updating the main Plus download keeps an installed Recon exactly as it is. To update Recon, use the matching Plus Recon download.
