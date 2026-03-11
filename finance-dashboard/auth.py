# auth.py — JWT authentication for Wealth dashboard
import hashlib
import hmac
import json
import os
import secrets
import time

AUTH_FILE = os.environ.get('WEALTH_AUTH_FILE', os.path.join(os.path.dirname(__file__), 'auth_config.json'))
JWT_SECRET_KEY = 'JWT_SECRET'
TOKEN_EXPIRY_DAYS = 30


def _load_config():
    if os.path.exists(AUTH_FILE):
        with open(AUTH_FILE, 'r') as f:
            return json.load(f)
    return {}


def _save_config(cfg):
    with open(AUTH_FILE, 'w') as f:
        json.dump(cfg, f, indent=2)


def is_password_set():
    cfg = _load_config()
    return bool(cfg.get('password_hash'))


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 260_000)
    return dk.hex(), salt


def verify_password(password):
    cfg = _load_config()
    stored_hash = cfg.get('password_hash')
    salt = cfg.get('salt')
    if not stored_hash or not salt:
        return False
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 260_000)
    return hmac.compare_digest(dk.hex(), stored_hash)


def setup_password(password):
    """First-time password creation. Returns JWT token."""
    if is_password_set():
        return None  # already set
    pw_hash, salt = hash_password(password)
    # Generate a stable JWT signing secret
    jwt_secret = secrets.token_hex(32)
    _save_config({
        'password_hash': pw_hash,
        'salt': salt,
        'jwt_secret': jwt_secret,
    })
    return generate_token()


def _get_jwt_secret():
    cfg = _load_config()
    secret = cfg.get('jwt_secret')
    if not secret:
        secret = secrets.token_hex(32)
        cfg['jwt_secret'] = secret
        _save_config(cfg)
    return secret


# ── Minimal JWT (HS256) without PyJWT dependency ──────────────────────────────
import base64


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _b64url_decode(s: str) -> bytes:
    s += '=' * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def generate_token():
    secret = _get_jwt_secret()
    header = _b64url_encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    payload = _b64url_encode(json.dumps({
        'exp': int(time.time()) + TOKEN_EXPIRY_DAYS * 86400,
        'iat': int(time.time()),
    }).encode())
    signing_input = f'{header}.{payload}'
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f'{signing_input}.{_b64url_encode(sig)}'


def validate_token(token):
    """Returns True if token is valid and not expired."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False
        header, payload, sig = parts
        secret = _get_jwt_secret()
        expected_sig = hmac.new(
            secret.encode(), f'{header}.{payload}'.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64url_decode(sig), expected_sig):
            return False
        claims = json.loads(_b64url_decode(payload))
        if claims.get('exp', 0) < time.time():
            return False
        return True
    except Exception:
        return False
