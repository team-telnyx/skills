"""Validation logic for friction reports"""

import re
from typing import Dict, Any, List

VALID_TEAMS = ["webrtc", "messaging", "voice", "numbers", "ai", "fax", "iot", "default"]
VALID_LANGUAGES = ["javascript", "python", "go", "ruby", "java"]
VALID_TYPES = ["parameter", "api", "docs", "auth"]
VALID_SEVERITIES = ["blocker", "major", "minor"]

MAX_MESSAGE_LENGTH = 200


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


def validate_report(report: Dict[str, Any]) -> List[str]:
    """
    Validate friction report against schema.
    Returns list of validation errors (empty if valid).
    """
    errors = []

    # Required fields
    required = ["skill", "team", "type", "severity", "message"]
    for field in required:
        if field not in report or not report[field]:
            errors.append(f"Missing required field: {field}")

    # Team validation
    if "team" in report and report["team"] not in VALID_TEAMS:
        errors.append(f"Invalid team: {report['team']}. Must be one of: {', '.join(VALID_TEAMS)}")

    # Language validation (optional)
    if "language" in report and report["language"] and report["language"] not in VALID_LANGUAGES:
        errors.append(f"Invalid language: {report['language']}. Must be one of: {', '.join(VALID_LANGUAGES)}")

    # Type validation
    if "type" in report and report["type"] not in VALID_TYPES:
        errors.append(f"Invalid type: {report['type']}. Must be one of: {', '.join(VALID_TYPES)}")

    # Severity validation
    if "severity" in report and report["severity"] not in VALID_SEVERITIES:
        errors.append(f"Invalid severity: {report['severity']}. Must be one of: {', '.join(VALID_SEVERITIES)}")

    # Message length
    if "message" in report and len(report["message"]) > MAX_MESSAGE_LENGTH:
        errors.append(f"Message too long: {len(report['message'])} chars (max {MAX_MESSAGE_LENGTH})")

    # Message should not be empty
    if "message" in report and not report["message"].strip():
        errors.append("Message cannot be empty")

    # Security: check for XSS patterns
    if "message" in report:
        xss_patterns = [r"<script", r"javascript:", r"onerror=", r"onclick="]
        for pattern in xss_patterns:
            if re.search(pattern, report["message"], re.IGNORECASE):
                errors.append(f"Message contains potentially unsafe content: {pattern}")

    return errors


def validate_and_raise(report: Dict[str, Any]) -> None:
    """Validate report and raise ValidationError if invalid"""
    errors = validate_report(report)
    if errors:
        raise ValidationError("\n".join(errors))
