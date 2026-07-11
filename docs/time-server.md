# Running your own trusted time server

Lockasaur checks a file's expiration date against a trusted time source before decrypting it. The default source is Cloudflare's public NTS server (`time.cloudflare.com`), but Settings > Trusted time > Custom accepts any server that speaks **Network Time Security (RFC 8915)**. This document specifies exactly what the app sends and what your server must return, so you can point it at an off-the-shelf NTS server or implement your own.

The app never sends the file, its name, its password or any other user data to the time server. The exchange below is the entirety of the traffic, and it only happens when the file being decrypted carries an expiration.

## Protocol summary

NTS runs in two phases:

1. **NTS Key Establishment (NTS-KE)**: a short TLS 1.3 exchange on TCP port 4460 that negotiates parameters, hands out cookies and derives two AEAD keys from the TLS session.
2. **NTS-protected NTP**: one NTPv4 request/response pair over UDP (port 123 by default), authenticated with those keys.

## Phase 1: NTS-KE (what the app sends)

The app opens a TLS connection with:

- TLS 1.3 minimum (lower versions are refused)
- ALPN `ntske/1` (the connection is aborted if the server negotiates anything else)
- SNI set to the configured hostname
- Certificate verification against the operating system trust store. Private CAs and self-signed certificates are not supported, so your server needs a certificate the OS already trusts (for example via Let's Encrypt).

It then writes three records (each record is `u16 type | u16 body length | body`, big-endian; the high bit of the type is the "critical" flag):

| Record | Type | Body |
|---|---|---|
| NTS Next Protocol Negotiation (critical) | 1 | `0x0000` (NTPv4) |
| AEAD Algorithm Negotiation | 4 | `0x000F` (AEAD_AES_SIV_CMAC_256) |
| End of Message (critical) | 0 | empty |

## Phase 1: NTS-KE (what the server must return)

A record stream ending in End of Message, containing at least:

| Record | Type | Requirement |
|---|---|---|
| NTS Next Protocol Negotiation | 1 | exactly `0x0000` (NTPv4); anything else is rejected |
| AEAD Algorithm Negotiation | 4 | exactly `0x000F`; anything else is rejected |
| New Cookie | 5 | at least one cookie (opaque bytes; the app uses one per NTP request) |
| NTPv4 Server Negotiation | 6 | optional: an ASCII hostname the NTP phase should use instead of the KE host |
| NTPv4 Port Negotiation | 7 | optional: `u16` port for the NTP phase (default 123) |
| End of Message | 0 | required terminator |

An Error record (type 2) aborts the exchange, as does any unknown record with the critical bit set. Unknown non-critical records and Warning records (type 3) are skipped.

### Key derivation

Both sides derive two 32-byte keys from the TLS session using the RFC 8446 exporter interface:

- label: `EXPORTER-network-time-security`
- context: 5 bytes: `u16` protocol ID (`0x0000`) + `u16` AEAD ID (`0x000F`) + one direction byte (`0x00` for client-to-server, `0x01` for server-to-client)
- length: 32 bytes per key

## Phase 2: NTS-protected NTPv4 (what the app sends)

One UDP datagram: a 48-byte NTPv4 header (leap 0, version 4, mode 3) followed by three extension fields, each padded to a 4-byte boundary (`u16 type | u16 total length | body`):

| Extension field | Type | Body |
|---|---|---|
| Unique Identifier | 0x0104 | 32 random bytes |
| NTS Cookie | 0x0204 | one cookie from the KE phase |
| NTS Authenticator and Encrypted Extension Fields | 0x0404 | `u16 nonce length`, `u16 ciphertext length`, nonce, ciphertext, padding |

The transmit timestamp in the header is random (it only needs to be echoed back; a real clock value would fingerprint the host).

The authenticator is AEAD_AES_SIV_CMAC_256 (RFC 5297) with the client-to-server key: associated data is every packet byte preceding the authenticator field, the nonce is 16 random bytes (passed to S2V as the final associated-data component), and the plaintext is empty, so the ciphertext is just the 16-byte SIV tag.

## Phase 2: NTS-protected NTPv4 (what the server must return)

One UDP datagram the app validates as follows, rejecting on any failure:

- NTP header mode 4 (server), stratum not 0 (stratum 0 is a kiss-of-death and is rejected)
- origin timestamp equal to the request's transmit timestamp
- a Unique Identifier extension field echoing the request's 32 bytes
- an NTS Authenticator extension field whose SIV tag verifies with the server-to-client key over every packet byte preceding it (same nonce-as-final-AD construction); extension fields after the authenticator are ignored
- the transmit timestamp (bytes 40..47) is the time verdict: 32-bit NTP seconds plus 32-bit fraction

The app converts NTP time to Unix time by picking the 136-year NTP era closest to the local clock, then sanity-bounds the verdict (roughly year 2020 through 9999); an implausible verdict counts as a failed lookup. NTP packets carry no era number, so a local clock off by more than about 68 years defeats era selection by design.

Fresh cookies for future requests may ride encrypted inside the response authenticator per RFC 8915; the app currently performs one exchange per lookup (cached for 60 seconds), so returning them is optional.

## Failure behavior

What happens when the server cannot be reached (or returns anything invalid) is the user's choice in Settings > Trusted time:

- **Fall back to clock** (default): the check proceeds against the local system clock and the result is flagged so the UI can say so.
- **Fail closed**: decrypting files that carry an expiration is refused with a `TIME_UNAVAILABLE` error until the server is reachable again. Files without an expiration are unaffected.

## Build your own

If you would rather implement the protocol than run an existing daemon, [examples/nts-server.js](examples/nts-server.js) (Node.js, no dependencies) and [examples/nts-server.py](examples/nts-server.py) (Python, `pyOpenSSL` plus `pycryptodome`) are complete minimal servers of about 250 lines each. They implement exactly the two phases above: an NTS-KE responder over TLS 1.3 that exports the c2s/s2c keys and issues cookies, and a UDP responder that authenticates the request and signs the reply. AES-SIV-CMAC-256 is built from the AES-128 primitives in the Node version (neither Node nor Electron exposes an SIV cipher) and comes from `pycryptodome` in the Python version.

Both stash the two session keys inside each cookie, sealed under a per-run master key, so the stateless UDP side can recover them. Rotate and persist that key for anything beyond a demo.

To run either one locally:

```
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 365 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

node examples/nts-server.js
# or
pip install pyOpenSSL pycryptodome
python3 examples/nts-server.py
```

That self-signed certificate is only good for local protocol testing: Lockasaur verifies the server certificate against the operating system trust store, so a deployment the app will trust needs a publicly trusted certificate (Let's Encrypt, for example) and TCP 4460 reachable. The examples default to KE on 4460 and NTP on 4461 (an unprivileged port, advertised through the NTPv4 Port Negotiation record); override with `NTS_KE_PORT` and `NTS_NTP_PORT`.

## Off-the-shelf servers

Any RFC 8915 implementation works. Two known-good options:

**chrony** (4.0+), in `/etc/chrony.conf`:

```
ntsservercert /etc/letsencrypt/live/nts.example.com/fullchain.pem
ntsserverkey  /etc/letsencrypt/live/nts.example.com/privkey.pem
ntsport 4460
allow
```

**ntpd-rs**, in `/etc/ntpd-rs/ntp.toml`:

```toml
[[server]]
listen = "[::]:123"

[[nts-ke-server]]
listen = "[::]:4460"
certificate-chain-path = "/etc/letsencrypt/live/nts.example.com/fullchain.pem"
private-key-path = "/etc/letsencrypt/live/nts.example.com/privkey.pem"
```

Both must be reachable on TCP 4460 (NTS-KE) and UDP 123 (NTP), and the certificate must chain to the client OS trust store. Point Settings > Trusted time > Custom at the hostname (no scheme, no port; the app always uses 4460 for KE and honors the server/port negotiation records for the NTP phase).
