# Telnyx Agent Skills

Official skills for AI coding agents to integrate Telnyx APIs using the native SDKs.

These skills follow the [Agent Skills specification](https://agentskills.io/specification) and can be installed in AI coding assistants like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Cursor, Windsurf, and other compatible agents.

## Available Skills

Skills are organized by product and language. Each skill teaches an AI agent how to use Telnyx SDKs correctly with production-ready code examples.

### Products

| Product | Description |
|---------|-------------|
| **Messaging** | |
| `telnyx-messaging-*` | Send/receive SMS/MMS, manage messaging numbers, handle opt-outs |
| `telnyx-messaging-profiles-*` | Messaging profiles, number pools, short codes |
| `telnyx-messaging-hosted-*` | Hosted SMS numbers, toll-free verification, RCS |
| `telnyx-10dlc-*` | 10DLC brand/campaign registration for A2P compliance |
| **Voice** | |
| `telnyx-voice-*` | Call control: dial, answer, hangup, transfer, bridge |
| `telnyx-voice-media-*` | Audio playback, text-to-speech, call recording |
| `telnyx-voice-gather-*` | DTMF/speech input collection, AI-powered gather |
| `telnyx-voice-streaming-*` | Real-time audio streaming, forking, transcription |
| `telnyx-voice-conferencing-*` | Conference calls, queues, multi-party sessions |
| `telnyx-voice-advanced-*` | DTMF sending, SIPREC, noise suppression, supervisor |
| `telnyx-texml-*` | TeXML (TwiML-compatible) voice applications |
| **Connectivity** | |
| `telnyx-sip-*` | SIP trunking connections, outbound voice profiles |
| `telnyx-sip-integrations-*` | Call recordings, media storage, Dialogflow integration |
| `telnyx-webrtc-*` | WebRTC credentials and mobile push notifications |
| **Phone Numbers** | |
| `telnyx-numbers-*` | Search, order, and manage phone numbers |
| `telnyx-numbers-config-*` | Phone number configuration and settings |
| `telnyx-numbers-compliance-*` | Regulatory requirements, bundles, documents |
| `telnyx-numbers-services-*` | Voicemail, voice channels, E911 |
| `telnyx-porting-in-*` | Port numbers into Telnyx |
| `telnyx-porting-out-*` | Manage port-out requests |
| **Identity & AI** | |
| `telnyx-verify-*` | Phone verification, number lookup, 2FA |
| `telnyx-ai-assistants-*` | AI voice assistants with knowledge bases |
| `telnyx-ai-inference-*` | LLM inference, embeddings, AI analytics |
| **Other** | |
| `telnyx-iot-*` | IoT SIM cards, eSIMs, data plans |
| `telnyx-networking-*` | Private networks, VPN gateways |
| `telnyx-storage-*` | S3-compatible cloud storage |
| `telnyx-video-*` | Video rooms and conferencing |
| `telnyx-fax-*` | Programmable fax |
| `telnyx-oauth-*` | OAuth 2.0 authentication flows |
| **Account** | |
| `telnyx-account-*` | Balance, payments, invoices, webhooks, audit logs |
| `telnyx-account-access-*` | Addresses, auth providers, IP access, billing groups |
| `telnyx-account-management-*` | Sub-account management (resellers) |
| `telnyx-account-notifications-*` | Notification channels and settings |
| `telnyx-account-reports-*` | Usage reports for billing and analytics |

### Languages

Each product is available for:
- **JavaScript** (`-javascript`)
- **Python** (`-python`)
- **Go** (`-go`)
- **Java** (`-java`)
- **Ruby** (`-ruby`)

## Installation

### Claude Code

First, add the Telnyx skills marketplace:

```bash
/plugin marketplace add team-telnyx/skills
```

Then install the plugin for your language. Each plugin includes all 35 Telnyx products (messaging, voice, numbers, IoT, AI, and more):

#### Python
```bash
/plugin install telnyx-python@team-telnyx/skills
```

#### JavaScript / Node.js
```bash
/plugin install telnyx-javascript@team-telnyx/skills
```

#### Go
```bash
/plugin install telnyx-go@team-telnyx/skills
```

#### Java
```bash
/plugin install telnyx-java@team-telnyx/skills
```

#### Ruby
```bash
/plugin install telnyx-ruby@team-telnyx/skills
```

### Other Agents

For Cursor, Windsurf, and other agents that support the [Agent Skills specification](https://agentskills.io/specification), copy the desired skill directory to your agent's skills location or reference the `SKILL.md` file directly.

## Skill Structure

Each skill contains a single `SKILL.md` file with:
- YAML frontmatter (name, description, metadata)
- Installation instructions for the SDK
- A setup section with client initialization (shown once)
- Concise code examples for every API operation
- Webhook event reference tables where applicable

All code examples are extracted directly from Telnyx OpenAPI specifications and are guaranteed to work with the latest SDK versions.

## Example

After installing `telnyx-messaging-python`, your AI agent will know how to:

```python
# Setup (shown once at top of skill)
from telnyx import Telnyx
client = Telnyx()

# Send an SMS
response = client.messages.send(
    from_="+15551234567",
    to="+15559876543",
    text="Hello from Telnyx!",
)
```

## Documentation

- [Telnyx Developer Docs](https://developers.telnyx.com)
- [Telnyx API Reference](https://developers.telnyx.com/api)
- [Agent Skills Specification](https://agentskills.io/specification)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Note:** Code examples are auto-generated from Telnyx OpenAPI specs. To fix a code example, please open an issue describing the problem rather than editing the code directly.

## Support

For issues with these skills, please [open an issue](https://github.com/team-telnyx/skills/issues) in this repository.

For Telnyx API support, visit [support.telnyx.com](https://support.telnyx.com).

## License

MIT License - see [LICENSE](LICENSE) for details.
