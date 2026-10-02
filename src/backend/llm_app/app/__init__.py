import truststore

# Verify HTTPS with the OS certificate store, so antivirus HTTPS scanning (e.g. Avast)
# and corporate proxies don't break calls to the Claude API.
truststore.inject_into_ssl()
