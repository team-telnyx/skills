#!/usr/bin/env python3
"""
Telnyx FFL CLI - CLI for reporting friction when using Telnyx APIs
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="telnyx-ffl-cli",
    version="0.1.0",
    author="Telnyx",
    description="CLI for reporting friction when using Telnyx APIs (Friction Feedback Loop)",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/team-telnyx/aifde-ffl-cli",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.7",
    install_requires=[
        "pyyaml>=6.0",
        "requests>=2.28.0",
    ],
    entry_points={
        "console_scripts": [
            "friction-report=telnyx_ffl_cli.cli:main",
        ],
    },
)
