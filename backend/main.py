# Solar AI-Optimizer V2 — Entry point for deployment
# This file imports the app from main_fastapi.py
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT

from main_fastapi import app  # noqa: F401
