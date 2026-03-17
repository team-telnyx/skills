# Telnyx Skills For Codex

This `codex/` directory is a generated projection of the public Telnyx skills repository for Codex-style installs.

Use these skills when a task involves Telnyx APIs, SDKs, WebRTC client SDKs, or Twilio-to-Telnyx migration work.

Choose the smallest relevant scope:

First choose a bundle:
- `telnyx-curl`
- `telnyx-go`
- `telnyx-java`
- `telnyx-javascript`
- `telnyx-python`
- `telnyx-ruby`
- `telnyx-webrtc-client`
- `telnyx-twilio-migration`
- `telnyx-cli`

Then choose the narrowest relevant skill by exact ID, for example:
- `telnyx-messaging-python`
- `telnyx-voice-javascript`
- `telnyx-numbers-curl`
- `telnyx-webrtc-client-ios`
- `telnyx-twilio-migration`

Selection rules:

- Match the language bundle to the project stack.
- Prefer one narrow product skill over loading a large set of unrelated skills.
- Use `telnyx-curl` when the user wants REST-first examples or no SDK language is fixed.
- Use `telnyx-webrtc-client` for device-side calling apps and client SDK setup.
- Use `telnyx-twilio-migration` for migration planning, migration execution, or Twilio compatibility questions.
- Use `telnyx-cli` only when the task is specifically about the Telnyx CLI.

Bundle notes:

- `telnyx-python`, `telnyx-javascript`, `telnyx-go`, `telnyx-java`, and `telnyx-ruby` are the server-side SDK bundles.
- `telnyx-curl` is the language-agnostic REST reference bundle.
- `telnyx-webrtc-client` covers JS, iOS, Android, Flutter, and React Native client SDKs.
- `telnyx-twilio-migration` is the cross-product migration guide.

Generated file:

- Do not edit `codex/skills/...` by hand.
- Edit the canonical source skill directories and regenerate this projection instead.
