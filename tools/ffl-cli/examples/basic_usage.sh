#!/bin/bash
#
# Basic usage examples for friction-report CLI
#

# Configuration
export TELNYX_FRICTION_ENDPOINT="https://ffl-backend.telnyx.com/v2/friction"
export TELNYX_API_KEY="<your-dev-api-key>"  # Replace with your actual API key

echo "=== Example 1: Parameter mismatch ==="
friction-report \
  --skill telnyx-webrtc-python \
  --team webrtc \
  --type parameter \
  --severity major \
  --message "API expects 'certificate' but docs say 'cert'" \
  --context '{"endpoint":"POST /v2/mobile_push_credentials","error":"422"}'

echo ""
echo "=== Example 2: API behavior issue ==="
friction-report \
  --skill telnyx-messaging-go \
  --team messaging \
  --type api \
  --severity blocker \
  --message "API returns 500 instead of documented 200" \
  --context '{"endpoint":"POST /v2/messages","expected":"200","actual":"500"}'

echo ""
echo "=== Example 3: Documentation unclear ==="
friction-report \
  --skill telnyx-voice-javascript \
  --team voice \
  --type docs \
  --severity minor \
  --message "Documentation doesn't explain required format for 'connection_id'" \
  --context '{"section":"Call Control API","parameter":"connection_id"}'

echo ""
echo "=== Example 4: Local mode (no backend call) ==="
friction-report \
  --skill test-skill \
  --team ai \
  --type api \
  --severity minor \
  --message "Testing local mode" \
  --output local

echo ""
echo "✅ All examples completed"
echo "Check ~/.openclaw/friction-logs/ for local reports"
