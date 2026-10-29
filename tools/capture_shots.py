"""Capture submission-quality screenshots with headless Edge.

Differs from `ui_check.py`: it waits for meaningful states (the hero's finished
artwork frame, a solved level) instead of shooting the first paint.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5180/").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "submission", "screenshots")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def find_edge() -> str:
    for path in EDGE_CANDIDATES:
        if os.path.exists(path):
            return path
    raise SystemExit("Edge not found")


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class CDP:
    def __init__(self, ws_url: str):
        import websocket  # type: ignore

        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=40)
        self.i = 0

    def send(self, method: str, params: dict | None = None) -> dict:
        self.i += 1
        mid = self.i
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            raw = self.ws.recv()
            if not raw:
                continue
            msg = json.loads(raw)
            if msg.get("id") == mid:
                return msg

    def js(self, expression: str):
        res = self.send("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        return res.get("result", {}).get("result", {}).get("value")

    def goto(self, path: str, wait: float = 1.6) -> None:
        self.send("Page.navigate", {"url": f"{BASE}/{path}"})
        deadline = time.time() + 25
        while time.time() < deadline:
            if self.js("document.readyState") == "complete":
                break
            time.sleep(0.15)
        time.sleep(wait)

    def shot(self, name: str) -> None:
        # Interactions may scroll the page; always capture from the top.
        self.js("window.scrollTo(0, 0)")
        time.sleep(0.45)
        res = self.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        data = res.get("result", {}).get("data")
        if not data:
            print("NO DATA", name)
            return
        with open(os.path.join(OUT, name), "wb") as fh:
            fh.write(base64.b64decode(data))
        print("saved", name)

    def viewport(self, w: int, h: int, mobile: bool = False) -> None:
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": mobile},
        )

    def click(self, text: str) -> bool:
        return bool(
            self.js(
                """(() => {
                  const el = [...document.querySelectorAll('button, a')]
                    .find(e => (e.textContent || '').includes(%s));
                  if (!el) return false;
                  el.scrollIntoView({block: 'center'});
                  el.click();
                  return true;
                })()"""
                % json.dumps(text)
            )
        )


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    port = free_port()
    profile = tempfile.mkdtemp(prefix="orisnip-shot-")
    proc = subprocess.Popen(
        [
            find_edge(),
            "--headless=new",
            "--disable-gpu",
            "--no-proxy-server",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-scrollbars",
            f"--user-data-dir={profile}",
            f"--remote-debugging-port={port}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ws = None
        for _ in range(90):
            try:
                pages = json.loads(OPENER.open(f"http://127.0.0.1:{port}/json/list", timeout=3).read())
                for page in pages:
                    if page.get("type") == "page":
                        ws = page["webSocketDebuggerUrl"]
                        break
                if ws:
                    break
            except Exception:
                time.sleep(0.25)
        if not ws:
            print("EDGE NEVER CAME UP")
            return 7

        cdp = CDP(ws)
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")

        # 1. Home — wait for the artwork phase of the loop (t ≈ 6.9–9.7 s)
        cdp.viewport(1440, 980)
        cdp.goto("#/", wait=0.2)
        time.sleep(6.9)
        cdp.shot("01-home-artwork.png")

        # 2. Home first impression (flat sheet)
        cdp.goto("#/", wait=0.3)
        time.sleep(0.8)
        cdp.shot("02-home-hero.png")

        # 3. Challenge index
        cdp.goto("#/challenge", wait=1.2)
        cdp.shot("03-challenge.png")

        # 4. Level 1 workspace: folded packet + cut line
        cdp.goto("#/challenge/l1", wait=1.2)
        cdp.shot("04-level1-aim.png")

        # 5. Level 3 solved: reveal the answer, cut, wait for the unfold
        cdp.goto("#/challenge/l3", wait=1.2)
        cdp.click("查看解答")
        time.sleep(0.4)
        cdp.shot("05-level3-answer.png")
        cdp.click("剪一刀")
        time.sleep(3.4)
        cdp.click("与目标对比")
        time.sleep(0.6)
        cdp.shot("06-level3-solved.png")

        # 6. Studio with a template applied
        cdp.goto("#/studio", wait=1.4)
        cdp.click("中国窗花")
        time.sleep(0.8)
        cdp.shot("07-studio.png")

        # 7. Atelier with a local preset
        cdp.goto("#/atelier", wait=1.2)
        cdp.click("月满中庭")
        time.sleep(1.0)
        cdp.shot("08-atelier.png")

        # 8. Mathematics
        cdp.goto("#/math", wait=1.2)
        cdp.shot("09-math.png")

        # 9. Mobile home
        cdp.viewport(390, 844, mobile=True)
        cdp.goto("#/", wait=0.3)
        time.sleep(6.9)
        cdp.shot("10-mobile-home.png")

        # 10. Mobile studio
        cdp.goto("#/studio", wait=1.4)
        cdp.shot("11-mobile-studio.png")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
