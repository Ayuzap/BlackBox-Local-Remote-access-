"""Detect how this machine reaches the network (wifi / ethernet / cellular), so nobody has to type it."""
import socket
import sys

import psutil

_VIRTUAL = ("vethernet", "vmware", "virtualbox", "vboxnet", "docker", "br-", "veth", "loopback", "tun", "tap", "utun",
            "hyper-v", "wsl", "bluetooth", "lo", "awdl", "llw", "bridge", "zt", "tailscale")
_WIFI = ("wi-fi", "wifi", "wlan", "wlp", "wireless", "wl")
_CELL = ("wwan", "rmnet", "ppp", "cell", "mobile", "usb")
_ETH = ("ethernet", "eth", "eno", "enp", "ens", "lan")


def _kind(name: str) -> str | None:
    n = name.lower()
    if n.startswith(_VIRTUAL) or "virtual" in n:
        return None
    if n.startswith(_WIFI) or "wi-fi" in n:
        return "wifi"
    if n.startswith(_CELL):
        return "cellular_4g"
    if n.startswith(_ETH) or "ethernet" in n:
        return "ethernet"
    if n.startswith("en"):                                   # macOS: en0 is normally the Wi-Fi card
        return "wifi" if sys.platform == "darwin" else "ethernet"
    return "other"


def _outbound_ip() -> str | None:
    """The local address the OS would use to reach the internet (a UDP connect sends no packet)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(1)
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def detect_connection_type() -> str | None:
    try:
        ip = _outbound_ip()
        addrs, stats = psutil.net_if_addrs(), psutil.net_if_stats()
        if ip:
            for name, entries in addrs.items():
                if any(a.family == socket.AF_INET and a.address == ip for a in entries):
                    return _kind(name) or "other"
        for name, entries in addrs.items():                  # no default route: first real interface that is up
            if stats.get(name) and stats[name].isup and any(a.family == socket.AF_INET and not a.address.startswith(("127.", "169.254.")) for a in entries):
                kind = _kind(name)
                if kind:
                    return kind
    except Exception:
        pass
    return None
