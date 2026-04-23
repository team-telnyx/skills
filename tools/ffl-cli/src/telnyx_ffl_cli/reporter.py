"""Friction reporter - handles local/remote report submission"""

import os
import json
import yaml
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from .validators import validate_and_raise, ValidationError


class FrictionReporter:
    """Report friction to local files or remote backend"""

    DEFAULT_LOCAL_DIR = Path.home() / ".openclaw" / "friction-logs"
    
    DEFAULT_ENDPOINT = "https://ffl-backend.telnyx.com/v2/friction"

    def __init__(
        self,
        skill: str,
        team: str,
        language: Optional[str] = None,
        output: str = "auto",
        local_dir: Optional[str] = None,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        self.skill = skill
        self.team = team
        self.language = language or self._detect_language()
        self.output = output
        self.local_dir = Path(local_dir) if local_dir else self.DEFAULT_LOCAL_DIR
        self.api_key = api_key or os.getenv("TELNYX_API_KEY")
        
        # Priority: parameter > env var > default
        self.endpoint = endpoint or os.getenv("TELNYX_FRICTION_ENDPOINT") or self.DEFAULT_ENDPOINT

        # Auto mode: use remote if endpoint and API key available, else local
        if self.output == "auto":
            self.output = "remote" if (self.endpoint and self.api_key) else "local"

    def _detect_language(self) -> str:
        """Try to detect language from environment"""
        # Could check for interpreter path, but default to 'python' for now
        return "python"

    def report(
        self,
        type: str,
        severity: str,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Report friction.

        Args:
            type: Friction type (parameter, api, docs, auth)
            severity: Severity level (blocker, major, minor)
            message: Brief description
            context: Additional context (optional)

        Returns:
            Report dict with status
        """
        # Build report
        report = {
            "skill": self.skill,
            "team": self.team,
            "language": self.language,
            "type": type,
            "severity": severity,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        if context:
            report["context"] = context

        # Validate
        try:
            validate_and_raise(report)
        except ValidationError as e:
            raise ValueError(f"Invalid friction report: {e}")

        # Save/send based on output mode
        results = {}

        if self.output in ["local", "both"]:
            results["local"] = self._save_local(report)

        if self.output in ["remote", "both"]:
            results["remote"] = self._send_remote(report)

        return results

    def _save_local(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """Save report to local YAML file"""
        self.local_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename: friction-YYYY-MM-DDTHH-MM-SS-SSSZ.yaml
        timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S")
        filename = f"friction-{timestamp}.yaml"
        filepath = self.local_dir / filename

        # Write YAML
        with open(filepath, "w") as f:
            yaml.dump(report, f, default_flow_style=False, sort_keys=False)

        return {
            "status": "saved",
            "path": str(filepath),
        }

    def _send_remote(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """Send report to remote backend"""
        if not self.api_key:
            return {
                "status": "skipped",
                "reason": "No API key available",
            }

        if not self.endpoint:
            return {
                "status": "skipped",
                "reason": "No endpoint configured",
            }

        try:
            response = requests.post(
                self.endpoint,
                json=report,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=5,
            )

            if response.status_code >= 200 and response.status_code < 300:
                return {
                    "status": "sent",
                    "endpoint": self.endpoint,
                }
            else:
                return {
                    "status": "failed",
                    "error": f"HTTP {response.status_code}: {response.text}",
                }
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
            }
