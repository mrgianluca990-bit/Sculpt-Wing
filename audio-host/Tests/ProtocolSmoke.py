#!/usr/bin/env python3
"""Exercise the real native process and a built VST3 fixture, without audio I/O."""

import base64
import json
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET


class Client:
    def __init__(self, executable, directory):
        self.errors = tempfile.TemporaryFile(mode="w+t")
        self.process = subprocess.Popen(
            [executable, "--stdio", "--data-dir", str(directory)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors,
            text=True, bufsize=1,
        )
        self.messages = queue.Queue()
        self.sequence = 0
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        try:
            for line in self.process.stdout:
                self.messages.put(json.loads(line))
        except Exception as error:
            self.messages.put(error)
        finally:
            self.messages.put(RuntimeError("Native host closed stdout"))

    def call(self, method, params=None, expect_error=False):
        self.sequence += 1
        identifier = self.sequence
        self.process.stdin.write(json.dumps({"id": identifier, "method": method, "params": params or {}}) + "\n")
        self.process.stdin.flush()
        deadline = time.monotonic() + 15
        while True:
            message = self.messages.get(timeout=max(0.01, deadline - time.monotonic()))
            if isinstance(message, Exception):
                raise message
            if "event" in message:
                assert message["event"] in ("state", "error", "scanProgress"), message
                assert isinstance(message.get("data"), dict), message
                continue
            assert message.get("id") == identifier, message
            if expect_error:
                assert message.get("ok") is False and isinstance(message.get("error"), str), message
                return message["error"]
            assert message.get("ok") is True and isinstance(message.get("result"), dict), message
            return message["result"]

    def close(self):
        if self.process.poll() is None:
            try:
                self.call("shutdown")
                self.process.wait(timeout=5)
            except Exception:
                self.process.kill()
                self.process.wait(timeout=5)
        self.reader.join(timeout=1)
        self.errors.seek(0)
        diagnostic = self.errors.read()
        self.errors.close()
        if self.process.returncode != 0 and diagnostic:
            print(diagnostic, file=sys.stderr)


def run(executable, fixture):
    with tempfile.TemporaryDirectory(prefix="sculpt-audio-protocol-") as temporary:
        directory = Path(temporary)
        result_path = directory / "scanned.json"
        scanned = subprocess.run(
            [executable, "--scan-one", fixture, "--scan-result", str(result_path)],
            capture_output=True, text=True, timeout=30,
        )
        assert scanned.returncode == 0, scanned.stderr or scanned.stdout
        descriptions = json.loads(result_path.read_text())["plugins"]
        assert descriptions, "Scanner returned no fixture"
        catalogue = ET.Element("SCULPT_VST3_CATALOG")
        for description in descriptions:
            catalogue.append(ET.fromstring(description))
        ET.ElementTree(catalogue).write(directory / "plugin-catalog.xml", encoding="utf-8")

        host = Client(executable, directory)
        try:
            initial = host.call("status")
            assert initial["running"] is False and initial["audio"]["configured"] is False
            assert initial["audio"]["inputDevice"] == initial["audio"]["outputDevice"] == ""
            plugin = next(item for item in initial["plugins"] if item["name"] == "SculptWingAudioTestGain")
            identifier = plugin["id"]
            assert len(identifier) == 21 and identifier.startswith("vst3-")
            int(identifier[5:], 16)
            rack = {"id": "ch-1", "name": "Fixture", "inputChannels": [0], "outputChannels": [0],
                    "enabled": False, "slots": [{"pluginId": identifier, "bypass": False}]}
            loaded = host.call("setRack", rack)
            assert loaded["running"] is False and loaded["racks"][0]["slots"][0]["missing"] is False
            assert loaded["racks"][0]["placement"] is None, "Legacy rack implied a mixer patch"
            for placement in (None, "pre", "insert1", "insert2"):
                placed = host.call("setRack", {**rack, "placement": placement})
                assert placed["racks"][0]["placement"] == placement
                assert host.call("getState")["racks"][0]["placement"] == placement
            snapshot = host.call("getState")
            encoded = snapshot["racks"][0]["slots"][0]["state"]
            assert base64.b64decode(encoded, validate=True), "Native preset was not captured"
            restored = host.call("restoreState", {"state": snapshot})
            assert restored["running"] is False and restored["audio"]["configured"] is False
            assert restored["racks"][0]["slots"][0]["pluginId"] == identifier
            assert restored["racks"][0]["placement"] == "insert2"
            for invalid in ("", "PRE", "insert0", "post", False, 1, [], {}):
                host.call("setRack", {**rack, "placement": invalid}, expect_error=True)
                invalid_state = {**snapshot, "racks": [{**snapshot["racks"][0], "placement": invalid}]}
                host.call("restoreState", {"state": invalid_state}, expect_error=True)
                assert host.call("getState")["racks"][0]["placement"] == "insert2", "Rejected placement changed the rack"
            collision = {**rack, "id": "ch-2"}
            host.call("setRack", collision, expect_error=True)
            assert len(host.call("getState")["racks"]) == 1, "Rejected mutation changed the graph"
            host.call("setRack", {**rack, "slots": [{"pluginId": "vst3-ffffffffffffffff", "bypass": False}]}, expect_error=True)

            missing_blob = base64.b64encode(b"missing-plugin-preset").decode()
            missing = {**rack, "enabled": True, "slots": [
                {"pluginId": "vst3-0000000000000000", "name": "Absent effect", "bypass": False, "state": missing_blob}
            ]}
            absent = host.call("restoreState", {"state": {"racks": [missing]}})
            assert absent["running"] is False and absent["racks"][0]["enabled"] is False
            assert absent["racks"][0]["slots"][0]["missing"] is True
            assert absent["racks"][0]["slots"][0]["state"] == missing_blob
            assert absent["racks"][0]["placement"] is None
            retained = host.call("setRack", {**missing, "enabled": False, "outputChannels": [1]})
            assert retained["racks"][0]["slots"][0]["state"] == missing_blob
            host.call("startAudio", expect_error=True)
            assert host.call("status")["running"] is False
            host.call("unsupportedMethod", expect_error=True)
            host.call("removeRack", {"id": "ch-1"})
            assert host.call("getState")["racks"] == []
        finally:
            host.close()
        assert host.process.returncode == 0, "Native host did not shut down cleanly"
    print("Sculpt Wing native protocol: isolated scan, real VST3 rack/state, validation, missing presets and stopped restore passed.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: ProtocolSmoke.py <helper executable> <VST3 fixture bundle>")
    run(str(Path(sys.argv[1]).resolve()), str(Path(sys.argv[2]).resolve()))
