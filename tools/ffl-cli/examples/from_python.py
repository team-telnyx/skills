#!/usr/bin/env python3
"""
Example: Using FrictionReporter as a Python library
"""

import os
from telnyx_ffl_cli import FrictionReporter

# Configure environment
os.environ["TELNYX_FRICTION_ENDPOINT"] = "https://ffl-backend.telnyx.com/v2/friction"
os.environ["TELNYX_API_KEY"] = "<your-dev-api-key>"  # Replace with your actual API key


def example_basic():
    """Basic friction reporting"""
    print("=== Example 1: Basic Usage ===")
    
    friction = FrictionReporter(
        skill='telnyx-webrtc-python',
        team='webrtc',
        output='remote'
    )
    
    result = friction.report(
        type='parameter',
        severity='major',
        message="API expects 'certificate' but docs say 'cert'",
        context={
            'endpoint': 'POST /v2/mobile_push_credentials',
            'attempted_param': 'cert',
            'correct_param': 'certificate'
        }
    )
    
    print(f"Result: {result}\n")


def example_auto_mode():
    """Auto mode (uses remote if API key available)"""
    print("=== Example 2: Auto Mode ===")
    
    friction = FrictionReporter(
        skill='telnyx-messaging-go',
        team='messaging',
        output='auto'  # Will use 'remote' since TELNYX_API_KEY is set
    )
    
    result = friction.report(
        type='api',
        severity='blocker',
        message="API returns 500 instead of documented 200",
        context={
            'endpoint': 'POST /v2/messages',
            'expected': '200',
            'actual': '500'
        }
    )
    
    print(f"Result: {result}\n")


def example_local_only():
    """Local mode (save to file only, no API call)"""
    print("=== Example 3: Local Mode ===")
    
    friction = FrictionReporter(
        skill='telnyx-voice-javascript',
        team='voice',
        output='local'
    )
    
    result = friction.report(
        type='docs',
        severity='minor',
        message="Documentation doesn't explain required format for 'connection_id'"
    )
    
    print(f"Result: {result}")
    print(f"File saved to: {result['local']['path']}\n")


def example_both_modes():
    """Both mode (save locally AND send remotely)"""
    print("=== Example 4: Both Mode ===")
    
    friction = FrictionReporter(
        skill='telnyx-numbers-python',
        team='numbers',
        output='both'
    )
    
    result = friction.report(
        type='auth',
        severity='blocker',
        message="Authentication fails with valid API key",
        context={
            'endpoint': 'GET /v2/available_phone_numbers',
            'http_status': 401,
            'error_code': 'unauthorized'
        }
    )
    
    print(f"Local: {result['local']}")
    print(f"Remote: {result['remote']}\n")


if __name__ == "__main__":
    print("Friction Reporting - Python Library Examples\n")
    
    example_basic()
    example_auto_mode()
    example_local_only()
    example_both_modes()
    
    print("✅ All examples completed")
    print("Check ~/.openclaw/friction-logs/ for local reports")
