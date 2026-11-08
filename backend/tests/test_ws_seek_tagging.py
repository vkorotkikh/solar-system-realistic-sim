"""Seek tagging: replies produced after a seek echo its client-chosen id."""
from __future__ import annotations

import asyncio

import pytest

import server
from test_kuiper_subscription_ordering import capture_connected

TDB = "TDB"


class _Engine:
    engine_name = "seek-fixture"
    fidelity_level = "low"

    def __init__(self):
        self.jd = 2451545.0
        self.runner = None
        self.stop_on_state = False

    def get_state(self):
        if self.stop_on_state:
            self.runner.running = False  # Publish exactly one frame.
        return {"jd": self.jd, "bodies": {}, "jd_time_scale": TDB}

    def get_julian_date(self):
        return self.jd

    def get_energy_error(self):
        return 0.0

    def list_body_ids(self):
        return ["earth"]

    def get_orbital_elements(self, _body_id):
        return {"a": 1.0}

    def set_julian_date(self, jd):
        self.jd = jd


def _runner():
    engine = _Engine()
    runner = server.SimulationRunner(engine, target_fps=10_000)
    engine.runner = runner
    runner.paused = True
    return runner, engine


def _frame(runner, engine):
    runner.running = True
    engine.stop_on_state = True
    runner._run_frames()
    engine.stop_on_state = False
    return runner.get_latest_state()


def _seek(runner, jd, **extra):
    runner._handle_command({"type": "set_julian_date", "jd": jd, "jd_time_scale": TDB, **extra})


def test_frames_and_orbital_elements_echo_the_last_applied_seek_id():
    runner, engine = _runner()
    assert _frame(runner, engine)["seek_id"] == 0  # No tagged seek yet.

    _seek(runner, 2460000.5, seek_id=7)
    assert engine.jd == 2460000.5
    assert _frame(runner, engine)["seek_id"] == 7
    assert _frame(runner, engine)["seek_id"] == 7  # Later frames keep echoing it.
    runner._handle_command({"type": "get_orbital_elements", "body_id": "earth"})
    assert runner.get_response()["seek_id"] == 7


def test_command_fifo_decides_which_side_of_a_seek_a_reply_is_on():
    runner, engine = _runner()
    _seek(runner, 2460000.5, seek_id=7)
    runner._handle_command({"type": "get_orbital_elements", "body_id": "earth"})
    _seek(runner, 2461000.5, seek_id=8)
    assert runner.get_response()["seek_id"] == 7  # Produced before seek 8.
    assert _frame(runner, engine)["seek_id"] == 8


def test_rejected_seek_still_acknowledges_its_id():
    runner, engine = _runner()
    _seek(runner, 2460000.5, seek_id=1)
    runner._handle_command({"type": "set_julian_date", "jd": 2461000.5, "seek_id": 2})  # No scale.
    assert runner.get_response()["code"] == "bad_request"
    assert engine.jd == 2460000.5
    assert _frame(runner, engine)["seek_id"] == 2  # Else the client would drop frames forever.


def test_seek_without_an_id_leaves_the_echo_unchanged():
    runner, engine = _runner()
    _seek(runner, 2460000.5, seek_id=3)
    _seek(runner, 2461000.5)
    assert _frame(runner, engine)["seek_id"] == 3


@pytest.mark.parametrize("bad", [True, False, -1, 1.5, "3", None, [1], 2**53])
def test_invalid_seek_id_is_rejected_without_seeking(bad):
    runner, engine = _runner()
    _seek(runner, 2460000.5, seek_id=4)
    _seek(runner, 2461000.5, seek_id=bad)
    response = runner.get_response()
    assert response["code"] == "bad_request" and response["action"] == "set_julian_date"
    assert engine.jd == 2460000.5
    assert _frame(runner, engine)["seek_id"] == 4


def test_ingress_forwards_seek_id():
    command = {"type": "set_julian_date", "jd": 2460000.5, "jd_time_scale": TDB, "seek_id": 5}
    assert server._normalize_ws_command(command) == (command, None)


def test_handshake_advertises_seek_id_support():
    assert asyncio.run(capture_connected())["seek_id_version"] == 1
