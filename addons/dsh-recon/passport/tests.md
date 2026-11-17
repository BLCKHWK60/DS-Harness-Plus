# Tests: @local/dsh-recon

100 tests in 18 files: test/accounts.test.mjs, test/boards.test.mjs, test/clearnet.test.mjs, test/connection.test.mjs, test/door.test.mjs, test/export.test.mjs, test/isolation.test.mjs, test/onion.test.mjs, test/page.test.mjs, test/recon.test.mjs, test/restore.test.mjs, test/room.test.mjs, test/settings.test.mjs, test/tabs.test.mjs, test/ultra.test.mjs, test/usenet.test.mjs, test/vpn.test.mjs, test/web.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
