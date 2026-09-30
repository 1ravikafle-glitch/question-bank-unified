"""Shared read-through cache for hot endpoints.

Memory backend by default (single process, zero setup). Set REDIS_URL and
every worker shares one cache with zero code change — required before
scaling past one API worker, since per-process memory caches diverge
(one worker invalidates on submit, another keeps serving stale progress).

Only JSON-serializable values. Namespaces: pass "q:" / "prog:" style
prefixes and invalidate by prefix on writes.
"""
import json
import os
import sys
import time

_mem: dict = {}
_redis = None
_mode: str | None = None
_hits = 0
_misses = 0


def _mode_name() -> str:
    global _mode, _redis
    if _mode is not None:
        return _mode
    url = os.getenv("REDIS_URL", "").strip()
    if url:
        try:
            import redis  # type: ignore

            _redis = redis.Redis.from_url(
                url, socket_connect_timeout=5, decode_responses=True
            )
            _redis.ping()
            _mode = "redis"
            print("[CACHE] shared Redis backend", file=sys.stderr)
        except Exception as e:
            print(f"[CACHE] Redis unreachable ({e}) — memory fallback", file=sys.stderr)
            _mode = "memory"
    else:
        _mode = "memory"
    return _mode


def get(key: str):
    """Return cached value or None. Counts hits/misses for observability."""
    global _hits, _misses
    if _mode_name() == "redis":
        try:
            raw = _redis.get(key)
            if raw is None:
                _misses += 1
                return None
            _hits += 1
            return json.loads(raw)
        except Exception:
            _misses += 1
            return None
    hit = _mem.get(key)
    if hit is None or hit[1] < time.time():
        _mem.pop(key, None)
        _misses += 1
        return None
    _hits += 1
    return hit[0]


def set(key: str, value, ttl: int):
    """Store a JSON-serializable value for ttl seconds."""
    if _mode_name() == "redis":
        try:
            _redis.setex(key, ttl, json.dumps(value))
            return
        except Exception:
            pass
    _mem[key] = (value, time.time() + ttl)


def delete(key: str):
    if _mode_name() == "redis":
        try:
            _redis.delete(key)
        except Exception:
            pass
    _mem.pop(key, None)


def delete_prefix(prefix: str):
    """Invalidate a whole namespace (e.g. all "q:" entries after upload)."""
    if _mode_name() == "redis":
        try:
            cursor = 0
            while True:
                cursor, keys = _redis.scan(cursor, match=prefix + "*", count=500)
                if keys:
                    _redis.delete(*keys)
                if cursor == 0:
                    break
        except Exception:
            pass
    for k in [k for k in _mem if k.startswith(prefix)]:
        _mem.pop(k, None)


def stats() -> dict:
    total = _hits + _misses
    return {
        "backend": _mode_name(),
        "hits": _hits,
        "misses": _misses,
        "hit_rate": round(_hits / total, 3) if total else 0.0,
        "keys": len(_mem),
    }
