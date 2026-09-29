# Local TLS Test Identity

This self-signed localhost identity is public test data, not a deployed credential.
It is used only by loopback regression servers to verify certificate pinning before
an HTTP request is sent. Never use this key outside tests.

Generated with OpenSSL: req -x509 -newkey rsa:2048 -nodes -days 36500 -subj /CN=localhost.
