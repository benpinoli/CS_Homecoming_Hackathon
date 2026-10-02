import os

# Tests never call the real API; this just lets Settings() load without a real key.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
