"""Headless-Edge UI probe for Orisnip.

Launches Microsoft Edge in headless mode through CDP, walks the app's routes,
collects console errors / page exceptions, exercises one real interaction per
route where it matters, and writes screenshots to `tools/shots/`.

Usage:
    python tools/ui_check.py [base_url]
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

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5180/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")

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

        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=30)
        self.next_id = 0
        self.events: list[dict] = []

    def send(self, method: str, params: dict | None = None) -> dict:
        self.next_id += 1
        msg_id = self.next_id
        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        while True:
            raw = self.ws.recv()
            if not raw:
                continue
            msg = json.loads(raw)
            if msg.get("id") == msg_id:
                return msg
            self.events.append(msg)

    def drain(self, seconds: float = 0.4) -> None:
        self.ws.settimeout(seconds)
        try:
            while True:
                raw = self.ws.recv()
                if not raw:
                    break
                self.events.append(json.loads(raw))
        except Exception:
            pass
        finally:
            self.ws.settimeout(30)

    def evaluate(self, expression: str):
        res = self.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
        )
        result = res.get("result", {})
        if "exceptionDetails" in result:
            return {"__error": result["exceptionDetails"]}
        return result.get("result", {}).get("value")

    def goto(self, url: str, wait: float = 1.3) -> None:
        self.send("Page.navigate", {"url": url})
        deadline = time.time() + 20
        while time.time() < deadline:
            ready = self.evaluate("document.readyState")
            if ready == "complete":
                break
            time.sleep(0.15)
        time.sleep(wait)

    def shot(self, path: str) -> None:
        res = self.send("Page.captureScreenshot", {"format": "png"})
        data = res.get("result", {}).get("data")
        if data:
            with open(path, "wb") as fh:
                fh.write(base64.b64decode(data))

    def errors(self) -> list[str]:
        found = []
        for event in self.events:
            method = event.get("method")
            if method == "Runtime.exceptionThrown":
                detail = event["params"].get("exceptionDetails", {})
                text = detail.get("exception", {}).get("description") or detail.get("text")
                found.append(f"exception: {text}")
            elif method == "Log.entryAdded":
                entry = event["params"].get("entry", {})
                if entry.get("level") in ("error",):
                    found.append(f"log: {entry.get('text')}")
            elif method == "Runtime.consoleAPICalled":
                if event["params"].get("type") == "error":
                    args = event["params"].get("args", [])
                    found.append("console: " + " ".join(str(a.get("value", "")) for a in args))
        return found

    def reset(self) -> None:
        self.events.clear()


def main() -> int:
    port = free_port()
    profile = tempfile.mkdtemp(prefix="orisnip-edge-")
    os.makedirs(OUT, exist_ok=True)
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
        ws_url = None
        for _ in range(80):
            try:
                pages = json.loads(
                    OPENER.open(f"http://127.0.0.1:{port}/json/list", timeout=3).read()
                )
                for page in pages:
                    if page.get("type") == "page":
                        ws_url = page["webSocketDebuggerUrl"]
                        break
                if ws_url:
                    break
            except Exception:
                time.sleep(0.25)
        if not ws_url:
            print("EDGE NEVER CAME UP")
            return 7

        cdp = CDP(ws_url)
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Log.enable")

        report = []
        viewports = [
            ("desktop", 1440, 980),
            ("mobile", 390, 844),
        ]

        routes = [
            ("home", "#/"),
            ("challenge", "#/challenge"),
            ("play-l1", "#/challenge/l1"),
            ("play-l3", "#/challenge/l3"),
            ("studio", "#/studio"),
            ("math", "#/math"),
            ("atelier", "#/atelier"),
            ("works", "#/works"),
        ]

        for vp_name, width, height in viewports:
            cdp.send(
                "Emulation.setDeviceMetricsOverride",
                {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": vp_name == "mobile"},
            )
            for name, hash_path in routes:
                cdp.reset()
                cdp.goto(BASE.rstrip("/") + "/" + hash_path, wait=1.4)
                title = cdp.evaluate("document.title")
                overflow = cdp.evaluate(
                    "Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
                )
                cdp.shot(os.path.join(OUT, f"{vp_name}-{name}.png"))
                errs = cdp.errors()
                report.append(
                    {
                        "viewport": vp_name,
                        "route": name,
                        "title": title,
                        "horizontal_overflow_px": overflow,
                        "errors": errs,
                    }
                )

        # Interaction: play level 1 and cut.
        cdp.send(
            "Emulation.setDeviceMetricsOverride",
            {"width": 1440, "height": 980, "deviceScaleFactor": 1, "mobile": False},
        )
        cdp.reset()
        cdp.goto(BASE.rstrip("/") + "/#/challenge/l3", wait=1.4)
        clicked = cdp.evaluate(
            """(() => {
              const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('剪一刀'));
              if (!btn) return 'no-button';
              btn.click();
              return 'clicked';
            })()"""
        )
        time.sleep(3.2)
        stage = cdp.evaluate(
            """(() => {
              const el = document.querySelector('[aria-label="展开后的图案"], [aria-label="逐层展开动画"]');
              return el ? el.getAttribute('aria-label') : 'none';
            })()"""
        )
        score = cdp.evaluate(
            """(() => {
              const t = document.body.innerText;
              const m = t.match(/IoU|吻合度|误差/);
              return { hasScore: !!m, snippet: t.slice(0, 0) };
            })()"""
        )
        cd = cdp.evaluate("document.body.innerText.includes('下一关')")
        cdp.shot(os.path.join(OUT, "desktop-play-l3-result.png"))
        report.append(
            {
                "action": "click 剪一刀 on l3",
                "clicked": clicked,
                "stage_after": stage,
                "next_button_present": cd,
                "score_present": score,
                "errors": cdp.errors(),
            }
        )

        # Interaction: save a studio work, then find it in the works library.
        cdp.reset()
        cdp.goto(BASE.rstrip("/") + "/#/studio", wait=1.4)
        cdp.evaluate(
            """(() => {
              const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('中国窗花'));
              if (btn) btn.click();
              return true;
            })()"""
        )
        time.sleep(0.6)
        cdp.evaluate(
            """(() => {
              const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存作品'));
              if (btn) btn.click();
              return true;
            })()"""
        )
        time.sleep(0.6)
        cdp.goto(BASE.rstrip("/") + "/#/works", wait=1.4)
        works = cdp.evaluate(
            """(() => {
              const cards = [...document.querySelectorAll('li')].filter(li => li.querySelector('svg'));
              return { count: cards.length, text: document.body.innerText.slice(0, 160) };
            })()"""
        )
        cdp.shot(os.path.join(OUT, "desktop-works-saved.png"))
        report.append({"action": "save studio work then open works", "works": works, "errors": cdp.errors()})

        print(json.dumps(report, ensure_ascii=False, indent=2))
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
