#!/usr/bin/env python3
"""
Download an encrypted Microsoft Teams / Stream (OnePlayer) recording.

These recordings are served as MPEG-DASH with SEA (urn:mpeg:dash:sea)
AES-128-CBC "clear-key" encryption: the AES key is fetched over HTTP from a
VideoProtectionKey endpoint, authorized by the same short-lived `tempauth`
token that's embedded in every URL inside the manifest. ffmpeg/yt-dlp can't
decrypt this scheme, so we do it by hand: parse the MPD, pull the key, download
+ decrypt every segment, then mux audio+video with ffmpeg.

IMPORTANT: the `tempauth` token expires in ~minutes. Grab a FRESH manifest
right before running (see the README block at the bottom), and run promptly.

Usage:
    pip install pycryptodome
    python3 destream.py manifest.xml                 # full download -> output.mp4
    python3 destream.py manifest.xml -o meeting.mp4
    python3 destream.py manifest.xml --test          # 3 segments only -> sample.mp4

`manifest.xml` is the saved body of the 200 `videomanifest` response (the XML
you get from DevTools -> right-click the request -> Copy as cURL, run with
`> manifest.xml`). You can also pass the manifest URL directly (in quotes).
"""

import argparse
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

try:
    from Crypto.Cipher import AES
except ImportError:
    sys.exit("Missing dependency. Run:  pip install pycryptodome")

NS = {
    "mpd": "urn:mpeg:DASH:schema:MPD:2011",
    "sea": "urn:mpeg:dash:sea:2012",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    ),
    "Referer": "https://teams.cloud.microsoft/",
    "Origin": "https://teams.cloud.microsoft",
}


def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def load_mpd(arg):
    """arg is either a path to a saved manifest XML or the manifest URL itself."""
    if os.path.isfile(arg):
        with open(arg, "rb") as f:
            return f.read()
    print("Fetching manifest from URL ...")
    return http_get(arg)


def parse_iv(iv_str):
    return bytes.fromhex(iv_str.lower().removeprefix("0x"))


def decrypt_segment(data, key, iv):
    """AES-128-CBC over whole-block portion; trailing partial block stays clear
    (SEA residual-block termination)."""
    full = len(data) - (len(data) % 16)
    if full == 0:
        return data
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return cipher.decrypt(data[:full]) + data[full:]


def build_times(seg_template):
    """Expand <SegmentTimeline> into the list of $Time$ values."""
    timeline = seg_template.find("mpd:SegmentTimeline", NS)
    times = []
    t = 0
    for s in timeline.findall("mpd:S", NS):
        if s.get("t") is not None:
            t = int(s.get("t"))
        d = int(s.get("d"))
        for _ in range(int(s.get("r", 0)) + 1):
            times.append(t)
            t += d
    return times


def resolve(base, template, rep_id, time=None):
    url = template.replace("$RepresentationID$", rep_id)
    if time is not None:
        url = url.replace("$Time$", str(time))
    return urllib.parse.urljoin(base, url)


def download_track(adaptation, base_url, out_path, limit=None):
    content_type = adaptation.get("contentType")
    rep = adaptation.find("mpd:Representation", NS)
    rep_id = rep.get("id")

    crypto = adaptation.find("mpd:ContentProtection/sea:CryptoPeriod", NS)
    key_url = resolve(base_url, crypto.get("keyUriTemplate"), rep_id)
    iv = parse_iv(crypto.get("IV"))

    print(f"[{content_type}] fetching AES key ...")
    key = http_get(key_url)
    if len(key) != 16:
        print(f"  warning: key is {len(key)} bytes (expected 16); first bytes "
              f"may need base64-decoding. Raw repr: {key[:32]!r}")
    print(f"[{content_type}] key OK ({len(key)} bytes), IV {iv.hex()}")

    seg = adaptation.find("mpd:SegmentTemplate", NS)
    init_url = resolve(base_url, seg.get("initialization"), rep_id)
    times = build_times(seg)
    if limit:
        times = times[:limit]

    print(f"[{content_type}] init segment ...")
    with open(out_path, "wb") as out:
        out.write(http_get(init_url))  # init (moov) is NOT encrypted
        total = len(times)
        for i, t in enumerate(times, 1):
            url = resolve(base_url, seg.get("media"), rep_id, t)
            out.write(decrypt_segment(http_get(url), key, iv))
            if i % 25 == 0 or i == total:
                print(f"[{content_type}] {i}/{total} segments", end="\r")
    print(f"\n[{content_type}] wrote {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", help="saved manifest XML file, or the manifest URL")
    ap.add_argument("-o", "--output", default="output.mp4")
    ap.add_argument("--test", action="store_true",
                    help="download only 3 segments per track to validate decryption")
    args = ap.parse_args()

    root = ET.fromstring(load_mpd(args.manifest))
    base_el = root.find(".//mpd:BaseURL", NS)
    base_url = base_el.text if base_el is not None else ""
    if not base_url:
        sys.exit("No <BaseURL> in manifest — did you save the right response?")

    limit = 3 if args.test else None
    tracks = {}
    for ad in root.findall(".//mpd:AdaptationSet", NS):
        ctype = ad.get("contentType")
        if ctype in ("audio", "video"):
            path = f"track_{ctype}.mp4"
            download_track(ad, base_url, path, limit=limit)
            tracks[ctype] = path

    out = "sample.mp4" if args.test else args.output
    if {"audio", "video"} <= tracks.keys():
        cmd = ["ffmpeg", "-y", "-i", tracks["video"], "-i", tracks["audio"],
               "-c", "copy", out]
    else:
        only = next(iter(tracks.values()))
        cmd = ["ffmpeg", "-y", "-i", only, "-c", "copy", out]
    print("\nMuxing:\n  " + " ".join(cmd))
    if subprocess.run(cmd).returncode == 0:
        print(f"\nDone -> {out}")
        for p in tracks.values():
            os.remove(p)
    else:
        print("\nffmpeg mux failed. The per-track files were kept for inspection.")


if __name__ == "__main__":
    main()
