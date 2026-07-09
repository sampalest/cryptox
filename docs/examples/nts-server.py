#!/usr/bin/env python3
# Minimal Network Time Security server (RFC 8915), Python.
#
# Speaks the exact exchange documented in docs/time-server.md, so Lockasaur (or
# any RFC 8915 client) can use it as a trusted time source:
#
#   1. NTS-KE over TLS 1.3 (TCP): negotiate NTPv4 + AEAD_AES_SIV_CMAC_256,
#      export the c2s/s2c keys, hand out cookies.
#   2. NTS-protected NTPv4 (UDP): authenticate the request, answer with the
#      current time signed under the s2c key.
#
# Python's standard-library ssl module cannot export TLS keying material, so the
# KE side uses pyOpenSSL; AES-SIV uses pycryptodome:
#
#   pip install pyOpenSSL pycryptodome
#
# Cookies here are the two session keys sealed under a per-run master key, so the
# stateless UDP side can recover them without shared storage. A production server
# would rotate that master key on a schedule and persist it.
#
# Run:
#   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
#     -days 365 -subj "/CN=localhost" \
#     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
#   python3 nts-server.py
#
# Lockasaur verifies the certificate against the OS trust store, so a real
# deployment needs a publicly trusted certificate (for example from Let's
# Encrypt) and the KE port reachable on TCP 4460.

import os
import socket
import struct
import threading
import time

from OpenSSL import SSL
from Crypto.Cipher import AES

KE_PORT = int(os.environ.get("NTS_KE_PORT", "4460"))
NTP_PORT = int(os.environ.get("NTS_NTP_PORT", "4461"))
CERT = os.environ.get("NTS_CERT", "cert.pem")
KEY = os.environ.get("NTS_KEY", "key.pem")
HOST = "0.0.0.0"

MASTER_KEY = os.urandom(32)

EXPORTER_LABEL = b"EXPORTER-network-time-security"

# --------------------------------------------------------------------------
# AEAD_AES_SIV_CMAC_256 (RFC 5297). pycryptodome's MODE_SIV takes one update()
# per S2V component, with the nonce as the last associated-data item; the tag it
# returns is the synthetic IV. Sealed layout is SIV(16) || ciphertext.
# --------------------------------------------------------------------------

def siv_seal(key, ad_list, plaintext):
    cipher = AES.new(key, AES.MODE_SIV)
    for ad in ad_list:
        cipher.update(ad)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return tag + ciphertext


def siv_open(key, ad_list, sealed):
    if len(sealed) < 16:
        return None
    cipher = AES.new(key, AES.MODE_SIV)
    for ad in ad_list:
        cipher.update(ad)
    try:
        return cipher.decrypt_and_verify(sealed[16:], sealed[:16])
    except ValueError:
        return None


# Cookies: AES-256-GCM(master key) over c2s||s2c. Layout nonce(12) | tag(16) | ct.

