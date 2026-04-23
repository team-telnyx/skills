#!/usr/bin/env python3
"""
Example: Integrating friction reporting into a Telnyx skill

This shows the recommended pattern for adding friction reporting
to your Telnyx skills.
"""

import os
from telnyx_ffl_cli import FrictionReporter

# Configure (these would typically be set in skill environment)
os.environ["TELNYX_FRICTION_ENDPOINT"] = "https://ffl-backend.telnyx.com/v2/friction"
os.environ["TELNYX_API_KEY"] = os.environ.get("TELNYX_API_KEY", "<your-dev-api-key>")


class TelnyxWebRTCSkill:
    """Example skill with friction reporting"""
    
    def __init__(self):
        # Initialize friction reporter once
        self.friction = FrictionReporter(
            skill='telnyx-webrtc-python-example',
            team='webrtc',
            output='auto'  # remote if API key available, else local
        )
    
    def create_push_credential(self, certificate: str, platform: str):
        """
        Create mobile push credential
        
        Common friction point: docs say 'cert' but API expects 'certificate'
        """
        try:
            # Attempt API call (simulated)
            response = self._api_call_simulated(
                endpoint='POST /v2/mobile_push_credentials',
                data={'certificate': certificate, 'platform': platform}
            )
            return response
            
        except ParameterError as e:
            # Report parameter mismatch friction
            self.friction.report(
                type='parameter',
                severity='major',
                message=f"Parameter name mismatch: {e}",
                context={
                    'endpoint': 'POST /v2/mobile_push_credentials',
                    'error': str(e),
                    'attempted_param': 'cert',
                    'correct_param': 'certificate'
                }
            )
            raise
    
    def make_call(self, connection_id: str, to: str, from_: str):
        """
        Make an outbound call
        
        Common friction point: unclear error messages
        """
        try:
            response = self._api_call_simulated(
                endpoint='POST /v2/calls',
                data={'connection_id': connection_id, 'to': to, 'from': from_}
            )
            return response
            
        except APIError as e:
            if 'connection_id' in str(e) and e.status_code == 422:
                # Report unclear error message
                self.friction.report(
                    type='docs',
                    severity='minor',
                    message="Error message doesn't explain valid connection_id format",
                    context={
                        'endpoint': 'POST /v2/calls',
                        'error': str(e),
                        'parameter': 'connection_id',
                        'suggestion': 'Add format example to error message'
                    }
                )
            raise
    
    def authenticate(self, api_key: str):
        """
        Authenticate with Telnyx API
        
        Common friction point: authentication failures with valid keys
        """
        try:
            response = self._auth_simulated(api_key)
            return response
            
        except AuthError as e:
            # Report authentication issue
            self.friction.report(
                type='auth',
                severity='blocker',
                message=f"Authentication failed with valid API key: {e}",
                context={
                    'endpoint': 'Authentication',
                    'key_format': 'KEY...' if api_key.startswith('KEY') else 'unknown',
                    'error': str(e)
                }
            )
            raise
    
    def _api_call_simulated(self, endpoint: str, data: dict):
        """Simulated API call (for example purposes)"""
        # In real skill, this would be actual Telnyx SDK call
        print(f"[API CALL] {endpoint} with {data}")
        return {"status": "success"}
    
    def _auth_simulated(self, api_key: str):
        """Simulated auth (for example purposes)"""
        print("[AUTH] Authenticating with key: ***REDACTED***")
        return {"authenticated": True}


# Custom exceptions (for example)
class ParameterError(Exception):
    pass

class APIError(Exception):
    def __init__(self, message, status_code=500):
        super().__init__(message)
        self.status_code = status_code

class AuthError(Exception):
    pass


# Example usage
if __name__ == "__main__":
    print("=== Skill Integration Example ===\n")
    
    skill = TelnyxWebRTCSkill()
    
    # Example 1: Successful call (no friction)
    print("1. Making a call (success)...")
    try:
        skill.make_call(
            connection_id='abc123',
            to='+15555551234',
            from_='+15555554321'
        )
        print("✅ Call successful\n")
    except Exception as e:
        print(f"❌ Call failed: {e}\n")
    
    # Example 2: Parameter error (reports friction)
    print("2. Creating push credential with parameter mismatch...")
    try:
        # Simulating the error that would happen
        raise ParameterError("Unknown parameter 'cert'")
    except ParameterError as e:
        try:
            skill.create_push_credential(
                certificate='cert-data-here',
                platform='ios'
            )
        except:
            pass
        print(f"❌ Parameter error (friction reported)\n")
    
    print("✅ Example completed")
    print("Check ~/.openclaw/friction-logs/ or backend for friction reports")
