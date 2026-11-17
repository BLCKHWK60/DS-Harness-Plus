# Tests: @local/dsh-tuning

156 tests in 8 files: test/app.test.mjs, test/libs.test.mjs, test/review.test.mjs, test/skill-bar.test.mjs, test/skill-care.test.mjs, test/skill-exam.test.mjs, test/skill-ideas.test.mjs, test/skills.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