def seal_cookie(c2s, s2c):
    nonce = os.urandom(12)
    cipher = AES.new(MASTER_KEY, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(c2s + s2c)
    return nonce + tag + ciphertext


def open_cookie(cookie):
    if len(cookie) != 12 + 16 + 64:
        return None
    try:
        cipher = AES.new(MASTER_KEY, AES.MODE_GCM, nonce=cookie[:12])
        keys = cipher.decrypt_and_verify(cookie[28:], cookie[12:28])
        return keys[:32], keys[32:64]
    except ValueError:
        return None


# --------------------------------------------------------------------------
# NTS-KE (TLS 1.3, ALPN ntske/1).
# --------------------------------------------------------------------------

CRITICAL = 0x8000
REC_EOM = 0
REC_NEXT_PROTOCOL = 1
REC_AEAD = 4
REC_COOKIE = 5
REC_NTP_PORT = 7
PROTO_NTPV4 = 0
AEAD_AES_SIV_CMAC_256 = 15


def record(rec_type, body):
    return struct.pack(">HH", rec_type, len(body)) + body


def u16(value):
    return struct.pack(">H", value)


# The 5-byte exporter context is protocol | AEAD | direction (0x00 c2s, 0x01 s2c).
def context(direction):
    return struct.pack(">HHB", PROTO_NTPV4, AEAD_AES_SIV_CMAC_256, direction)


def request_complete(buf):
    offset = 0
    while True:
        if offset + 4 > len(buf):
            return False
        rec_type = struct.unpack_from(">H", buf, offset)[0] & ~CRITICAL
        body_len = struct.unpack_from(">H", buf, offset + 2)[0]
        if offset + 4 + body_len > len(buf):
            return False
        offset += 4 + body_len
        if rec_type == REC_EOM:
            return True


def build_ke_response(cookies):
    parts = [
        record(CRITICAL | REC_NEXT_PROTOCOL, u16(PROTO_NTPV4)),
        record(REC_AEAD, u16(AEAD_AES_SIV_CMAC_256)),
        record(REC_NTP_PORT, u16(NTP_PORT)),
    ]
    for cookie in cookies:
        parts.append(record(REC_COOKIE, cookie))
    parts.append(record(CRITICAL | REC_EOM, b""))
    return b"".join(parts)


def make_tls_context():
    ctx = SSL.Context(SSL.TLS_SERVER_METHOD)
    ctx.set_min_proto_version(SSL.TLS1_3_VERSION)
    ctx.use_privatekey_file(KEY)
    ctx.use_certificate_file(CERT)

    def select_alpn(conn, protocols):
        return b"ntske/1" if b"ntske/1" in protocols else SSL.NO_OVERLAPPING_PROTOCOLS

    ctx.set_alpn_select_callback(select_alpn)
    return ctx


def handle_ke(ctx, raw):
    conn = SSL.Connection(ctx, raw)
    conn.set_accept_state()
    try:
        conn.do_handshake()
        if conn.get_alpn_proto_negotiated() != b"ntske/1":
            return
        buf = b""
        while not request_complete(buf):
            data = conn.recv(4096)
            if not data or len(buf) > 4096:
                return
            buf += data
        c2s = conn.export_keying_material(EXPORTER_LABEL, 32, context(0x00))
        s2c = conn.export_keying_material(EXPORTER_LABEL, 32, context(0x01))
        conn.sendall(build_ke_response([seal_cookie(c2s, s2c), seal_cookie(c2s, s2c)]))
        conn.shutdown()
    except SSL.Error:
        pass
    finally:
        raw.close()


# --------------------------------------------------------------------------
# NTS-protected NTPv4 (UDP).
# --------------------------------------------------------------------------

NTP_HEADER_LEN = 48
EF_UNIQUE_ID = 0x0104
EF_COOKIE = 0x0204
EF_AUTHENTICATOR = 0x0404
NTP_UNIX_OFFSET = 2208988800


def extension_field(ef_type, body, min_body=0):
    padded = max(len(body), min_body)
    total = 4 + padded
    total += (4 - (total % 4)) % 4
    buf = bytearray(total)
    struct.pack_into(">HH", buf, 0, ef_type, total)
    buf[4:4 + len(body)] = body
    return bytes(buf)


def ntp_timestamp():
    now = time.time()
    seconds = int(now) + NTP_UNIX_OFFSET
    fraction = int((now - int(now)) * (1 << 32))
    return struct.pack(">II", seconds & 0xFFFFFFFF, fraction & 0xFFFFFFFF)


# Read the request extension fields, stopping at the authenticator (everything
# before it is the authenticated associated data).
def read_request(buf):
    result = {"auth_start": -1}
    offset = NTP_HEADER_LEN
    while offset + 4 <= len(buf):
        ef_type, total = struct.unpack_from(">HH", buf, offset)
        if total < 4 or total % 4 != 0 or offset + total > len(buf):
            break
        body = buf[offset + 4:offset + total]
        if ef_type == EF_UNIQUE_ID:
            result["unique_id"] = bytes(body[:32])
        elif ef_type == EF_COOKIE:
            result["cookie"] = bytes(body)
        elif ef_type == EF_AUTHENTICATOR:
            nonce_len, cipher_len = struct.unpack_from(">HH", body, 0)
            result["auth_start"] = offset
            result["nonce"] = bytes(body[4:4 + nonce_len])
            result["sealed"] = bytes(body[4 + nonce_len:4 + nonce_len + cipher_len])
            break
        offset += total
    return result


def handle_ntp(request):
    if len(request) < NTP_HEADER_LEN:
        return None
    parsed = read_request(request)
    if "unique_id" not in parsed or "cookie" not in parsed or parsed["auth_start"] < 0:
        return None
    keys = open_cookie(parsed["cookie"])
    if keys is None:
        return None
    c2s, s2c = keys
    associated = request[:parsed["auth_start"]]
    if siv_open(c2s, [associated, parsed["nonce"]], parsed["sealed"]) is None:
        return None

    header = bytearray(NTP_HEADER_LEN)
    header[0] = 0x24  # LI 0, VN 4, mode 4 (server)
    header[1] = 1  # stratum 1 (primary reference)
    struct.pack_into(">b", header, 3, -23)  # precision, roughly one microsecond
    header[12:16] = b"LOCL"  # reference identifier
    header[24:32] = request[40:48]  # origin echoes the client transmit timestamp
    header[32:40] = ntp_timestamp()  # receive
    now = ntp_timestamp()
    header[16:24] = now  # reference
    header[40:48] = now  # transmit: the time verdict the client reads

    id_field = extension_field(EF_UNIQUE_ID, parsed["unique_id"])
    preceding = bytes(header) + id_field
    nonce = os.urandom(16)
    sealed = siv_seal(s2c, [preceding, nonce], b"")
    auth_body = struct.pack(">HH", len(nonce), len(sealed)) + nonce + sealed
    return preceding + extension_field(EF_AUTHENTICATOR, auth_body, 24)


def ke_server():
    ctx = make_tls_context()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, KE_PORT))
    sock.listen(16)
    print("NTS-KE on tcp/%d" % KE_PORT, flush=True)
    while True:
        raw, _ = sock.accept()
        threading.Thread(target=handle_ke, args=(ctx, raw), daemon=True).start()


def ntp_server():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, NTP_PORT))
    print("NTS-NTP on udp/%d" % NTP_PORT, flush=True)
    while True:
        data, addr = sock.recvfrom(65535)
        try:
            response = handle_ntp(data)
        except Exception:
            response = None
        if response:
            sock.sendto(response, addr)


if __name__ == "__main__":
    threading.Thread(target=ntp_server, daemon=True).start()
    ke_server()
